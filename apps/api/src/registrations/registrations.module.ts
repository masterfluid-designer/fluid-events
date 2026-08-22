import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { EventAccessModule } from '../common/event-access.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RegistrationsService } from './registrations.service';
import { RegistrationsController } from './registrations.controller';

/**
 * Inscriptions sans billetterie (lot 2, 2026-08-22). Module distinct de
 * `PaymentsModule` : il ne partage avec lui ni commande, ni stock, ni
 * fournisseur — seulement l'idée qu'une personne vient à un événement.
 */
@Module({
  imports: [PrismaModule, AuthModule, EventAccessModule, NotificationsModule],
  providers: [RegistrationsService],
  controllers: [RegistrationsController],
  exports: [RegistrationsService],
})
export class RegistrationsModule {}
