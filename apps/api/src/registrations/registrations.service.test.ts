/**
 * Tests unitaires — RegistrationsService (lot 2, 2026-08-22).
 *
 * Le formulaire d'inscription est la seule porte publique de la plateforme
 * ouverte sur une écriture en base. Ce fichier garde ce qui peut y entrer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCodes } from '@saas-events/types';
import { RegistrationsService } from './registrations.service';

function makePrisma() {
  return {
    event: { findUnique: vi.fn() },
    registration: {
      create: vi.fn().mockResolvedValue({
        id: 'reg-1',
        firstName: 'Ama',
        createdAt: new Date(),
      }),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockResolvedValue({ id: 'reg-1', checkedInAt: null }),
      delete: vi.fn().mockResolvedValue({}),
    },
    /*
     * La recherche passe par du SQL brut depuis le 2026-08-23 : `unaccent`
     * n’a pas d’équivalent dans le langage de requête de Prisma. Le double
     * capture donc la requête telle qu’elle part.
     */
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
}

/** Recompose le SQL d’un appel `$queryRaw` (gabarit balisé). */
function sqlDe(appel: unknown[]): string {
  return (appel[0] as string[]).join('?');
}

/** Les valeurs liées d’un appel `$queryRaw`, dans leur ordre. */
function parametresDe(appel: unknown[]): unknown[] {
  return appel.slice(1);
}

const phoneService = { normalizeToE164: (v: string) => (v.startsWith('+') ? v : null) };

function corps(err: unknown): { code?: string; message?: string } {
  return (err as { response: Record<string, unknown> }).response as never;
}

async function erreurDe(promesse: Promise<unknown>) {
  const succes = Symbol('aucune erreur');
  const issue = await promesse.then(() => succes, (e: unknown) => e);
  if (issue === succes) throw new Error('la promesse a abouti alors qu’un refus était attendu');
  return corps(issue);
}

const demande = {
  firstName: '  Ama ',
  lastName: 'Dzikpé',
  email: '  Ama@Example.COM ',
  phone: '+22890000000',
};

