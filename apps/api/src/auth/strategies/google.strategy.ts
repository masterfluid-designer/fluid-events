import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ErrorCodes } from '@saas-events/types';

/**
 * Profil Google normalisé — sous-ensemble des champs que l'on persiste.
 * On ne demande JAMAIS que email + profile + openid (minimisation, CDC §2.2).
 */
export interface GoogleProfile {
  googleId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

/**
 * GoogleStrategy — OAuth 2.0 pour la connexion des clients/managers.
 *
 * Scope restreint à openid + email + profile (RGPD/minimisation).
 * L'authentification elle-même (upsert User, génération JWT) est déléguée au
 * AuthController / AuthService — la stratégie ne fait que normaliser le profil.
 *
 * Scénario CDC §7.3 : un nouvel utilisateur Google → on upsert en BDD,
 * un client revient → on émet un JWT à durée événementielle.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: requireEnv('GOOGLE_CLIENT_ID'),
      clientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
      callbackURL: requireEnv('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile', 'openid'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<void> {
    const email = profile?.emails?.[0]?.value;
    const googleId = profile?.id;

    if (!email || !googleId) {
      // Google n'a pas renvoyé l'email (rare) — on refuse proprement.
      done(
        new UnauthorizedException({
          code: ErrorCodes.UNAUTHORIZED,
          message: 'Profil Google incomplet — email requis.',
        }),
        undefined,
      );
      return;
    }

    const normalized: GoogleProfile = {
      googleId: String(googleId),
      email: String(email).toLowerCase(),
      ...(profile.displayName ? { name: String(profile.displayName) } : {}),
      ...(profile.photos?.[0]?.value
        ? { avatarUrl: String(profile.photos[0].value) }
        : {}),
    };

    // Injection dans req.user via passport (le AuthController prend le relais)
    done(null, normalized);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} manquant — configuration Google OAuth impossible (CDC §16.1).`,
    );
  }
  return value;
}
