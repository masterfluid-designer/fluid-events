import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
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
import { StorageModule } from './storage/storage.module';
import { RetentionModule } from './retention/retention.module';
import { PlatformSettingsModule } from './platform-settings/platform-settings.module';
import { ContactModule } from './contact/contact.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
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
 * Les modules métier gèrent leurs propres providers/services. Chacun expose
 * ses controllers HTTP (auth/events/scanner/builder/tickets/payments/
 * pdf-queue/admin/storage/contact/etc.) — voir chaque *.module.ts pour le
 * détail de ce qu'il fournit/exporte.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Cron de rétention des comptes (décision produit 2026-07-14, RetentionModule).
    ScheduleModule.forRoot(),
    // Connexion Redis partagée par toutes les queues BullMQ (CDC ADR §3 —
    // génération PDF asynchrone, hors chemin critique webhook).
    BullModule.forRoot(parseRedisUrl(process.env.REDIS_URL)),
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
    StorageModule,
    RetentionModule,
    PlatformSettingsModule,
    ContactModule,
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

/** Parse REDIS_URL ("redis://[:password@]host:port") en config `bull`/ioredis. */
function parseRedisUrl(redisUrl: string | undefined) {
  if (!redisUrl) {
    throw new Error('REDIS_URL manquant — nécessaire pour les queues BullMQ.');
  }
  const parsed = new URL(redisUrl);
  return {
    redis: {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      ...(parsed.password ? { password: parsed.password } : {}),
    },
  };
}
