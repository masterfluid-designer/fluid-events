import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * GoogleAuthGuard — propage `eventSlug` + `redirect` à travers le paramètre
 * OAuth `state` (CDC §7.4 — intent d'achat horodaté).
 *
 * Sans ça, `GET /api/auth/google?eventSlug=...&redirect=...` perdrait ces
 * paramètres au retour de Google : passport ne les fait pas transiter tout
 * seul, il faut explicitement les encoder dans `state` à l'aller et les
 * décoder au callback (`AuthController.googleCallback`).
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext): { state?: string } | undefined {
    const request = context.switchToHttp().getRequest();
    const eventSlug = request.query?.eventSlug;
    const redirect = request.query?.redirect;
    if (!eventSlug && !redirect) return undefined;

    return {
      state: JSON.stringify({
        ...(eventSlug ? { eventSlug: String(eventSlug) } : {}),
        ...(redirect ? { redirect: String(redirect) } : {}),
      }),
    };
  }
}
