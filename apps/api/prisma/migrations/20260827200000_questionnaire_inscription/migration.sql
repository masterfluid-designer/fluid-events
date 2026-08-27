-- Questionnaire d'inscription composable (2026-08-27)
--
-- Le regime « inscription simple » n'offrait qu'UN champ libre, nomme par
-- l'organisateur. Une ONG qui veut savoir la tranche d'age, la commune et la
-- disponibilite de ses participants n'avait aucun moyen de le demander.
--
-- La definition vit dans une table a part plutot que dans des colonnes sur
-- `events` : c'est un objet avec sa propre vie -- on l'active, on le desactive,
-- on le remanie entre deux editions -- et le garder separe laisse `events`
-- lisible. Une ligne au plus par evenement.
CREATE TABLE "registration_forms" (
  "id"          TEXT NOT NULL,
  "eventId"     TEXT NOT NULL,
  "isActive"    BOOLEAN NOT NULL DEFAULT false,
  "title"       TEXT,
  "description" TEXT,
  -- Les champs en JSON : leur NOMBRE et leur TYPE changent a chaque
  -- questionnaire. Une table `form_fields` relationnelle imposerait une
  -- jointure et un ordre a maintenir pour ne rien gagner -- personne ne
  -- requete jamais un champ isolement, on lit toujours le formulaire entier.
  "fields"      JSONB NOT NULL DEFAULT '[]',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "registration_forms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "registration_forms_eventId_key" ON "registration_forms"("eventId");

ALTER TABLE "registration_forms"
  ADD CONSTRAINT "registration_forms_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Les reponses, portees par l'inscrit.
--
-- Chaque reponse embarque le LIBELLE et le TYPE de sa question, figes au
-- moment ou elle est donnee -- meme raison que `extraLabel` : reformuler une
-- question ne doit pas reecrire le sens des reponses deja recueillies. Un
-- sondage dont les questions changent apres coup ne vaut rien.
ALTER TABLE "registrations" ADD COLUMN "answers" JSONB;
