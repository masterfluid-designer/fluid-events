import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { Role } from '@saas-events/types';

/** Fenêtre d'essai avant suppression d'un compte Manager self-service non abonné. */
const MANAGER_TRIAL_DAYS = 3;
/** Délai de rétention après la fin d'un événement avant anonymisation d'un Client. */
const CLIENT_RETENTION_DAYS = 7;

/**
 * RetentionService — Rétention/suppression automatique des comptes (décision
 * produit 2026-07-14) :
 *
 *  - Manager self-service sans abonnement actif depuis > 3 jours → compte
 *    (et son événement s'il existe) supprimés définitivement, SAUF si
 *    l'événement a au moins une commande (paiement en cours ou passé) : la
 *    contrainte FK Order→Event (Restrict) empêcherait de toute façon la
 *    suppression, et perdre des données de commande serait inacceptable même
 *    hors PAID (PENDING peut devenir PAID via webhook tardif) — on journalise
 *    un avertissement et on ignore ce compte plutôt que de le supprimer.
 *  - Client dont TOUS les événements liés (via ses commandes) se sont
 *    terminés il y a plus de 7 jours → données personnelles ANONYMISÉES
 *    (jamais de suppression : Order/OrderItem restent intacts pour la
 *    comptabilité, cf. Order.client en relation requise).
 *
 * Jamais de manager invité par l'Admin (isSelfService=false) concerné, jamais
 * de client avec un événement à venir ou terminé depuis moins de 7 jours.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runDailyRetention(): Promise<void> {
    await this.deleteExpiredSelfServiceManagers();
    await this.anonymizeStaleClients();
  }

  /** Supprime les comptes Manager self-service sans abonnement depuis > 3 jours. */
  async deleteExpiredSelfServiceManagers(): Promise<void> {
    const cutoff = new Date(Date.now() - MANAGER_TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const managers = await this.prisma.user.findMany({
      where: {
        role: Role.MANAGER,
        isSelfService: true,
        subscriptionActive: false,
        createdAt: { lt: cutoff },
      },
      select: {
        id: true,
        email: true,
        managedEvent: { select: { id: true } },
      },
    });

    for (const manager of managers) {
      if (manager.managedEvent) {
        const orderCount = await this.prisma.order.count({
          where: { eventId: manager.managedEvent.id },
        });
        if (orderCount > 0) {
          this.logger.warn(
            `Suppression auto ignorée — manager ${manager.id} (${manager.email}) a un événement avec ${orderCount} commande(s) liée(s).`,
          );
          continue;
        }
      }

      try {
        await this.prisma.$transaction(async (tx) => {
          if (manager.managedEvent) {
            await tx.event.delete({ where: { id: manager.managedEvent!.id } });
          }
          await tx.user.delete({ where: { id: manager.id } });
        });
      } catch (error) {
        this.logger.warn(
          `Suppression auto échouée — manager ${manager.id} (${manager.email}) : ${(error as Error).message}`,
        );
        continue;
      }

      await this.audit.log('account.retention.manager.deleted', 'User', manager.id, {
        email: manager.email,
        hadEvent: Boolean(manager.managedEvent),
      });
    }
  }

  /** Anonymise les comptes Client dont tous les événements liés sont terminés depuis > 7 jours. */
  async anonymizeStaleClients(): Promise<void> {
    const cutoff = new Date(Date.now() - CLIENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const candidates = await this.prisma.user.findMany({
      where: {
        role: Role.CLIENT,
        googleId: { not: null },
        orders: { some: {} },
      },
      select: {
        id: true,
        orders: { select: { event: { select: { endDate: true } } } },
      },
    });

    for (const client of candidates) {
      const allEventsEndedPastRetention = client.orders.every(
        (order) => order.event.endDate < cutoff,
      );
      if (!allEventsEndedPastRetention) continue;

      await this.prisma.user.update({
        where: { id: client.id },
        data: {
          name: null,
          phone: null,
          country: null,
          avatarUrl: null,
          profileCompletedAt: null,
          googleId: null,
          email: `deleted-${client.id}@anonymized.fluid-events.local`,
        },
      });

      await this.audit.log('account.retention.client.anonymized', 'User', client.id, {});
    }
  }
}
