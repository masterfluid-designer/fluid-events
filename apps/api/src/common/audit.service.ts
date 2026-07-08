import { Injectable, Logger } from '@nestjs/common';
import { InputJsonValue } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Actions d'audit standardisées (CDC §15.5).
 * Typées `as const` pour garantir l'exhaustivité et éviter les typos.
 */
export const AUDIT_ACTIONS = {
  'auth.google.login': 'Connexion Google OAuth',
  'auth.scanner.login': 'Connexion scanner',
  'auth.logout': 'Déconnexion',
  'event.created': 'Événement créé',
  'event.updated': 'Événement modifié',
  'event.status.changed': 'Statut changé',
  'event.deleted': 'Événement supprimé',
  'payment.init': 'Paiement initialisé',
  'payment.webhook.success': 'Webhook succès',
  'payment.webhook.failed': 'Webhook échoué',
  'payment.webhook.duplicate': 'Webhook en double ignoré',
  'payment.stock.race': 'Race condition stock détectée',
  'scan.valid': 'QR valide',
  'scan.already_used': 'QR déjà utilisé',
  'scan.invalid': 'QR invalide',
  'scan.expired': 'QR expiré',
  'email.sent': 'Email envoyé',
  'email.failed': 'Email échoué',
  'whatsapp.sent': 'WhatsApp envoyé',
  'whatsapp.failed': 'WhatsApp échoué',
  'admin.provider.updated': 'Provider paiement modifié',
  'admin.manager.status': 'Statut manager changé',
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

/**
 * AuditService — Journalisation applicative persistée.
 *
 * Toutes les actions sensibles (paiement, scan, auth, admin) sont tracées
 * dans la table `audit_logs` (CDC §15.5). Les échecs d'écriture sont non-bloquants
 * (log warning) pour ne pas interrompre un flux métier critique.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enregistre une action d'audit.
   * Non-bloquant : une erreur BDD est loggée mais ne propage pas d'exception.
   */
  async log(
    action: AuditAction | string,
    entityType?: string | null,
    entityId?: string | null,
    metadata?: Record<string, unknown> | null,
    userId?: string | null,
    ip?: string | null,
    userAgent?: string | null,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action,
          entityType: entityType ?? null,
          entityId: entityId ?? null,
          metadata: (metadata as InputJsonValue | undefined) ?? undefined,
          userId: userId ?? null,
          ip: ip ?? null,
          userAgent: userAgent ?? null,
        },
      });
    } catch (err) {
      // Non-bloquant : on log en console mais on ne casse pas le flux métier
      this.logger.warn(
        `Échec écriture audit (${action}) : ${(err as Error).message}`,
      );
    }
  }
}
