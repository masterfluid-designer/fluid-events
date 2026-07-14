import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { AuditService } from '../common/audit.service';
import { GoogleProfile } from './strategies/google.strategy';
import { LoginScannerDto } from './dto/login-scanner.dto';
import { LoginDto } from './dto/login.dto';
import { Role, TokenPair, ErrorCodes, GoogleAuthIntent, JwtPayload } from '@saas-events/types';

/**
 * AuthOrchestratorService — Orchestration des flux d'authentification complets.
 *
 * AuthService reste pur (génération de token, testée unitairement) ; ce service
 * gère les effets de bord : upsert BDD, vérification password, audit log.
 *
 * Flux (CDC §7) :
 *  - Google OAuth : upsert User → JWT client (durée événementielle si eventSlug)
 *  - Scanner : vérification passwordHash (bcrypt) → JWT scanner (exp = endDate + 1h)
 *  - Refresh : vérification du refresh token → nouvelle paire
 */
@Injectable()
export class AuthOrchestratorService {
  private readonly logger = new Logger(AuthOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Connexion Google OAuth.
   * @param profile Profil normalisé par GoogleStrategy
   * @param eventSlug Optionnel — slug de l'événement ciblé (session événementielle)
   * @param intent Optionnel — `become_manager` déclenche l'inscription self-service
   *   Manager (CDC §14.3, décision produit 2026-07-14) SI le compte n'existe pas
   *   encore. Un compte déjà existant (même googleId) n'a JAMAIS son rôle modifié
   *   par ce paramètre — évite toute escalade de privilège silencieuse.
   */
  async loginWithGoogle(
    profile: GoogleProfile,
    eventSlug?: string,
    intent?: string,
  ): Promise<TokenPair> {
    const existing = await this.prisma.user.findUnique({
      where: { googleId: profile.googleId },
      select: { id: true },
    });
    const isSelfServiceManagerSignup = !existing && intent === GoogleAuthIntent.BECOME_MANAGER;

    // Upsert : si l'utilisateur existe déjà (même googleId), on met à jour les infos
    // Google sans écraser les champs enrichis post-paiement (phone, country, profileCompletedAt)
    // ni le rôle (jamais touché dans `update`, quel que soit `intent`).
    const user = await this.prisma.user.upsert({
      where: { googleId: profile.googleId },
      create: {
        email: profile.email,
        googleId: profile.googleId,
        name: profile.name ?? null,
        avatarUrl: profile.avatarUrl ?? null,
        role: isSelfServiceManagerSignup ? Role.MANAGER : Role.CLIENT,
        ...(isSelfServiceManagerSignup
          ? { isSelfService: true, subscriptionActive: false }
          : {}),
      },
      update: {
        name: profile.name ?? undefined,
        avatarUrl: profile.avatarUrl ?? undefined,
      },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user.isActive) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'Compte désactivé. Contactez un administrateur.',
      });
    }

    if (isSelfServiceManagerSignup) {
      await this.audit.log('auth.manager.selfservice.signup', 'User', user.id, {
        email: user.email,
      });
    }

    await this.audit.log('auth.google.login', 'User', user.id, {
      email: user.email,
    });

