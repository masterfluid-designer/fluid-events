import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentProviderType } from '@saas-events/types';

const ALL_PROVIDERS: PaymentProviderType[] = [
  PaymentProviderType.KKIAPAY,
  PaymentProviderType.CINETPAY,
  PaymentProviderType.FEDAPAY,
];

/**
 * AdminService — Vue plateforme pour le rôle SUPER_ADMIN (CDC §14.2).
 * Toutes les métriques sont calculées à la volée depuis les données réelles
 * (pas de table d'agrégats dédiée en V1).
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [activeEvents, managersCount, revenueAgg, ticketsSold, managers, providerConfigs, recentLogs] =
      await Promise.all([
        this.prisma.event.count({ where: { status: 'PUBLISHED' } }),
        this.prisma.user.count({ where: { role: 'MANAGER' } }),
        this.prisma.order.aggregate({
          where: { status: 'PAID', paidAt: { gte: thirtyDaysAgo } },
          _sum: { totalAmount: true },
        }),
        this.prisma.orderItem.count({ where: { order: { status: 'PAID' } } }),
        this.prisma.user.findMany({
          where: { role: 'MANAGER' },
          select: {
            name: true,
            email: true,
            isActive: true,
            managedEvent: { select: { title: true, status: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.paymentProviderConfig.findMany({
          select: { provider: true, isActive: true, isDefault: true },
        }),
        this.prisma.auditLog.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { action: true, createdAt: true },
        }),
      ]);

    const configByProvider = new Map(providerConfigs.map((c) => [c.provider, c]));
    const providers = ALL_PROVIDERS.map((provider) => {
      const config = configByProvider.get(provider);
      return {
        name: provider,
        configured: Boolean(config),
        isActive: config?.isActive ?? false,
        isDefault: config?.isDefault ?? false,
      };
    });

    return {
      activeEvents,
      managersCount,
      revenue30d: Number(revenueAgg._sum.totalAmount ?? 0),
      currency: 'XOF',
      ticketsSold,
      managers: managers.map((m) => ({
        name: m.name ?? 'Sans nom',
        email: m.email,
        isActive: m.isActive,
        eventTitle: m.managedEvent?.title ?? null,
        eventStatus: m.managedEvent?.status ?? null,
      })),
      providers,
      recentLogs,
    };
  }
}
