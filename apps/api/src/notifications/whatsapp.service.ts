import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../common/audit.service';

/**
 * WhatsappService — Notification WhatsApp via Meta Cloud API (CDC — WhatsApp
 * Business, décision produit 2026-07-14 : Meta Cloud API directement, pas un
 * BSP tiers comme Twilio — `.env` avait un bloc Twilio jamais branché,
 * remplacé par les vraies variables Meta).
 *
 * Contrainte incontournable de la plateforme WhatsApp Business (pas une
 * limitation de ce code) : en dehors d'une fenêtre de conversation ouverte
 * par le client (24h), Meta n'autorise QUE l'envoi de "message templates"
 * pré-approuvés — jamais de texte libre. `WHATSAPP_TICKET_READY_TEMPLATE_NAME`
 * doit donc référencer un template déjà créé ET approuvé dans Meta Business
 * Manager (catégorie UTILITY — confirmation de commande) AVANT tout envoi
 * réel ; ce n'est pas automatisable depuis ce service (processus manuel côté
 * Meta, hors du contrôle applicatif).
 *
 * Best-effort volontaire, même principe qu'EmailService : un échec d'envoi
 * WhatsApp ne doit jamais bloquer la confirmation de paiement ni la
 * génération du billet — jamais de throw, seulement un log.
 */
export interface TicketWhatsappParams {
  to: string; // format Meta Cloud API : E.164 SANS le '+' (PhoneService.normalizeForWhatsapp)
  clientName: string;
  eventTitle: string;
  orderNumber: string;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(private readonly audit: AuditService) {}

  async sendTicketReadyMessage(params: TicketWhatsappParams): Promise<void> {
    const { to, clientName, eventTitle, orderNumber } = params;

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const apiVersion = process.env.WHATSAPP_API_VERSION ?? 'v21.0';
    const templateName = process.env.WHATSAPP_TICKET_READY_TEMPLATE_NAME ?? 'ticket_ready';
    const templateLang = process.env.WHATSAPP_TICKET_READY_TEMPLATE_LANG ?? 'fr';

    if (!accessToken || !phoneNumberId) {
      this.logger.warn('WhatsApp non configuré (WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID manquants) — envoi ignoré.');
      return;
    }

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: templateName,
            language: { code: templateLang },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: clientName },
                  { type: 'text', text: eventTitle },
                  { type: 'text', text: orderNumber },
                ],
              },
            ],
          },
        }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        messages?: Array<{ id: string }>;
        error?: { message?: string; type?: string; code?: number };
      };

      if (!response.ok) {
        throw new Error(
          body.error?.message ?? `WhatsApp API a répondu ${response.status}`,
        );
      }

      this.logger.log(
        `Message WhatsApp "billets prêts" envoyé à ${to} (commande ${orderNumber}) — id ${body.messages?.[0]?.id ?? '?'}`,
      );
      await this.audit.log('whatsapp.sent', 'Order', null, { to, orderNumber });
    } catch (err) {
      this.logger.warn(
        `Échec envoi WhatsApp billets (commande ${orderNumber}) : ${(err as Error).message}`,
      );
      await this.audit.log('whatsapp.failed', 'Order', null, {
        to,
        orderNumber,
        error: (err as Error).message,
      });
    }
  }

  /**
   * Envoie le code de vérification téléphone (décision produit 2026-07-15).
   * Nécessite un template Meta pré-approuvé (catégorie AUTHENTICATION —
   * recommandée par Meta pour les codes OTP, avec bouton "Copier le code"
   * intégré), même contrainte que `sendTicketReadyMessage` mais un template
   * distinct (`WHATSAPP_VERIFICATION_TEMPLATE_NAME`).
   *
   * Contrairement à `sendTicketReadyMessage` (best-effort, ne bloque jamais
   * la génération du billet), CETTE méthode PROPAGE l'erreur à l'appelant :
   * c'est le livrable même de la requête — l'utilisateur attend activement
   * ce code, un échec silencieux le laisserait bloqué sans recours.
   */
  async sendVerificationCode(params: { to: string; code: string }): Promise<void> {
    const { to, code } = params;

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const apiVersion = process.env.WHATSAPP_API_VERSION ?? 'v21.0';
    const templateName = process.env.WHATSAPP_VERIFICATION_TEMPLATE_NAME ?? 'phone_verification';
    const templateLang = process.env.WHATSAPP_VERIFICATION_TEMPLATE_LANG ?? 'fr';

    if (!accessToken || !phoneNumberId) {
      throw new Error(
        'WhatsApp non configuré (WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID manquants).',
      );
    }

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLang },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: code }] },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: code }],
            },
          ],
        },
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      messages?: Array<{ id: string }>;
      error?: { message?: string; type?: string; code?: number };
    };

    if (!response.ok) {
      throw new Error(body.error?.message ?? `WhatsApp API a répondu ${response.status}`);
    }

    this.logger.log(
      `Code de vérification WhatsApp envoyé à ${to} — id ${body.messages?.[0]?.id ?? '?'}`,
    );
  }
}
