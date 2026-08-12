import { test, expect } from '@playwright/test';
import { SEEDED_EVENT_SLUG } from './helpers';

/**
 * Page événement publique (`/e/[slug]`) — SSR, sans authentification.
 * Header obligatoire (logo/titre + "Mon ticket") toujours présent, que la
 * page utilise le rendu Builder (blocs) ou le template statique de repli.
 */
test.describe('Page événement publique', () => {
  test('affiche le header obligatoire et le bouton "Mon ticket"', async ({ page }) => {
    await page.goto(`/e/${SEEDED_EVENT_SLUG}`);

    const header = page.locator('header');
    await expect(header).toBeVisible();
    await expect(header.getByRole('link', { name: /mon ticket/i })).toHaveAttribute(
      'href',
      `/client?event=${SEEDED_EVENT_SLUG}`,
    );
  });

  test('liste au moins un billet avec un prix et un sélecteur de quantité (ou "Indisponible")', async ({ page }) => {
    await page.goto(`/e/${SEEDED_EVENT_SLUG}`);

    // Le stepper "Ajouter un billet ..." (billet disponible) OU "Indisponible"
    // (épuisé/non publié) — au moins un des deux doit exister si des billets
    // sont configurés (panier multi-billets, plus de lien "Acheter" unitaire).
    const addButtons = page.getByRole('button', { name: /Ajouter un billet/i });
    const soldOutBadges = page.getByText('Indisponible');
    const total = (await addButtons.count()) + (await soldOutBadges.count());
    expect(total).toBeGreaterThan(0);
  });

  test('un événement inexistant renvoie une 404', async ({ page }) => {
    const response = await page.goto('/e/evenement-qui-nexiste-pas-du-tout');
    expect(response?.status()).toBe(404);
  });

  test('sélectionner un billet puis "Continuer" ouvre le OAuth Google en pop-up avec le bon intent (jamais un paiement direct sans auth)', async ({
    page,
  }) => {
    await page.goto(`/e/${SEEDED_EVENT_SLUG}`);
    const addButton = page.getByRole('button', { name: /Ajouter un billet/i }).first();
    if ((await addButton.count()) === 0) {
      test.skip(true, 'Aucun billet disponible dans les données seedées actuelles');
    }

    await addButton.click();
    const continueButton = page.getByRole('button', { name: 'Continuer' });
    await expect(continueButton).toBeVisible();

    // La connexion se fait maintenant dans une FENÊTRE POP-UP (l'onglet
    // d'origine, et donc le panier, ne bougent plus) — c'est donc `popup`
    // qu'il faut attendre, pas une navigation de `page`. On ne pilote jamais
    // l'écran Google lui-même (pas de compte OAuth réel en E2E) : on valide
    // seulement que l'URL ouverte est bien celle de l'authentification, donc
    // qu'aucun paiement n'est atteignable sans passer par là.
    const [popup] = await Promise.all([page.waitForEvent('popup'), continueButton.click()]);
    const url = new URL(popup.url());
    expect(url.pathname).toContain('/api/auth/google');
    await popup.close();
    expect(url.searchParams.get('intent')).toBe('buy');
    expect(url.searchParams.get('eventSlug')).toBe(SEEDED_EVENT_SLUG);
  });
});
