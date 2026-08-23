import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { ErrorCodes } from '@saas-events/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { EmailService } from '../notifications/email.service';
import { FRONTEND_URL } from '../common/constants';

/**
 * PasswordResetService — récupération de mot de passe (2026-08-23).
 *
 * Il n'en existait AUCUNE. `set-password` exige un jeton d'invitation, et
 * aucune route ne savait en régénérer un : `POST /admin/managers` refuse une
 * adresse déjà connue. Un organisateur qui oubliait son mot de passe la veille
 * de sa soirée était dehors définitivement, et la seule sortie — supprimer puis
 * recréer le compte — emportait ses événements, ses billets vendus et ses
 * inscrits.
 *
 * Trois règles gouvernent ce fichier :
 *
 *  1. **La réponse ne dit jamais si le compte existe.** Une formulation
 *     différente pour une adresse inconnue transformerait ce formulaire public
 *     en annuaire des organisateurs de la plateforme.
 *  2. **Le jeton est stocké haché.** `inviteToken` l'est en clair ; une copie
 *     de la base suffirait alors à prendre la main sur n'importe quel compte.
 *     Un jeton de réinitialisation vaut un mot de passe, il se range comme un
 *     mot de passe.
 *  3. **Un compte fantôme ne se réclame pas.** Les comptes créés à la volée
 *     pour un achat sans compte (`isGuest`) portent les billets de quelqu'un ;
 *     leur ouvrir une porte par email les offrirait au premier venu.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  /** Une heure : assez pour aller chercher l'email, trop court pour traîner. */
  private static readonly TTL_MINUTES = 60;

  /**
   * Délai minimum entre deux demandes pour une même adresse.
   *
   * Sans lui, ce formulaire public devient un moyen d'inonder la boîte de
   * quelqu'un — et d'épuiser le quota d'envoi de la plateforme au passage.
   */
  private static readonly DELAI_ENTRE_DEMANDES_SECONDES = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  /**
   * Émet un lien de réinitialisation, ou fait semblant.
   *
   * Renvoie TOUJOURS la même chose. Les seuls écarts observables de
   * l'extérieur sont le temps de réponse et l'arrivée d'un email — le premier
   * est bruité par l'envoi lui-même, le second n'est visible que du
   * propriétaire de la boîte.
   */
  async demander(emailSaisi: string): Promise<{ success: true }> {
    const adresse = emailSaisi.trim().toLowerCase();

    const compte = await this.prisma.user.findUnique({
      where: { email: adresse },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        isGuest: true,
        passwordResetRequestedAt: true,
      },
    });

    if (!compte || !compte.isActive || compte.isGuest) {
      // On journalise le refus — c'est le seul endroit où il laisse une trace,
      // et une rafale sur des adresses inconnues mérite d'être visible.
      this.logger.log(`Demande de réinitialisation sans effet pour ${adresse}`);
      return { success: true };
    }

    const depuisLaDerniere = compte.passwordResetRequestedAt
      ? (Date.now() - compte.passwordResetRequestedAt.getTime()) / 1000
      : Infinity;

    if (depuisLaDerniere < PasswordResetService.DELAI_ENTRE_DEMANDES_SECONDES) {
      this.logger.warn(`Demande de réinitialisation trop rapprochée pour ${adresse}`);
      return { success: true };
    }

    /*
     * Le jeton porte l'identifiant du compte en préfixe : c'est ce qui permet
     * de retrouver la ligne alors que seul le HACHAGE du secret est en base.
     * Le préfixe n'est pas un secret — il ne sert qu'à trouver la serrure, la
     * clé reste la seconde moitié.
     */
    const secret = randomBytes(32).toString('hex');
    const jeton = `${compte.id}.${secret}`;
    const maintenant = new Date();

    await this.prisma.user.update({
      where: { id: compte.id },
      data: {
        passwordResetTokenHash: this.hacher(secret),
        passwordResetTokenExpiresAt: new Date(
          maintenant.getTime() + PasswordResetService.TTL_MINUTES * 60 * 1000,
        ),
        passwordResetRequestedAt: maintenant,
      },
    });

    await this.audit.log('auth.password.reset_requested', 'User', compte.id, {
      email: compte.email,
    });

    /*
     * L'envoi ne remonte pas son échec à l'appelant : le distinguer du cas
     * « adresse inconnue » redonnerait au visiteur l'oracle qu'on vient de lui
     * retirer. L'incident reste dans les logs, où il est censé être lu.
     */
    try {
      await this.email.sendPasswordResetEmail({
        to: compte.email,
        name: compte.name ?? 'Bonjour',
        resetUrl: `${FRONTEND_URL}/auth/reinitialiser?token=${encodeURIComponent(jeton)}`,
        validiteMinutes: PasswordResetService.TTL_MINUTES,
      });
    } catch (err) {
      this.logger.error(
        `Échec d'envoi du lien de réinitialisation à ${compte.email} : ${
          err instanceof Error ? err.message : err
        }`,
      );
    }

    return { success: true };
  }

  /**
   * Consomme le jeton et pose le nouveau mot de passe.
   *
   * À l'inverse de `demander`, cette route DIT ce qui ne va pas : la personne
   * a le lien sous les yeux, lui répondre « quelque chose a échoué » la
   * laisserait sans savoir s'il faut recommencer ou attendre.
   */
  async reinitialiser(jeton: string, motDePasse: string): Promise<{ success: true }> {
    const separateur = jeton.indexOf('.');
    if (separateur <= 0) throw this.lienInvalide();

    const userId = jeton.slice(0, separateur);
    const secret = jeton.slice(separateur + 1);
    if (!secret) throw this.lienInvalide();

    const compte = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isActive: true,
        isGuest: true,
        passwordResetTokenHash: true,
        passwordResetTokenExpiresAt: true,
      },
    });

    if (!compte || !compte.isActive || compte.isGuest || !compte.passwordResetTokenHash) {
      throw this.lienInvalide();
    }

    if (!this.correspond(secret, compte.passwordResetTokenHash)) throw this.lienInvalide();

    if (
      !compte.passwordResetTokenExpiresAt ||
      compte.passwordResetTokenExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException({
        code: ErrorCodes.INVITE_TOKEN_EXPIRED,
        message: 'Ce lien a expiré. Demandez-en un nouveau.',
      });
    }

    const passwordHash = await bcrypt.hash(motDePasse, 10);

    await this.prisma.user.update({
      where: { id: compte.id },
      data: {
        passwordHash,
        // Usage unique : le jeton meurt avec la réinitialisation qu'il a servie.
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
        /*
         * Une invitation en cours devient caduque : la personne vient de
         * prouver qu'elle tient l'adresse, et laisser vivre un second chemin
         * d'accès n'apporte rien qu'un risque de plus.
         */
        inviteToken: null,
        inviteTokenExpiresAt: null,
      },
    });

    await this.audit.log('auth.password.reset', 'User', compte.id, { email: compte.email });
    this.logger.log(`Mot de passe réinitialisé pour ${compte.email}`);

    return { success: true };
  }

  /** SHA-256 : le jeton est déjà 256 bits d'aléa, il n'a rien à gagner d'un KDF. */
  private hacher(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  /**
   * Comparaison à temps constant : comparer deux empreintes avec `===` laisse
   * fuir, par la durée, le nombre de caractères devinés.
   */
  private correspond(secret: string, empreinteAttendue: string): boolean {
    const fourni = Buffer.from(this.hacher(secret), 'hex');
    const attendu = Buffer.from(empreinteAttendue, 'hex');
    return fourni.length === attendu.length && timingSafeEqual(fourni, attendu);
  }

  /**
   * Un seul message pour « mal formé », « inconnu », « déjà utilisé » et
   * « pas le bon secret » : les distinguer dirait à un curieux lequel de ces
   * quatre murs il vient de heurter.
   */
  private lienInvalide(): BadRequestException {
    return new BadRequestException({
      code: ErrorCodes.INVITE_TOKEN_INVALID,
      message: 'Ce lien de réinitialisation est invalide ou a déjà été utilisé.',
    });
  }
}
