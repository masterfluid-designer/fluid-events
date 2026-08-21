import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EventAccessModule } from '../common/event-access.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  // AuthModule exporte AuditService (event.created/event.updated).
  imports: [PrismaModule, AuthModule, EventAccessModule],
  providers: [EventsService],
  controllers: [EventsController],
  exports: [EventsService],
})
export class EventsModule {}
