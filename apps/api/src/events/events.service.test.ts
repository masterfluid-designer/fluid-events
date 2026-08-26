/**
 * Tests unitaires — EventsService
 * Vue manager (mine/overview) et participants — ownership + agrégats réels
 * (CDC §1.4 : 1 Manager = 1 Event ; RULES.md §1 : ownership check en service).
 */
import { ErrorCodes } from '@saas-events/types';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventsService } from './events.service';

function makePrisma() {
  // `_tx` expose les appels faits dans la transaction (remplacement des
  // journées), que les tests inspectent.
  const tx = {
    eventDay: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn().mockResolvedValue({}),
    },
    ticket: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  return {
    event: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    // `getMyEvent` compte aussi ce que la bascule de régime conserve.
    order: { findMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    registration: {
      count: vi.fn().mockResolvedValue(0),
      // Série des inscriptions dans le temps, pour l'accueil d'un événement
      // sur inscription (2026-08-22).
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: { findUnique: vi.fn() },
    eventDay: { findMany: vi.fn().mockResolvedValue([]) },
    orderItem: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn().mockImplementation((fn: any) => fn(tx)),
    _tx: tx,
  };
}


/**
 * Faux EventAccessService. Le vrai est couvert par ses propres tests
 * (common/event-access.service.test.ts) : ici on ne teste pas la résolution,
 * on la suppose faite. Par défaut elle renvoie l'identifiant demandé, ou
 * `ev-1` — celui que les mocks Prisma de ce fichier renvoient déjà.
 */
function makeAcces() {
  return {
    resoudreEvenementDuManager: vi.fn(async (_managerId: string, eventId?: string) => eventId ?? 'ev-1'),
    assertQuotaEvenements: vi.fn().mockResolvedValue(undefined),
    plafondScanners: vi.fn().mockResolvedValue(3),
  };
}

/**
 * Double du service qui recopie les configs de paiement « globales » sur un
 * événement neuf (2026-08-24). Il avale ses propres échecs — la création ne
 * doit jamais échouer pour une histoire de clés recopiées.
 */
function makePaiements() {
  return { heriterDesConfigsGlobales: vi.fn().mockResolvedValue(0) };
}
describe('EventsService.createEvent()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: EventsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new EventsService(prisma as any, { log: vi.fn().mockResolvedValue(undefined) } as any, makeAcces() as any, makePaiements() as any);
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
    service = new EventsService(prisma as any, { log: vi.fn().mockResolvedValue(undefined) } as any, makeAcces() as any, makePaiements() as any);
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

  it("propage le refus quand le manager n'a pas d'événement", async () => {
    // La résolution a déménagé dans EventAccessService (2026-08-21), qui a
    // ses propres tests. Ce qu’on vérifie ici : le refus remonte, et rien
    // n’est écrit au passage.
    const acces = makeAcces();
    acces.resoudreEvenementDuManager.mockRejectedValue(new NotFoundException({}));
    const isole = new EventsService(
      prisma as any,
      { log: vi.fn().mockResolvedValue(undefined) } as any,
      acces as any,
      makePaiements() as any,
    );

    await expect(isole.updateMyEvent('mgr-1', { title: 'X' } as any)).rejects.toThrow(NotFoundException);
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
    service = new EventsService(prisma as any, { log: vi.fn().mockResolvedValue(undefined) } as any, makeAcces() as any, makePaiements() as any);
  });

  it("retourne l'événement du manager avec ses tickets", async () => {
    prisma.event.findUnique.mockResolvedValue({ id: 'ev-1', managerId: 'mgr-1', tickets: [] });
    prisma.order.count.mockResolvedValue(4);
    prisma.registration.count.mockResolvedValue(9);

    const result = await service.getMyEvent('mgr-1');

    // Les deux compteurs accompagnent l’événement : l’écran de changement de
    // régime doit annoncer ce qui est conservé avec des chiffres réels.
    expect(result).toEqual({
      id: 'ev-1',
      managerId: 'mgr-1',
      tickets: [],
      commandesPayees: 4,
      inscriptions: 9,
    });
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
    service = new EventsService(prisma as any, { log: vi.fn().mockResolvedValue(undefined) } as any, makeAcces() as any, makePaiements() as any);
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
    service = new EventsService(prisma as any, { log: vi.fn().mockResolvedValue(undefined) } as any, makeAcces() as any, makePaiements() as any);
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
    service = new EventsService(prisma as any, { log: vi.fn().mockResolvedValue(undefined) } as any, makeAcces() as any, makePaiements() as any);
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
        include: expect.objectContaining({
          eventPage: { select: { blocks: true, theme: true } },
        }),
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

/**
 * Régime de billetterie et journées (décision produit 2026-08-16).
 * Le multi-jours est réservé au palier Premium ; une journée à laquelle des
 * billets sont rattachés ne peut pas disparaître.
 */
describe('EventsService.updateMyEvent() — journées et régime', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: EventsService;

  const TWO_DAYS = [
    { label: 'Jour 1', date: '2026-08-08' },
    { label: 'Jour 2', date: '2026-08-09' },
  ];

  beforeEach(() => {
    prisma = makePrisma();
    service = new EventsService(prisma as any, { log: vi.fn().mockResolvedValue(undefined) } as any, makeAcces() as any, makePaiements() as any);
    prisma.event.findUnique.mockResolvedValue({ id: 'ev-1', ticketPolicy: 'SINGLE_DAY' });
    prisma.event.update.mockResolvedValue({ id: 'ev-1' });
    prisma.eventDay.findMany.mockResolvedValue([]);
  });

  it('refuse le multi-jours à un manager non Premium (PREMIUM_REQUIRED)', async () => {
    prisma.user.findUnique.mockResolvedValue({ plan: 'FREE' });

    await expect(
      service.updateMyEvent('mgr-1', { ticketPolicy: 'PER_DAY', days: TWO_DAYS } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCodes.PREMIUM_REQUIRED }),
    });
    // Le refus doit précéder toute écriture — pas de régime à moitié appliqué.
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('refuse une seule journée en multi-jours (une journée, c’est SINGLE_DAY)', async () => {
    prisma.user.findUnique.mockResolvedValue({ plan: 'PREMIUM' });

    await expect(
      service.updateMyEvent('mgr-1', {
        ticketPolicy: 'PASS_ALL_DAYS',
        days: [{ label: 'Jour unique', date: '2026-08-08' }],
      } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCodes.EVENT_DAYS_INVALID }),
    });
  });

  it('refuse des journées déclarées sur un événement resté mono-jour', async () => {
    prisma.user.findUnique.mockResolvedValue({ plan: 'PREMIUM' });

    await expect(
      service.updateMyEvent('mgr-1', { ticketPolicy: 'SINGLE_DAY', days: TWO_DAYS } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCodes.EVENT_DAYS_INVALID }),
    });
  });

  it('refuse deux journées à la même date (le scanner ne saurait pas laquelle)', async () => {
    prisma.user.findUnique.mockResolvedValue({ plan: 'PREMIUM' });

    await expect(
      service.updateMyEvent('mgr-1', {
        ticketPolicy: 'PER_DAY',
        days: [
          { label: 'Matin', date: '2026-08-08' },
          { label: 'Soir', date: '2026-08-08' },
        ],
      } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCodes.EVENT_DAYS_INVALID }),
    });
  });

  it('refuse de supprimer une journée à laquelle des billets sont rattachés', async () => {
    prisma.user.findUnique.mockResolvedValue({ plan: 'PREMIUM' });
    // Une 3e journée existe en base, absente de la nouvelle liste, et porte
    // des billets déjà vendus : la supprimer les détacherait (SetNull) et ils
    // n'ouvriraient plus rien au contrôle d'accès.
    prisma.eventDay.findMany.mockResolvedValue([
      { id: 'd-1', date: new Date('2026-08-08T00:00:00.000Z'), _count: { tickets: 0 } },
      { id: 'd-3', date: new Date('2026-08-10T00:00:00.000Z'), _count: { tickets: 4 } },
    ]);

    await expect(
      service.updateMyEvent('mgr-1', { ticketPolicy: 'PER_DAY', days: TWO_DAYS } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCodes.EVENT_DAYS_INVALID }),
    });
  });

  it('accepte deux journées pour un manager Premium et normalise les dates', async () => {
    prisma.user.findUnique.mockResolvedValue({ plan: 'PREMIUM' });

    await service.updateMyEvent('mgr-1', { ticketPolicy: 'PER_DAY', days: TWO_DAYS } as any);

    const upserts = prisma._tx.eventDay.upsert.mock.calls.map((c: any) => c[0]);
    expect(upserts).toHaveLength(2);
    // Date civile à minuit UTC : le scanner compare un jour du calendrier.
    expect(upserts[0].create.date.toISOString()).toBe('2026-08-08T00:00:00.000Z');
    expect(prisma.event.update).toHaveBeenCalled();
  });

  it('laisse passer une mise à jour ordinaire sans toucher aux journées', async () => {
    prisma.user.findUnique.mockResolvedValue({ plan: 'FREE' });

    await service.updateMyEvent('mgr-1', { title: 'Nouveau titre' } as any);

    // Ni régime ni journées dans le DTO : aucune vérification Premium, sinon
    // un manager standard ne pourrait plus rien modifier du tout.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.event.update).toHaveBeenCalled();
  });
});

