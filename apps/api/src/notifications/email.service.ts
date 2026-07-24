import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { Resend } from 'resend';
import { AuditService } from '../common/audit.service';

/**
 * EmailService — Notification email (CDC §7.6 / décision produit 2026-07-14,
 * bascule Resend 2026-07-14).
 *
 * Deux transports, choisis à l'exécution selon `RESEND_API_KEY` :
 *  - Configuré (prod) → Resend (`resend.emails.send`), le fournisseur déjà
 *    anticipé par `.env.example` (RESEND_API_KEY/EMAIL_FROM) mais jamais
 *    branché jusqu'ici.
 *  - Absent (dev) → SMTP via Mailpit (`nodemailer`, `SMTP_HOST=localhost`,
 *    interface web http://localhost:8025, aucun email ne part réellement).
 *
 * Resend n'est PAS utilisable en dev pour ce projet : sans domaine vérifié,
 * l'API n'autorise l'envoi qu'à l'adresse email du propriétaire du compte
 * Resend lui-même — incompatible avec les adresses de seed `@fluid-events.test`
 * et le confort de Mailpit (catch-all, n'importe quel destinataire). D'où le
 * fallback SMTP conservé pour le développement local.
 *
 * Best-effort volontaire, dans les deux cas : un échec d'envoi ne doit JAMAIS
 * faire échouer la génération du billet — le PDF reste toujours téléchargeable
 * depuis le dashboard client (`GET /api/payments/orders`) indépendamment de
 * l'email. `sendTicketReadyEmail` ne relance donc jamais d'exception, elle logue.
 */
export interface TicketEmailItem {
  ticketName: string;
  qrCodeUrl: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly from: string;
  private readonly resend: Resend | null;
  private readonly transporter: Transporter | null;

  constructor(private readonly audit: AuditService) {
    this.from = process.env.SMTP_FROM ?? 'noreply@fluid-events.dev';

    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      this.resend = new Resend(resendApiKey);
      this.transporter = null;
    } else {
      this.resend = null;
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
          : undefined,
      });
    }
  }

  async sendTicketReadyEmail(params: {
    to: string;
    clientName: string;
    eventTitle: string;
    orderNumber: string;
    items: TicketEmailItem[];
  }): Promise<void> {
    const { to, clientName, eventTitle, orderNumber, items } = params;

    const itemsHtml = items
      .map(
        (item) =>
          `<li>${escapeHtml(item.ticketName)} — <a href="${item.qrCodeUrl}">Télécharger mon billet (PDF)</a></li>`,
      )
      .join('');

    const subject = `Vos billets pour ${eventTitle}`;
    const html = `
      <p>Bonjour ${escapeHtml(clientName)},</p>
      <p>Votre paiement pour <strong>${escapeHtml(eventTitle)}</strong> est confirmé (commande ${escapeHtml(orderNumber)}).</p>
      <ul>${itemsHtml}</ul>
      <p>Présentez le QR contenu dans votre billet PDF à l'entrée de l'événement.</p>
    `;

    try {
      await this.send(to, subject, html);
      this.logger.log(`Email billets envoyé à ${to} (commande ${orderNumber})`);
    } catch (err) {
      this.logger.warn(
        `Échec envoi email billets (commande ${orderNumber}) : ${(err as Error).message}`,
      );
    }
  }

  /**
   * Email d'invitation Manager (Admin, décision produit 2026-07-14) —
   * contrairement à `sendTicketReadyEmail`, l'échec est remonté à l'appelant
   * (`AdminService.inviteManager`) plutôt qu'avalé : l'Admin doit savoir si
   * l'invitation n'est pas partie, pour pouvoir partager le lien manuellement.
   */
  async sendManagerInviteEmail(params: { to: string; name: string; inviteUrl: string }): Promise<void> {
    const { to, name, inviteUrl } = params;
    const subject = 'Invitation à rejoindre Fluid Events';
    const html = `
      <p>Bonjour ${escapeHtml(name)},</p>
      <p>Vous avez été invité·e à gérer un événement sur Fluid Events.</p>
      <p><a href="${inviteUrl}">Définir mon mot de passe et accéder à mon dashboard</a></p>
      <p>Ce lien expire dans 7 jours.</p>
    `;
    await this.send(to, subject, html);
    this.logger.log(`Email d'invitation manager envoyé à ${to}`);
  }

  /**
   * Message du formulaire de contact public (/contact, /support —
   * 2026-07-24). Contrairement à `sendTicketReadyEmail`, l'échec est
   * remonté à l'appelant (même raisonnement que `sendManagerInviteEmail` :
   * il n'y a pas de repli, l'utilisateur doit savoir que son message n'est
   * pas parti). `replyTo` pointe vers le visiteur pour pouvoir lui répondre
   * directement depuis le client mail.
   */
  async sendContactMessage(params: {
    name: string;
    email: string;
    subject?: string;
    phone?: string;
    message: string;
  }): Promise<void> {
    const { name, email, subject, phone, message } = params;
    const to = process.env.CONTACT_RECIPIENT_EMAIL || 'hello@fluidevents.africa';
    const emailSubject = subject ? `[Contact] ${subject}` : `[Contact] Nouveau message de ${name}`;
    const html = `
      <p><strong>De :</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p>
      ${phone ? `<p><strong>Téléphone :</strong> ${escapeHtml(phone)}</p>` : ''}
      <p><strong>Message :</strong></p>
      <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
    `;
    await this.send(to, emailSubject, html, email);
    this.logger.log(`Message de contact envoyé (de ${email})`);
  }

  private async send(to: string, subject: string, html: string, replyTo?: string): Promise<void> {
    try {
      if (this.resend) {
        const { error } = await this.resend.emails.send({
          from: this.from,
          to,
          subject,
          html,
          ...(replyTo ? { replyTo } : {}),
        });
        if (error) throw new Error(error.message);
      } else {
        await this.transporter!.sendMail({
          from: this.from,
          to,
          subject,
          html,
          ...(replyTo ? { replyTo } : {}),
        });
      }
      await this.audit.log('email.sent', null, null, { to, subject });
    } catch (err) {
      await this.audit.log('email.failed', null, null, {
        to,
        subject,
        error: (err as Error).message,
      });
      throw err;
    }
  }
}

/** Échappement HTML minimal — contenu inséré dans un email HTML (noms/libellés utilisateur). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
