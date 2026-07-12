import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { TicketDesignModule } from '../ticket-design/ticket-design.module';
import { StorageModule } from '../storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { PdfQueueService, TICKET_PDF_QUEUE } from './pdf-queue.service';
import { PdfProcessor } from './pdf.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: TICKET_PDF_QUEUE }),
    PrismaModule,
    TicketDesignModule,
    StorageModule,
    AuthModule, // exporte AuditService, réutilisé par PdfProcessor
  ],
  providers: [PdfQueueService, PdfProcessor],
  exports: [PdfQueueService],
})
export class PdfQueueModule {}
