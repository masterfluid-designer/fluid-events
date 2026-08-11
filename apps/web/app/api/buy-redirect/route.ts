import { NextRequest, NextResponse } from 'next/server';

/**
 * Route interne de redirection d'achat (CDC §7.1).
 *
 * Reçoit ?slug=...&items=<JSON encodé> (panier `{ticketId, quantity}[]`,
 * décision produit "panier multi-billets"), sauvegarde l'intent horodaté en
 * sessionStorage via un petit script, puis redirige vers le OAuth Google du
 * backend avec eventSlug + intent=buy pour que le backend calcule le JWT
 * événementiel.
 *
 * Comme la route tourne côté serveur Next.js (pas d'accès sessionStorage),
 * on renvoie une page HTML minimale qui écrit l'intent côté navigateur puis
 * redirige. ⚠️ Le format écrit ici DOIT rester synchronisé avec `BuyIntent`
 * / `consumeIntent` (@saas-events/utils) — cette route ne peut pas importer
 * `saveIntent` directement (pas de sessionStorage côté serveur).
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug');
  const itemsRaw = request.nextUrl.searchParams.get('items');

  if (!slug || !itemsRaw) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'slug et items requis' } },
      { status: 400 },
    );
  }

  let items: { ticketId: string; quantity: number }[];
  try {
    items = JSON.parse(itemsRaw);
    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      items.some(
        (i) => typeof i?.ticketId !== 'string' || !Number.isInteger(i?.quantity) || i.quantity < 1,
      )
    ) {
      throw new Error('invalid cart');
    }
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'items invalide' } },
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

  // `slug`/`items` viennent de la query string (contrôlés par le client) —
  // toute valeur injectée dans le <script> DOIT passer par JSON.stringify
  // (échappement JS correct) PUIS par l'échappement de `<` ci-dessous (sinon
  // une séquence "</script>" dans une valeur casserait hors du bloc script).
  const toSafeJs = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

  // Petite page qui pose l'intent en sessionStorage puis redirige.
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Redirection...</title></head>
<body>
<p>Redirection en cours...</p>
<script>
  try {
    var key = ${toSafeJs(`buy_intent_${slug}`)};
    var intent = ${toSafeJs({ items })};
    intent.timestamp = Date.now();
    sessionStorage.setItem(key, JSON.stringify(intent));
  } catch (e) {}
  window.location.href = ${toSafeJs(oauthUrl.toString())};
</script>
</body></html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
