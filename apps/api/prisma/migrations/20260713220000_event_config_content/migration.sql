-- AlterTable
ALTER TABLE "events" ADD COLUMN     "faqs" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "galleryImages" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "schedule" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "speakers" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "sponsorImages" JSONB NOT NULL DEFAULT '[]';
