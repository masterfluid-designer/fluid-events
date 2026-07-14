// Utilisé uniquement par apps/web/e2e/global-setup.ts (voir ce fichier pour
// le pourquoi) — pas un script de seed, ne pas ajouter à `prisma db seed`.
//
// Supprime UNIQUEMENT l'EventPage de l'événement seedé utilisé par les tests
// E2E (SEEDED_EVENT_SLUG, apps/web/e2e/helpers.ts) — jamais un deleteMany({})
// sans filtre, qui effacerait les pages Builder de tous les événements.
const { PrismaClient } = require('@prisma/client');

const SEEDED_EVENT_SLUG = 'concert-festa-2026';

const prisma = new PrismaClient();

prisma.eventPage
  .deleteMany({ where: { event: { slug: SEEDED_EVENT_SLUG } } })
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
