import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { TicketDesignModule } from '../ticket-design/ticket-design.module';
import { ScannerService } from './scanner.service';
import { ScannerController } from './scanner.controller';
import { ScannerAdminService } from './scanner-admin.service';
import { ScannerAdminController } from './scanner-admin.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  // NotificationsModule (2026-08-19) : l’invitation d’un agent de contrôle
  // part par email, comme celle d’un Manager.
  imports: [PrismaModule, AuthModule, TicketDesignModule, NotificationsModule],
  providers: [ScannerService, ScannerAdminService],
  controllers: [ScannerController, ScannerAdminController],
})
export class ScannerModule {}
