-- CreateEnum
CREATE TYPE "TicketPolicy" AS ENUM ('SINGLE_DAY', 'PASS_ALL_DAYS', 'PER_DAY');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "ticketPolicy" "TicketPolicy" NOT NULL DEFAULT 'SINGLE_DAY';

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "eventDayId" TEXT;

-- CreateTable
CREATE TABLE "event_days" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "event_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_day_scans" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "eventDayId" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scannedById" TEXT,

    CONSTRAINT "ticket_day_scans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_days_eventId_date_key" ON "event_days"("eventId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_day_scans_orderItemId_eventDayId_key" ON "ticket_day_scans"("orderItemId", "eventDayId");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_eventDayId_fkey" FOREIGN KEY ("eventDayId") REFERENCES "event_days"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_days" ADD CONSTRAINT "event_days_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_day_scans" ADD CONSTRAINT "ticket_day_scans_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_day_scans" ADD CONSTRAINT "ticket_day_scans_eventDayId_fkey" FOREIGN KEY ("eventDayId") REFERENCES "event_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

