import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { CryptoService } from './common/crypto.service';
import { PhoneService } from './notifications/phone.service';
import { StockService } from './payments/stock.service';
import { WebhookIdempotencyService } from './payments/webhook-idempotency.service';
import { ClientProfileService } from './payments/client-profile.service';
import { TicketDesignService } from './ticket-design/ticket-design.service';
import { HttpExceptionFilter } from './common/filters/http-exception-filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

/**
 * AppModule — Racine de l'application NestJS.
 *
 * Assemble tous les modules métier du CDC v2.0.0. AuthModule et EventsModule
 * exposent déjà leurs controllers HTTP ; les autres domaines (payments,
 * tickets, scanner, builder, ticket-design, admin, notifications) n'ont pour
 * l'instant que leur logique métier ici en providers bruts — leurs modules
 * dédiés restent des coquilles vides tant que leurs controllers ne sont pas
 * écrits (prochaine étape).
 *
 * Sécurité transverse :
 *  - HttpExceptionFilter global → format d'erreur standardisé + anti-fuite
 *  - ResponseInterceptor global → format de succès standardisé
 *
 * ⚠️ Pas encore de Guard global (JwtAuthGuard) : les routes ne sont protégées
 * que si elles utilisent explicitement @UseGuards(JwtAuthGuard). Le décorateur
 * @Public() n'a donc pas encore d'effet réel — à câbler avec le Guard global
 * une fois toutes les routes protégées auditées.
 */
@Module({
  imports: [
    // Chargement du .env (validé par chaque service au démarrage)
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    EventsModule,
  ],
  controllers: [],
  providers: [
    // Services métier pas encore exposés via un module/controller dédié
    CryptoService,
    PhoneService,
    StockService,
    WebhookIdempotencyService,
    ClientProfileService,
    TicketDesignService,
    // Transverse : filtre d'exception + intercepteur de réponse (CDC §6.12)
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
