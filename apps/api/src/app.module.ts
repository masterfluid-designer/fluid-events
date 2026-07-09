import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthService } from './auth/auth.service';
import { CryptoService } from './common/crypto.service';
import { AuditService } from './common/audit.service';
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
 * Assemble tous les services critiques du CDC v2.0.0. Les contrôleurs HTTP
 * (controllers) seront ajoutés dans chaque module métier au fil des phases.
 * Les Guards globaux (JwtAuthGuard, RolesGuard) seront enregistrés via APP_GUARD
 * une fois les stratégies Passport câblées.
 *
 * Sécurité transverse :
 *  - HttpExceptionFilter global → format d'erreur standardisé + anti-fuite
 *  - ResponseInterceptor global → format de succès standardisé
 */
@Module({
  imports: [
    // Chargement du .env (validé par chaque service au démarrage)
    ConfigModule.forRoot({ isGlobal: true }),
    // JWT — la durée réelle est calculée dynamiquement par AuthService
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { algorithm: 'HS256' },
    }),
    PrismaModule,
  ],
  controllers: [],
  providers: [
    // Services métier
    { provide: 'ENCRYPTION_KEY', useValue: process.env.ENCRYPTION_KEY },
    AuthService,
    CryptoService,
    AuditService,
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
