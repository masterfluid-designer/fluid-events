import { Injectable, Logger } from '@nestjs/common';
import { InputJsonValue } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Actions d'audit standardisées (CDC §15.5).
 * Typées `as const` pour garantir l'exhaustivité et éviter les typos.
 */
export const AUDIT_ACTIONS = {
  'auth.google.login': 'Connexion Google OAuth',
  'auth.password.login': 'Connexion email/password',
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
  'ticket.pdf.generated': 'PDF billet généré',
  'ticket.pdf.failed': 'Échec génération PDF billet',
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
  'admin.manager.invited': 'Manager invité par email',
  'admin.manager.subscription': 'Abonnement manager modifié',
  'admin.impersonate.start': 'Connexion en tant que manager (Admin)',
  'admin.impersonate.end': "Fin de l'impersonation",
  'auth.password.set': 'Mot de passe défini (invitation)',
  'auth.manager.selfservice.signup': 'Inscription manager self-service (Google)',
  'account.retention.manager.deleted': 'Compte manager supprimé (essai expiré)',
  'account.retention.client.anonymized': 'Compte client anonymisé (rétention)',
  'auth.phone.verification_requested': 'Code de vérification téléphone demandé',
  'auth.phone.verified': 'Téléphone vérifié',
  'admin.platform_settings.updated': 'Logo/icône de la plateforme modifié',
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
