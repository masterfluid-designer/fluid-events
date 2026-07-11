import { Module } from '@nestjs/common';
import { TicketDesignService } from './ticket-design.service';

@Module({
  providers: [TicketDesignService],
  controllers: [],
  exports: [TicketDesignService],
})
export class TicketDesignModule {}
