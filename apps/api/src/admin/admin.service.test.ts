/**
 * Tests unitaires — AdminService
 * Vue plateforme SUPER_ADMIN (CDC §14.2) et configuration du paiement PAR
 * ÉVÉNEMENT (décision produit 2026-07-13, supersède BUSINESS.md §6).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

function makePrisma() {
  const tx = {
    paymentProviderConfig: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn().mockResolvedValue({ id: 'cfg-1' }),
      update: vi.fn().mockResolvedValue({ id: 'cfg-1' }),
    },
  };
  return {
    event: {
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'user-1', name: 'Jean', email: 'jean@example.com' }),
      update: vi.fn().mockResolvedValue({ id: 'user-1', isActive: true }),
    },
    order: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { totalAmount: null } }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    orderItem: { count: vi.fn().mockResolvedValue(0) },
    paymentProviderConfig: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn().mockImplementation((fn: any) => fn(tx)),
    _tx: tx,
  };
}

function makeCrypto() {
  return { encrypt: vi.fn((v: string) => `enc:${v}`), decrypt: vi.fn((v: string) => v.replace('enc:', '')) };
}

function makeEmail() {
  return { sendManagerInviteEmail: vi.fn().mockResolvedValue(undefined) };
}

function makeAuthService() {
  return { generateClientToken: vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }) };
}

function makeAudit() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

const OWNED_EVENT = { id: 'ev-1', title: 'Concert FESTA' };

describe('AdminService.getOverview()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AdminService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AdminService(prisma as any, makeCrypto() as any, makeEmail() as any, makeAudit() as any, makeAuthService() as any);
  });

  it('agrège les métriques plateforme réelles, dont le statut paiement par manager', async () => {
    prisma.event.count.mockResolvedValue(5);
    prisma.user.count.mockResolvedValue(3);
    prisma.order.aggregate.mockResolvedValue({ _sum: { totalAmount: 120000 } });
    prisma.orderItem.count.mockResolvedValue(42);
    prisma.user.findMany.mockResolvedValue([
      {
        name: 'Kwame Asante',
        email: 'kwame@x.com',
        isActive: true,
        managedEvent: {
          id: 'ev-1',
          title: 'Concert FESTA',
          status: 'PUBLISHED',
          paymentProviderConfigs: [{ provider: 'KKIAPAY' }],
        },
      },
      { name: null, email: 'nobody@x.com', isActive: false, managedEvent: null },
    ]);
    prisma.auditLog.findMany.mockResolvedValue([
      { action: 'payment.webhook.success', createdAt: new Date('2026-07-12T10:00:00Z') },
    ]);

    const result = await service.getOverview();

    expect(result.activeEvents).toBe(5);
    expect(result.managersCount).toBe(3);
    expect(result.revenue30d).toBe(120000);
    expect(result.ticketsSold).toBe(42);
    expect(result.managers).toEqual([
      {
        name: 'Kwame Asante',
        email: 'kwame@x.com',
        isActive: true,
        eventId: 'ev-1',
        eventTitle: 'Concert FESTA',
        eventStatus: 'PUBLISHED',
        paymentProvider: 'KKIAPAY',
      },
      {
        name: 'Sans nom',
        email: 'nobody@x.com',
        isActive: false,
        eventId: null,
        eventTitle: null,
        eventStatus: null,
        paymentProvider: null,
      },
    ]);
    expect(result.recentLogs).toHaveLength(1);
  });

  it('retourne 0/tableaux vides sans planter sur une plateforme neuve (aucune donnée)', async () => {
    const result = await service.getOverview();

    expect(result.activeEvents).toBe(0);
    expect(result.revenue30d).toBe(0);
    expect(result.managers).toEqual([]);
  });

  it('filtre les revenus sur les 30 derniers jours (paidAt >= now - 30j)', async () => {
    await service.getOverview();
    const args = prisma.order.aggregate.mock.calls[0][0];
    expect(args.where.status).toBe('PAID');
    expect(args.where.paidAt.gte).toBeInstanceOf(Date);
  });

  it('agrège la tendance des ventes plateforme sur 30 jours, tous événements confondus', async () => {
    const today = new Date();
    prisma.order.findMany.mockResolvedValue([
      { paidAt: today, totalAmount: 15000, items: [{ id: 'oi-1' }] },
      { paidAt: today, totalAmount: 6000, items: [{ id: 'oi-2' }] },
    ]);

    const result = await service.getOverview();

    expect(result.salesOverTime).toHaveLength(30);
    expect(result.salesOverTime[29]).toEqual({
      date: today.toISOString().slice(0, 10),
      revenue: 21000,
      ticketsSold: 2,
    });
  });

  it('salesOverTime est zero-fillé (jamais de trou) sur une plateforme sans vente récente', async () => {
    const result = await service.getOverview();
    expect(result.salesOverTime).toHaveLength(30);
    expect(result.salesOverTime.every((b) => b.revenue === 0 && b.ticketsSold === 0)).toBe(true);
  });
});

describe('AdminService.listAllPaymentConfigs()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AdminService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AdminService(prisma as any, makeCrypto() as any, makeEmail() as any, makeAudit() as any, makeAuthService() as any);
  });

  it('liste les configs tous événements confondus, avec contexte event/manager, sans jamais les secrets', async () => {
    prisma.paymentProviderConfig.findMany.mockResolvedValue([
      {
        id: 'cfg-1',
        provider: 'KKIAPAY',
        isActive: true,
        publicKey: 'pub',
        config: null,
        updatedAt: new Date('2026-07-01T00:00:00Z'),
        event: {
          id: 'ev-1',
          title: 'Concert FESTA',
          status: 'PUBLISHED',
          manager: { id: 'mgr-1', name: 'Kwame Asante', email: 'kwame@x.com' },
        },
      },
      {
        id: 'cfg-2',
        provider: 'CINETPAY',
        isActive: false,
        publicKey: null,
        config: { siteId: 's-1' },
        updatedAt: new Date('2026-07-02T00:00:00Z'),
        event: {
          id: 'ev-2',
          title: 'Gala',
          status: 'DRAFT',
          manager: { id: 'mgr-2', name: null, email: 'nobody@x.com' },
        },
      },
    ] as any);

    const result = await service.listAllPaymentConfigs();

    expect(result).toEqual([
      {
        id: 'cfg-1',
        provider: 'KKIAPAY',
        isActive: true,
        publicKey: 'pub',
        config: null,
        updatedAt: new Date('2026-07-01T00:00:00Z'),
        eventId: 'ev-1',
        eventTitle: 'Concert FESTA',
        eventStatus: 'PUBLISHED',
        managerId: 'mgr-1',
        managerName: 'Kwame Asante',
        managerEmail: 'kwame@x.com',
      },
      {
        id: 'cfg-2',
        provider: 'CINETPAY',
        isActive: false,
        publicKey: null,
        config: { siteId: 's-1' },
        updatedAt: new Date('2026-07-02T00:00:00Z'),
        eventId: 'ev-2',
        eventTitle: 'Gala',
        eventStatus: 'DRAFT',
        managerId: 'mgr-2',
        managerName: 'Sans nom',
        managerEmail: 'nobody@x.com',
      },
    ]);
    const selectArg = prisma.paymentProviderConfig.findMany.mock.calls[0][0].select;
    expect(selectArg).not.toHaveProperty('privateKey');
    expect(selectArg).not.toHaveProperty('webhookSecret');
  });

  it('retourne un tableau vide sur une plateforme sans configuration', async () => {
    const result = await service.listAllPaymentConfigs();
    expect(result).toEqual([]);
  });
});

describe('AdminService.listAllEvents()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AdminService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AdminService(prisma as any, makeCrypto() as any, makeEmail() as any, makeAudit() as any, makeAuthService() as any);
  });

  it('liste les événements avec manager, revenu et billets vendus calculés depuis les commandes payées', async () => {
    prisma.event.findMany.mockResolvedValue([
      {
        id: 'ev-1',
        title: 'Concert FESTA',
        slug: 'concert-festa',
        status: 'PUBLISHED',
        startDate: new Date('2026-12-31T20:00:00Z'),
        endDate: new Date('2027-01-01T02:00:00Z'),
        createdAt: new Date('2026-07-01T00:00:00Z'),
        manager: { name: 'Kwame Asante', email: 'kwame@x.com' },
      },
      {
        id: 'ev-2',
        title: 'Gala',
        slug: 'gala',
        status: 'DRAFT',
        startDate: new Date('2026-11-01T00:00:00Z'),
        endDate: new Date('2026-11-01T23:00:00Z'),
        createdAt: new Date('2026-07-02T00:00:00Z'),
        manager: { name: null, email: 'nobody@x.com' },
      },
    ] as any);
    prisma.order.findMany.mockResolvedValue([
      { eventId: 'ev-1', totalAmount: 15000, items: [{ id: 'oi-1' }] },
      { eventId: 'ev-1', totalAmount: 6000, items: [{ id: 'oi-2' }] },
    ] as any);

    const result = await service.listAllEvents();

    expect(result).toEqual([
      expect.objectContaining({
        id: 'ev-1',
        title: 'Concert FESTA',
        managerName: 'Kwame Asante',
        managerEmail: 'kwame@x.com',
        revenue: 21000,
        ticketsSold: 2,
      }),
      expect.objectContaining({
        id: 'ev-2',
        title: 'Gala',
        managerName: 'Sans nom',
        managerEmail: 'nobody@x.com',
        revenue: 0,
        ticketsSold: 0,
      }),
    ]);
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PAID' } }),
    );
  });

  it('retourne un tableau vide sur une plateforme sans événement', async () => {
    const result = await service.listAllEvents();
    expect(result).toEqual([]);
  });
});

describe('AdminService.listAuditLogs()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AdminService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AdminService(prisma as any, makeCrypto() as any, makeEmail() as any, makeAudit() as any, makeAuthService() as any);
  });

  it('pagine avec les valeurs par défaut (page=1, pageSize=50) et journalise le user', async () => {
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'log-1',
        action: 'auth.google.login',
        entityType: 'User',
        entityId: 'u-1',
        metadata: { email: 'a@x.com' },
        createdAt: new Date('2026-07-14T10:00:00Z'),
        user: { name: 'Jean Dupont', email: 'jean@x.com' },
      },
    ] as any);
    prisma.auditLog.count.mockResolvedValue(1);

    const result = await service.listAuditLogs({});

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, skip: 0, take: 50, orderBy: { createdAt: 'desc' } }),
    );
    expect(result).toEqual({
      logs: [
        expect.objectContaining({
          id: 'log-1',
          action: 'auth.google.login',
          userName: 'Jean Dupont',
          userEmail: 'jean@x.com',
        }),
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });
  });

  it('filtre par action quand fournie', async () => {
    await service.listAuditLogs({ action: 'admin.impersonate.start' });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { action: 'admin.impersonate.start' } }),
    );
    expect(prisma.auditLog.count).toHaveBeenCalledWith({ where: { action: 'admin.impersonate.start' } });
  });

  it('calcule le offset depuis page/pageSize et plafonne pageSize à 100', async () => {
    await service.listAuditLogs({ page: 3, pageSize: 500 });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 200, take: 100 }),
    );
  });

  it("gère un log sans user associé (userName/userEmail null)", async () => {
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'log-2',
        action: 'payment.webhook.success',
        entityType: null,
        entityId: null,
        metadata: null,
        createdAt: new Date('2026-07-14T10:00:00Z'),
        user: null,
      },
    ] as any);

    const result = await service.listAuditLogs({});
    expect(result.logs[0]).toEqual(
      expect.objectContaining({ userName: null, userEmail: null }),
    );
  });
});

describe('AdminService.getEventPaymentConfigs()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AdminService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AdminService(prisma as any, makeCrypto() as any, makeEmail() as any, makeAudit() as any, makeAuthService() as any);
  });

  it('liste les configs sans jamais renvoyer les secrets', async () => {
    prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);
    prisma.paymentProviderConfig.findMany.mockResolvedValue([
      { id: 'cfg-1', provider: 'KKIAPAY', isActive: true, publicKey: 'pub', config: null, updatedAt: new Date() },
    ]);

    const result = await service.getEventPaymentConfigs('ev-1');

    expect(result.event).toEqual(OWNED_EVENT);
    expect(result.configs).toHaveLength(1);
    expect(prisma.paymentProviderConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: 'ev-1' },
        select: expect.not.objectContaining({ privateKey: true, webhookSecret: true }),
      }),
    );
  });

  it("404 si l'événement n'existe pas", async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    await expect(service.getEventPaymentConfigs('unknown')).rejects.toThrow(NotFoundException);
  });
});

describe('AdminService.upsertEventPaymentConfig()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let crypto: ReturnType<typeof makeCrypto>;
  let service: AdminService;

  beforeEach(() => {
    prisma = makePrisma();
    crypto = makeCrypto();
    prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);
    service = new AdminService(prisma as any, crypto as any, makeEmail() as any, makeAudit() as any, makeAuthService() as any);
  });

  it('chiffre privateKey/webhookSecret avant stockage (KKIAPAY)', async () => {
    await service.upsertEventPaymentConfig('ev-1', {
      provider: 'KKIAPAY',
      publicKey: 'pub-key',
      privateKey: 'secret-priv',
      webhookSecret: 'secret-hook',
      isActive: true,
    } as any);

    expect(crypto.encrypt).toHaveBeenCalledWith('secret-priv');
    expect(crypto.encrypt).toHaveBeenCalledWith('secret-hook');
    expect(prisma._tx.paymentProviderConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId_provider: { eventId: 'ev-1', provider: 'KKIAPAY' } },
        create: expect.objectContaining({ privateKey: 'enc:secret-priv', webhookSecret: 'enc:secret-hook' }),
      }),
    );
  });

  it('désactive les autres providers du même événement quand isActive=true', async () => {
    await service.upsertEventPaymentConfig('ev-1', {
      provider: 'KKIAPAY',
      publicKey: 'pub',
      privateKey: 'p',
      webhookSecret: 'w',
      isActive: true,
    } as any);

    expect(prisma._tx.paymentProviderConfig.updateMany).toHaveBeenCalledWith({
      where: { eventId: 'ev-1', provider: { not: 'KKIAPAY' } },
      data: { isActive: false },
    });
  });

  it('range siteId/environment dans `config` pour CINETPAY/FEDAPAY', async () => {
    await service.upsertEventPaymentConfig('ev-1', {
      provider: 'CINETPAY',
      privateKey: 'apikey',
      webhookSecret: 'hmac-secret',
      siteId: 'site-123',
    } as any);

    expect(prisma._tx.paymentProviderConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ config: { siteId: 'site-123' } }) }),
    );
  });

  it('permet d’activer CINETPAY (exécution branchée depuis le 2026-07-13)', async () => {
    await expect(
      service.upsertEventPaymentConfig('ev-1', {
        provider: 'CINETPAY',
        privateKey: 'apikey',
        webhookSecret: 'hmac-secret',
        siteId: 'site-123',
        isActive: true,
      } as any),
    ).resolves.toBeDefined();
    expect(prisma._tx.paymentProviderConfig.upsert).toHaveBeenCalled();
  });

  it("permet d'enregistrer CINETPAY/FEDAPAY avec isActive=false (préparation)", async () => {
    await expect(
      service.upsertEventPaymentConfig('ev-1', {
        provider: 'FEDAPAY',
        publicKey: 'pub',
        privateKey: 'secret',
        webhookSecret: 'hook',
        environment: 'sandbox',
        isActive: false,
      } as any),
    ).resolves.toBeDefined();
  });

  it("404 si l'événement n'existe pas", async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    await expect(
      service.upsertEventPaymentConfig('unknown', {
        provider: 'KKIAPAY',
        publicKey: 'pub',
        privateKey: 'p',
        webhookSecret: 'w',
      } as any),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('AdminService.setEventPaymentConfigActive()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AdminService;

  beforeEach(() => {
    prisma = makePrisma();
    prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);
    service = new AdminService(prisma as any, makeCrypto() as any, makeEmail() as any, makeAudit() as any, makeAuthService() as any);
  });

  it('active un provider déjà configuré et désactive les autres', async () => {
    prisma.paymentProviderConfig.findUnique.mockResolvedValue({ id: 'cfg-1' });

    await service.setEventPaymentConfigActive('ev-1', 'KKIAPAY' as any, true);

    expect(prisma._tx.paymentProviderConfig.updateMany).toHaveBeenCalledWith({
      where: { eventId: 'ev-1', provider: { not: 'KKIAPAY' } },
      data: { isActive: false },
    });
    expect(prisma._tx.paymentProviderConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: true } }),
    );
  });

  it("404 si aucune config n'existe encore pour ce provider", async () => {
    prisma.paymentProviderConfig.findUnique.mockResolvedValue(null);
    await expect(service.setEventPaymentConfigActive('ev-1', 'KKIAPAY' as any, true)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('permet d’activer CINETPAY (exécution branchée depuis le 2026-07-13)', async () => {
    prisma.paymentProviderConfig.findUnique.mockResolvedValue({ id: 'cfg-1' });
    await expect(service.setEventPaymentConfigActive('ev-1', 'CINETPAY' as any, true)).resolves.toBeDefined();
  });

  it('désactiver reste toujours permis, quel que soit le provider', async () => {
    prisma.paymentProviderConfig.findUnique.mockResolvedValue({ id: 'cfg-1' });
    await expect(service.setEventPaymentConfigActive('ev-1', 'CINETPAY' as any, false)).resolves.toBeDefined();
  });
});

describe('AdminService.deleteEventPaymentConfig()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AdminService;

  beforeEach(() => {
    prisma = makePrisma();
    prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);
    service = new AdminService(prisma as any, makeCrypto() as any, makeEmail() as any, makeAudit() as any, makeAuthService() as any);
  });

  it('supprime la config du provider pour cet événement', async () => {
    await service.deleteEventPaymentConfig('ev-1', 'KKIAPAY' as any);
    expect(prisma.paymentProviderConfig.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'ev-1', provider: 'KKIAPAY' },
    });
  });

  it("404 si l'événement n'existe pas", async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    await expect(service.deleteEventPaymentConfig('unknown', 'KKIAPAY' as any)).rejects.toThrow(NotFoundException);
  });
});

describe('AdminService.listManagers()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AdminService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AdminService(prisma as any, makeCrypto() as any, makeEmail() as any, makeAudit() as any, makeAuthService() as any);
  });

  it('liste les managers avec statut self-service/abonnement et événement lié', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'mgr-1',
        name: 'Kwame Asante',
        email: 'kwame@x.com',
        isActive: true,
        isSelfService: false,
        subscriptionActive: true,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        managedEvent: { id: 'ev-1', title: 'Concert FESTA', status: 'PUBLISHED' },
      },
      {
        id: 'mgr-2',
        name: null,
        email: 'nobody@x.com',
        isActive: false,
        isSelfService: true,
        subscriptionActive: false,
        createdAt: new Date('2026-07-02T00:00:00Z'),
        managedEvent: null,
      },
    ] as any);

    const result = await service.listManagers();

    expect(result).toEqual([
      {
        id: 'mgr-1',
        name: 'Kwame Asante',
        email: 'kwame@x.com',
        isActive: true,
        isSelfService: false,
        subscriptionActive: true,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        eventId: 'ev-1',
        eventTitle: 'Concert FESTA',
        eventStatus: 'PUBLISHED',
      },
      {
        id: 'mgr-2',
        name: 'Sans nom',
        email: 'nobody@x.com',
        isActive: false,
        isSelfService: true,
        subscriptionActive: false,
        createdAt: new Date('2026-07-02T00:00:00Z'),
        eventId: null,
        eventTitle: null,
        eventStatus: null,
      },
    ]);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: 'MANAGER' } }),
    );
  });
});

describe('AdminService.inviteManager()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let email: ReturnType<typeof makeEmail>;
  let audit: ReturnType<typeof makeAudit>;
  let service: AdminService;

  beforeEach(() => {
    prisma = makePrisma();
    email = makeEmail();
    audit = makeAudit();
    service = new AdminService(prisma as any, makeCrypto() as any, email as any, audit as any, makeAuthService() as any);
  });

  it("crée le compte Manager (isActive/subscriptionActive=true, isSelfService=false) et envoie l'invitation", async () => {
    prisma.user.create.mockResolvedValue({ id: 'mgr-1', name: 'Jean Dupont', email: 'jean@x.com' });

    const result = await service.inviteManager({ name: 'Jean Dupont', email: 'jean@x.com' } as any);

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Jean Dupont',
          email: 'jean@x.com',
          role: 'MANAGER',
          isActive: true,
          isSelfService: false,
          subscriptionActive: true,
          inviteToken: expect.any(String),
          inviteTokenExpiresAt: expect.any(Date),
        }),
      }),
    );
    expect(email.sendManagerInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'jean@x.com',
        name: 'Jean Dupont',
        inviteUrl: expect.stringContaining('/auth/set-password?token='),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      'admin.manager.invited',
      'User',
      'mgr-1',
      expect.objectContaining({ email: 'jean@x.com', emailSent: true }),
    );
    expect(result).toEqual({ id: 'mgr-1', name: 'Jean Dupont', email: 'jean@x.com', emailSent: true });
  });

  it('rejette si un compte existe déjà avec cet email (EMAIL_ALREADY_EXISTS)', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      service.inviteManager({ name: 'Jean', email: 'jean@x.com' } as any),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("garde le compte créé et renvoie emailSent=false si l'envoi de l'email échoue", async () => {
    prisma.user.create.mockResolvedValue({ id: 'mgr-1', name: 'Jean', email: 'jean@x.com' });
    email.sendManagerInviteEmail.mockRejectedValueOnce(new Error('SMTP down'));

    const result = await service.inviteManager({ name: 'Jean', email: 'jean@x.com' } as any);

    expect(result.emailSent).toBe(false);
    expect(audit.log).toHaveBeenCalledWith(
      'admin.manager.invited',
      'User',
      'mgr-1',
      expect.objectContaining({ emailSent: false }),
    );
  });
});

describe('AdminService.setManagerActive()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let audit: ReturnType<typeof makeAudit>;
  let service: AdminService;

  beforeEach(() => {
    prisma = makePrisma();
    audit = makeAudit();
    service = new AdminService(prisma as any, makeCrypto() as any, makeEmail() as any, audit as any, makeAuthService() as any);
  });

  it('suspend/réactive un manager et journalise', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'mgr-1', role: 'MANAGER' });
    prisma.user.update.mockResolvedValue({ id: 'mgr-1', isActive: false });

    const result = await service.setManagerActive('mgr-1', false);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'mgr-1' }, data: { isActive: false } }),
    );
    expect(audit.log).toHaveBeenCalledWith('admin.manager.status', 'User', 'mgr-1', { isActive: false });
    expect(result).toEqual({ id: 'mgr-1', isActive: false });
  });

  it("404 si l'utilisateur n'existe pas ou n'est pas MANAGER (MANAGER_NOT_FOUND)", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'client-1', role: 'CLIENT' });

    await expect(service.setManagerActive('client-1', false)).rejects.toThrow(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('AdminService.setManagerSubscription()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let audit: ReturnType<typeof makeAudit>;
  let service: AdminService;

  beforeEach(() => {
    prisma = makePrisma();
    audit = makeAudit();
    service = new AdminService(prisma as any, makeCrypto() as any, makeEmail() as any, audit as any, makeAuthService() as any);
  });

  it('active/désactive manuellement l’abonnement et journalise (statut manuel V1)', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'mgr-1', role: 'MANAGER' });
    prisma.user.update.mockResolvedValue({ id: 'mgr-1', subscriptionActive: true });

    const result = await service.setManagerSubscription('mgr-1', true);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'mgr-1' }, data: { subscriptionActive: true } }),
    );
    expect(audit.log).toHaveBeenCalledWith('admin.manager.subscription', 'User', 'mgr-1', {
      subscriptionActive: true,
    });
    expect(result).toEqual({ id: 'mgr-1', subscriptionActive: true });
  });

  it('404 si le manager est introuvable', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.setManagerSubscription('unknown', true)).rejects.toThrow(NotFoundException);
  });
});

describe('AdminService.impersonateManager()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let audit: ReturnType<typeof makeAudit>;
  let authService: ReturnType<typeof makeAuthService>;
  let service: AdminService;

  beforeEach(() => {
    prisma = makePrisma();
    audit = makeAudit();
    authService = makeAuthService();
    service = new AdminService(prisma as any, makeCrypto() as any, makeEmail() as any, audit as any, authService as any);
  });

  it('émet un token MANAGER pour le compte ciblé et journalise avec l’id Admin', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'mgr-1', email: 'mgr1@x.com', role: 'MANAGER' });

    const result = await service.impersonateManager('admin-1', 'mgr-1');

    expect(authService.generateClientToken).toHaveBeenCalledWith({
      id: 'mgr-1',
      email: 'mgr1@x.com',
      role: 'MANAGER',
    });
    expect(audit.log).toHaveBeenCalledWith('admin.impersonate.start', 'User', 'mgr-1', { adminId: 'admin-1' });
    expect(result).toEqual({ accessToken: 'a', refreshToken: 'r' });
  });

  it("404 si la cible n'existe pas ou n'est pas MANAGER (MANAGER_NOT_FOUND)", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'client-1', role: 'CLIENT' });

    await expect(service.impersonateManager('admin-1', 'client-1')).rejects.toThrow(NotFoundException);
    expect(authService.generateClientToken).not.toHaveBeenCalled();
  });
});
