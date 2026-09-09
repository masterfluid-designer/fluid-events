-- Rattrapage : la valeur JSON `null` remise en SQL NULL (2026-09-09).
--
-- Le service d'inscription écrivait `Prisma.JsonNull` pour « pas de réponse ».
-- Ce n'est pas l'absence de valeur : c'est la valeur JSON `null`, stockée
-- comme telle. Conséquence, `answers IS NOT NULL` était vrai pour TOUTES les
-- inscriptions, y compris celles qui n'avaient jamais rien répondu — et tout
-- compteur, tout export, tout filtre bâti là-dessus donnait un chiffre faux.
--
-- Le code écrit désormais `Prisma.DbNull`. Cette migration répare les lignes
-- déjà écrites. Elle ne touche QUE le `null` JSON : un tableau vide `[]` ou un
-- objet `{}` sont des réponses délibérées et restent intacts.

UPDATE "registrations"
SET "answers" = NULL
WHERE "answers" = 'null'::jsonb;

-- Même piège, mêmes colonnes : les options de fournisseur de paiement.
UPDATE "payment_provider_configs"
SET "config" = NULL
WHERE "config" = 'null'::jsonb;
