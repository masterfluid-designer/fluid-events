-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "whatsappAccessToken" TEXT,
ADD COLUMN     "whatsappPhoneNumberId" TEXT,
ADD COLUMN     "whatsappApiVersion" TEXT,
ADD COLUMN     "whatsappTicketTemplate" TEXT,
ADD COLUMN     "whatsappTicketLang" TEXT,
ADD COLUMN     "whatsappVerifyTemplate" TEXT,
ADD COLUMN     "whatsappVerifyLang" TEXT;
