import type { Page } from '@playwright/test';

/**
 * Comptes de test seedés (`apps/api/prisma/seed.ts`) — stables entre reseeds.
 */
export const TEST_ACCOUNTS = {
  client: { email: 'client1@fluid-events.test', password: 'client123' },
  manager: { email: 'manager1@fluid-events.test', password: 'manager123' },
  admin: { email: 'admin1@fluid-events.test', password: 'admin123' },
} as const;

export const SEEDED_EVENT_SLUG = 'concert-festa-2026';

/** Connexion via le formulaire email/mot de passe (pas Google OAuth). */
export async function loginAs(page: Page, account: { email: string; password: string }) {
  await page.goto('/auth/login');
  await page.getByPlaceholder('Email').fill(account.email);
  await page.getByPlaceholder('Mot de passe').fill(account.password);
  await page.getByRole('button', { name: 'se connecter' }).click();
}
