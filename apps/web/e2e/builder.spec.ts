import { test, expect } from '@playwright/test';
import { TEST_ACCOUNTS, loginAs } from './helpers';

/**
 * Event Builder manager (`/manager/builder`) — CDC §11.
 * Vérifie le chargement des vrais endpoints (GET /api/builder/mine) et
 * l'ajout d'un bloc depuis la bibliothèque (pas de test de sauvegarde
 * persistée ici, pour ne pas modifier l'état de l'événement seedé partagé
 * par les autres specs — voir public-event-page.spec.ts).
 */
test.describe('Builder manager', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_ACCOUNTS.manager);
    await page.waitForURL('http://localhost:3000/manager', { timeout: 45_000 });
  });

  test('charge la bibliothèque de blocs et le canvas', async ({ page }) => {
    await page.goto('/manager/builder');

    await expect(page.getByText('Builder').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /hero.*couverture/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Billets' })).toBeVisible();
  });

  test('ajouter un bloc Texte depuis la bibliothèque le place dans le canvas', async ({ page }) => {
    await page.goto('/manager/builder');
    await expect(page.getByRole('button', { name: /hero.*couverture/i })).toBeVisible();

    const blocksBefore = await page.locator('[class*="outline-2"]').count();
    await page.getByRole('button', { name: 'Texte', exact: true }).click();
    const blocksAfter = await page.locator('[class*="outline-2"]').count();

    expect(blocksAfter).toBeGreaterThan(blocksBefore);
    // Le panneau de propriétés doit refléter la sélection automatique du bloc ajouté.
    await expect(page.getByText('Propriétés — Texte')).toBeVisible();
  });

  test("un client authentifié ne voit pas le contenu du Builder (RBAC appliqué côté NestJS, pas le middleware Next.js — voir middleware.ts)", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await loginAs(page, TEST_ACCOUNTS.client);
    await page.waitForURL('http://localhost:3000/', { timeout: 45_000 });

    await page.goto('/manager/builder');
    // GET /api/builder/mine (RolesGuard, Manager uniquement) renvoie 403 pour
    // un CLIENT — la page affiche son état d'erreur, jamais la bibliothèque
    // de blocs (le middleware Next.js ne vérifie que la présence du cookie,
    // pas le rôle — la vraie garde est le RolesGuard backend).
    await expect(page.getByText(/impossible de charger/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Billets' })).not.toBeVisible();
  });
});
