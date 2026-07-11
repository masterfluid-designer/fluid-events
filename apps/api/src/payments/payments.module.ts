import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CryptoService } from '../common/crypto.service';
import { StockService } from './stock.service';
import { WebhookIdempotencyService } from './webhook-idempotency.service';
import { ClientProfileService } from './client-profile.service';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  providers: [
    CryptoService,
    StockService,
    WebhookIdempotencyService,
    ClientProfileService,
  ],
  controllers: [],
})
export class PaymentsModule {}
