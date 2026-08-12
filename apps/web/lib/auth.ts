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
import { saveIntent, consumeIntent, type BuyIntentItem } from '@saas-events/utils';

export { saveIntent, consumeIntent };
export type { BuyIntentItem };

/**
 * Déclenche le flux OAuth Google avec préservation de l'intent d'achat.
 * Redirige vers le backend qui initie OAuth puis revient sur la page événement.
 */
export function startGoogleAuth(eventSlug: string, items: BuyIntentItem[]): void {
  // 1. Sauvegarde l'intent avant de quitter la page
  saveIntent(eventSlug, items);

  // 2. Redirige vers le backend NestJS (init OAuth)
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
  const params = new URLSearchParams({
    redirect: window.location.href,
    intent: 'buy',
    eventSlug,
  });
  window.location.href = `${apiBase}/api/auth/google?${params.toString()}`;
}

/**
 * Événement DOM émis quand l'authentification en pop-up a réussi et que le
 * tunnel d'achat peut reprendre. Permet au sélecteur de billets (qui possède
 * le panier) de prévenir `ResumeCheckout` (qui possède la machine à états du
 * paiement) sans état partagé entre deux composants frères.
 */
export const CHECKOUT_RESUME_EVENT = 'fluid:checkout-resume';

/** Message posté par /auth/popup-callback à la fenêtre qui a ouvert la pop-up. */
interface AuthPopupMessage {
  type: 'fluid-auth';
  ok: boolean;
}

function isAuthPopupMessage(data: unknown): data is AuthPopupMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'fluid-auth' &&
    (data as { ok?: unknown }).ok === true
  );
}

/**
 * Connexion Google dans une FENÊTRE POP-UP, pour le tunnel d'achat.
 *
 * Motivation (décision produit) : la redirection pleine page faisait quitter
 * la page événement — le visiteur perdait le contexte de son panier et
 * revenait sur une page rechargée. Ici l'onglet d'origine ne bouge pas, il
 * reprend simplement le checkout quand la pop-up signale le succès.
 *
 * ⚠️ Google interdit l'affichage de son écran de connexion en iframe : ce
 * flux ne peut PAS être une modale intégrée, il faut une vraie fenêtre.
 *
 * L'intent d'achat est écrit ici, dans le sessionStorage de l'ONGLET
 * D'ORIGINE (et non dans la pop-up, dont le stockage est un contexte à part) :
 * c'est cet onglet qui reprendra le checkout.
 *
 * @returns true si l'authentification a réussi ; false si la fenêtre a été
 *          fermée sans aboutir. Si la pop-up est bloquée par le navigateur,
 *          on retombe sur la redirection pleine page (et la promesse ne se
 *          résout jamais, la page étant en train de partir).
 */
export function openGoogleAuthPopup(
  eventSlug: string,
  items: BuyIntentItem[],
): Promise<boolean> {
  saveIntent(eventSlug, items);

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;

  const popupUrl = new URL(`${apiBase}/api/auth/google`);
  popupUrl.searchParams.set('intent', 'buy');
  popupUrl.searchParams.set('eventSlug', eventSlug);
  popupUrl.searchParams.set('redirect', `${appUrl}/auth/popup-callback`);

  const width = 500;
  const height = 650;
  const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);

  const popup = window.open(
    popupUrl.toString(),
    'fluid-auth',
    `width=${width},height=${height},left=${left},top=${top}`,
  );

  if (!popup) {
    // Pop-up bloquée : on repasse par la redirection pleine page historique.
    // L'intent est déjà en sessionStorage, `?resume=1` le reprendra au retour.
    const fallbackUrl = new URL(`${apiBase}/api/auth/google`);
    fallbackUrl.searchParams.set('intent', 'buy');
    fallbackUrl.searchParams.set('eventSlug', eventSlug);
    fallbackUrl.searchParams.set('redirect', `${appUrl}/e/${eventSlug}?resume=1`);
    window.location.href = fallbackUrl.toString();
    return new Promise<boolean>(() => {});
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;

    function cleanup() {
      window.removeEventListener('message', onMessage);
      clearInterval(closedTimer);
    }

    function onMessage(event: MessageEvent) {
      // N'accepter que les messages de NOTRE origine : une fenêtre tierce ne
      // doit jamais pouvoir simuler une authentification réussie.
      if (event.origin !== window.location.origin) return;
      if (!isAuthPopupMessage(event.data)) return;
      settled = true;
      cleanup();
      resolve(true);
    }

    // Filet de sécurité : l'utilisateur ferme la fenêtre sans aller au bout,
    // aucun message n'arrivera jamais.
    const closedTimer = setInterval(() => {
      if (popup.closed && !settled) {
        cleanup();
        resolve(false);
      }
    }, 500);

    window.addEventListener('message', onMessage);
  });
}

/**
 * Déclenche le flux OAuth Google pour l'inscription self-service Manager
 * (CDC §14.3, décision produit 2026-07-14 — CTA "Devenir organisateur" sur
 * la page d'accueil). `intent=become_manager` n'a d'effet backend que si
 * aucun compte n'existe encore pour ce googleId (voir AuthOrchestratorService
 * .loginWithGoogle) — jamais d'escalade de privilège sur un compte existant.
 */
export function startGoogleManagerSignup(): void {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
  const params = new URLSearchParams({
    redirect: `${window.location.origin}/manager`,
    intent: 'become_manager',
  });
  window.location.href = `${apiBase}/api/auth/google?${params.toString()}`;
}
