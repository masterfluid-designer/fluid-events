import { Injectable, Logger } from '@nestjs/common';
import twilio from 'twilio';

/**
 * SmsService — Notification SMS via Twilio (décision produit 2026-07-14).
 *
 * Canal complémentaire à EmailService/WhatsappService — pas un remplacement,
 * pas un "vrai" fallback conditionné à l'échec de WhatsApp (le Cloud API
 * Meta ne renvoie le statut de livraison que de façon asynchrone via webhook,
 * non implémenté ici) : le SMS part en parallèle dès qu'un téléphone valide
 * existe, volontairement plus simple pour la V1. Contrairement à WhatsApp,
 * le SMS ne nécessite aucun template pré-approuvé — texte libre, envoyable
 * immédiatement dès qu'un numéro Twilio (`TWILIO_SMS_FROM`) est configuré.
 *
 * Best-effort, même principe qu'EmailService/WhatsappService : un échec
 * d'envoi ne doit jamais bloquer la confirmation de paiement ni la
 * génération du billet — jamais de throw, seulement un log.
 */
/**
 * Erreur d'envoi du code de vérification. Distincte d'une panne Twilio :
 * elle dit que le canal n'est pas configuré du tout, ce qui appelle une action
 * d'exploitation et non une nouvelle tentative.
 */
export class CanalSmsIndisponibleError extends Error {}

export interface TicketSmsParams {
  to: string; // E.164 AVEC le '+' (PhoneService.normalizeToE164) — format attendu par Twilio
  eventTitle: string;
  orderNumber: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  async sendTicketReadySms(params: TicketSmsParams): Promise<void> {
    const { to, eventTitle, orderNumber } = params;

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_SMS_FROM;

    if (!accountSid || !authToken || !from) {
      this.logger.warn(
        'Twilio non configuré (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_SMS_FROM manquants) — SMS ignoré.',
      );
      return;
    }

    try {
      const client = twilio(accountSid, authToken);
      const message = await client.messages.create({
        to,
        from,
        body: `Vos billets pour ${eventTitle} sont prêts (commande ${orderNumber}). Retrouvez-les par email ou WhatsApp.`,
      });
      this.logger.log(
        `SMS "billets prêts" envoyé à ${to} (commande ${orderNumber}) — sid ${message.sid}`,
      );
    } catch (err) {
      this.logger.warn(
        `Échec envoi SMS billets (commande ${orderNumber}) : ${(err as Error).message}`,
      );
    }
  }

  /**
   * Code de vérification du numéro (2026-08-21).
   *
   * ⚠️ Contrairement au reste de ce service, cette méthode PROPAGE ses
   * erreurs. Les autres envois sont accessoires — un billet reste
   * téléchargeable sans SMS. Ici la personne attend le code devant son
   * écran : un échec avalé la laisserait patienter devant un message qui
   * ne viendra jamais.
   *
   * Le SMS remplace WhatsApp pour ce code (décision produit 2026-08-21) :
   * il ne demande aucun template pré-approuvé, et surtout il prouve que la
   * personne détient CE numéro — ce qu'un email n'aurait pas prouvé.
   */
  async sendVerificationCodeSms(params: { to: string; code: string }): Promise<void> {
    const { to, code } = params;

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_SMS_FROM;

    if (!accountSid || !authToken || !from) {
      throw new CanalSmsIndisponibleError(
        'Twilio non configuré (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_SMS_FROM manquants).',
      );
    }

    const client = twilio(accountSid, authToken);
    const message = await client.messages.create({
      to,
      from,
      // Le code d’abord : sur l’écran de verrouillage, seule la première
      // ligne est lue. Aucun lien — un SMS qui contient un lien ressemble
      // à une arnaque, et les codes de vérification en sont la cible.
      body: `${code} — votre code de vérification Fluid Events. Valable 10 minutes. Ne le communiquez à personne.`,
    });

    // Le code lui-même n’est jamais journalisé : les journaux sont lus par
    // plus de monde que la boîte de réception de son destinataire.
    this.logger.log(`SMS de vérification envoyé à ${to} — sid ${message.sid}`);
  }
}
