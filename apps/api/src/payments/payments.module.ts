import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TicketDesignModule } from '../ticket-design/ticket-design.module';
import { PdfQueueModule } from '../pdf-queue/pdf-queue.module';
import { CryptoService } from '../common/crypto.service';
import { StockService } from './stock.service';
import { WebhookIdempotencyService } from './webhook-idempotency.service';
import { ClientProfileService } from './client-profile.service';
import { KkiapayService } from './kkiapay.service';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule, TicketDesignModule, PdfQueueModule],
  providers: [
    CryptoService,
    StockService,
    WebhookIdempotencyService,
    ClientProfileService,
    KkiapayService,
    PaymentsService,
  ],
  controllers: [PaymentsController],
})
export class PaymentsModule {}
