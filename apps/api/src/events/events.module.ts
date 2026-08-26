import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { PaymentConfigService } from '../payments/payment-config.service';
import { CryptoService } from '../common/crypto.service';
import { EventsController } from './events.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EventAccessModule } from '../common/event-access.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  // AuthModule exporte AuditService (event.created/event.updated).
  imports: [PrismaModule, AuthModule, EventAccessModule],
  providers: [
    EventsService,
    /*
     * Déclarés ici plutôt qu'importés de PaymentsModule (2026-08-24) :
     * celui-ci embarque la file PDF et ses dépendances Redis, dont la
     * création d'un événement n'a que faire. Ces deux services sont sans
     * état, une seconde instance ne coûte rien.
     */
    PaymentConfigService,
    CryptoService,
  ],
  controllers: [EventsController],
  exports: [EventsService],
})
export class EventsModule {}
