import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { Resend } from 'resend';
import { AuditService } from '../common/audit.service';
import { APP_URL } from '../common/constants';

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
   * Invitation d'un organisateur — refondue en briefing d'accueil
   * (2026-08-23).
   *
   * La version précédente disait ce qu'il y avait à faire (choisir un mot de
   * passe) et où aller ensuite. Elle ne disait pas CE QU’EST la plateforme :
   * un organisateur découvrait les trois régimes d'événement, le plafond de
   * son palier et le fait que l'encaissement se branche côté équipe en s'y
   * heurtant, un par un.
   *
   * Cet email est souvent le seul document que l'organisateur garde. Il porte
   * donc les quatre choses qu’on ne veut pas lui laisser découvrir seul :
   * ce qu’il peut faire, ce que son palier autorise, ce que Premium ajoute,
   * et l’ordre dans lequel s’y prendre.
   */
  async sendManagerInviteEmail(params: {
    to: string;
    name: string;
    inviteUrl: string;
    /** Palier du compte à sa création. Un compte invité démarre simple. */
    plan?: 'FREE' | 'PREMIUM';
  }): Promise<void> {
    const { to, name, inviteUrl, plan = 'FREE' } = params;
    const app = APP_URL;
    const premium = plan === 'PREMIUM';
    const subject = `Bienvenue sur Fluid Events, ${name} — votre espace organisateur est ouvert`;

    /*
     * Tables et styles en ligne : les clients mail ignorent flexbox, grid et
     * les feuilles de style externes. Ce qui se lit ici se lit partout.
     */
    const carte = (titre: string, texte: string) => `
      <tr>
        <td style="padding:0 0 14px">
          <div style="font-weight:700;color:#1c1b1a">${titre}</div>
          <div style="color:#6f645c;font-size:14px">${texte}</div>
        </td>
      </tr>`;

    // La colonne du palier courant est mise en avant : l'organisateur doit
    // reconnaître SA colonne avant de lire ce qui lui manque.
    const ligne = (quoi: string, simple: string, plus: string) => `
      <tr>
        <td style="padding:10px 12px;border-top:1px solid #ece5df;font-size:14px;color:#1c1b1a">${quoi}</td>
        <td style="padding:10px 12px;border-top:1px solid #ece5df;font-size:14px;text-align:center;color:${premium ? '#6f645c' : '#1c1b1a'};font-weight:${premium ? '400' : '700'}">${simple}</td>
        <td style="padding:10px 12px;border-top:1px solid #ece5df;font-size:14px;text-align:center;background:#fdf6f1;color:${premium ? '#1c1b1a' : '#c0571e'};font-weight:700">${plus}</td>
      </tr>`;

    const html = `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#faf8f6;padding:28px 12px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #ece5df;border-radius:16px">
          <tr><td style="padding:32px 28px 0">

            <p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#c0571e">Votre espace est ouvert</p>
            <h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;color:#1c1b1a">Bienvenue sur Fluid&nbsp;Events, ${escapeHtml(name)}</h1>

            <p style="margin:0;font-size:15px;line-height:1.6;color:#3d3733">
              Vous tenez désormais votre billetterie de bout en bout : la page de votre
              événement, vos tarifs, l'encaissement, le contrôle des entrées le jour J
              et le suivi de ce qui se vend. Il ne manque qu’un mot de passe.
            </p>

            <p style="margin:26px 0 8px">
              <a href="${inviteUrl}" style="display:inline-block;background:#c0571e;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:700;font-size:15px">
                Choisir mon mot de passe
              </a>
            </p>
            <p style="margin:0;color:#6f645c;font-size:13px">
              Ce lien n'est valable que <strong>7 jours</strong>. Passé ce délai, demandez-en
              un nouveau à l’équipe — votre compte, lui, reste en place.
            </p>

          </td></tr>

          <tr><td style="padding:28px">
            <div style="border-top:1px solid #ece5df;padding-top:24px">
              <h2 style="margin:0 0 16px;font-size:17px;color:#1c1b1a">Ce que vous pouvez faire</h2>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                ${carte(
                  'Choisir la forme de votre événement',
                  `Trois régimes, selon ce que vous organisez : <strong>inscription simple</strong>
                   (un formulaire, ni compte ni billet — pour un séminaire ou une conférence gratuite),
                   <strong>billetterie sans compte</strong> (on achète en trois champs, le billet arrive par email),
                   ou <strong>billetterie avec compte client</strong> (chacun retrouve ses billets dans son espace).`,
                )}
                ${carte(
                  'Composer votre page publique',
                  `Un éditeur par blocs : affiche, présentation, programme, intervenants,
                   galerie, plan d'accès, billetterie. Vous rangez, vous publiez, l'adresse est à vous.`,
                )}
                ${carte(
                  'Tenir votre billetterie',
                  `Autant de tarifs que nécessaire, avec stock, dates d'ouverture et de clôture.
                   Les formules négociées — tables, groupes — s’affichent en <em>sur demande</em>
                   et vous renvoient l’acheteur au lieu de passer au panier.`,
                )}
                ${carte(
                  'Encaisser',
                  `Mobile Money et carte bancaire. Le moyen d'encaissement est branché sur
                   votre événement par l’équipe Fluid Events — <strong>dites-le-nous avant de publier</strong>,
                   sinon votre page s’affiche sans pouvoir rien vendre.`,
                )}
                ${carte(
                  'Contrôler les entrées',
                  `Vous invitez vos agents ; ils scannent les QR depuis leur téléphone.
                   Un billet déjà passé est refusé sur-le-champ.`,
                )}
                ${carte(
                  'Suivre',
                  `Qui a acheté, qui s’est inscrit, ce qui s’est vendu et quand — et
                   la liste de vos participants, exportable.`,
                )}
              </table>
            </div>
          </td></tr>

          <tr><td style="padding:0 28px 28px">
            <div style="border-top:1px solid #ece5df;padding-top:24px">
              <h2 style="margin:0 0 6px;font-size:17px;color:#1c1b1a">Compte simple ou Premium</h2>
              <p style="margin:0 0 14px;color:#6f645c;font-size:14px">
                Votre compte démarre en <strong style="color:#1c1b1a">${premium ? 'Premium' : 'compte simple'}</strong>.
                ${premium ? 'Tout ce qui suit vous est ouvert.' : 'Voici ce que cela autorise, et ce que Premium ajoute.'}
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #ece5df;border-radius:12px;border-collapse:separate;overflow:hidden">
                <tr>
                  <td style="padding:10px 12px"></td>
                  <td style="padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#6f645c;text-align:center">Compte simple</td>
                  <td style="padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#c0571e;text-align:center;background:#fdf6f1;font-weight:700">Premium</td>
                </tr>
                ${ligne('Événements en cours', '1', 'jusqu’à 8')}
                ${ligne('Types différents en parallèle', '—', 'oui')}
                ${ligne('Agents de contrôle par événement', '3', '6')}
                ${ligne('Événement sur plusieurs journées', '—', 'oui')}
                ${ligne('Page publique, billetterie, paiements, statistiques', 'inclus', 'inclus')}
              </table>

              <p style="margin:14px 0 0;color:#6f645c;font-size:13px">
                ${
                  premium
                    ? 'Vos huit places sont libres de forme : rien ne vous oblige à tenir le même régime d’un événement à l’autre.'
                    : 'Rien à installer pour changer de palier : écrivez-nous, votre compte bascule sans que vous perdiez ce que vous avez déjà construit.'
                }
              </p>
            </div>
          </td></tr>

          <tr><td style="padding:0 28px 28px">
            <div style="border-top:1px solid #ece5df;padding-top:24px">
              <h2 style="margin:0 0 14px;font-size:17px;color:#1c1b1a">Par où commencer</h2>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:14px;color:#3d3733">
                <tr><td style="padding:0 0 10px;width:26px;color:#c0571e;font-weight:700">1.</td><td style="padding:0 0 10px">Choisissez votre mot de passe avec le bouton ci-dessus.</td></tr>
                <tr><td style="padding:0 0 10px;color:#c0571e;font-weight:700">2.</td><td style="padding:0 0 10px">Créez votre événement et fixez son <strong>régime</strong> — c’est lui qui décide des modules disponibles.</td></tr>
                <tr><td style="padding:0 0 10px;color:#c0571e;font-weight:700">3.</td><td style="padding:0 0 10px">Posez vos tarifs, puis composez la page publique.</td></tr>
                <tr><td style="padding:0 0 10px;color:#c0571e;font-weight:700">4.</td><td style="padding:0 0 10px">Demandez-nous le branchement de l’encaissement, <strong>avant</strong> de publier.</td></tr>
                <tr><td style="padding:0;color:#c0571e;font-weight:700">5.</td><td style="padding:0">Publiez, puis invitez vos agents de contrôle.</td></tr>
              </table>
            </div>
          </td></tr>

          <tr><td style="padding:0 28px 32px">
            <div style="border-top:1px solid #ece5df;padding-top:20px;font-size:13px;color:#6f645c;line-height:1.7">
              <strong style="color:#1c1b1a">Gardez ces adresses</strong><br>
              Tableau de bord : <a href="${app}/manager" style="color:#c0571e">${app}/manager</a><br>
              Connexion : <a href="${app}/auth/login" style="color:#c0571e">${app}/auth/login</a><br>
              Guide : <a href="${app}/docs" style="color:#c0571e">${app}/docs</a><br>
              Une question, un blocage ? <a href="${app}/support" style="color:#c0571e">${app}/support</a> — on répond vite.
              <br><br>
              Vous n'attendiez pas cette invitation ? Ignorez ce message, le compte restera inutilisé.
            </div>
          </td></tr>
        </table>
      </div>
    `;

    await this.send(to, subject, html);
    this.logger.log(`Email d'invitation manager envoyé à ${to}`);
  }
  /**
   * Lien de réinitialisation de mot de passe (2026-08-23).
   *
   * Court et sans ornement, à l'inverse de l'invitation : la personne est
   * bloquée dehors, elle veut un bouton, pas une brochure.
   *
   * Il dit deux choses qu'un email de ce type doit dire : combien de temps le
   * lien vaut, et quoi faire si la demande ne vient pas de vous. La seconde
   * n'est pas de la politesse — c'est le seul signal qu'a quelqu'un dont
   * l'adresse est visée.
   *
   * ⚠️ Contrairement aux autres, cette méthode PROPAGE l'erreur d'envoi :
   * l'appelant doit pouvoir la journaliser. Il ne la remonte pas au visiteur
   * pour autant — voir `PasswordResetService.demander`.
   */
  async sendPasswordResetEmail(params: {
    to: string;
    name: string;
    resetUrl: string;
    validiteMinutes: number;
  }): Promise<void> {
    const { to, name, resetUrl, validiteMinutes } = params;
    const app = APP_URL;
    const subject = 'Réinitialisez votre mot de passe Fluid Events';

    const html = `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#faf8f6;padding:28px 12px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #ece5df;border-radius:16px">
          <tr><td style="padding:32px 28px">

            <p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#c0571e">Mot de passe oublié</p>
            <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#1c1b1a">Reprenons la main, ${escapeHtml(name)}</h1>

            <p style="margin:0;font-size:15px;line-height:1.6;color:#3d3733">
              Choisissez un nouveau mot de passe, et vous retrouverez votre espace
              exactement comme vous l’avez laissé.
            </p>

            <p style="margin:26px 0 8px">
              <a href="${resetUrl}" style="display:inline-block;background:#c0571e;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:700;font-size:15px">
                Choisir un nouveau mot de passe
              </a>
            </p>

            <p style="margin:0;color:#6f645c;font-size:13px">
              Ce lien n’est valable que <strong>${validiteMinutes} minutes</strong> et ne
              fonctionne qu’une seule fois.
            </p>

            <div style="margin-top:28px;border-top:1px solid #ece5df;padding-top:20px;font-size:13px;line-height:1.7;color:#6f645c">
              <strong style="color:#1c1b1a">Vous n’avez rien demandé ?</strong><br>
              Ignorez ce message : votre mot de passe actuel reste valable et rien
              n’a changé sur votre compte. Si cela se répète, écrivez-nous depuis
              <a href="${app}/support" style="color:#c0571e">${app}/support</a>.
              <br><br>
              Le bouton ne fonctionne pas ? Copiez cette adresse dans votre navigateur :<br>
              <span style="word-break:break-all;color:#3d3733">${resetUrl}</span>
            </div>

          </td></tr>
        </table>
      </div>
    `;

    await this.send(to, subject, html);
    this.logger.log(`Email de réinitialisation envoyé à ${to}`);
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
