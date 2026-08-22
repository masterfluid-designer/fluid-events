-- Pointage des inscrits a l'entree (2026-08-22)
--
-- Un horodatage plutot qu'un booleen : savoir QUAND quelqu'un est arrive sert
-- a l'organisateur, et distingue un pointage du soir meme d'une case cochee
-- trois jours plus tard. NULL = pas encore arrive.
ALTER TABLE "registrations" ADD COLUMN "checkedInAt" TIMESTAMP(3);
