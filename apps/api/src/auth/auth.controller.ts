import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthOrchestratorService } from './auth-orchestrator.service';
import { LoginScannerDto } from './dto/login-scanner.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { GoogleProfile } from './strategies/google.strategy';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { FRONTEND_URL } from '../common/constants';

const authLogger = new Logger('AuthController');

/**
 * AuthController — Points d'entrée d'authentification (CDC §7).
 *
 * Routes :
 *  GET  /api/auth/google           → déclenche le flow OAuth Google
 *  GET  /api/auth/google/callback  → callback Google, set cookie + redirect frontend
 *  POST /api/auth/login            → login email/password (CLIENT/MANAGER/SUPER_ADMIN, test/dev)
 *  POST /api/auth/login/scanner    → login email/password (scanners uniquement)
 *  POST /api/auth/refresh          → rafraîchit la paire de tokens
 *  POST /api/auth/logout           → efface les cookies
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly orchestrator: AuthOrchestratorService) {}

  /**
   * Déclenche l'OAuth Google. `eventSlug` (session événementielle, CDC §7.2)
   * et `redirect` (reprise du tunnel d'achat, CDC §7.4) sont propagés via
   * `state` par `GoogleAuthGuard` pour être récupérés au callback.
   */
  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth(
    @Query('eventSlug') _eventSlug?: string,
    @Query('redirect') _redirect?: string,
  ): void {
    // passport-google-oauth20 gère la redirection → on ne fait rien ici.
  }

  /**
   * Callback Google. Stratégie 'google' peuple req.user avec le GoogleProfile.
   * On émet les tokens puis on redirige vers le frontend — soit vers `redirect`
   * (repris du `state`, ex : reprise d'achat sur `/e/[slug]?resume=1`) si son
   * origine correspond bien à FRONTEND_URL, soit vers `/auth/callback` par défaut.
   */
  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(
    @Req() req: Request & { user?: GoogleProfile },
    @Res({ passthrough: true }) res: Response,
    @Query('state') state?: string,
  ): Promise<void> {
    const profile = req.user!;
    const decoded = state ? decodeState(state) : undefined;
    const tokens = await this.orchestrator.loginWithGoogle(profile, decoded?.eventSlug);

    setAuthCookies(res, tokens);
    res.redirect(resolveSafeRedirect(decoded?.redirect));
  }

  /** Connexion email/password générique (CLIENT/MANAGER/SUPER_ADMIN — test/dev). */
  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, role } = await this.orchestrator.login(dto);
    setAuthCookies(res, tokens);
    return { accessToken: tokens.accessToken, role };
  }

  /** Connexion scanner (email + password). */
  @Public()
  @Post('login/scanner')
  async loginScanner(
    @Body() dto: LoginScannerDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.orchestrator.loginScanner(dto);
    setAuthCookies(res, { accessToken: tokens.accessToken });
    return { accessToken: tokens.accessToken };
  }

  /** Rafraîchit la paire access/refresh token. */
  @Public()
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.orchestrator.refreshTokens(dto.refreshToken);
    setAuthCookies(res, tokens);
    return tokens;
  }

  /** Déconnexion — efface les cookies d'authentification. */
  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response): { success: true } {
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    return { success: true };
  }
}

/** Lit le `state` OAuth JSON posé par `GoogleAuthGuard` ({ eventSlug?, redirect? }). */
function decodeState(state: string): { eventSlug?: string; redirect?: string } | undefined {
  try {
    const parsed = JSON.parse(state);
    return {
      eventSlug: typeof parsed.eventSlug === 'string' ? parsed.eventSlug : undefined,
      redirect: typeof parsed.redirect === 'string' ? parsed.redirect : undefined,
    };
  } catch {
    // Ancien format (state = slug brut, non-JSON) — rétrocompatibilité.
    return state ? { eventSlug: state } : undefined;
  }
}

/**
 * Valide que `redirect` pointe bien vers l'origine de FRONTEND_URL avant de
 * l'honorer — sinon un `redirect` arbitraire dans la query de départ
 * ouvrirait une redirection non contrôlée après une authentification bien
 * réelle (open redirect). Fallback sur `/auth/callback` en cas de doute.
 */
function resolveSafeRedirect(redirect: string | undefined): string {
  const fallback = `${FRONTEND_URL}/auth/callback`;
  if (!redirect) return fallback;
  try {
    const target = new URL(redirect, FRONTEND_URL);
    if (target.origin !== new URL(FRONTEND_URL).origin) {
      authLogger.warn(`Redirect OAuth hors origine ignoré : ${redirect}`);
      return fallback;
    }
    return target.toString();
  } catch {
    return fallback;
  }
}

/** Pose les cookies httpOnly pour access + refresh token. */
function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken?: string },
): void {
  res.cookie('access_token', tokens.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  if (tokens.refreshToken) {
    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
    });
  }
}
