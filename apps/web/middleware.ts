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
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', encodeURIComponent(request.url));
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/manager/:path*', '/client/:path*', '/scanner/scan'],
};
