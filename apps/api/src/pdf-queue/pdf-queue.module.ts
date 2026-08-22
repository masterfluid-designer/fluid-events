import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { TicketDesignModule } from '../ticket-design/ticket-design.module';
import { StorageModule } from '../storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PdfQueueService, TICKET_PDF_QUEUE } from './pdf-queue.service';
import { PdfProcessor } from './pdf.processor';
import { TicketAccessModule } from '../payments/ticket-access.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: TICKET_PDF_QUEUE }),
    PrismaModule,
    TicketDesignModule,
    StorageModule,
    AuthModule, // exporte AuditService, réutilisé par PdfProcessor
    NotificationsModule, // exporte EmailService — email "billets prêts"
    // Le lien signé posé dans cet email. Module dédié : PaymentsModule importe
    // déjà PdfQueueModule, l’y déclarer fermerait le cercle.
    TicketAccessModule,
  ],
  providers: [PdfQueueService, PdfProcessor],
  exports: [PdfQueueService],
})
export class PdfQueueModule {}
