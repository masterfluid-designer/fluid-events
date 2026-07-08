import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload, Role, ErrorCodes } from '@saas-events/types';

/**
 * JwtStrategy — Extrait et valide le JWT depuis l'en-tête Authorization: Bearer <token>.
 *
 * Le payload décodé est injecté dans `req.user` (CDC §7.6).
 * La vérification de signature + expiration est assurée par passport-jwt.
 *
 * ⚠️ Pas de fetch BDD ici : on fait confiance au JWT signé (stateless).
 * Si l'utilisateur a été désactivé en BDD, son token reste valide jusqu'à expiration —
 * c'est un compromis assumé du CDC (durées courtes, sessions événementielles).
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
  constructor() {
    super({
      // Extraction "Bearer <token>" depuis l'en-tête Authorization
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
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
