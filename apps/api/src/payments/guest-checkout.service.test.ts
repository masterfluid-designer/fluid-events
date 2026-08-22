/**
 * Tests unitaires — GuestCheckoutService (lot 1, 2026-08-22).
 *
 * L'achat sans compte ouvre une porte publique sur la création de comptes et
 * de commandes. Ce fichier garde cette porte : qui peut acheter sans compte,
 * sur quels événements, et ce qu'on écrit dans un compte qui existe déjà.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ErrorCodes, Role } from '@saas-events/types';
import { GuestCheckoutService } from './guest-checkout.service';

function makePrisma() {
  return {
    event: { findUnique: vi.fn() },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'u-neuf', email: 'ama@example.com' }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

const phoneService = {
  normalizeToE164: (v: string) => (v.startsWith('+') ? v : null),
};

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
  eventSlug: 'concert-2026',
  email: 'Ama@Example.com ',
  firstName: 'Ama',
  lastName: 'Dzikpé',
  phone: '+22890000000',
};

describe('GuestCheckoutService.resoudreAcheteur()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let service: GuestCheckoutService;

  beforeEach(() => {
    prisma = makePrisma();
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    service = new GuestCheckoutService(prisma as never, audit as never, phoneService as never);
    prisma.event.findUnique.mockResolvedValue({
      id: 'evt-1',
      accessMode: 'TICKETED_GUEST',
      status: 'PUBLISHED',
    });
  });

  it('crée un compte invisible pour un acheteur inconnu', async () => {
    const acheteur = await service.resoudreAcheteur(demande);

    expect(acheteur).toEqual({ id: 'u-neuf', email: 'ama@example.com', role: Role.CLIENT });
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'ama@example.com',
          name: 'Ama Dzikpé',
          isGuest: true,
          role: Role.CLIENT,
        }),
      }),
    );
  });

  it('ne pose ni mot de passe ni identifiant Google — ce compte ne peut pas se connecter', async () => {
    await service.resoudreAcheteur(demande);

    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.passwordHash).toBeUndefined();
    expect(data.googleId).toBeUndefined();
  });

  it("refuse l'achat sans compte sur un événement qui exige un compte", async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'evt-1',
      accessMode: 'TICKETED_ACCOUNT',
      status: 'PUBLISHED',
    });

    const err = await erreurDe(service.resoudreAcheteur(demande));
    expect(err.code).toBe(ErrorCodes.AUTH_REQUIRED_TO_PURCHASE);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("relit le régime EN BASE, jamais dans la demande — sinon la porte s'ouvre par l'API", async () => {
    await service.resoudreAcheteur(demande);

    expect(prisma.event.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'concert-2026' } }),
    );
  });

  it("refuse un événement qui n'est pas publié", async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'evt-1',
      accessMode: 'TICKETED_GUEST',
      status: 'DRAFT',
    });

    await expect(service.resoudreAcheteur(demande)).rejects.toThrow();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('refuse un événement introuvable', async () => {
    prisma.event.findUnique.mockResolvedValue(null);

    await expect(service.resoudreAcheteur(demande)).rejects.toThrow(NotFoundException);
  });

  it('réutilise un compte client existant — la personne doit retrouver TOUS ses billets', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-deja',
      email: 'ama@example.com',
      role: Role.CLIENT,
      isGuest: false,
      name: 'Ama D.',
      phone: '+22891111111',
    });

    const acheteur = await service.resoudreAcheteur(demande);

    expect(acheteur.id).toBe('u-deja');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("n'écrase jamais le nom ni le numéro déjà renseignés par la personne", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-deja',
      email: 'ama@example.com',
      role: Role.CLIENT,
      isGuest: false,
      name: 'Ama D.',
      phone: '+22891111111',
    });

    await service.resoudreAcheteur(demande);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('complète en revanche ce qui manque', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-deja',
      email: 'ama@example.com',
      role: Role.CLIENT,
      isGuest: true,
      name: null,
      phone: null,
    });

    await service.resoudreAcheteur(demande);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-deja' },
      data: { name: 'Ama Dzikpé', phone: '+22890000000' },
    });
  });

  it("refuse d'attacher une commande client à un compte organisateur", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-mgr',
      email: 'ama@example.com',
      role: Role.MANAGER,
      isGuest: false,
      name: 'Ama',
      phone: null,
    });

    const err = await erreurDe(service.resoudreAcheteur(demande));
    expect(err.code).toBe(ErrorCodes.AUTH_REQUIRED_TO_PURCHASE);
  });

  it("n'échoue pas sur un numéro invalide — il sert à joindre, pas à authentifier", async () => {
    await expect(
      service.resoudreAcheteur({ ...demande, phone: '00 pas un numéro' }),
    ).resolves.toMatchObject({ id: 'u-neuf' });

    expect(prisma.user.create.mock.calls[0][0].data.phone).toBeNull();
  });

  it('normalise la casse et les espaces de l’adresse', async () => {
    await service.resoudreAcheteur(demande);

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'ama@example.com' } }),
    );
  });
});
