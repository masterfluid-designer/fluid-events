import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TicketDesignModule } from '../ticket-design/ticket-design.module';
import { ScannerService } from './scanner.service';
import { ScannerController } from './scanner.controller';

@Module({
  imports: [PrismaModule, TicketDesignModule],
  providers: [ScannerService],
  controllers: [ScannerController],
})
export class ScannerModule {}
