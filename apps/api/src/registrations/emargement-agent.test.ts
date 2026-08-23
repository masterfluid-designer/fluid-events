/**
 * Tests — la liste d'émargement d'un agent de contrôle (2026-08-23).
 *
 * Ce qui se joue ici n'est pas l'affichage : c'est que l'événement d'un agent
 * vienne de son COMPTE et jamais de la requête. Une liste d'inscrits est
 * nominative — noms, emails, téléphones — et un agent recruté pour une soirée
 * ne doit pas pouvoir lire celle de la soirée d'à côté.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventAccessMode, ErrorCodes } from '@saas-events/types';
import { RegistrationsService } from './registrations.service';

function makePrisma() {
  return {
    event: { findUnique: vi.fn() },
    registration: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockResolvedValue({ id: 'reg-1', checkedInAt: null }),
    },
  };
}

function corps(err: unknown): { code?: string; message?: string } {
  return (err as { response: Record<string, unknown> }).response as never;
}

describe('RegistrationsService — côté agent de contrôle', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let acces: { resoudreEvenementDeLAgent: ReturnType<typeof vi.fn> };
  let service: RegistrationsService;

  beforeEach(() => {
    prisma = makePrisma();
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    acces = {
      resoudreEvenementDeLAgent: vi
        .fn()
        .mockResolvedValue({ eventId: 'evt-1', accessMode: EventAccessMode.RSVP }),
    };
    service = new RegistrationsService(
      prisma as never,
      audit as never,
      acces as never,
      {} as never,
      {} as never,
    );
  });

  describe('listerPourAgent()', () => {
    it("n'accepte aucun identifiant d'événement : il vient du compte", async () => {
      await service.listerPourAgent('user-agent');

      expect(acces.resoudreEvenementDeLAgent).toHaveBeenCalledWith('user-agent');
      // Toutes les requêtes portent l'événement RÉSOLU, pas un paramètre.
      for (const appel of prisma.registration.count.mock.calls) {
        expect(appel[0].where.eventId).toBe('evt-1');
      }
      expect(prisma.registration.findMany.mock.calls[0][0].where).toEqual({ eventId: 'evt-1' });
    });

    /*
     * Par nom : à la porte on cherche quelqu'un, on ne consulte pas le
     * journal des inscriptions. L'ordre par date rendrait la liste
     * inutilisable dès la trentième ligne.
     */
    it('trie par nom, pas par date d’inscription', async () => {
      await service.listerPourAgent('user-agent');

      expect(prisma.registration.findMany.mock.calls[0][0].orderBy).toEqual([
        { lastName: 'asc' },
        { firstName: 'asc' },
      ]);
    });

    it('refuse un événement qui vend des billets', async () => {
      acces.resoudreEvenementDeLAgent.mockResolvedValue({
        eventId: 'evt-2',
        accessMode: EventAccessMode.TICKETED_ACCOUNT,
      });

      const erreur = await service.listerPourAgent('user-agent').catch((e: unknown) => e);

      expect(erreur).toBeInstanceOf(BadRequestException);
      expect(corps(erreur).code).toBe(ErrorCodes.EVENT_ACCESS_MODE_MISMATCH);
      expect(prisma.registration.findMany).not.toHaveBeenCalled();
    });

    /*
     * Le plafond n'est pas décoratif : au-delà, l'agent chercherait un nom qui
     * n'a jamais été chargé et conclurait que la personne n'est pas inscrite.
     */
    it('signale une liste tronquée plutôt que de la laisser croire complète', async () => {
      prisma.registration.count.mockResolvedValueOnce(2500).mockResolvedValueOnce(10);

      const resultat = await service.listerPourAgent('user-agent');

      expect(resultat.tronquee).toBe(true);
      expect(prisma.registration.findMany.mock.calls[0][0].take).toBe(2000);
    });

    it('ne signale rien tant que la liste tient sous le plafond', async () => {
      prisma.registration.count.mockResolvedValueOnce(7).mockResolvedValueOnce(1);

      const resultat = await service.listerPourAgent('user-agent');

      expect(resultat.tronquee).toBe(false);
      expect(resultat.total).toBe(7);
      expect(resultat.presents).toBe(1);
    });
  });

  describe('pointerParAgent()', () => {
    it('pointe un inscrit de son propre événement', async () => {
      prisma.registration.findUnique.mockResolvedValue({ id: 'reg-1', eventId: 'evt-1' });
      prisma.registration.update.mockResolvedValue({ id: 'reg-1', checkedInAt: new Date() });

      await service.pointerParAgent('user-agent', 'reg-1', true);

      expect(prisma.registration.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'reg-1' } }),
      );
      expect(prisma.registration.update.mock.calls[0][0].data.checkedInAt).toBeInstanceOf(Date);
    });

    /*
     * Réversible : on se trompe de ligne sur un téléphone, debout, dans le
     * bruit. Dépointer remet à `null`, pas à une date.
     */
    it('dépointe en remettant à null', async () => {
      prisma.registration.findUnique.mockResolvedValue({ id: 'reg-1', eventId: 'evt-1' });

      await service.pointerParAgent('user-agent', 'reg-1', false);

      expect(prisma.registration.update.mock.calls[0][0].data).toEqual({ checkedInAt: null });
    });

    /*
     * LE test de ce fichier. Sans lui, un agent pointerait — et donc
     * confirmerait l'existence — d'un inscrit de l'événement d'un autre
     * organisateur, en changeant un identifiant.
     */
    it("refuse un inscrit qui n'est pas sur son événement", async () => {
      prisma.registration.findUnique.mockResolvedValue({ id: 'reg-9', eventId: 'evt-AUTRE' });

      const erreur = await service.pointerParAgent('user-agent', 'reg-9', true).catch((e) => e);

      expect(erreur).toBeInstanceOf(NotFoundException);
      expect(prisma.registration.update).not.toHaveBeenCalled();
    });

    /*
     * Et il le refuse avec le MÊME message qu'un identifiant inexistant : une
     * erreur distincte confirmerait à un agent curieux que cet identifiant
     * existe bien ailleurs sur la plateforme.
     */
    it('répond identiquement à « inexistant » et « pas le vôtre »', async () => {
      prisma.registration.findUnique.mockResolvedValue({ id: 'reg-9', eventId: 'evt-AUTRE' });
      const pasLeSien = await service.pointerParAgent('user-agent', 'reg-9', true).catch((e) => e);

      prisma.registration.findUnique.mockResolvedValue(null);
      const inexistant = await service.pointerParAgent('user-agent', 'reg-X', true).catch((e) => e);

      expect(corps(pasLeSien)).toEqual(corps(inexistant));
    });

    it('journalise le pointage en nommant son auteur', async () => {
      prisma.registration.findUnique.mockResolvedValue({ id: 'reg-1', eventId: 'evt-1' });

      await service.pointerParAgent('user-agent', 'reg-1', true);

      expect(audit.log).toHaveBeenCalledWith(
        'registration.checked_in',
        'Registration',
        'reg-1',
        expect.objectContaining({ present: true, par: 'agent' }),
        'user-agent',
      );
    });
  });
});
