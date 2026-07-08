import { SetMetadata } from '@nestjs/common';

/**
 * Décorateur @Public() — Marque une route comme accessible sans authentification.
 *
 * Utilisé pour les routes ouvertes : login Google, page événement publiée,
 * webhook de paiement (qui s'authentifie autrement, par signature HMAC).
 *
 * @example
 * @Public()
 * @Get('events/:slug')
 * findOne() { ... }
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
