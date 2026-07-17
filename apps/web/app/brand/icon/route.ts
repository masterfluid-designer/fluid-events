import { API_URL } from '@/lib/api';

/**
 * GET /brand/icon — favicon dynamique servant l'icône SVG configurée par le
 * Super Admin (page /admin/branding, 2026-07-17). Référencé explicitement via
 * `metadata.icons` (app/layout.tsx) — coexiste avec le favicon.ico statique
 * (repli automatique pour les navigateurs ne supportant pas les favicons SVG).
 * Contenu déjà assaini côté API à l'écriture (jamais de SVG brut ici).
 */
const FALLBACK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2Z" fill="#c1622d" stroke="none"/></svg>`;

export const revalidate = 300; // 5 min — évite de solliciter l'API à chaque requête de favicon

export async function GET() {
  let iconSvg: string | null = null;

  try {
    const res = await fetch(`${API_URL}/api/platform-settings`, { next: { revalidate } });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.success) {
      iconSvg = body.data?.iconSvg ?? null;
    }
  } catch {
    // API indisponible — on sert le repli plutôt qu'un favicon cassé
  }

  return new Response(iconSvg ?? FALLBACK_ICON, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}
