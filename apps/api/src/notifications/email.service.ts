import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * EmailService — Notification email (CDC §7.6 / décision produit 2026-07-14).
 *
 * SMTP via Mailpit en dev (`SMTP_HOST=localhost`, `SMTP_PORT=1025`, interface
 * web sur http://localhost:8025 — aucun email ne part réellement en dev),
 * un vrai fournisseur SMTP en prod (mêmes variables d'env).
 *
 * Best-effort volontaire : un échec d'envoi ne doit JAMAIS faire échouer la
 * génération du billet — le PDF reste toujours téléchargeable depuis le
 * dashboard client (`GET /api/payments/orders`) indépendamment de l'email.
 * `sendTicketReadyEmail` ne relance donc jamais d'exception, elle logue.
 */
export interface TicketEmailItem {
  ticketName: string;
  qrCodeUrl: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor() {
    this.from = process.env.SMTP_FROM ?? 'noreply@fluid-events.dev';
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
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

    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: `Vos billets pour ${eventTitle}`,
        html: `
          <p>Bonjour ${escapeHtml(clientName)},</p>
          <p>Votre paiement pour <strong>${escapeHtml(eventTitle)}</strong> est confirmé (commande ${escapeHtml(orderNumber)}).</p>
          <ul>${itemsHtml}</ul>
          <p>Présentez le QR contenu dans votre billet PDF à l'entrée de l'événement.</p>
        `,
      });
      this.logger.log(`Email billets envoyé à ${to} (commande ${orderNumber})`);
    } catch (err) {
      this.logger.warn(
        `Échec envoi email billets (commande ${orderNumber}) : ${(err as Error).message}`,
      );
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
