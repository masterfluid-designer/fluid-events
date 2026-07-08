import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * JwtAuthGuard — Protège les routes via la stratégie Passport 'jwt'.
 *
 * Conçu pour être enregistré en APP_GUARD global (CDC §4.3). Les routes publiques
 * (login, page événement publiée, webhook paiement) le contournent via @Public().
 *
 * ⚠️ À toujours placer AVANT RolesGuard. JwtAuthGuard authentifie (peuple req.user),
 *    RolesGuard autorise (vérifie le rôle).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Route @Public() → on court-circuite l'auth JWT
    if (isPublic) return true;

    return super.canActivate(context);
  }
}
