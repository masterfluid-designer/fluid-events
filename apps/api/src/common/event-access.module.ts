import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EventAccessService } from './event-access.service';

/**
 * Le contrôle d'appartenance est partagé par tous les modules qui manipulent
 * un événement au nom d'un manager (events, builder, tickets, scanner). Un
 * module dédié plutôt qu'un ajout à AuthModule : rien ici ne relève de
 * l'authentification, il s'agit de savoir à qui appartient quoi.
 */
@Module({
  imports: [PrismaModule],
  providers: [EventAccessService],
  exports: [EventAccessService],
})
export class EventAccessModule {}
