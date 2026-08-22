import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { TicketAccessService } from './ticket-access.service';

/**
 * Module dédié au lien de billet (2026-08-22).
 *
 * Le service est réclamé des deux côtés d'une dépendance existante :
 * `PaymentsModule` l'expose au public, et `PdfQueueModule` en a besoin pour
 * poser le lien dans l'email — or `PaymentsModule` importe déjà
 * `PdfQueueModule`. Le déclarer dans l'un ou l'autre fermerait le cercle.
 *
 * `AuthModule` fournit le JwtService, et donc le secret des sessions : ces
 * liens doivent être signés avec lui, pas avec une configuration parallèle qui
 * finirait par diverger.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  providers: [TicketAccessService],
  exports: [TicketAccessService],
})
export class TicketAccessModule {}