describe('RegistrationsService.inscrire()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let acces: { resoudreEvenementDuManager: ReturnType<typeof vi.fn> };
  let service: RegistrationsService;
  let email: { sendRegistrationConfirmationEmail: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = makePrisma();
    email = { sendRegistrationConfirmationEmail: vi.fn().mockResolvedValue(undefined) };
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    acces = { resoudreEvenementDuManager: vi.fn().mockResolvedValue('evt-1') };
    service = new RegistrationsService(
      prisma as never,
      audit as never,
      acces as never,
      phoneService as never,
      email as never,
    );
    prisma.event.findUnique.mockResolvedValue({
      id: 'evt-1',
      accessMode: 'RSVP',
      status: 'PUBLISHED',
      title: 'Soirée ALL WHITE',
      startDate: new Date('2026-08-22T20:00:00Z'),
      venueName: 'Green Palace',
      city: 'Lomé',
    });
  });

  it('inscrit un participant, en nettoyant ce qu’il a saisi', async () => {
    const r = await service.inscrire('soiree', demande);

    expect(r).toMatchObject({ id: 'reg-1', eventTitle: 'Soirée ALL WHITE' });
    expect(prisma.registration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: 'evt-1',
          firstName: 'Ama',
          lastName: 'Dzikpé',
          email: 'ama@example.com',
          phone: '+22890000000',
        }),
      }),
    );
  });

  it('envoie une confirmation, sans QR ni PDF — à l’entrée on pointe les noms', async () => {
    await service.inscrire('soiree', demande);

    expect(email.sendRegistrationConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ama@example.com',
        firstName: 'Ama',
        eventTitle: 'Soirée ALL WHITE',
      }),
    );
  });

  it('ne crée ni compte ni commande — c’est tout l’intérêt du régime', async () => {
    await service.inscrire('soiree', demande);

    expect(prisma).not.toHaveProperty('user');
    expect(prisma).not.toHaveProperty('order');
  });

  it("refuse un événement qui vend des billets", async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'evt-1',
      accessMode: 'TICKETED_ACCOUNT',
      status: 'PUBLISHED',
      title: 'Concert',
    });

    await expect(service.inscrire('concert', demande)).rejects.toThrow(ForbiddenException);
    expect(prisma.registration.create).not.toHaveBeenCalled();
  });

  it("relit le régime EN BASE, jamais dans la demande", async () => {
    await service.inscrire('soiree', demande);

    expect(prisma.event.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'soiree' } }),
    );
  });

  it("refuse un événement qui n'est pas publié", async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'evt-1',
      accessMode: 'RSVP',
      status: 'DRAFT',
      title: 'Soirée',
    });

    await expect(service.inscrire('soiree', demande)).rejects.toThrow();
  });

  it('refuse un événement introuvable', async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    await expect(service.inscrire('inconnu', demande)).rejects.toThrow(NotFoundException);
  });

  it('dit franchement qu’une adresse est déjà inscrite', async () => {
    prisma.registration.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('doublon', {
        code: 'P2002',
        clientVersion: '5.22.0',
      }),
    );

    const err = await erreurDe(service.inscrire('soiree', demande));
    expect(err.code).toBe(ErrorCodes.ALREADY_REGISTERED);
  });

  it('accepte une inscription sans téléphone', async () => {
    await expect(
      service.inscrire('soiree', { firstName: 'Kossi', lastName: 'A', email: 'k@x.com' }),
    ).resolves.toMatchObject({ id: 'reg-1' });

    expect(prisma.registration.create.mock.calls[0][0].data.phone).toBeNull();
  });

  it("n'échoue pas sur un numéro illisible — il sert à joindre, pas à identifier", async () => {
    await expect(
      service.inscrire('soiree', { ...demande, phone: 'appelle-moi' }),
    ).resolves.toMatchObject({ id: 'reg-1' });

    expect(prisma.registration.create.mock.calls[0][0].data.phone).toBeNull();
  });

  it('range le libellé du champ libre AVEC la réponse', async () => {
    // Le renommer plus tard ne doit pas réécrire le sens des réponses déjà
    // recueillies.
    await service.inscrire('soiree', {
      ...demande,
      extraLabel: 'Tu viens avec combien ?',
      extraValue: '3',
    });

    expect(prisma.registration.create.mock.calls[0][0].data).toMatchObject({
      extraLabel: 'Tu viens avec combien ?',
      extraValue: '3',
    });
  });
});

describe('RegistrationsService.listerPourManager()', () => {
  it("passe par le contrôle d'appartenance partagé", async () => {
    const prisma = makePrisma();
    const acces = { resoudreEvenementDuManager: vi.fn().mockResolvedValue('evt-du-manager') };
    const service = new RegistrationsService(
      prisma as never,
      { log: vi.fn() } as never,
      acces as never,
      phoneService as never,
      { sendRegistrationConfirmationEmail: vi.fn() } as never,
    );

    await service.listerPourManager('mgr-1', 'evt-demande');

    expect(acces.resoudreEvenementDuManager).toHaveBeenCalledWith('mgr-1', 'evt-demande');
    // La requête porte sur l'événement RÉSOLU, jamais sur celui demandé.
    expect(prisma.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: 'evt-du-manager' } }),
    );
  });

  it('laisse remonter le refus quand l’événement n’est pas le sien', async () => {
    const acces = {
      resoudreEvenementDuManager: vi.fn().mockRejectedValue(new NotFoundException()),
    };
    const service = new RegistrationsService(
      makePrisma() as never,
      { log: vi.fn() } as never,
      acces as never,
      phoneService as never,
      { sendRegistrationConfirmationEmail: vi.fn() } as never,
    );

    await expect(service.listerPourManager('mgr-1', 'evt-autre')).rejects.toThrow(NotFoundException);
  });
});


