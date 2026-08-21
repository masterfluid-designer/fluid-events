-- Palier d'abonnement + multi-événement Premium (2026-08-21)
--
-- Trois changements, dans un ordre qui compte : on COPIE avant de supprimer,
-- sinon la valeur de `isPremium` serait perdue au moment du DROP.

-- 1. Le palier remplace le booléen.
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'PREMIUM');

ALTER TABLE "users" ADD COLUMN "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE';

UPDATE "users" SET "plan" = 'PREMIUM' WHERE "isPremium" = true;

ALTER TABLE "users" DROP COLUMN "isPremium";

-- 2. Un manager peut porter plusieurs événements. Retirer une contrainte
--    d'unicité ne déplace aucune donnée et n'invalide aucune ligne existante.
--    L'index simple la remplace : les recherches par manager restent aussi
--    rapides, sans interdire le deuxième événement.
DROP INDEX "events_managerId_key";

CREATE INDEX "events_managerId_idx" ON "events"("managerId");

-- 3. `maxScanners` ne limitait rien : la colonne valait 3 partout et personne
--    ne la lisait. Elle devient nullable, et NULL veut dire « suivre le palier »
--    (3 en FREE, 6 en PREMIUM).
--
--    Les valeurs restées à 3 sont remises à NULL : les garder figerait à 3 les
--    événements d'un manager qui passe Premium, alors qu'il a droit à 6. Une
--    valeur différente de 3 a forcément été posée à la main : on la conserve.
ALTER TABLE "events" ALTER COLUMN "maxScanners" DROP NOT NULL;
ALTER TABLE "events" ALTER COLUMN "maxScanners" DROP DEFAULT;

UPDATE "events" SET "maxScanners" = NULL WHERE "maxScanners" = 3;
