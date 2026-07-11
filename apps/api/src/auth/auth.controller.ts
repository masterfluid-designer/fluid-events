import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { AuthOrchestratorService } from './auth-orchestrator.service';
import { LoginScannerDto } from './dto/login-scanner.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { GoogleProfile } from './strategies/google.strategy';
import { Public } from '../common/decorators/public.decorator';
import { FRONTEND_URL } from '../common/constants';

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
   * Déclenche l'OAuth Google. Le paramètre `eventSlug` est propagé via `state`
   * pour pouvoir le récupérer au callback (session événementielle, CDC §7.2).
   */
  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth(@Query('eventSlug') _eventSlug?: string): void {
    // passport-google-oauth20 gère la redirection → on ne fait rien ici.
  }

  /**
   * Callback Google. Stratégie 'google' peuple req.user avec le GoogleProfile.
   * On émet les tokens puis on redirige vers le frontend avec un cookie httpOnly.
   */
  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req: Request & { user?: GoogleProfile },
    @Res({ passthrough: true }) res: Response,
    @Query('state') state?: string,
  ): Promise<void> {
    const profile = req.user!;
    // Le state porte l'eventSlug s'il a été passé (URL-encodé par Google)
    const eventSlug = state ? decodeState(state) : undefined;
    const tokens = await this.orchestrator.loginWithGoogle(profile, eventSlug);

    setAuthCookies(res, tokens);
    res.redirect(`${FRONTEND_URL}/auth/callback`);
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

/** Lit le `state` OAuth (peut contenir l'eventSlug encodé). */
function decodeState(state: string): string | undefined {
  try {
    const parsed = JSON.parse(state);
    return typeof parsed.eventSlug === 'string' ? parsed.eventSlug : undefined;
  } catch {
    // Si ce n'est pas du JSON, on considère que c'est directement le slug
    return state || undefined;
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
