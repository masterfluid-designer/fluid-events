-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "features" TEXT[] DEFAULT ARRAY[]::TEXT[];
