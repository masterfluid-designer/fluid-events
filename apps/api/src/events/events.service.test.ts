/**
 * Tests unitaires — EventsService
 * Vue manager (mine/overview) et participants — ownership + agrégats réels
 * (CDC §1.4 : 1 Manager = 1 Event ; RULES.md §1 : ownership check en service).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventsService } from './events.service';

function makePrisma() {
  return {
    event: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    order: { findMany: vi.fn() },
  };
}

describe('EventsService.createEvent()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: EventsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new EventsService(prisma as any);
  });

  const dto = {
    slug: 'concert-2026',
    title: 'Concert',
    startDate: '2026-12-31T20:00:00Z',
    endDate: '2027-01-01T02:00:00Z',
  } as any;

  it("crée l'événement avec managerId dérivé du paramètre (jamais du body)", async () => {
    prisma.event.create.mockResolvedValue({ id: 'ev-1', managerId: 'mgr-1' });

    const result = await service.createEvent('mgr-1', dto);

    expect(result).toEqual({ id: 'ev-1', managerId: 'mgr-1' });
    expect(prisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ managerId: 'mgr-1', slug: 'concert-2026' }) }),
    );
  });

  it('409 si le manager a déjà un événement (contrainte unique managerId)', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: '5.22.0',
    });
    prisma.event.create.mockRejectedValue(p2002);

    await expect(service.createEvent('mgr-1', dto)).rejects.toThrow(ConflictException);
  });

  it('propage les erreurs non-P2002', async () => {
    prisma.event.create.mockRejectedValue(new Error('db down'));
    await expect(service.createEvent('mgr-1', dto)).rejects.toThrow('db down');
  });
});

describe('EventsService.updateMyEvent()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: EventsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new EventsService(prisma as any);
  });

  it("met à jour l'événement du manager authentifié", async () => {
    prisma.event.findUnique.mockResolvedValue({ id: 'ev-1' });
    prisma.event.update.mockResolvedValue({ id: 'ev-1', title: 'Nouveau titre' });

    const result = await service.updateMyEvent('mgr-1', { title: 'Nouveau titre' } as any);

    expect(result).toEqual({ id: 'ev-1', title: 'Nouveau titre' });
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: 'ev-1' },
      data: expect.objectContaining({ title: 'Nouveau titre' }),
    });
  });

  it("404 si le manager n'a pas d'événement", async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    await expect(service.updateMyEvent('mgr-1', { title: 'X' } as any)).rejects.toThrow(NotFoundException);
    expect(prisma.event.update).not.toHaveBeenCalled();
  });
});

describe('EventsService.getMyEvent()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: EventsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new EventsService(prisma as any);
  });

  it("retourne l'événement du manager avec ses tickets", async () => {
    prisma.event.findUnique.mockResolvedValue({ id: 'ev-1', managerId: 'mgr-1', tickets: [] });
    const result = await service.getMyEvent('mgr-1');
    expect(result).toEqual({ id: 'ev-1', managerId: 'mgr-1', tickets: [] });
  });

  it("404 si le manager n'a pas d'événement", async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    await expect(service.getMyEvent('mgr-1')).rejects.toThrow(NotFoundException);
  });
});

describe('EventsService.getMyEventOverview()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: EventsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new EventsService(prisma as any);
  });

  it('agrège revenus, ventes et scans depuis les vraies commandes payées', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'ev-1',
      title: 'Concert',
      slug: 'concert',
      status: 'PUBLISHED',
      scanners: [
        {
          name: 'Entrée Nord',
          logs: [
            { result: 'VALID', scannedAt: new Date('2026-07-01T10:00:00Z') },
            { result: 'VALID', scannedAt: new Date('2026-07-01T11:00:00Z') },
            { result: 'ALREADY_USED', scannedAt: new Date('2026-07-01T12:00:00Z') },
          ],
        },
      ],
    });
    prisma.order.findMany.mockResolvedValue([
      {
        items: [
          { unitPrice: 15000, ticketId: 'tk-vip', ticket: { name: 'VIP Or' } },
          { unitPrice: 6000, ticketId: 'tk-std', ticket: { name: 'Standard' } },
        ],
      },
      {
        items: [{ unitPrice: 15000, ticketId: 'tk-vip', ticket: { name: 'VIP Or' } }],
      },
    ]);

    const result = await service.getMyEventOverview('mgr-1');

    expect(result.event).toEqual({ id: 'ev-1', title: 'Concert', slug: 'concert', status: 'PUBLISHED' });
    expect(result.totalRevenue).toBe(36000);
    expect(result.ticketsSold).toBe(3);
    expect(result.revenueByTicketType).toEqual([
      { name: 'VIP Or', revenue: 30000, count: 2 },
      { name: 'Standard', revenue: 6000, count: 1 },
    ]);
    // Seuls les scans VALID comptent, pas ALREADY_USED
    expect(result.scansByScanner).toEqual([
      { name: 'Entrée Nord', scans: 2, lastScanAt: new Date('2026-07-01T11:00:00Z') },
    ]);
  });

  it("404 si le manager n'a pas d'événement", async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    await expect(service.getMyEventOverview('mgr-1')).rejects.toThrow(NotFoundException);
  });
});

describe('EventsService.getParticipants()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: EventsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new EventsService(prisma as any);
  });

  it('liste les participants des commandes payées uniquement', async () => {
    prisma.event.findUnique.mockResolvedValue({ id: 'ev-1', managerId: 'mgr-1' });
    prisma.order.findMany.mockResolvedValue([
      {
        orderNumber: 'ORD-1',
        paidAt: new Date('2026-07-01T10:00:00Z'),
        client: { name: 'Jean Dupont', email: 'jean@x.com' },
        items: [{ isScanned: true, ticket: { name: 'VIP Or' } }],
      },
    ]);

    const result = await service.getParticipants('ev-1', 'mgr-1');

    expect(result).toEqual([
      {
        orderNumber: 'ORD-1',
        clientName: 'Jean Dupont',
        clientEmail: 'jean@x.com',
        ticketName: 'VIP Or',
        purchasedAt: new Date('2026-07-01T10:00:00Z'),
        isScanned: true,
      },
    ]);
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: 'ev-1', status: 'PAID' } }),
    );
  });

  it('404 si événement introuvable', async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    await expect(service.getParticipants('unknown', 'mgr-1')).rejects.toThrow(NotFoundException);
  });

  it("403 si le manager n'est pas le propriétaire de l'événement", async () => {
    prisma.event.findUnique.mockResolvedValue({ id: 'ev-1', managerId: 'other-mgr' });
    await expect(service.getParticipants('ev-1', 'mgr-1')).rejects.toThrow(ForbiddenException);
  });
});
