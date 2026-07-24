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
import { SetPasswordDto } from './dto/set-password.dto';
import { RequestPhoneVerificationDto } from './dto/request-phone-verification.dto';
import { ConfirmPhoneVerificationDto } from './dto/confirm-phone-verification.dto';
import { GoogleProfile } from './strategies/google.strategy';
import { RequestUser } from './strategies/jwt.strategy';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { AuditService } from '../common/audit.service';
import { FRONTEND_URL } from '../common/constants';
import {
  setAuthCookies,
  setImpersonatedAccessCookie,
  clearImpersonatorCookie,
  clearAuthCookies,
} from '../common/cookies.util';

const authLogger = new Logger('AuthController');

/**
 * AuthController — Points d'entrée d'authentification (CDC §7).
 *
 * Routes :
 *  GET  /api/auth/google           → déclenche le flow OAuth Google
 *  GET  /api/auth/google/callback  → callback Google, set cookie + redirect frontend
 *  POST /api/auth/login            → login email/password (CLIENT/MANAGER/SUPER_ADMIN, test/dev)
 *  POST /api/auth/login/scanner    → login email/password (scanners uniquement)
 *  POST /api/auth/set-password     → pose le mot de passe via token d'invitation Manager
 *  POST /api/auth/refresh          → rafraîchit la paire de tokens
 *  GET  /api/auth/me               → identité courante + statut impersonation
 *  POST /api/auth/stop-impersonation → retour à la session Admin d'origine
 *  POST /api/auth/phone/request-verification → envoie un code WhatsApp
 *  POST /api/auth/phone/confirm-verification → confirme le code reçu
 *  POST /api/auth/logout           → efface les cookies
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly orchestrator: AuthOrchestratorService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Déclenche l'OAuth Google. `eventSlug` (session événementielle, CDC §7.2),
   * `redirect` (reprise du tunnel d'achat, CDC §7.4) et `intent` (`buy` ou
   * `become_manager` — inscription self-service Manager, décision produit
   * 2026-07-14) sont propagés via `state` par `GoogleAuthGuard` pour être
   * récupérés au callback.
   */
  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth(
    @Query('eventSlug') _eventSlug?: string,
    @Query('redirect') _redirect?: string,
    @Query('intent') _intent?: string,
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
    const tokens = await this.orchestrator.loginWithGoogle(profile, decoded?.eventSlug, decoded?.intent);

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

  /** Pose le mot de passe initial via le token d'invitation Manager (CDC §14.3). */
  @Public()
  @Post('set-password')
  async setPassword(@Body() dto: SetPasswordDto) {
    return this.orchestrator.setPassword(dto.token, dto.password);
  }

  /** Identité courante + statut impersonation (CDC §14.3 — bannière frontend). */
  @Get('me')
  async me(@Req() req: Request & { user?: RequestUser }) {
    const user = await this.orchestrator.getCurrentUser(req.user!.id);
    return { ...user, isImpersonating: Boolean(req.cookies?.impersonator_token) };
  }

  /**
   * Retour à la session Admin d'origine après une impersonation (CDC §14.3).
   * @Public() volontaire : la sécurité repose sur la vérification de signature
   * du cookie `impersonator_token` lui-même (comme /refresh), pas sur le token
   * actif — qui peut avoir expiré pendant l'impersonation.
   */
  @Public()
  @Post('stop-impersonation')
  async stopImpersonation(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.orchestrator.stopImpersonation(req.cookies?.impersonator_token);
    setImpersonatedAccessCookie(res, result.accessToken);
    clearImpersonatorCookie(res);
    return { accessToken: result.accessToken };
  }

  /**
   * Envoie un code de vérification WhatsApp pour le numéro soumis (CDC —
   * décision produit 2026-07-15). Le pays est déduit de l'indicatif, jamais
   * demandé séparément. Non @Public() : le user courant (req.user.id) est la
   * cible de la vérification, jamais un id passé dans le body.
   */
  @Post('phone/request-verification')
  async requestPhoneVerification(
    @Req() req: Request & { user?: RequestUser },
    @Body() dto: RequestPhoneVerificationDto,
  ) {
    return this.orchestrator.requestPhoneVerification(req.user!.id, dto.phone);
  }

  /** Confirme le code de vérification WhatsApp reçu. */
  @Post('phone/confirm-verification')
  async confirmPhoneVerification(
    @Req() req: Request & { user?: RequestUser },
    @Body() dto: ConfirmPhoneVerificationDto,
  ) {
    return this.orchestrator.confirmPhoneVerification(req.user!.id, dto.code);
  }

  /**
   * Déconnexion — efface les cookies d'authentification. `@Public()`
   * volontaire (doit fonctionner même avec un access_token déjà expiré) —
   * voir `clearAuthCookies` pour pourquoi le `path` de chaque cookie doit
   * correspondre exactement à celui utilisé lors de sa pose.
   */
  @Public()
  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response): Promise<{ success: true }> {
    clearAuthCookies(res);
    await this.audit.log('auth.logout');
    return { success: true };
  }
}

/** Lit le `state` OAuth JSON posé par `GoogleAuthGuard` ({ eventSlug?, redirect?, intent? }). */
function decodeState(state: string): { eventSlug?: string; redirect?: string; intent?: string } | undefined {
  try {
    const parsed = JSON.parse(state);
    return {
      eventSlug: typeof parsed.eventSlug === 'string' ? parsed.eventSlug : undefined,
      redirect: typeof parsed.redirect === 'string' ? parsed.redirect : undefined,
      intent: typeof parsed.intent === 'string' ? parsed.intent : undefined,
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