/**
 * Changement de régime : remise à zéro de la billetterie (2026-08-17).
 * Des billets pensés pour un régime n'ont pas de sens dans un autre — mais
 * jamais au prix d'une vente déjà encaissée.
 */
describe('EventsService.updateMyEvent() — changement de régime', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: EventsService;

  const TWO_DAYS = [
    { label: 'Jour 1', date: '2026-08-08' },
    { label: 'Jour 2', date: '2026-08-09' },
  ];

  beforeEach(() => {
    prisma = makePrisma();
    service = new EventsService(prisma as any, { log: vi.fn().mockResolvedValue(undefined) } as any, makeAcces() as any, makePaiements() as any);
    prisma.event.findUnique.mockResolvedValue({ id: 'ev-1', ticketPolicy: 'SINGLE_DAY' });
    prisma.event.update.mockResolvedValue({ id: 'ev-1' });
    prisma.eventDay.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue({ plan: 'PREMIUM' });
    prisma.orderItem.count.mockResolvedValue(0);
  });

  it('efface les billets quand le régime change', async () => {
    await service.updateMyEvent('mgr-1', { ticketPolicy: 'PER_DAY', days: TWO_DAYS } as any);

    expect(prisma._tx.ticket.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'ev-1' } });
  });

  it("REFUSE le changement si une vente existe, et n'efface rien", async () => {
    // Supprimer un billet vendu d'trairait la commande qui le référence : la
    // base le refuserait de toute façon, on préfère un message explicite.
    prisma.orderItem.count.mockResolvedValue(3);

    await expect(
      service.updateMyEvent('mgr-1', { ticketPolicy: 'PER_DAY', days: TWO_DAYS } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: ErrorCodes.TICKET_POLICY_LOCKED }),
    });
    expect(prisma._tx.ticket.deleteMany).not.toHaveBeenCalled();
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it("n'efface rien quand le régime ne change pas", async () => {
    prisma.event.findUnique.mockResolvedValue({ id: 'ev-1', ticketPolicy: 'PER_DAY' });

    await service.updateMyEvent('mgr-1', { ticketPolicy: 'PER_DAY', days: TWO_DAYS } as any);

    // Enregistrer à nouveau le même régime (pour modifier les journées, par
    // exemple) ne doit pas détruire la billetterie au passage.
    expect(prisma._tx.ticket.deleteMany).not.toHaveBeenCalled();
  });
});
