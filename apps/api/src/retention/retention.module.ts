import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditService } from '../common/audit.service';
import { RetentionService } from './retention.service';

/** RetentionModule — Cron de rétention/suppression automatique des comptes (décision produit 2026-07-14). */
@Module({
  imports: [PrismaModule],
  providers: [RetentionService, AuditService],
  exports: [RetentionService],
})
export class RetentionModule {}
