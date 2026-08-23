-- Recuperation de mot de passe (2026-08-23)
--
-- Il n'en existait AUCUNE. Un manager ou un agent de controle qui oubliait son
-- mot de passe etait dehors definitivement : `set-password` exige un jeton
-- d'invitation, et aucune route ne savait en regenerer un -- `POST
-- /admin/managers` refuse une adresse deja connue. La seule sortie etait que
-- l'Admin supprime le compte et le recree, ce qui emportait ses evenements,
-- ses billets vendus et ses inscrits.
--
-- Le jeton est stocke HACHE, contrairement a `inviteToken` qui l'est en clair.
-- Une copie de la base suffirait sinon a prendre la main sur n'importe quel
-- compte : un jeton de reinitialisation vaut un mot de passe, il se range
-- comme un mot de passe. Le jeton remis a l'utilisateur porte l'identifiant du
-- compte en prefixe, ce qui permet de retrouver la ligne sans avoir a chercher
-- par le hachage.
ALTER TABLE "users" ADD COLUMN "passwordResetTokenHash" TEXT;

-- Duree de vie courte (une heure). Sert AUSSI a limiter la cadence des
-- demandes : tant qu'un jeton recent existe, on n'en emet pas un second.
ALTER TABLE "users" ADD COLUMN "passwordResetTokenExpiresAt" TIMESTAMP(3);

-- Horodatage de la demande, distinct de l'expiration : c'est lui qui permet de
-- refuser une rafale de demandes sans avoir a deduire la date d'emission de la
-- date d'expiration -- deduction qui deviendrait fausse le jour ou la duree de
-- vie changerait.
ALTER TABLE "users" ADD COLUMN "passwordResetRequestedAt" TIMESTAMP(3);
