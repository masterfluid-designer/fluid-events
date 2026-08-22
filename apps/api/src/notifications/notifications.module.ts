import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CryptoService } from '../common/crypto.service';
import { PhoneService } from './phone.service';
import { EmailService } from './email.service';
import { WhatsappService } from './whatsapp.service';

@Module({
  // AuthModule exporte AuditService (email.sent/failed, whatsapp.sent/failed
  // — voir EmailService/WhatsappService). Pas de cycle : AuthModule
  // n'importe pas NotificationsModule (il déclare ses propres PhoneService/
  // WhatsappService pour la vérification OTP, voir auth.module.ts).
  // PrismaModule + CryptoService (2026-08-19) : WhatsappService lit ses
  // réglages en base, où le jeton est stocké chiffré.
  imports: [AuthModule, PrismaModule],
  providers: [PhoneService, EmailService, WhatsappService, CryptoService],
  controllers: [],
  exports: [PhoneService, EmailService, WhatsappService],
})
export class NotificationsModule {}
