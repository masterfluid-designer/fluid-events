import { NextRequest, NextResponse } from 'next/server';

/**
 * middleware.ts — Redirections UX uniquement (CDC §7.8).
 *
 * ⚠️ SÉCURITÉ : ce middleware NE protège RIEN. Il ne fait que rediriger
 * visuellement les utilisateurs non-authentifiés vers la page de login.
 * La vraie sécurité est dans NestJS (JwtAuthGuard + RolesGuard).
 *
 * Raison : Next.js edge runtime ne peut pas vérifier un JWT HS256 de façon
 * fiable (pas d'accès au secret backend). On s'appuie uniquement sur la
 * présence du cookie access_token comme signal UX.
 */
export function middleware(request: NextRequest) {
  const token = request.cookies.get('access_token');
  const { pathname } = request.nextUrl;

  const protectedPrefixes = ['/admin', '/manager', '/client', '/scanner/scan'];
  const isProtected = protectedPrefixes.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (isProtected && !token) {
    // `request.nextUrl` et non `request.url` : derrière Nginx, `request.url`
    // porte l'adresse INTERNE du conteneur (http://localhost:3000/...), qui
    // se retrouvait telle quelle dans l'URL de retour.
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/auth/login';
    loginUrl.search = '';
    // Chemin relatif, pas une URL absolue : c'est ce que le backend accepte
    // pour la redirection post-OAuth, et cela évite d'exposer un hôte.
    // Pas d'encodeURIComponent ici — `searchParams.set` encode déjà, et
    // encoder deux fois produisait `%253A`, que le backend renvoyait ensuite
    // en chemin littéral (`/https%3A%2F%2F...` → 404).
    loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/manager/:path*', '/client/:path*', '/scanner/scan'],
};
