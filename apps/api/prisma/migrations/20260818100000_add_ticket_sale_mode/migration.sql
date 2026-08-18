-- CreateEnum
CREATE TYPE "TicketSaleMode" AS ENUM ('ONLINE', 'ON_REQUEST');
-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "requestBadge" TEXT,
ADD COLUMN     "saleMode" "TicketSaleMode" NOT NULL DEFAULT 'ONLINE';
