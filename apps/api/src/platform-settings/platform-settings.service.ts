import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { sanitizeSvg } from './svg-sanitizer.util';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';

/** Ligne unique — pas de multi-tenant pour la marque de la plateforme (V1). */
const SINGLETON_ID = 'singleton';

/**
 * PlatformSettingsService — Logo/icône SVG de la plateforme (page Branding
 * Admin, 2026-07-17). Lecture publique (marketing, connexion, sidebar de
 * tous les rôles) ; écriture réservée SUPER_ADMIN (voir AdminController).
 */
@Injectable()
export class PlatformSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getSettings(): Promise<{ logoSvg: string | null; iconSvg: string | null }> {
    const settings = await this.prisma.platformSettings.findUnique({ where: { id: SINGLETON_ID } });
    return { logoSvg: settings?.logoSvg ?? null, iconSvg: settings?.iconSvg ?? null };
  }

  async updateSettings(dto: UpdatePlatformSettingsDto): Promise<{ logoSvg: string | null; iconSvg: string | null }> {
    const data: { logoSvg?: string | null; iconSvg?: string | null } = {};
    // Absent (undefined) = ne pas toucher ; null = réinitialiser ; chaîne = assainir avant stockage.
    if (dto.logoSvg !== undefined) data.logoSvg = dto.logoSvg === null ? null : sanitizeSvg(dto.logoSvg);
    if (dto.iconSvg !== undefined) data.iconSvg = dto.iconSvg === null ? null : sanitizeSvg(dto.iconSvg);

    const updated = await this.prisma.platformSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: data,
    });

    await this.audit.log('admin.platform_settings.updated', 'PlatformSettings', SINGLETON_ID, {
      logoChanged: dto.logoSvg !== undefined,
      iconChanged: dto.iconSvg !== undefined,
    });

    return { logoSvg: updated.logoSvg, iconSvg: updated.iconSvg };
  }
}
