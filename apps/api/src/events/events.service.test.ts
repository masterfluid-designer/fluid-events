/**
 * Tests unitaires — EventsService
 * Vue manager (mine/overview) et participants — ownership + agrégats réels
 * (CDC §1.4 : 1 Manager = 1 Event ; RULES.md §1 : ownership check en service).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
    service = new EventsService(prisma as any, { log: vi.fn().mockResolvedValue(undefined) } as any);
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
    service = new EventsService(prisma as any, { log: vi.fn().mockResolvedValue(undefined) } as any);
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

  it('persiste les champs de contenu centralisé (faqs/schedule/speakers/galleryImages/sponsorImages)', async () => {
    prisma.event.findUnique.mockResolvedValue({ id: 'ev-1' });
    prisma.event.update.mockResolvedValue({ id: 'ev-1' });

    const faqs = [{ id: 'f1', question: 'Q ?', answer: 'R.' }];
    const schedule = [{ id: 's1', startsAt: '2026-12-31T20:00:00.000Z', title: 'Ouverture des portes' }];
    const speakers = [{ id: 'sp1', name: 'Jane Doe', role: 'Keynote' }];

    await service.updateMyEvent('mgr-1', { faqs, schedule, speakers } as any);

    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: 'ev-1' },
      data: expect.objectContaining({ faqs, schedule, speakers }),
    });
  });

  describe("whitelist d'URL image (RULES.md §6)", () => {
    const ORIGINAL_ENV = { ...process.env };

    beforeEach(() => {
      process.env.STORAGE_ENDPOINT = 'http://localhost:9000';
      process.env.STORAGE_BUCKET = 'fluid-events';
    });

    afterEach(() => {
      process.env = { ...ORIGINAL_ENV };
    });

    it('400 si logoUrl pointe vers un domaine hors whitelist', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'ev-1' });

      await expect(
        service.updateMyEvent('mgr-1', { logoUrl: 'https://evil.com/logo.png' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it("400 si la photo d'un speaker pointe vers un domaine hors whitelist", async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'ev-1' });

      await expect(
        service.updateMyEvent('mgr-1', {
          speakers: [{ id: 'sp1', name: 'Jane', role: 'Keynote', photoUrl: 'https://evil.com/x.png' }],
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('400 si une image de galerie ou de sponsor pointe hors whitelist', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'ev-1' });

      await expect(
        service.updateMyEvent('mgr-1', {
          galleryImages: [{ id: 'g1', url: 'https://evil.com/x.png' }],
        } as any),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateMyEvent('mgr-1', {
          sponsorImages: [{ id: 'sp1', url: 'https://evil.com/x.png' }],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('sauvegarde quand les images pointent vers le stockage whitelisté', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'ev-1' });
      prisma.event.update.mockResolvedValue({ id: 'ev-1' });

      const url = 'http://localhost:9000/fluid-events/uploads/mgr-1/x.png';
      await service.updateMyEvent('mgr-1', {
        logoUrl: url,
        speakers: [{ id: 'sp1', name: 'Jane', role: 'Keynote', photoUrl: url }],
        galleryImages: [{ id: 'g1', url }],
        sponsorImages: [{ id: 'sp1', url }],
      } as any);

      expect(prisma.event.update).toHaveBeenCalled();
    });
  });
});

describe('EventsService.getMyEvent()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: EventsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new EventsService(prisma as any, { log: vi.fn().mockResolvedValue(undefined) } as any);
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
    service = new EventsService(prisma as any, { log: vi.fn().mockResolvedValue(undefined) } as any);
  });

  it('agrège revenus, ventes et scans depuis les vraies commandes payées', async () => {
    const today = new Date();
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
      paymentProviderConfigs: [{ provider: 'KKIAPAY' }],
      tickets: [
        { name: 'VIP Or', stock: 10, stockSold: 5 },
        { name: 'Standard', stock: 100, stockSold: 20 },
      ],
    });
    prisma.order.findMany.mockResolvedValue([
      {
        paidAt: today,
        items: [
          { unitPrice: 15000, ticketId: 'tk-vip', ticket: { name: 'VIP Or' } },
          { unitPrice: 6000, ticketId: 'tk-std', ticket: { name: 'Standard' } },
        ],
      },
      {
        paidAt: today,
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
    expect(result.paymentStatus).toEqual({ configured: true, provider: 'KKIAPAY' });
    expect(result.fillRateByTicketType).toEqual([
      { name: 'VIP Or', stock: 10, stockSold: 5, fillRate: 50 },
      { name: 'Standard', stock: 100, stockSold: 20, fillRate: 20 },
    ]);
    // Les deux commandes payées aujourd'hui sont regroupées dans le dernier bucket.
    expect(result.salesOverTime).toHaveLength(30);
    expect(result.salesOverTime[29]).toEqual({
      date: today.toISOString().slice(0, 10),
      revenue: 36000,
      ticketsSold: 3,
    });
  });

  it("404 si le manager n'a pas d'événement", async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    await expect(service.getMyEventOverview('mgr-1')).rejects.toThrow(NotFoundException);
  });

  it("paymentStatus.configured=false si aucun provider actif pour l'événement", async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'ev-1',
      title: 'Concert',
      slug: 'concert',
      status: 'PUBLISHED',
      scanners: [],
      paymentProviderConfigs: [],
      tickets: [],
    });
    prisma.order.findMany.mockResolvedValue([]);

    const result = await service.getMyEventOverview('mgr-1');

    expect(result.paymentStatus).toEqual({ configured: false, provider: null });
  });

  it('fillRate=0 pour un billet à stock 0 (évite une division par zéro)', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'ev-1',
      title: 'Concert',
      slug: 'concert',
      status: 'PUBLISHED',
      scanners: [],
      paymentProviderConfigs: [],
      tickets: [{ name: 'Épuisé au setup', stock: 0, stockSold: 0 }],
    });
    prisma.order.findMany.mockResolvedValue([]);

    const result = await service.getMyEventOverview('mgr-1');

    expect(result.fillRateByTicketType).toEqual([
      { name: 'Épuisé au setup', stock: 0, stockSold: 0, fillRate: 0 },
    ]);
  });
});

describe('EventsService.getParticipants()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: EventsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new EventsService(prisma as any, { log: vi.fn().mockResolvedValue(undefined) } as any);
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

describe('EventsService.getPublicEventBySlug()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: EventsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new EventsService(prisma as any, { log: vi.fn().mockResolvedValue(undefined) } as any);
  });

  it('retourne l’événement publié avec ses billets et les blocs Builder', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'ev-1',
      slug: 'concert-2026',
      status: 'PUBLISHED',
      tickets: [{ id: 'tk-1' }],
      eventPage: { blocks: [{ id: 'b-1', type: 'hero', order: 0, props: {} }] },
    });

    const result = await service.getPublicEventBySlug('concert-2026');

    expect(result.eventPage?.blocks).toEqual([{ id: 'b-1', type: 'hero', order: 0, props: {} }]);
    expect(prisma.event.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ eventPage: { select: { blocks: true } } }),
      }),
    );
  });

  it("404 si l'événement n'existe pas", async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    await expect(service.getPublicEventBySlug('unknown')).rejects.toThrow(NotFoundException);
  });

  it("404 si l'événement n'est pas PUBLISHED (ex: CANCELLED)", async () => {
    prisma.event.findUnique.mockResolvedValue({ id: 'ev-1', status: 'CANCELLED' });
    await expect(service.getPublicEventBySlug('concert-2026')).rejects.toThrow(NotFoundException);
  });
});
