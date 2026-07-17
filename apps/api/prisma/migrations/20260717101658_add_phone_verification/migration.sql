-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phoneVerificationCode" TEXT,
ADD COLUMN     "phoneVerificationCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);
