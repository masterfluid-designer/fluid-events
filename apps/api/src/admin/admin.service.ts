import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';
import { SUPPORTED_PAYMENT_PROVIDERS } from '../common/supported-payment-providers';
import { bucketSalesByDay } from '../common/analytics.util';
import { AuditService } from '../common/audit.service';
import { EmailService } from '../notifications/email.service';
import { AuthService } from '../auth/auth.service';
import { ErrorCodes, EventStatus, PaymentProviderType, Role, TokenPair } from '@saas-events/types';
import { FRONTEND_URL } from '../common/constants';
import { UpsertPaymentConfigDto } from './dto/upsert-payment-config.dto';
import { InviteManagerDto } from './dto/invite-manager.dto';

/** Durée de validité du lien d'invitation Manager (décision produit 2026-07-14). */
const INVITE_TOKEN_TTL_DAYS = 7;

/** Fenêtre de la série temporelle "ventes dans le temps" (Analytics, 2026-07-14). */
const SALES_TREND_DAYS = 30;

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
    private readonly email: EmailService,
    private readonly audit: AuditService,
    private readonly authService: AuthService,
  ) {}

  async getOverview() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [activeEvents, managersCount, revenueAgg, ticketsSold, recentPaidOrders, managers, recentLogs] =
      await Promise.all([
      this.prisma.event.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.user.count({ where: { role: 'MANAGER' } }),
      this.prisma.order.aggregate({
        where: { status: 'PAID', paidAt: { gte: thirtyDaysAgo } },
        _sum: { totalAmount: true },
      }),
      this.prisma.orderItem.count({ where: { order: { status: 'PAID' } } }),
      // Tendance plateforme (Analytics, décision produit 2026-07-14) — tous
      // événements confondus, contrairement à EventsService.getMyEventOverview
      // qui filtre sur un seul événement (1 Manager = 1 Event en V1).
      this.prisma.order.findMany({
        where: { status: 'PAID', paidAt: { gte: thirtyDaysAgo } },
        select: { paidAt: true, totalAmount: true, items: { select: { id: true } } },
      }),
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

    const salesOverTime = bucketSalesByDay(
      recentPaidOrders.map((order) => ({
        paidAt: order.paidAt,
        amount: Number(order.totalAmount),
        itemCount: order.items.length,
      })),
      SALES_TREND_DAYS,
    );

    return {
      activeEvents,
      managersCount,
      revenue30d: Number(revenueAgg._sum.totalAmount ?? 0),
      currency: 'XOF',
      ticketsSold,
      salesOverTime,
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

  /**
   * GET /api/admin/payment-configs — vue plateforme, tous événements confondus
   * (décision produit 2026-07-14). Jamais les secrets (SAFE_CONFIG_SELECT).
   */
  async listAllPaymentConfigs() {
    const configs = await this.prisma.paymentProviderConfig.findMany({
      select: {
        ...SAFE_CONFIG_SELECT,
        event: {
          select: {
            id: true,
            title: true,
            status: true,
            manager: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return configs.map((c) => ({
      id: c.id,
      provider: c.provider,
      isActive: c.isActive,
      publicKey: c.publicKey,
      config: c.config,
      updatedAt: c.updatedAt,
      eventId: c.event.id,
      eventTitle: c.event.title,
      eventStatus: c.event.status,
      managerId: c.event.manager.id,
      managerName: c.event.manager.name ?? 'Sans nom',
      managerEmail: c.event.manager.email,
    }));
  }

  /**
   * GET /api/admin/events — vue plateforme de tous les événements (décision
   * produit 2026-07-14). Revenu/billets vendus calculés en mémoire à partir
   * des commandes payées (même approche que EventsService.getMyEventOverview
   * — pas de table d'agrégats dédiée en V1, volumes encore faibles).
   */
  async listAllEvents() {
    const events = await this.prisma.event.findMany({
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        manager: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const paidOrders = await this.prisma.order.findMany({
      where: { status: 'PAID' },
      select: { eventId: true, totalAmount: true, items: { select: { id: true } } },
    });

    const statsByEvent = new Map<string, { revenue: number; ticketsSold: number }>();
    for (const order of paidOrders) {
      const stat = statsByEvent.get(order.eventId) ?? { revenue: 0, ticketsSold: 0 };
      stat.revenue += Number(order.totalAmount);
      stat.ticketsSold += order.items.length;
      statsByEvent.set(order.eventId, stat);
    }

    return events.map((e) => ({
      id: e.id,
      title: e.title,
      slug: e.slug,
      status: e.status,
      startDate: e.startDate,
      endDate: e.endDate,
      createdAt: e.createdAt,
      managerName: e.manager.name ?? 'Sans nom',
      managerEmail: e.manager.email,
      revenue: statsByEvent.get(e.id)?.revenue ?? 0,
      ticketsSold: statsByEvent.get(e.id)?.ticketsSold ?? 0,
    }));
  }

  /**
   * PATCH /api/admin/events/:eventId/status — annule/republie un événement
   * depuis la vue plateforme (décision produit 2026-07-14, complète
   * `listAllEvents`). Aucune state-machine imposée (BUSINESS.md §12, même
   * choix que `EventsService.updateMyEvent`) : n'importe quelle valeur de
   * l'enum est acceptée, pas de transition interdite côté serveur. L'Admin
   * agit sur n'importe quel événement, sans vérification d'ownership
   * (contrairement au Manager, dont l'action équivalente est bornée au sien).
   */
  async setEventStatus(eventId: string, status: EventStatus) {
    await this.getOwnedEventOrThrow(eventId);
    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: { status },
      select: { id: true, status: true },
    });
    await this.audit.log('event.status.changed', 'Event', eventId, { status, changedByAdmin: true });
    return updated;
  }

  /**
   * GET /api/admin/logs — historique complet des logs d'audit, paginé et
   * filtrable par action (décision produit 2026-07-14). `getOverview()`
   * n'expose que les 10 plus récents pour la vue d'ensemble — cette méthode
   * est la vue dédiée, plus profonde.
   */
  async listAuditLogs(params: { page?: number; pageSize?: number; action?: string }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 50));
    const where = params.action ? { action: params.action } : {};

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          metadata: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        metadata: l.metadata,
        createdAt: l.createdAt,
        userName: l.user?.name ?? null,
        userEmail: l.user?.email ?? null,
      })),
      total,
      page,
      pageSize,
    };
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

  /**
   * GET /api/admin/managers — liste dédiée (distincte de `getOverview`, qui
   * embarque un sous-ensemble des mêmes champs pour la vue d'ensemble).
   */
  async listManagers() {
    const managers = await this.prisma.user.findMany({
      where: { role: Role.MANAGER },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        isSelfService: true,
        subscriptionActive: true,
        createdAt: true,
        managedEvent: { select: { id: true, title: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return managers.map((m) => ({
      id: m.id,
      name: m.name ?? 'Sans nom',
      email: m.email,
      isActive: m.isActive,
      isSelfService: m.isSelfService,
      subscriptionActive: m.subscriptionActive,
      createdAt: m.createdAt,
      eventId: m.managedEvent?.id ?? null,
      eventTitle: m.managedEvent?.title ?? null,
      eventStatus: m.managedEvent?.status ?? null,
    }));
  }

  /**
   * POST /api/admin/managers — invitation par email (décision produit
   * 2026-07-14). Le compte est créé immédiatement (isActive/subscriptionActive
   * = true — l'Admin a déjà vérifié ce manager, pas de fenêtre d'essai comme
   * pour le self-service), `passwordHash` reste null jusqu'à ce que le lien
   * reçu soit utilisé (`POST /api/auth/set-password`).
   *
   * Si l'email d'invitation échoue à partir, le compte reste créé (l'Admin
   * peut relancer manuellement) — `emailSent: false` dans la réponse pour
   * que le frontend puisse le signaler.
   */
  async inviteManager(dto: InviteManagerDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException({
        code: ErrorCodes.EMAIL_ALREADY_EXISTS,
        message: 'Un compte existe déjà avec cet email.',
      });
    }

    const inviteToken = randomBytes(32).toString('hex');
    const inviteTokenExpiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const manager = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        role: Role.MANAGER,
        isActive: true,
        isSelfService: false,
        subscriptionActive: true,
        inviteToken,
        inviteTokenExpiresAt,
      },
      select: { id: true, name: true, email: true },
    });

    let emailSent = true;
    try {
      await this.email.sendManagerInviteEmail({
        to: manager.email,
        name: manager.name ?? 'Manager',
        inviteUrl: `${FRONTEND_URL}/auth/set-password?token=${inviteToken}`,
      });
    } catch {
      emailSent = false;
    }

    await this.audit.log('admin.manager.invited', 'User', manager.id, { email: manager.email, emailSent });

    return { id: manager.id, name: manager.name, email: manager.email, emailSent };
  }

  /** PATCH /api/admin/managers/:id { isActive } — suspend/réactive un compte. */
  async setManagerActive(managerId: string, isActive: boolean) {
    const manager = await this.getManagerOrThrow(managerId);
    const updated = await this.prisma.user.update({
      where: { id: manager.id },
      data: { isActive },
      select: { id: true, isActive: true },
    });
    await this.audit.log('admin.manager.status', 'User', manager.id, { isActive });
    return updated;
  }

  /** PATCH /api/admin/managers/:id { subscriptionActive } — statut manuel (V1, pas de facturation réelle). */
  async setManagerSubscription(managerId: string, subscriptionActive: boolean) {
    const manager = await this.getManagerOrThrow(managerId);
    const updated = await this.prisma.user.update({
      where: { id: manager.id },
      data: { subscriptionActive },
      select: { id: true, subscriptionActive: true },
    });
    await this.audit.log('admin.manager.subscription', 'User', manager.id, { subscriptionActive });
    return updated;
  }

  /**
   * POST /api/admin/managers/:id/impersonate — connexion directe au dashboard
   * Manager sans ses identifiants (CDC §14.3). Le contrôleur pose le token
   * émis ici comme `access_token` ET conserve le token Admin d'origine dans
   * un second cookie (`impersonator_token`) pour permettre le retour sans
   * réauthentification (`POST /api/auth/stop-impersonation`).
   */
  async impersonateManager(adminId: string, managerId: string): Promise<TokenPair> {
    const manager = await this.getManagerOrThrow(managerId);
    const tokens = await this.authService.generateClientToken({
      id: manager.id,
      email: manager.email,
      role: Role.MANAGER,
    });
    await this.audit.log('admin.impersonate.start', 'User', manager.id, { adminId });
    return tokens;
  }

  private async getManagerOrThrow(managerId: string) {
    const manager = await this.prisma.user.findUnique({ where: { id: managerId } });
    if (!manager || manager.role !== Role.MANAGER) {
      throw new NotFoundException({
        code: ErrorCodes.MANAGER_NOT_FOUND,
        message: 'Manager introuvable.',
      });
    }
    return manager;
  }
}
