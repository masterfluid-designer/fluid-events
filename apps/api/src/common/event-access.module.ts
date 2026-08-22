import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EventAccessService } from './event-access.service';
import { AuditService } from './audit.service';

/**
 * Le contrôle d'appartenance est partagé par tous les modules qui manipulent
 * un événement au nom d'un manager (events, builder, tickets, scanner). Un
 * module dédié plutôt qu'un ajout à AuthModule : rien ici ne relève de
 * l'authentification, il s'agit de savoir à qui appartient quoi.
 *
 * AuditService est déclaré ICI plutôt qu'importé d'AuthModule : le faire
 * venir de là créerait un cycle (AuthModule → EventAccessModule → AuthModule)
 * dès que l’authentification aura besoin de connaître un événement.
 */
@Module({
  imports: [PrismaModule],
  providers: [EventAccessService, AuditService],
  exports: [EventAccessService],
})
export class EventAccessModule {}
