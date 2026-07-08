'use client';

/**
 * lib/auth.ts — Gestion de l'intent d'achat horodaté (CDC §7.4).
 *
 * Le client DOIT être authentifié pour acheter. Avant la redirection OAuth,
 * on sauvegarde l'intent (ticketId ciblé) en sessionStorage avec un timestamp.
 * Au retour OAuth, on consomme l'intent (TTL 30min) pour reprendre le checkout.
 *
 * ⚠️ Clé spécifique à l'événement : un intent ne peut pas fuiter vers un autre event.
 *
 * La logique pure (saveIntent / consumeIntent) vit dans @saas-events/utils
 * (testée unitairement, 37 tests verts). Ce module l'expose côté navigateur.
 */
import { saveIntent, consumeIntent } from '@saas-events/utils';

export { saveIntent, consumeIntent };

/**
 * Déclenche le flux OAuth Google avec préservation de l'intent d'achat.
 * Redirige vers le backend qui initie OAuth puis revient sur la page événement.
 */
export function startGoogleAuth(eventSlug: string, ticketId: string): void {
  // 1. Sauvegarde l'intent avant de quitter la page
  saveIntent(eventSlug, ticketId);

  // 2. Redirige vers le backend NestJS (init OAuth)
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
  const params = new URLSearchParams({
    redirect: window.location.href,
    intent: 'buy',
    eventSlug,
  });
  window.location.href = `${apiBase}/api/auth/google?${params.toString()}`;
}
