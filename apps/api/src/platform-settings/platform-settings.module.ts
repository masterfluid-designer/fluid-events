import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PlatformSettingsService } from './platform-settings.service';
import { PlatformSettingsController } from './platform-settings.controller';

@Module({
  // AuthModule fournit + exporte AuditService (pas un provider global) —
  // requis par PlatformSettingsService pour journaliser les mises à jour.
  imports: [PrismaModule, AuthModule],
  providers: [PlatformSettingsService],
  controllers: [PlatformSettingsController],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
