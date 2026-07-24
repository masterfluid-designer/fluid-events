import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { PaymentProviderType } from '@saas-events/types';

/** Code d'erreur Prisma pour une violation de contrainte d'unicité. */
export const PRISMA_UNIQUE_VIOLATION = 'P2002';

/** Valeur sentinelle retournée quand le webhook a déjà été traité. */
export const ALREADY_PROCESSED = Symbol('ALREADY_PROCESSED');

/**
 * WebhookIdempotencyService — Empêche le double-traitement d'un webhook.
 *
 * Mitigation critique du CDC §8.3 : les providers de paiement peuvent rejouer
 * un webhook (retry). Sans idempotence, une même vente serait traitée 2×.
 *
 * Stratégie : insertion dans `webhook_events` avec contrainte `@unique([provider, transactionId])`.
 *  - Premier webhook → insert réussit → on traite.
 *  - Rejeu → insert échoue (P2002) → on ignore proprement.
 *
 * Avantage sur un SELECT+INSERT : pas de fenêtre de race (l'unicité est garantie
 * au niveau ligne par PostgreSQL, pas par la logique applicative).
 */
@Injectable()
export class WebhookIdempotencyService {
  private readonly logger = new Logger(WebhookIdempotencyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Tente d'enregistrer un webhook. Retourne :
   *  - `true` si nouveau (à traiter)
   *  - `ALREADY_PROCESSED` (Symbol) si déjà traité (doublon ignoré)
   *  - throw pour toute autre erreur (vraie anomalie BDD)
   */
  async recordOrSkip(
    provider: PaymentProviderType | string,
    transactionId: string,
  ): Promise<true | typeof ALREADY_PROCESSED> {
    if (!transactionId || typeof transactionId !== 'string') {
      throw new Error('transactionId requis pour l\'idempotence du webhook.');
    }

    const normalizedProvider = String(provider).toUpperCase();

    try {
      await this.prisma.webhookEvent.create({
        data: { provider: normalizedProvider, transactionId },
      });
      return true;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === PRISMA_UNIQUE_VIOLATION
      ) {
        // Doublon → déjà traité → on ignore proprement
        this.logger.warn(
          `Webhook ${normalizedProvider}/${transactionId} déjà traité — ignoré (idempotence).`,
        );
        await this.audit.log(
          'payment.webhook.duplicate',
          'Order',
          null,
          { transactionId, provider: normalizedProvider },
        );
        return ALREADY_PROCESSED;
      }
      // Autre erreur → propager (ne pas masquer une vraie anomalie)
      throw err;
    }
  }
}
