import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PlatformSettingsService } from './platform-settings.service';

/**
 * GET /api/platform-settings — lecture publique (marketing, connexion,
 * sidebar de tous les rôles ont besoin du logo/icône sans authentification).
 * L'écriture (Super Admin) vit sous /api/admin/platform-settings, voir
 * AdminController — même convention que le reste de la surface admin.
 */
@Controller('platform-settings')
export class PlatformSettingsController {
  constructor(private readonly platformSettingsService: PlatformSettingsService) {}

  @Public()
  @Get()
  async getSettings() {
    return this.platformSettingsService.getSettings();
  }
}
