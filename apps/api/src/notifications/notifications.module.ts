import { Module } from '@nestjs/common';
import { PhoneService } from './phone.service';
import { EmailService } from './email.service';

@Module({
  providers: [PhoneService, EmailService],
  controllers: [],
  exports: [PhoneService, EmailService],
})
export class NotificationsModule {}
