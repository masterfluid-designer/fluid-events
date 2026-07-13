/**
 * Tests unitaires — AdminService
 * Vue plateforme SUPER_ADMIN (CDC §14.2) et configuration du paiement PAR
 * ÉVÉNEMENT (décision produit 2026-07-13, supersède BUSINESS.md §6).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
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
    event: { count: vi.fn().mockResolvedValue(0), findUnique: vi.fn().mockResolvedValue(null) },
    user: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    order: { aggregate: vi.fn().mockResolvedValue({ _sum: { totalAmount: null } }) },
    orderItem: { count: vi.fn().mockResolvedValue(0) },
    paymentProviderConfig: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn().mockImplementation((fn: any) => fn(tx)),
    _tx: tx,
  };
}

function makeCrypto() {
  return { encrypt: vi.fn((v: string) => `enc:${v}`), decrypt: vi.fn((v: string) => v.replace('enc:', '')) };
}

const OWNED_EVENT = { id: 'ev-1', title: 'Concert FESTA' };

describe('AdminService.getOverview()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AdminService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AdminService(prisma as any, makeCrypto() as any);
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
});

describe('AdminService.getEventPaymentConfigs()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AdminService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AdminService(prisma as any, makeCrypto() as any);
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
    service = new AdminService(prisma as any, crypto as any);
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
    service = new AdminService(prisma as any, makeCrypto() as any);
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
    service = new AdminService(prisma as any, makeCrypto() as any);
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
