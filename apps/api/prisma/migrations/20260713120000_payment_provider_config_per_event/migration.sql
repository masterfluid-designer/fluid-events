-- PaymentProviderConfig devient une config PAR ÉVÉNEMENT (décision produit
-- 2026-07-13, supersède BUSINESS.md §6 "un seul compte Kkiapay global").
-- Chaque événement peut avoir sa propre config par fournisseur ; au plus une
-- ligne isActive=true par événement (contrainte applicative, pas ici).

-- Step 1: add eventId as nullable first (table has existing rows)
ALTER TABLE "payment_provider_configs" ADD COLUMN "eventId" TEXT;
ALTER TABLE "payment_provider_configs" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Step 2: backfill existing global config rows onto the seeded demo event
-- (dev-only data — no production rows exist yet for this platform).
UPDATE "payment_provider_configs"
SET "eventId" = (SELECT "id" FROM "events" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "eventId" IS NULL;

-- Step 3: drop rows that couldn't be backfilled (no event exists at all) —
-- defensive, should never fire outside an empty fresh DB.
DELETE FROM "payment_provider_configs" WHERE "eventId" IS NULL;

-- Step 4: make eventId required + FK + drop the old global unique/isDefault
ALTER TABLE "payment_provider_configs" ALTER COLUMN "eventId" SET NOT NULL;

DROP INDEX "payment_provider_configs_provider_key";

ALTER TABLE "payment_provider_configs" DROP COLUMN "isDefault";

ALTER TABLE "payment_provider_configs"
  ADD CONSTRAINT "payment_provider_configs_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "payment_provider_configs_eventId_provider_key"
  ON "payment_provider_configs"("eventId", "provider");
