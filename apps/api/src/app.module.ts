import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { TicketsModule } from './tickets/tickets.module';
import { PaymentsModule } from './payments/payments.module';
import { ScannerModule } from './scanner/scanner.module';
import { BuilderModule } from './builder/builder.module';
import { AdminModule } from './admin/admin.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TicketDesignModule } from './ticket-design/ticket-design.module';
import { PdfQueueModule } from './pdf-queue/pdf-queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    AuthModule,
    EventsModule,
    TicketsModule,
    PaymentsModule,
    ScannerModule,
    BuilderModule,
    AdminModule,
    NotificationsModule,
    TicketDesignModule,
    PdfQueueModule,
  ],
})
export class AppModule {}
