-- Inscriptions sans billetterie (lot 2, 2026-08-22)
--
-- Table dédiée plutôt qu'un billet gratuit passant par le tunnel d'achat :
-- ce dernier fabriquerait des commandes, des QR et des PDF pour rien, et
-- ferait apparaître des « ventes a 0 F » dans l'analytique de l'organisateur.
CREATE TABLE "registrations" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "extraLabel" TEXT,
    "extraValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- Une adresse ne s'inscrit qu'une fois par evenement : garde-fou principal
-- contre le remplissage automatique d'un formulaire public.
CREATE UNIQUE INDEX "registrations_eventId_email_key" ON "registrations"("eventId", "email");

CREATE INDEX "registrations_eventId_createdAt_idx" ON "registrations"("eventId", "createdAt");

ALTER TABLE "registrations" ADD CONSTRAINT "registrations_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
