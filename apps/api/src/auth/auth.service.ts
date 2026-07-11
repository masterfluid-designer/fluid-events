import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { parseDurationToSeconds } from '@saas-events/utils';
import { JwtPayload, Role, TokenPair } from '@saas-events/types';

/** Durée de grâce appliquée après la fin d'un événement (24h). */
export const SESSION_GRACE_SECONDS = 24 * 60 * 60;
/** Durée minimale garantie d'une session (1h), même si l'événement est passé/proche. */
export const MIN_SESSION_SECONDS = 3600;
/** Durée de grâce d'un token scanner après la fin de l'événement (1h). */
export const SCANNER_GRACE_SECONDS = 60 * 60;

/**
 * AuthService — Gestion des tokens JWT avec durée de session événementielle.
 *
 * Le cœur de la sécurité d'authentification (CDC §7) :
 *  - Le client DOIT rester connecté pendant toute la durée de l'événement ciblé.
 *  - La durée du JWT est calculée dynamiquement = event.endDate + 24h de grâce.
 *  - Sans événement cible → fallback JWT_EXPIRES_IN.
 *  - Le scanner a un JWT dédié (exp = endDate + 1h), sans refresh token.
 *
 * La signature réelle est déléguée à JwtService (testable via mock).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Génère une paire access+refresh token pour un CLIENT.
   * La durée est calée sur l'événement ciblé si eventSlug est fourni et PUBLISHED.
   *
   * @param user Utilisateur authentifié
   * @param eventSlug Optionnel — slug de l'événement ciblé (acheteur)
   */
  async generateClientToken(
    user: { id: string; email: string; role: Role },
    eventSlug?: string,
  ): Promise<TokenPair> {
    const fallbackExpiresIn = process.env.JWT_EXPIRES_IN ?? '7d';
    let expiresIn = fallbackExpiresIn;
    let sessionExpiresAt: number | undefined;

    if (eventSlug) {
      const event = await this.prisma.event.findUnique({
        where: { slug: eventSlug },
        select: { endDate: true, status: true },
      });

      if (event && event.status === 'PUBLISHED') {
        const msUntilExpiry =
          event.endDate.getTime() - Date.now() + SESSION_GRACE_SECONDS * 1000;

        if (msUntilExpiry > 0) {
          const seconds = Math.max(
            Math.ceil(msUntilExpiry / 1000),
            MIN_SESSION_SECONDS,
          );
          expiresIn = `${seconds}s`;
          sessionExpiresAt =
            Math.floor(event.endDate.getTime() / 1000) + SESSION_GRACE_SECONDS;
        }
      }
      // Événement non trouvé / non publié / passé → fallback JWT_EXPIRES_IN
    }

    const now = Math.floor(Date.now() / 1000);
    const parsedSeconds = parseDurationToSeconds(expiresIn);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      ...(sessionExpiresAt ? { sessionExpiresAt } : {}),
      iat: now,
      exp: now + parsedSeconds,
    };

    // payload porte déjà `exp` — AuthModule n'a pas de signOptions.expiresIn par
    // défaut (cf. auth.module.ts), donc aucun conflit avec jsonwebtoken ici.
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(
      { sub: user.id, type: 'refresh', ...(sessionExpiresAt ? { sessionExpiresAt } : {}) },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn }, // pas d'exp dans ce payload → OK
    );

    this.logger.debug(
      `Token client généré pour ${user.email} — expiresIn=${expiresIn}` +
        (sessionExpiresAt ? ` (session événementielle)` : ' (fallback)'),
    );

    return { accessToken, refreshToken };
  }

  /**
   * Génère un token SCANNER dédié.
   * exp = event.endDate + 1h. Pas de refresh token (re-login si expiré).
   */
  async generateScannerToken(
    user: { id: string; email: string; name?: string; role: Role },
    eventId: string,
    eventEndDate: Date,
  ): Promise<{ accessToken: string; refreshToken?: string }> {
    const msUntilExpiry =
      eventEndDate.getTime() - Date.now() + SCANNER_GRACE_SECONDS * 1000;
    const seconds = Math.max(
      Math.ceil(msUntilExpiry / 1000),
      MIN_SESSION_SECONDS,
    );

    const now = Math.floor(Date.now() / 1000);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: Role.SCANNER,
      eventId,
      iat: now,
      exp: now + seconds,
    };

    // payload porte déjà `exp` — pas de signOptions.expiresIn par défaut sur ce
    // module (cf. auth.module.ts), donc aucun conflit avec jsonwebtoken ici.
    const accessToken = this.jwtService.sign(payload);

    this.logger.debug(
      `Token scanner généré pour ${user.email} — eventId=${eventId}`,
    );

    // Pas de refresh token pour le scanner (CDC §7.5)
    return { accessToken };
  }
}
