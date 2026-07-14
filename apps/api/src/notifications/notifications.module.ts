import { Module } from '@nestjs/common';
import { PhoneService } from './phone.service';
import { EmailService } from './email.service';
import { WhatsappService } from './whatsapp.service';
import { SmsService } from './sms.service';

@Module({
  providers: [PhoneService, EmailService, WhatsappService, SmsService],
  controllers: [],
  exports: [PhoneService, EmailService, WhatsappService, SmsService],
})
export class NotificationsModule {}
