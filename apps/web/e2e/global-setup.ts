import { execSync } from 'node:child_process';

/**
 * Reseed la base avant la suite E2E (comptes de test stables — voir
 * helpers.ts) pour un état prévisible, indépendant de ce que les tests
 * précédents (manuels ou automatisés) ont pu laisser en base. Nécessite
 * Docker Postgres déjà démarré (voir playwright.config.ts).
 *
 * `prisma db seed` (apps/api/prisma/seed.ts) n'écrit jamais dans EventPage
 * (upsert-only, jamais de deleteMany) — une page Builder sauvegardée pendant
 * une session de dev/test manuelle antérieure persiste donc telle quelle
 * entre deux reseeds. Sans ce nettoyage, la page publique de l'événement
 * seedé rendrait les blocs Builder résiduels au lieu du template statique
 * de repli, cassant les tests qui supposent ce dernier (public-event-page.spec.ts).
 */
export default function globalSetup() {
  execSync('pnpm --filter @saas-events/api exec prisma db seed', {
    cwd: '../..',
    stdio: 'inherit',
  });

  execSync('pnpm --filter @saas-events/api exec node prisma/e2e-reset-event-pages.js', {
    cwd: '../..',
    stdio: 'inherit',
  });
}
