import { Module } from '@nestjs/common';
import { PhoneService } from './phone.service';
import { EmailService } from './email.service';
import { WhatsappService } from './whatsapp.service';

@Module({
  providers: [PhoneService, EmailService, WhatsappService],
  controllers: [],
  exports: [PhoneService, EmailService, WhatsappService],
})
export class NotificationsModule {}
