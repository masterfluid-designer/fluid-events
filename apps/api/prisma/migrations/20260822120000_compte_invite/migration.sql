-- Compte invité : achat sans compte (lot 1, 2026-08-22)
--
-- `Order.clientId` est obligatoire, et le scan, l'export, la rétention et les
-- remboursements en dépendent. Plutôt que de rendre la colonne nullable et
-- d'écrire un `if (client === null)` dans chacun de ces chemins — dont un
-- oublié suffit à produire une commande orpheline — le compte existe bel et
-- bien, mais le visiteur ne le voit jamais.
--
-- Défaut `false` : tous les comptes actuels sont de vrais comptes.
ALTER TABLE "users" ADD COLUMN "isGuest" BOOLEAN NOT NULL DEFAULT false;
