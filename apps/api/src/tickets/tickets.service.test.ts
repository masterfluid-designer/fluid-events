/**
 * Tests unitaires — TicketsService
 * Ownership Manager obligatoire (RULES.md §1) : un Manager ne peut créer/lire/
 * modifier/supprimer un billet QUE sur son propre événement.
 */
import { ErrorCodes } from '@saas-events/types';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TicketsService } from './tickets.service';

const OWNED_EVENT = { id: 'ev-1', managerId: 'mgr-1' };
const OTHER_EVENT = { id: 'ev-2', managerId: 'mgr-2' };

function makePrisma() {
  return {
    event: { findUnique: vi.fn() },
    eventDay: { findFirst: vi.fn().mockResolvedValue({ id: 'd-1' }) },
    ticket: {
      aggregate: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe('TicketsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: TicketsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new TicketsService(prisma as any);
  });

  describe('createTicket()', () => {
    it("crée le ticket quand le manager possède l'événement", async () => {
      prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);
      prisma.ticket.create.mockResolvedValue({ id: 'tk-1' });

      const result = await service.createTicket('ev-1', 'mgr-1', {
        name: 'VIP',
        price: 5000,
        stock: 100,
      } as any);

      expect(result).toEqual({ id: 'tk-1' });
      expect(prisma.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventId: 'ev-1', name: 'VIP' }) }),
      );
    });


    // ─── Plafond de capacité (décision produit 2026-08-16) ──────────────────
    // `event.findUnique` est appelé deux fois : d'abord pour l'ownership, puis
    // par le garde de capacité — d'où le séquençage par `mockResolvedValueOnce`.

    it("refuse un billet qui ferait dépasser le nombre de personnes prévues", async () => {
      prisma.event.findUnique
        .mockResolvedValueOnce(OWNED_EVENT)
        .mockResolvedValueOnce({ expectedAttendees: 500 });
      prisma.ticket.aggregate.mockResolvedValue({ _sum: { stock: 450 } });

      await expect(
        service.createTicket('ev-1', 'mgr-1', { name: 'VIP', price: 5000, stock: 100 } as any),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: ErrorCodes.EVENT_CAPACITY_EXCEEDED }),
      });
      expect(prisma.ticket.create).not.toHaveBeenCalled();
    });

    it('accepte un billet qui atteint exactement le plafond', async () => {
      prisma.event.findUnique
        .mockResolvedValueOnce(OWNED_EVENT)
        .mockResolvedValueOnce({ expectedAttendees: 500 });
      prisma.ticket.aggregate.mockResolvedValue({ _sum: { stock: 400 } });
      prisma.ticket.create.mockResolvedValue({ id: 'tk-1' });

      await expect(
        service.createTicket('ev-1', 'mgr-1', { name: 'VIP', price: 5000, stock: 100 } as any),
      ).resolves.toEqual({ id: 'tk-1' });
    });

    it("ne plafonne rien quand l'événement n'a pas de capacité déclarée", async () => {
      prisma.event.findUnique
        .mockResolvedValueOnce(OWNED_EVENT)
        .mockResolvedValueOnce({ expectedAttendees: null });
      prisma.ticket.create.mockResolvedValue({ id: 'tk-1' });

      await service.createTicket('ev-1', 'mgr-1', { name: 'VIP', price: 5000, stock: 99999 } as any);

      // Aucun agrégat interrogé : on sort avant, la requête serait gaspillée.
      expect(prisma.ticket.aggregate).not.toHaveBeenCalled();
      expect(prisma.ticket.create).toHaveBeenCalled();
    });

    it('compte le premier billet seul quand aucun autre stock n\u0027existe (_sum à null)', async () => {
      prisma.event.findUnique
        .mockResolvedValueOnce(OWNED_EVENT)
        .mockResolvedValueOnce({ expectedAttendees: 50 });
      // Prisma renvoie `null`, pas 0, quand aucune ligne ne correspond.
      prisma.ticket.aggregate.mockResolvedValue({ _sum: { stock: null } });

      await expect(
        service.createTicket('ev-1', 'mgr-1', { name: 'VIP', price: 5000, stock: 80 } as any),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: ErrorCodes.EVENT_CAPACITY_EXCEEDED }),
      });
    });

    // ─── Rattachement à une journée (décision produit 2026-08-16) ───────────
    // `event.findUnique` sert successivement à l'ownership, au plafond de
    // capacité, puis au régime de billetterie — d'où le séquençage.

    it("refuse une journée quand l'événement n'est pas en régime « billet par jour »", async () => {
      prisma.event.findUnique
        .mockResolvedValueOnce(OWNED_EVENT)
        .mockResolvedValueOnce({ expectedAttendees: null })
        .mockResolvedValueOnce({ ticketPolicy: 'SINGLE_DAY' });

      await expect(
        service.createTicket('ev-1', 'mgr-1', {
          name: 'VIP',
          price: 5000,
          stock: 10,
          eventDayId: 'd-1',
        } as any),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: ErrorCodes.TICKET_DAY_INVALID }),
      });
      expect(prisma.ticket.create).not.toHaveBeenCalled();
    });

    it('exige une journée en régime PER_DAY', async () => {
      prisma.event.findUnique
        .mockResolvedValueOnce(OWNED_EVENT)
        .mockResolvedValueOnce({ expectedAttendees: null })
        .mockResolvedValueOnce({ ticketPolicy: 'PER_DAY' });

      await expect(
        service.createTicket('ev-1', 'mgr-1', { name: 'VIP', price: 5000, stock: 10 } as any),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: ErrorCodes.TICKET_DAY_INVALID }),
      });
    });

    it("refuse une journée appartenant à un autre événement", async () => {
      // Sinon un manager ouvrirait une porte chez un organisateur voisin.
      prisma.event.findUnique
        .mockResolvedValueOnce(OWNED_EVENT)
        .mockResolvedValueOnce({ expectedAttendees: null })
        .mockResolvedValueOnce({ ticketPolicy: 'PER_DAY' });
      prisma.eventDay.findFirst.mockResolvedValue(null);

      await expect(
        service.createTicket('ev-1', 'mgr-1', {
          name: 'VIP',
          price: 5000,
          stock: 10,
          eventDayId: 'd-autre-event',
        } as any),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: ErrorCodes.TICKET_DAY_INVALID }),
      });
    });

    it('accepte un billet rattaché à une journée de son propre événement', async () => {
      prisma.event.findUnique
        .mockResolvedValueOnce(OWNED_EVENT)
        .mockResolvedValueOnce({ expectedAttendees: null })
        .mockResolvedValueOnce({ ticketPolicy: 'PER_DAY' });
      prisma.eventDay.findFirst.mockResolvedValue({ id: 'd-1' });
      prisma.ticket.create.mockResolvedValue({ id: 'tk-1' });

      await service.createTicket('ev-1', 'mgr-1', {
        name: 'VIP',
        price: 5000,
        stock: 10,
        eventDayId: 'd-1',
      } as any);

      expect(prisma.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventDayId: 'd-1' }) }),
      );
    });

    it("refuse (403) si le manager ne possède pas l'événement", async () => {
      prisma.event.findUnique.mockResolvedValue(OTHER_EVENT);

      await expect(
        service.createTicket('ev-2', 'mgr-1', { name: 'VIP', price: 5000, stock: 100 } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.ticket.create).not.toHaveBeenCalled();
    });

    it('refuse (404) si l\'événement est introuvable', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(
        service.createTicket('unknown', 'mgr-1', { name: 'VIP', price: 5000, stock: 100 } as any),
      ).rejects.toThrow(NotFoundException);
    });

    describe("whitelist designImageUrl (RULES.md §6)", () => {
      const ORIGINAL_ENV = { ...process.env };

      beforeEach(() => {
        process.env.STORAGE_ENDPOINT = 'http://localhost:9000';
        process.env.STORAGE_BUCKET = 'fluid-events';
      });

      afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
      });

      it('400 si designImageUrl pointe vers un domaine hors whitelist', async () => {
        prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);

        await expect(
          service.createTicket('ev-1', 'mgr-1', {
            name: 'VIP',
            price: 5000,
            stock: 100,
            designImageUrl: 'https://evil.com/x.png',
          } as any),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.ticket.create).not.toHaveBeenCalled();
      });

      it('crée le ticket quand designImageUrl pointe vers le stockage whitelisté', async () => {
        prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);
        prisma.ticket.create.mockResolvedValue({ id: 'tk-1' });

        await service.createTicket('ev-1', 'mgr-1', {
          name: 'VIP',
          price: 5000,
          stock: 100,
          designImageUrl: 'http://localhost:9000/fluid-events/uploads/mgr-1/x.png',
        } as any);

        expect(prisma.ticket.create).toHaveBeenCalled();
      });
    });
  });

  describe('listByEvent()', () => {
    it('liste les tickets si ownership ok', async () => {
      prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);
      prisma.ticket.findMany.mockResolvedValue([{ id: 'tk-1' }]);

      const result = await service.listByEvent('ev-1', 'mgr-1');
      expect(result).toEqual([{ id: 'tk-1' }]);
    });

    it("refuse si le manager n'est pas propriétaire", async () => {
      prisma.event.findUnique.mockResolvedValue(OTHER_EVENT);
      await expect(service.listByEvent('ev-2', 'mgr-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getTicket() / updateTicket() / deleteTicket()', () => {
    const ownedTicket = { id: 'tk-1', event: OWNED_EVENT };
    const foreignTicket = { id: 'tk-2', event: OTHER_EVENT };

    it('getTicket() retourne le ticket si ownership ok', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ownedTicket);
      const result = await service.getTicket('tk-1', 'mgr-1');
      expect(result).toEqual(ownedTicket);
    });

    it('getTicket() 404 si ticket introuvable', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null);
      await expect(service.getTicket('unknown', 'mgr-1')).rejects.toThrow(NotFoundException);
    });

    it('getTicket() 403 si le ticket appartient à un autre manager', async () => {
      prisma.ticket.findUnique.mockResolvedValue(foreignTicket);
      await expect(service.getTicket('tk-2', 'mgr-1')).rejects.toThrow(ForbiddenException);
    });

    it('updateTicket() met à jour si ownership ok', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ownedTicket);
      prisma.ticket.update.mockResolvedValue({ id: 'tk-1', name: 'VIP Or' });

      const result = await service.updateTicket('tk-1', 'mgr-1', { name: 'VIP Or' } as any);
      expect(result).toEqual({ id: 'tk-1', name: 'VIP Or' });
    });

    it("updateTicket() refuse si le manager n'est pas propriétaire", async () => {
      prisma.ticket.findUnique.mockResolvedValue(foreignTicket);
      await expect(
        service.updateTicket('tk-2', 'mgr-1', { name: 'Hack' } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.ticket.update).not.toHaveBeenCalled();
    });

    it('deleteTicket() supprime si ownership ok', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ownedTicket);
      prisma.ticket.delete.mockResolvedValue({});

      await expect(service.deleteTicket('tk-1', 'mgr-1')).resolves.toBeUndefined();
      expect(prisma.ticket.delete).toHaveBeenCalledWith({ where: { id: 'tk-1' } });
    });

    it('deleteTicket() convertit une violation FK (commandes existantes) en 409', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ownedTicket);
      const fkError = new Prisma.PrismaClientKnownRequestError('fk', {
        code: 'P2003',
        clientVersion: '5.22.0',
      });
      prisma.ticket.delete.mockRejectedValue(fkError);

      await expect(service.deleteTicket('tk-1', 'mgr-1')).rejects.toThrow(ConflictException);
    });

    it('deleteTicket() propage les erreurs non-FK', async () => {
      prisma.ticket.findUnique.mockResolvedValue(ownedTicket);
      prisma.ticket.delete.mockRejectedValue(new Error('connection lost'));

      await expect(service.deleteTicket('tk-1', 'mgr-1')).rejects.toThrow('connection lost');
    });
  });
});
