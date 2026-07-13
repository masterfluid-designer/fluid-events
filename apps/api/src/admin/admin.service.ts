import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';
import { SUPPORTED_PAYMENT_PROVIDERS } from '../common/supported-payment-providers';
import { ErrorCodes, PaymentProviderType } from '@saas-events/types';
import { UpsertPaymentConfigDto } from './dto/upsert-payment-config.dto';

/** Champs jamais renvoyés au client — secrets chiffrés (RULES.md §9). */
const SAFE_CONFIG_SELECT = {
  id: true,
  provider: true,
  isActive: true,
  publicKey: true,
  config: true,
  updatedAt: true,
} as const;

/**
 * AdminService — Vue plateforme (CDC §14.2) et configuration du paiement PAR
 * ÉVÉNEMENT (décision produit 2026-07-13, supersède BUSINESS.md §6 "un seul
 * compte Kkiapay global" — 1 Manager = 1 Event en V1, donc de facto une
 * config par Manager, assumé explicitement par le produit).
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async getOverview() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [activeEvents, managersCount, revenueAgg, ticketsSold, managers, recentLogs] = await Promise.all([
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
          managedEvent: {
            select: {
              id: true,
              title: true,
              status: true,
              paymentProviderConfigs: {
                where: { isActive: true },
                select: { provider: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { action: true, createdAt: true },
      }),
    ]);

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
        eventId: m.managedEvent?.id ?? null,
        eventTitle: m.managedEvent?.title ?? null,
        eventStatus: m.managedEvent?.status ?? null,
        paymentProvider: m.managedEvent?.paymentProviderConfigs[0]?.provider ?? null,
      })),
      recentLogs,
    };
  }

  private async getOwnedEventOrThrow(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true },
    });
    if (!event) {
      throw new NotFoundException({ code: ErrorCodes.EVENT_NOT_FOUND, message: 'Événement introuvable.' });
    }
    return event;
  }

  /** Liste les configs de paiement d'un événement (jamais les secrets). */
  async getEventPaymentConfigs(eventId: string) {
    const event = await this.getOwnedEventOrThrow(eventId);
    const configs = await this.prisma.paymentProviderConfig.findMany({
      where: { eventId },
      select: SAFE_CONFIG_SELECT,
      orderBy: { provider: 'asc' },
    });
    return { event, configs };
  }

  /** Refuse d'activer un provider dont l'exécution (init/webhook) n'est pas branchée. */
  private assertActivatable(provider: PaymentProviderType, isActive: boolean | undefined): void {
    if (isActive && !SUPPORTED_PAYMENT_PROVIDERS.includes(provider)) {
      throw new BadRequestException({
        code: ErrorCodes.PROVIDER_EXECUTION_NOT_SUPPORTED,
        message: `L'exécution des paiements ${provider} n'est pas encore branchée — les identifiants peuvent être enregistrés mais pas activés.`,
      });
    }
  }

  /**
   * Crée/remplace les identifiants d'un fournisseur pour un événement.
   * `privateKey`/`webhookSecret` sont toujours fournis (remplacement complet,
   * pas de mise à jour partielle des secrets — évite l'ambiguïté "garder
   * l'ancien secret" côté API).
   */
  async upsertEventPaymentConfig(eventId: string, dto: UpsertPaymentConfigDto) {
    await this.getOwnedEventOrThrow(eventId);
    this.assertActivatable(dto.provider, dto.isActive);

    const config: Record<string, unknown> = {};
    if (dto.provider === PaymentProviderType.CINETPAY && dto.siteId) config.siteId = dto.siteId;
    if (dto.provider === PaymentProviderType.FEDAPAY && dto.environment) config.environment = dto.environment;

    const encryptedPrivateKey = this.crypto.encrypt(dto.privateKey);
    const encryptedWebhookSecret = this.crypto.encrypt(dto.webhookSecret);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isActive) {
        await tx.paymentProviderConfig.updateMany({
          where: { eventId, provider: { not: dto.provider } },
          data: { isActive: false },
        });
      }

      return tx.paymentProviderConfig.upsert({
        where: { eventId_provider: { eventId, provider: dto.provider } },
        create: {
          eventId,
          provider: dto.provider,
          isActive: dto.isActive ?? false,
          publicKey: dto.publicKey ?? null,
          privateKey: encryptedPrivateKey,
          webhookSecret: encryptedWebhookSecret,
          config: Object.keys(config).length > 0 ? (config as Prisma.InputJsonValue) : undefined,
        },
        update: {
          isActive: dto.isActive ?? false,
          publicKey: dto.publicKey ?? null,
          privateKey: encryptedPrivateKey,
          webhookSecret: encryptedWebhookSecret,
          config: Object.keys(config).length > 0 ? (config as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
        select: SAFE_CONFIG_SELECT,
      });
    });
  }

  /** Active/désactive un provider déjà configuré, sans toucher aux identifiants. */
  async setEventPaymentConfigActive(eventId: string, provider: PaymentProviderType, isActive: boolean) {
    await this.getOwnedEventOrThrow(eventId);
    this.assertActivatable(provider, isActive);

    const existing = await this.prisma.paymentProviderConfig.findUnique({
      where: { eventId_provider: { eventId, provider } },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException({
        code: ErrorCodes.EVENT_NOT_FOUND,
        message: `Aucune config ${provider} enregistrée pour cet événement — configurez d'abord les identifiants.`,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      if (isActive) {
        await tx.paymentProviderConfig.updateMany({
          where: { eventId, provider: { not: provider } },
          data: { isActive: false },
        });
      }
      return tx.paymentProviderConfig.update({
        where: { eventId_provider: { eventId, provider } },
        data: { isActive },
        select: SAFE_CONFIG_SELECT,
      });
    });
  }

  async deleteEventPaymentConfig(eventId: string, provider: PaymentProviderType): Promise<void> {
    await this.getOwnedEventOrThrow(eventId);
    await this.prisma.paymentProviderConfig.deleteMany({ where: { eventId, provider } });
  }
}
