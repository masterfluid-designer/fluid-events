import { test, expect } from '@playwright/test';
import { TEST_ACCOUNTS, loginAs } from './helpers';

/**
 * Connexion email/mot de passe — redirection par rôle (login/page.tsx).
 * SUPER_ADMIN -> /admin, MANAGER -> /manager, CLIENT -> "/" (redirectTo par défaut).
 */
test.describe('Authentification', () => {
  // Timeout généreux (au-delà du défaut waitForURL de 30s hérité du timeout
  // global) : première visite de ces routes depuis le démarrage du serveur
  // Next.js dev => compilation à la demande, peut prendre du temps.
  const NAV_TIMEOUT = 45_000;

  test('CLIENT se connecte et est redirigé vers l\'accueil', async ({ page }) => {
    await loginAs(page, TEST_ACCOUNTS.client);
    await page.waitForURL('http://localhost:3000/', { timeout: NAV_TIMEOUT });
  });

  test('MANAGER se connecte et est redirigé vers /manager', async ({ page }) => {
    await loginAs(page, TEST_ACCOUNTS.manager);
    await page.waitForURL('http://localhost:3000/manager', { timeout: NAV_TIMEOUT });
  });

  test('SUPER_ADMIN se connecte et est redirigé vers /admin', async ({ page }) => {
    await loginAs(page, TEST_ACCOUNTS.admin);
    await page.waitForURL('http://localhost:3000/admin', { timeout: NAV_TIMEOUT });
  });

  test('affiche une erreur explicite sur mot de passe invalide', async ({ page }) => {
    await loginAs(page, { email: TEST_ACCOUNTS.client.email, password: 'mot-de-passe-invalide' });
    await expect(page.getByText(/connexion échouée|invalide|incorrect/i)).toBeVisible({
      timeout: 10_000,
    });
    // Toujours sur la page de login — pas de redirection sur échec.
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
