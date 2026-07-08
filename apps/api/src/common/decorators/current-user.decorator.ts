import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestUser } from '../../auth/strategies/jwt.strategy';

/**
 * Décorateur @CurrentUser() — Extrait l'utilisateur authentifié depuis req.user.
 *
 * @example
 * @Get('me')
 * @Roles(Role.CLIENT)
 * getProfile(@CurrentUser() user: RequestUser) { ... }
 *
 * Retourne undefined sur une route @Public() non authentifiée.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
