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
import { CinetPayService } from './cinetpay.service';
import { FedaPayService } from './fedapay.service';
import { StripeService } from './stripe.service';
import { PayPalService } from './paypal.service';
import { PaymentsService } from './payments.service';
import { GuestCheckoutService } from './guest-checkout.service';
import { TicketAccessModule } from './ticket-access.module';
import { PaymentsController } from './payments.controller';
import { PaymentConfigController } from './payment-config.controller';
import { PaymentConfigService } from './payment-config.service';
import { OrderExpiryService } from './order-expiry.service';
import { EventAccessService } from '../common/event-access.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    NotificationsModule,
    TicketDesignModule,
    PdfQueueModule,
    TicketAccessModule,
  ],
  providers: [
    CryptoService,
    StockService,
    WebhookIdempotencyService,
    ClientProfileService,
    GuestCheckoutService,
    KkiapayService,
    CinetPayService,
    FedaPayService,
    // Stripe apporte la carte, Google Pay et Apple Pay d’un seul tenant.
    StripeService,
    PayPalService,
    PaymentsService,
    // L'encaissement se règle désormais côté organisateur (2026-08-24).
    PaymentConfigService,
    // Rend au stock les places que personne n’achètera (2026-09-02).
    OrderExpiryService,
    EventAccessService,
  ],
  controllers: [PaymentsController, PaymentConfigController],
})
export class PaymentsModule {}
