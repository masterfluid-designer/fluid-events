-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "compareAtPrice" DECIMAL(10,2),
ADD COLUMN     "dayLabel" TEXT,
ADD COLUMN     "promoEndsAt" TIMESTAMP(3);

