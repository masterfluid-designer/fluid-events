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

/** Adresse publique de l'application — les emails y renvoient. */
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

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
    /**
     * Lien signé vers la page du billet (2026-08-22). Indispensable à un
     * acheteur sans compte, qui n'a aucun tableau de bord où retourner.
     * Absent, le message reste celui d’avant.
     */
    ticketUrl?: string;
  }): Promise<void> {
    const { to, clientName, eventTitle, orderNumber, items, ticketUrl } = params;

    const itemsHtml = items
      .map(
        (item) =>
          `<li>${escapeHtml(item.ticketName)} — <a href="${item.qrCodeUrl}">Télécharger mon billet (PDF)</a></li>`,
      )
      .join('');

    const subject = `Vos billets pour ${eventTitle}`;

    /*
     * Le lien passe AVANT la liste des PDF quand il existe : un acheteur
     * sans compte n’a que lui, et c’est aussi le seul repère qui survit à
     * un téléphone changé ou à un PDF égaré.
     */
    const bloclien = ticketUrl
      ? `<p style="margin:24px 0">
           <a href="${ticketUrl}"
              style="display:inline-block;background:#c0571e;color:#fff;text-decoration:none;
                     padding:14px 32px;border-radius:999px;font-weight:700">
             Voir mes billets
           </a>
         </p>
         <p style="color:#6f645c;font-size:13px">Ce lien ouvre vos billets sans mot de passe. Gardez-le : il reste valable jusqu’à deux mois après l’événement.</p>`
      : '';

    const html = `
      <p>Bonjour ${escapeHtml(clientName)},</p>
      <p>Votre paiement pour <strong>${escapeHtml(eventTitle)}</strong> est confirmé (commande ${escapeHtml(orderNumber)}).</p>
      ${bloclien}
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
    const app = APP_URL;
    const subject = 'Votre espace organisateur Fluid Events est ouvert';

    /*
     * Réécrit le 2026-08-20. L'ancien message tenait en trois lignes : « vous
     * avez été invité », un lien, « expire dans 7 jours ». Un organisateur qui
     * arrivait dessus ne savait NI ce qu'il pouvait faire, NI où retourner
     * après avoir choisi son mot de passe, NI qui joindre en cas de doute —
     * et l'email d'invitation est souvent le seul repère qu'il garde.
     *
     * On y met donc les trois choses qui manquaient : ce qui l'attend, les
     * adresses pour y revenir, et une porte de sortie si le lien a expiré.
     */
    const html = `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#14171a">
        <p>Bonjour ${escapeHtml(name)},</p>

        <p>Votre espace organisateur vient d'être ouvert sur <strong>Fluid Events</strong>.
        Vous pouvez y créer votre événement, vendre vos billets en ligne et contrôler
        les entrées le jour J.</p>

        <p style="margin:28px 0">
          <a href="${inviteUrl}"
             style="display:inline-block;background:#14171a;color:#fff;text-decoration:none;
                    padding:13px 26px;border-radius:999px;font-weight:600">
            Choisir mon mot de passe
          </a>
        </p>

        <p style="color:#5f6b6b;font-size:13px">
          Ce lien n'est valable que <strong>7 jours</strong>. Passé ce délai, demandez-en
          un nouveau à l'équipe — votre compte, lui, reste en place.
        </p>

        <p style="margin-top:28px"><strong>Une fois votre mot de passe choisi</strong>, votre
        tableau de bord vous attend :</p>
        <ul style="padding-left:18px;color:#3d4649">
          <li><strong>Page publique</strong> — composez la page de votre événement, bloc par bloc.</li>
          <li><strong>Billetterie</strong> — vos tarifs, vos stocks, vos dates de vente.</li>
          <li><strong>Agents de contrôle</strong> — invitez qui scannera les billets à l'entrée.</li>
          <li><strong>Participants et statistiques</strong> — qui a acheté, ce qui s'est vendu.</li>
        </ul>

        <p style="margin-top:28px">Gardez ces adresses :</p>
        <ul style="padding-left:18px;color:#3d4649">
          <li>Votre tableau de bord : <a href="${app}/manager">${app}/manager</a></li>
          <li>Vous reconnecter plus tard : <a href="${app}/auth/login">${app}/auth/login</a></li>
          <li>Le guide : <a href="${app}/docs">${app}/docs</a></li>
        </ul>

        <p style="margin-top:28px;color:#5f6b6b;font-size:13px">
          Une question, un blocage ? Écrivez-nous depuis
          <a href="${app}/support">${app}/support</a> — on répond vite.
        </p>

        <p style="color:#5f6b6b;font-size:13px">
          Vous n'attendiez pas cette invitation ? Ignorez ce message, le compte restera
          inutilisé.
        </p>
      </div>
    `;
    await this.send(to, subject, html);
    this.logger.log(`Email d'invitation manager envoyé à ${to}`);
  }

  /**
   * Invitation d'un agent de contrôle (2026-08-19). Même mécanique que
   * l'invitation Manager — un lien pour choisir son mot de passe — mais le
   * message nomme l'événement : un agent peut travailler pour plusieurs
   * organisateurs et doit savoir lequel l'invite.
   */
  async sendScannerInviteEmail(params: {
    to: string;
    name: string;
    eventTitle: string;
    inviteUrl: string;
  }): Promise<void> {
    const { to, name, eventTitle, inviteUrl } = params;
    const subject = `Contrôle des billets — ${eventTitle}`;
    const html = `
      <p>Bonjour ${escapeHtml(name)},</p>
      <p>Vous avez été désigné·e pour contrôler les billets de
         <strong>${escapeHtml(eventTitle)}</strong> sur Fluid Events.</p>
      <p><a href="${inviteUrl}">Définir mon mot de passe et accéder au scanner</a></p>
      <p>Ce lien expire dans 7 jours. Le jour J, ouvrez le scanner depuis votre
         téléphone et présentez la caméra au QR de chaque billet.</p>
    `;
    await this.send(to, subject, html);
    this.logger.log(`Email d'invitation scanner envoyé à ${to}`);
  }

  /**
   * Confirmation d'inscription — régime RSVP (lot 2, 2026-08-22).
   *
   * Ni QR ni PDF : à l’entrée, on pointe les noms sur la liste. Ce message
   * n'est pas un billet, c'est une preuve d'inscription et un rappel de la
   * date — les deux choses qu’un inviter cherche trois semaines plus tard.
   *
   * Best-effort, comme les billets : une inscription enregistrée ne doit
   * pas être perdue parce que l'email n'est pas parti. Le nom figure sur la
   * liste de toute façon.
   */
  async sendRegistrationConfirmationEmail(params: {
    to: string;
    firstName: string;
    eventTitle: string;
    dateLabel?: string;
    placeLabel?: string;
  }): Promise<void> {
    const { to, firstName, eventTitle, dateLabel, placeLabel } = params;
    const subject = `Votre inscription à ${eventTitle} est enregistrée`;

    const details = [dateLabel, placeLabel].filter(Boolean).join(" · ");

    const html = `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#1c1b1a">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#c0571e">Inscription confirmée</p>
        <h1 style="margin:0 0 12px;font-size:24px;line-height:1.2">Merci ${escapeHtml(firstName)}, vous êtes sur la liste</h1>
        <p>Votre nom sera à l’accueil de <strong>${escapeHtml(eventTitle)}</strong>.</p>
        ${details ? `<p style="color:#6f645c">${escapeHtml(details)}</p>` : ''}
        <p style="color:#6f645c;font-size:13px;margin-top:24px">
          Rien à imprimer, rien à présenter : donnez simplement votre nom à l’entrée.
        </p>
      </div>
    `;

    try {
      await this.send(to, subject, html);
      this.logger.log(`Email de confirmation d’inscription envoyé à ${to}`);
    } catch (err) {
      this.logger.warn(
        `Échec envoi confirmation d’inscription à ${to} : ${(err as Error).message}`,
      );
    }
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
