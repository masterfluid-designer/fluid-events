import { test, expect } from '@playwright/test';
import { TEST_ACCOUNTS, SEEDED_EVENT_SLUG, loginAs } from './helpers';

/**
 * Flux "Mon ticket" (header public obligatoire, décision produit 2026-07-13) :
 * un client déjà authentifié cliquant "Mon ticket" doit voir SES commandes
 * pour CET événement uniquement (GET /api/payments/orders?eventSlug=, filtre
 * serveur — voir AI/API.md). Le flux OAuth+achat complet (bouton "Acheter")
 * n'est pas testable ici sans compte Google réel — couvert séparément dans
 * public-event-page.spec.ts (vérifie juste la construction de l'URL OAuth).
 */
test.describe('"Mon ticket" — dashboard client filtré par événement', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_ACCOUNTS.client);
    await page.waitForURL('http://localhost:3000/', { timeout: 45_000 });
  });

  test('le bouton "Mon ticket" du header public mène au dashboard filtré sur cet événement', async ({
    page,
  }) => {
    await page.goto(`/e/${SEEDED_EVENT_SLUG}`);
    await page.getByRole('link', { name: /mon ticket/i }).click();

    await page.waitForURL(new RegExp(`/client\\?event=${SEEDED_EVENT_SLUG}`), { timeout: 45_000 });
    await expect(page.getByText('Vos billets pour cet événement')).toBeVisible();
  });

  test('sans paramètre ?event=, le dashboard montre toutes les commandes du client', async ({
    page,
  }) => {
    await page.goto('/client');
    await expect(page.getByText('Vos billets pour cet événement')).not.toBeVisible();
  });
});
