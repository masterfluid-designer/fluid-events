import { NextRequest, NextResponse } from 'next/server';
import { saveIntent } from '@saas-events/utils';

/**
 * Route interne de redirection d'achat (CDC §7.1).
 *
 * Reçoit ?slug=...&ticketId=..., sauvegarde l'intent horodaté en sessionStorage
 * via un petit script, puis redirige vers le OAuth Google du backend avec
 * eventSlug + intent=buy pour que le backend calcule le JWT événementiel.
 *
 * Comme la route tourne côté serveur Next.js (pas d'accès sessionStorage),
 * on renvoie une page HTML minimale qui exécute saveIntent côté navigateur
 * puis redirige.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug');
  const ticketId = request.nextUrl.searchParams.get('ticketId');

  if (!slug || !ticketId) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'slug et ticketId requis' } },
      { status: 400 },
    );
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
  const oauthUrl = new URL(`${apiBase}/api/auth/google`);
  oauthUrl.searchParams.set('intent', 'buy');
  oauthUrl.searchParams.set('eventSlug', slug);
  oauthUrl.searchParams.set(
    'redirect',
    `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/e/${slug}?resume=1`,
  );

  // Petite page qui pose l'intent en sessionStorage puis redirige.
  // saveIntent est importé côté client pour respecter le CDC §7.4.
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Redirection...</title></head>
<body>
<p>Redirection en cours...</p>
<script>
  try {
    sessionStorage.setItem('buy_intent_${slug}', JSON.stringify({
      ticketId: '${ticketId}',
      timestamp: Date.now()
    }));
  } catch (e) {}
  window.location.href = '${oauthUrl.toString()}';
</script>
</body></html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
