/**
 * Tests unitaires — TicketsService
 * Ownership Manager obligatoire (RULES.md §1) : un Manager ne peut créer/lire/
 * modifier/supprimer un billet QUE sur son propre événement.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TicketsService } from './tickets.service';

const OWNED_EVENT = { id: 'ev-1', managerId: 'mgr-1' };
const OTHER_EVENT = { id: 'ev-2', managerId: 'mgr-2' };

function makePrisma() {
  return {
    event: { findUnique: vi.fn() },
    ticket: {
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
