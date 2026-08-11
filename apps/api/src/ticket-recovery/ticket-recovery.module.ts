import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';
import { TicketRecoveryController } from './ticket-recovery.controller';
import { TicketRecoveryService } from './ticket-recovery.service';

@Module({
  // AuthModule importé directement pour AuditService (NotificationsModule ne
  // le ré-exporte pas lui-même — même pattern que EventsModule/NotificationsModule).
  imports: [PrismaModule, NotificationsModule, AuthModule],
  controllers: [TicketRecoveryController],
  providers: [TicketRecoveryService],
})
export class TicketRecoveryModule {}
