-- Régime d'accès d'un événement (plan 2026-08-21)
--
-- Trois façons d'ouvrir sa porte : inscription simple, billetterie sans
-- compte, billetterie avec compte.
--
-- Le défaut est TICKETED_ACCOUNT, le comportement historique : aucun
-- événement existant ne change à la migration. C'est la contrainte qui prime
-- sur toutes les autres — la production vend des billets pendant ce chantier.
CREATE TYPE "EventAccessMode" AS ENUM ('RSVP', 'TICKETED_GUEST', 'TICKETED_ACCOUNT');

ALTER TABLE "events"
  ADD COLUMN "accessMode" "EventAccessMode" NOT NULL DEFAULT 'TICKETED_ACCOUNT';
