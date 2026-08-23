import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { JwtPayload, Role, ErrorCodes } from '@saas-events/types';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Extrait le JWT depuis le cookie httpOnly `access_token` (CDC §7.3).
 * Utilisé en repli quand aucun header Authorization: Bearer n'est présent —
 * c'est le mode d'auth par défaut du frontend Next.js (`credentials: 'include'`).
 */
function extractFromCookie(req: Request): string | null {
  return req?.cookies?.access_token ?? null;
}

/**
 * JwtStrategy — Extrait et valide le JWT depuis l'en-tête Authorization: Bearer <token>.
 *
 * Le payload décodé est injecté dans `req.user` (CDC §7.6).
 * La vérification de signature + expiration est assurée par passport-jwt.
 *
 * ⚠️ **Une lecture BDD par requête depuis le 2026-08-23**, et une seule :
 * le numéro de version des jetons du compte, cherché par clé primaire.
 *
 * Le stateless était tenable tant qu'aucun jeton ne pouvait être révoqué.
 * Il ne l'était plus une fois la réinitialisation de mot de passe en place :
 * un jeton d’accès vaut SEPT JOURS par défaut, et celui d’un agent court
 * jusqu'à la fin de l'événement — des mois. Changer son mot de passe parce
 * qu'il est compromis ne mettait donc personne dehors.
 *
 * L'alternative — ne vérifier qu'au rafraîchissement — ne coûtait rien et
 * ne servait à rien : c'est justement l'access token qui dure longtemps ici.
 *
 * **`isActive` est vérifié depuis le 2026-08-23**, dans la même lecture.
 *
 * Désactiver un compte ne le mettait pas dehors : il gardait sa session
 * jusqu'à sept jours, et pour un agent de contrôle jusqu'à la fin de
 * l'événement. Un Admin qui coupe l'accès à quelqu'un attend que ce soit
 * fait maintenant, pas la semaine prochaine — sans quoi la seule mesure
 * réellement efficace était la suppression, qui emporte tout.
 */
export interface RequestUser {
  id: string;
  email: string;
  role: Role;
  /** Scanners uniquement — verrouillé dans le JWT pour empêcher le scan cross-event. */
  eventId?: string;
  /** Clients — timestamp Unix (event.endDate + 24h). */
  sessionExpiresAt?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({
      // Header Authorization: Bearer <token> en priorité (clients API / scanner
      // PWA), sinon cookie httpOnly access_token (flux web par défaut)
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        extractFromCookie,
      ]),
      // Refus explicite si pas de secret configuré (fail-fast au démarrage)
      secretOrKey: requireEnv('JWT_SECRET'),
      // passport-jwt vérifie déjà exp ; on ignore pas l'iat
      ignoreExpiration: false,
    });
  }

  /**
   * Appelé automatiquement après vérification de la signature.
   * La valeur retournée devient `req.user`.
   */
  async validate(payload: JwtPayload): Promise<RequestUser> {
    if (!payload.sub || !payload.email || !payload.role) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Token JWT malformé.',
      });
    }
    /*
     * Un jeton émis avant l'introduction de `tv` n'en porte pas : il vaut
     * la version 0, celle de tous les comptes au départ. Personne n’est
     * déconnecté par le déploiement — seulement par une réinitialisation.
     */
    const compte = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { tokenVersion: true, isActive: true },
    });

    if (!compte) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Compte introuvable.',
      });
    }

    /*
     * Contrôlé AVANT la version : un compte fermé l'est quelle que soit la
     * fraîcheur de son jeton, et lui répondre « reconnectez-vous » quand la
     * reconnexion est justement ce qui lui est refusé serait une impasse.
     */
    if (!compte.isActive) {
      throw new UnauthorizedException({
        code: ErrorCodes.ACCOUNT_DISABLED,
        message: 'Ce compte a été désactivé. Contactez un administrateur.',
      });
    }

    if ((payload.tv ?? 0) !== compte.tokenVersion) {
      throw new UnauthorizedException({
        code: ErrorCodes.SESSION_REVOKED,
        message:
          'Votre session a été fermée : le mot de passe de ce compte a changé. Reconnectez-vous.',
      });
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      ...(payload.eventId ? { eventId: payload.eventId } : {}),
      ...(payload.sessionExpiresAt
        ? { sessionExpiresAt: payload.sessionExpiresAt }
        : {}),
    };
  }
}

/** Helper fail-fast : lance si une variable d'env critique est absente. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} manquant — configuration JWT impossible (CDC §16.1).`,
    );
  }
  return value;
}
