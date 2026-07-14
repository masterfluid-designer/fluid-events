import { Response } from 'express';

const COOKIE_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
};

/** Pose les cookies httpOnly access + refresh token (login normal). */
export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken?: string },
): void {
  res.cookie('access_token', tokens.accessToken, { ...COOKIE_BASE, path: '/' });
  if (tokens.refreshToken) {
    res.cookie('refresh_token', tokens.refreshToken, { ...COOKIE_BASE, path: '/api/auth' });
  }
}

/**
 * Pose le cookie access_token d'une session impersonée (Admin → Manager, CDC
 * §14.3) SANS refresh_token : un refresh sur une session impersonée pourrait
 * silencieusement réémettre un token Manager après un retour à l'Admin
 * (`stop-impersonation`) si l'ancien refresh_token traînait encore — on efface
 * donc explicitement le refresh_token existant plutôt que d'en poser un nouveau.
 */
export function setImpersonatedAccessCookie(res: Response, accessToken: string): void {
  res.cookie('access_token', accessToken, { ...COOKIE_BASE, path: '/' });
  res.clearCookie('refresh_token', { path: '/api/auth' });
}

/** Pose le cookie contenant le token Admin d'origine, le temps de l'impersonation. */
export function setImpersonatorCookie(res: Response, adminAccessToken: string): void {
  res.cookie('impersonator_token', adminAccessToken, { ...COOKIE_BASE, path: '/' });
}

export function clearImpersonatorCookie(res: Response): void {
  res.clearCookie('impersonator_token', { path: '/' });
}
