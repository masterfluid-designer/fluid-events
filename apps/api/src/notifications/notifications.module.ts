import { Module } from '@nestjs/common';
import { PhoneService } from './phone.service';

@Module({
  providers: [PhoneService],
  controllers: [],
  exports: [PhoneService],
})
export class NotificationsModule {}
