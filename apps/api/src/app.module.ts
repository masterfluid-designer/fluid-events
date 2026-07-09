import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { ScannerModule } from './scanner/scanner.module';
import { BuilderModule } from './builder/builder.module';
import { TicketsModule } from './tickets/tickets.module';
import { PaymentsModule } from './payments/payments.module';
import { PdfQueueModule } from './pdf-queue/pdf-queue.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { TicketDesignModule } from './ticket-design/ticket-design.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { HttpExceptionFilter } from './common/filters/http-exception-filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

/**
 * AppModule — Racine de l'application NestJS (CDC v4.0.0).
 *
 * Assemble tous les modules métier. La sécurité est portée par :
 *  - JwtAuthGuard  → appliqué globalement, bypass via @Public()
 *  - RolesGuard    → appliqué globalement, bypass via pas de @Roles()
 *  - HttpExceptionFilter  → format d'erreur standardisé (CDC §6.12)
 *  - ResponseInterceptor  → format de succès { success: true, data }
 *
 * Les modules métier gèrent leurs propres providers/services.
 * Aucune logique métier n'est importée directement dans AppModule.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    EventsModule,
    ScannerModule,
    BuilderModule,
    TicketsModule,
    PaymentsModule,
    PdfQueueModule,
    NotificationsModule,
    AdminModule,
    TicketDesignModule,
  ],
  providers: [
    // Sécurité transverse globale
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