    return this.authService.generateClientToken(
      { id: user.id, email: user.email, role: user.role as Role },
      eventSlug,
    );
  }

  /**
   * Consomme le token d'invitation envoyé par mail (invitation Manager, CDC §14.3)
   * pour poser le mot de passe initial du compte. Le token est à usage unique :
   * il est effacé après utilisation, quelle que soit la suite (login normal ensuite).
   */
  async setPassword(token: string, password: string): Promise<{ success: true }> {
    const user = await this.prisma.user.findUnique({
      where: { inviteToken: token },
      select: { id: true, email: true, inviteTokenExpiresAt: true },
    });

    if (!user) {
      throw new BadRequestException({
        code: ErrorCodes.INVITE_TOKEN_INVALID,
        message: "Lien d'invitation invalide.",
      });
    }

    if (!user.inviteTokenExpiresAt || user.inviteTokenExpiresAt < new Date()) {
      throw new BadRequestException({
        code: ErrorCodes.INVITE_TOKEN_EXPIRED,
        message: "Lien d'invitation expiré. Demandez une nouvelle invitation.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        inviteToken: null,
        inviteTokenExpiresAt: null,
      },
    });

    await this.audit.log('auth.password.set', 'User', user.id, {
      email: user.email,
    });

    return { success: true };
  }

  /**
   * Connexion scanner (email + password).
   * Vérifie le mot de passe via bcrypt et que le scanner est actif sur l'événement.
   */
  async loginScanner(dto: LoginScannerDto): Promise<{ accessToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        passwordHash: true,
      },
    });

    if (!user || user.role !== Role.SCANNER || !user.passwordHash) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Identifiants scanner invalides.',
      });
    }

    if (!user.isActive) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'Compte scanner désactivé.',
      });
    }

    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Identifiants scanner invalides.',
      });
    }

    // Récupère l'événement associé au scanner (1 manager = 1 event, CDC §1.4)
    const scanner = await this.prisma.scanner.findFirst({
      where: { userId: user.id, isActive: true },
      select: {
        eventId: true,
        event: { select: { endDate: true, status: true } },
      },
    });

    if (!scanner || !scanner.event) {
      throw new NotFoundException({
        code: ErrorCodes.SCANNER_NOT_ACTIVE,
        message: 'Aucun événement actif associé à ce scanner.',
      });
    }

    await this.audit.log('auth.scanner.login', 'User', user.id, {
      eventId: scanner.eventId,
    });

    return this.authService.generateScannerToken(
      {
        id: user.id,
        email: user.email,
        name: user.name ?? undefined,
        role: Role.SCANNER,
      },
      scanner.eventId,
      scanner.event.endDate,
    );
  }

  /**
   * Connexion email/password générique (CLIENT/MANAGER/SUPER_ADMIN).
   * Ajoutée comme alternative de test/dev à Google OAuth — les comptes SCANNER
   * restent sur loginScanner() (logique event-bound distincte).
   */
  async login(dto: LoginDto): Promise<{ tokens: TokenPair; role: Role }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        passwordHash: true,
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Identifiants invalides.',
      });
    }

    if (user.role === Role.SCANNER) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Les comptes scanner utilisent /api/auth/login/scanner.',
      });
    }

    if (!user.isActive) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'Compte désactivé. Contactez un administrateur.',
      });
    }

    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Identifiants invalides.',
      });
    }

    await this.audit.log('auth.password.login', 'User', user.id, {
      email: user.email,
    });

    const tokens = await this.authService.generateClientToken({
      id: user.id,
      email: user.email,
      role: user.role as Role,
    });

    return { tokens, role: user.role as Role };
  }

  /**
   * Rafraîchit la paire de tokens côté client.
   * Le refresh token est signé avec JWT_REFRESH_SECRET (vérifié ici).
   */
  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string; email?: string; role?: Role };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException({
        code: ErrorCodes.TOKEN_EXPIRED,
        message: 'Refresh token invalide ou expiré.',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Utilisateur introuvable ou désactivé.',
      });
    }

    return this.authService.generateClientToken(
      { id: user.id, email: user.email, role: user.role as Role },
    );
  }

  /** GET /api/auth/me — identité courante (CDC §14.3, bannière impersonation frontend). */
  async getCurrentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCodes.USER_NOT_FOUND,
        message: 'Utilisateur introuvable.',
      });
    }
    return user;
  }

  /**
   * Restaure la session Admin d'origine après une impersonation (CDC §14.3).
   * Le cookie `impersonator_token` est un vrai JWT SUPER_ADMIN déjà signé
   * (celui de l'Admin au moment du clic "Se connecter en tant que Manager") —
   * on se contente de vérifier sa signature/expiration/rôle, jamais de le
   * décoder sans vérification.
   */
  async stopImpersonation(impersonatorToken: string | undefined): Promise<{ accessToken: string }> {
    if (!impersonatorToken) {
      throw new BadRequestException({
        code: ErrorCodes.NOT_IMPERSONATING,
        message: "Aucune session d'impersonation en cours.",
      });
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify(impersonatorToken);
    } catch {
      throw new UnauthorizedException({
        code: ErrorCodes.TOKEN_EXPIRED,
        message: 'Session administrateur expirée — reconnectez-vous.',
      });
    }

    if (payload.role !== Role.SUPER_ADMIN) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Token administrateur invalide.',
      });
    }

    await this.audit.log('admin.impersonate.end', 'User', payload.sub, {});

    return { accessToken: impersonatorToken };
  }
}