describe('RegistrationsService.listerPourManager() — recherche sans accents (2026-08-23)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: RegistrationsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new RegistrationsService(
      prisma as never,
      { log: vi.fn() } as never,
      { resoudreEvenementDuManager: vi.fn().mockResolvedValue('evt-1') } as never,
      phoneService as never,
      { sendRegistrationConfirmationEmail: vi.fn() } as never,
    );
    // Comptes puis lignes : deux appels, dans cet ordre.
    prisma.$queryRaw
      .mockResolvedValueOnce([{ total: 1, presents: 0 }])
      .mockResolvedValueOnce([{ id: 'reg-1' }]);
  });

  /*
   * Le cas courant ne doit rien payer pour la recherche : sans terme, on
   * reste sur du Prisma ordinaire.
   */
  it('ne passe par le SQL brut que s’il y a un terme', async () => {
    prisma.$queryRaw.mockReset();

    await service.listerPourManager('mgr-1', undefined, { limit: 50 });

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.registration.findMany).toHaveBeenCalled();
  });

  it('bascule sur le SQL brut dès qu’un terme est fourni', async () => {
    await service.listerPourManager('mgr-1', undefined, { q: 'konate' });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.registration.findMany).not.toHaveBeenCalled();
  });

  /*
   * LE point du chantier : `contains` de Prisma compare octet par octet, donc
   * « konate » ne trouvait pas « Konaté ». La comparaison doit passer des
   * DEUX côtés par `unaccent(lower(...))` — la colonne comme le motif.
   */
  it('déaccentue la colonne ET le motif', async () => {
    await service.listerPourManager('mgr-1', undefined, { q: 'konate' });

    const sql = sqlDe(prisma.$queryRaw.mock.calls[0]);
    expect(sql).toMatch(/unaccent\(lower\(\s*"firstName"/);
    expect(sql).toContain('LIKE unaccent(lower(');
  });

  /*
   * Un terme n'est jamais concaténé dans le texte de la requête : il voyage
   * en paramètre lié. La règle vaut pour toute requête brute (RULES.md §9).
   */
  it('lie les valeurs au lieu de les coudre dans le SQL', async () => {
    await service.listerPourManager('mgr-1', undefined, { q: "Robert'); DROP TABLE registrations;--" });

    const sql = sqlDe(prisma.$queryRaw.mock.calls[0]);
    expect(sql).not.toContain('DROP TABLE');
    expect(parametresDe(prisma.$queryRaw.mock.calls[0])).toEqual(
      expect.arrayContaining([expect.stringContaining('DROP TABLE')]),
    );
  });

  /*
   * `%` et `_` sont les jokers de LIKE. Un organisateur qui les tape cherche
   * ces caractères-là, il ne compose pas une expression.
   */
  it('neutralise les jokers de LIKE dans le terme', async () => {
    await service.listerPourManager('mgr-1', undefined, { q: '100%_promo' });

    const [, , motif] = prisma.$queryRaw.mock.calls[0];
    expect(motif).toBe('%100!%!_promo%');
  });

  it('annonce le nombre de RÉSULTATS, pas la taille de la liste', async () => {
    prisma.$queryRaw
      .mockReset()
      .mockResolvedValueOnce([{ total: 3, presents: 2 }])
      .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

    const r = await service.listerPourManager('mgr-1', undefined, { q: 'a' });

    expect(r.total).toBe(3);
    expect(r.presents).toBe(2);
    expect(r.items).toHaveLength(3);
  });

  /*
   * Le plafond s'applique aussi au chemin de recherche : sans lui, `q=a`
   * ramènerait huit cents lignes sur le téléphone de l’accueil.
   */
  it('borne la pagination du chemin de recherche comme celle de l’autre', async () => {
    await service.listerPourManager('mgr-1', undefined, { q: 'a', limit: 100000, offset: -5 });

    const parametres = parametresDe(prisma.$queryRaw.mock.calls[1]);
    expect(parametres).toEqual(expect.arrayContaining([200, 0]));
  });

  it('passe par le contrôle d’appartenance avant de chercher', async () => {
    const acces = { resoudreEvenementDuManager: vi.fn().mockRejectedValue(new NotFoundException()) };
    const refuse = new RegistrationsService(
      prisma as never,
      { log: vi.fn() } as never,
      acces as never,
      phoneService as never,
      { sendRegistrationConfirmationEmail: vi.fn() } as never,
    );

    await expect(
      refuse.listerPourManager('mgr-1', 'evt-autre', { q: 'konate' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('RegistrationsService — pointage, retrait, pagination (2026-08-22)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let acces: { resoudreEvenementDuManager: ReturnType<typeof vi.fn> };
  let audit: { log: ReturnType<typeof vi.fn> };
  let service: RegistrationsService;

  beforeEach(() => {
    prisma = makePrisma();
    acces = { resoudreEvenementDuManager: vi.fn().mockResolvedValue('evt-1') };
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    service = new RegistrationsService(
      prisma as never,
      audit as never,
      acces as never,
      phoneService as never,
      { sendRegistrationConfirmationEmail: vi.fn() } as never,
    );
    prisma.registration.findUnique.mockResolvedValue({
      id: 'reg-1',
      eventId: 'evt-1',
      email: 'ama@example.com',
    });
  });

  it('pointe un inscrit avec un horodatage', async () => {
    await service.pointer('mgr-1', 'reg-1', true);

    const data = prisma.registration.update.mock.calls[0][0].data;
    expect(data.checkedInAt).toBeInstanceOf(Date);
  });

  it('dépointe en remettant à null — on se trompe de ligne, debout, dans le bruit', async () => {
    await service.pointer('mgr-1', 'reg-1', false);

    expect(prisma.registration.update.mock.calls[0][0].data).toEqual({ checkedInAt: null });
  });

  it("refuse de pointer l'inscrit d'un autre organisateur", async () => {
    acces.resoudreEvenementDuManager.mockRejectedValue(new NotFoundException());

    await expect(service.pointer('mgr-autre', 'reg-1', true)).rejects.toThrow(NotFoundException);
    expect(prisma.registration.update).not.toHaveBeenCalled();
  });

  it("vérifie l'appartenance AVANT d'écrire, pas après", async () => {
    await service.pointer('mgr-1', 'reg-1', true);

    // L’événement contrôlé est celui de l’INSCRIPTION, jamais un identifiant
    // fourni par l’appelant.
    expect(acces.resoudreEvenementDuManager).toHaveBeenCalledWith('mgr-1', 'evt-1');
  });

  it('supprime réellement un désistement — pas un drapeau', async () => {
    await service.retirer('mgr-1', 'reg-1');

    expect(prisma.registration.delete).toHaveBeenCalledWith({ where: { id: 'reg-1' } });
  });

  it("refuse de retirer l'inscrit d'un autre organisateur", async () => {
    acces.resoudreEvenementDuManager.mockRejectedValue(new NotFoundException());

    await expect(service.retirer('mgr-autre', 'reg-1')).rejects.toThrow(NotFoundException);
    expect(prisma.registration.delete).not.toHaveBeenCalled();
  });

  it('borne la pagination — une limite qu’on peut demander à 100 000 n’en est pas une', async () => {
    await service.listerPourManager('mgr-1', undefined, { limit: 100000, offset: -5 });

    const appel = prisma.registration.findMany.mock.calls[0][0];
    expect(appel.take).toBe(200);
    expect(appel.skip).toBe(0);
  });

  it('compte TOUTE la liste, pas la page rendue', async () => {
    prisma.registration.count.mockResolvedValueOnce(812).mockResolvedValueOnce(140);
    prisma.registration.findMany.mockResolvedValue([{ id: 'reg-1' }]);

    const r = await service.listerPourManager('mgr-1', undefined, { limit: 50 });

    expect(r.total).toBe(812);
    expect(r.presents).toBe(140);
    expect(r.items).toHaveLength(1);
  });
});
