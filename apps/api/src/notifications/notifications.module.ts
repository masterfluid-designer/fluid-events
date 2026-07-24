import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PhoneService } from './phone.service';
import { EmailService } from './email.service';
import { WhatsappService } from './whatsapp.service';
import { SmsService } from './sms.service';

@Module({
  // AuthModule exporte AuditService (email.sent/failed, whatsapp.sent/failed
  // — voir EmailService/WhatsappService). Pas de cycle : AuthModule
  // n'importe pas NotificationsModule (il déclare ses propres PhoneService/
  // WhatsappService pour la vérification OTP, voir auth.module.ts).
  imports: [AuthModule],
  providers: [PhoneService, EmailService, WhatsappService, SmsService],
  controllers: [],
  exports: [PhoneService, EmailService, WhatsappService, SmsService],
})
export class NotificationsModule {}
