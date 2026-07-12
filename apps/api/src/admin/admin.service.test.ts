/**
 * Tests unitaires — AdminService
 * Vue plateforme SUPER_ADMIN (CDC §14.2) : agrégats réels, pas de table dédiée.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminService } from './admin.service';

function makePrisma() {
  return {
    event: { count: vi.fn().mockResolvedValue(0) },
    user: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    order: { aggregate: vi.fn().mockResolvedValue({ _sum: { totalAmount: null } }) },
    orderItem: { count: vi.fn().mockResolvedValue(0) },
    paymentProviderConfig: { findMany: vi.fn().mockResolvedValue([]) },
    auditLog: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

describe('AdminService.getOverview()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AdminService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AdminService(prisma as any);
  });

  it('agrège les métriques plateforme réelles', async () => {
    prisma.event.count.mockResolvedValue(5);
    prisma.user.count.mockResolvedValue(3);
    prisma.order.aggregate.mockResolvedValue({ _sum: { totalAmount: 120000 } });
    prisma.orderItem.count.mockResolvedValue(42);
    prisma.user.findMany.mockResolvedValue([
      {
        name: 'Kwame Asante',
        email: 'kwame@x.com',
        isActive: true,
        managedEvent: { title: 'Concert FESTA', status: 'PUBLISHED' },
      },
      { name: null, email: 'nobody@x.com', isActive: false, managedEvent: null },
    ]);
    prisma.paymentProviderConfig.findMany.mockResolvedValue([
      { provider: 'KKIAPAY', isActive: true, isDefault: true },
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
      { name: 'Kwame Asante', email: 'kwame@x.com', isActive: true, eventTitle: 'Concert FESTA', eventStatus: 'PUBLISHED' },
      { name: 'Sans nom', email: 'nobody@x.com', isActive: false, eventTitle: null, eventStatus: null },
    ]);
    expect(result.providers).toEqual([
      { name: 'KKIAPAY', configured: true, isActive: true, isDefault: true },
      { name: 'CINETPAY', configured: false, isActive: false, isDefault: false },
      { name: 'FEDAPAY', configured: false, isActive: false, isDefault: false },
    ]);
    expect(result.recentLogs).toHaveLength(1);
  });

  it("retourne 0/tableaux vides sans planter sur une plateforme neuve (aucune donnée)", async () => {
    const result = await service.getOverview();

    expect(result.activeEvents).toBe(0);
    expect(result.revenue30d).toBe(0);
    expect(result.managers).toEqual([]);
    expect(result.providers).toHaveLength(3);
    expect(result.providers.every((p) => !p.configured)).toBe(true);
  });

  it('filtre les revenus sur les 30 derniers jours (paidAt >= now - 30j)', async () => {
    await service.getOverview();
    const args = prisma.order.aggregate.mock.calls[0][0];
    expect(args.where.status).toBe('PAID');
    expect(args.where.paidAt.gte).toBeInstanceOf(Date);
  });
});
