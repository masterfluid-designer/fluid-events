import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E (CDC Phase 5 — décision produit 2026-07-14).
 *
 * Prérequis non orchestrés ici (mêmes hypothèses que tout le développement
 * de ce projet) : Docker infra déjà démarrée (`pnpm docker:dev` ou
 * conteneurs individuels — Postgres/Redis/MinIO/Mailpit) et base seedée
 * (`pnpm db:seed`, comptes de test `client1@fluid-events.test` etc.).
 * `webServer` démarre l'API et le web s'ils ne tournent pas déjà
 * (`reuseExistingServer` en local), mais ne gère pas Docker lui-même —
 * ce n'est pas un environnement CI isolé, voir ROADMAP.md Phase 5.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false, // partage la même base seedée entre tests — évite les conflits d'état
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  // Next.js dev compile chaque route à la demande, au premier accès — une
  // route jamais visitée depuis le démarrage du serveur peut prendre bien
  // plus de quelques secondes à compiler avant de répondre. 60s (au lieu du
  // défaut 30s) évite les faux échecs purement liés à ce délai de compilation.
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @saas-events/api dev',
      cwd: '../..',
      url: 'http://localhost:4000/api/events/public/concert-festa-2026',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
