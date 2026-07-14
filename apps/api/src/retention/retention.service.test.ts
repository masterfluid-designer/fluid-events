/**
 * Tests unitaires — RetentionService
 * Suppression auto Manager self-service non abonné (3j) + anonymisation
 * Client (7j après fin de tous ses événements) — décision produit 2026-07-14.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetentionService } from './retention.service';

function makePrisma() {
  const tx = {
    event: { delete: vi.fn().mockResolvedValue({}) },
    user: { delete: vi.fn().mockResolvedValue({}) },
  };
  return {
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    order: {
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: vi.fn().mockImplementation((fn: any) => fn(tx)),
    _tx: tx,
  };
}

function makeAudit() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

describe('RetentionService.deleteExpiredSelfServiceManagers()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let audit: ReturnType<typeof makeAudit>;
  let service: RetentionService;

  beforeEach(() => {
    prisma = makePrisma();
    audit = makeAudit();
    service = new RetentionService(prisma as any, audit as any);
  });

  it("ne cible que les managers self-service non abonnés créés il y a plus de 3 jours", async () => {
    await service.deleteExpiredSelfServiceManagers();

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: 'MANAGER',
          isSelfService: true,
          subscriptionActive: false,
          createdAt: { lt: expect.any(Date) },
        }),
      }),
    );
  });

  it("supprime un manager expiré sans événement (pas de commande à protéger)", async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'mgr-1', email: 'mgr1@x.com', managedEvent: null },
    ]);

    await service.deleteExpiredSelfServiceManagers();

    expect(prisma._tx.event.delete).not.toHaveBeenCalled();
    expect(prisma._tx.user.delete).toHaveBeenCalledWith({ where: { id: 'mgr-1' } });
    expect(audit.log).toHaveBeenCalledWith('account.retention.manager.deleted', 'User', 'mgr-1', {
      email: 'mgr1@x.com',
      hadEvent: false,
    });
  });

  it("supprime le manager ET son événement quand l'événement n'a aucune commande", async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'mgr-1', email: 'mgr1@x.com', managedEvent: { id: 'ev-1' } },
    ]);
    prisma.order.count.mockResolvedValue(0);

    await service.deleteExpiredSelfServiceManagers();

    expect(prisma.order.count).toHaveBeenCalledWith({ where: { eventId: 'ev-1' } });
    expect(prisma._tx.event.delete).toHaveBeenCalledWith({ where: { id: 'ev-1' } });
    expect(prisma._tx.user.delete).toHaveBeenCalledWith({ where: { id: 'mgr-1' } });
    expect(audit.log).toHaveBeenCalledWith('account.retention.manager.deleted', 'User', 'mgr-1', {
      email: 'mgr1@x.com',
      hadEvent: true,
    });
  });

  it("N'IGNORE PAS la suppression et journalise un avertissement quand l'événement a des commandes", async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'mgr-1', email: 'mgr1@x.com', managedEvent: { id: 'ev-1' } },
    ]);
    prisma.order.count.mockResolvedValue(3);

    await service.deleteExpiredSelfServiceManagers();

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma._tx.user.delete).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it("continue sur les managers suivants si une suppression échoue (erreur DB)", async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'mgr-1', email: 'mgr1@x.com', managedEvent: null },
      { id: 'mgr-2', email: 'mgr2@x.com', managedEvent: null },
    ]);
    prisma.$transaction
      .mockImplementationOnce(() => Promise.reject(new Error('FK constraint')))
      .mockImplementationOnce((fn: any) => fn(prisma._tx));

    await service.deleteExpiredSelfServiceManagers();

    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      'account.retention.manager.deleted',
      'User',
      'mgr-2',
      expect.anything(),
    );
  });
});

describe('RetentionService.anonymizeStaleClients()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let audit: ReturnType<typeof makeAudit>;
  let service: RetentionService;
  const NOW = new Date('2026-07-14T12:00:00Z');

  beforeEach(() => {
    prisma = makePrisma();
    audit = makeAudit();
    service = new RetentionService(prisma as any, audit as any);
    vi.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
  });

  it("ne cible que les clients Google avec au moins une commande", async () => {
    await service.anonymizeStaleClients();

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: 'CLIENT',
          googleId: { not: null },
          orders: { some: {} },
        }),
      }),
    );
  });

  it("anonymise un client dont tous les événements sont terminés depuis plus de 7 jours", async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'client-1',
        orders: [{ event: { endDate: new Date('2026-07-01T00:00:00Z') } }],
      },
    ]);

    await service.anonymizeStaleClients();

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'client-1' },
      data: expect.objectContaining({
        name: null,
        phone: null,
        country: null,
        avatarUrl: null,
        profileCompletedAt: null,
        googleId: null,
        email: 'deleted-client-1@anonymized.fluid-events.local',
      }),
    });
    expect(audit.log).toHaveBeenCalledWith('account.retention.client.anonymized', 'User', 'client-1', {});
  });

  it("NE touche PAS un client avec un événement terminé il y a moins de 7 jours", async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'client-1',
        orders: [{ event: { endDate: new Date('2026-07-10T00:00:00Z') } }],
      },
    ]);

    await service.anonymizeStaleClients();

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it("NE touche PAS un client ayant au moins un événement encore à venir, même si un autre est terminé", async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'client-1',
        orders: [
          { event: { endDate: new Date('2026-06-01T00:00:00Z') } },
          { event: { endDate: new Date('2026-12-01T00:00:00Z') } },
        ],
      },
    ]);

    await service.anonymizeStaleClients();

    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
