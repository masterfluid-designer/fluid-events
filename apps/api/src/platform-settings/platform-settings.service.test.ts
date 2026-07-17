/**
 * Tests unitaires — PlatformSettingsService
 * Logo/icône SVG de la plateforme (page Branding Admin, 2026-07-17).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { PlatformSettingsService } from './platform-settings.service';

const SIMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="5"/></svg>';

function makePrisma() {
  return {
    platformSettings: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: 'singleton', logoSvg: null, iconSvg: null }),
    },
  };
}

function makeAudit() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

describe('PlatformSettingsService — getSettings()', () => {
  it('retourne logoSvg/iconSvg à null si aucune ligne en base', async () => {
    const prisma = makePrisma();
    const service = new PlatformSettingsService(prisma as any, makeAudit() as any);

    const result = await service.getSettings();
    expect(result).toEqual({ logoSvg: null, iconSvg: null });
  });

  it('retourne les valeurs stockées si la ligne existe', async () => {
    const prisma = makePrisma();
    prisma.platformSettings.findUnique.mockResolvedValue({ id: 'singleton', logoSvg: SIMPLE_SVG, iconSvg: null });
    const service = new PlatformSettingsService(prisma as any, makeAudit() as any);

    const result = await service.getSettings();
    expect(result.logoSvg).toBe(SIMPLE_SVG);
    expect(result.iconSvg).toBeNull();
  });
});

describe('PlatformSettingsService — updateSettings()', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let audit: ReturnType<typeof makeAudit>;
  let service: PlatformSettingsService;

  beforeEach(() => {
    prisma = makePrisma();
    audit = makeAudit();
    service = new PlatformSettingsService(prisma as any, audit as any);
  });

  it('assainit et enregistre un nouveau logo', async () => {
    await service.updateSettings({ logoSvg: SIMPLE_SVG });

    expect(prisma.platformSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'singleton' },
        update: expect.objectContaining({ logoSvg: expect.stringContaining('<svg') }),
      }),
    );
  });

  it('assainit un SVG contenant un <script> avant de le persister (jamais tel quel)', async () => {
    await service.updateSettings({ logoSvg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle cx="5" cy="5" r="5"/></svg>' });

    const call = prisma.platformSettings.upsert.mock.calls[0][0];
    expect(call.update.logoSvg).not.toContain('script');
    expect(call.update.logoSvg).toContain('<circle');
  });

  it('rejette un contenu sans racine <svg> exploitable (propage BadRequestException, ne persiste rien)', async () => {
    await expect(service.updateSettings({ logoSvg: 'pas du tout un svg' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.platformSettings.upsert).not.toHaveBeenCalled();
  });

  it('réinitialise le logo quand logoSvg=null explicite', async () => {
    await service.updateSettings({ logoSvg: null });

    expect(prisma.platformSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { logoSvg: null } }),
    );
  });

  it('ne touche pas iconSvg quand seul logoSvg est fourni (absent du DTO)', async () => {
    await service.updateSettings({ logoSvg: SIMPLE_SVG });

    const call = prisma.platformSettings.upsert.mock.calls[0][0];
    expect(call.update).not.toHaveProperty('iconSvg');
  });

  it('journalise une entrée d\'audit à chaque mise à jour', async () => {
    await service.updateSettings({ iconSvg: SIMPLE_SVG });

    expect(audit.log).toHaveBeenCalledWith(
      'admin.platform_settings.updated',
      'PlatformSettings',
      'singleton',
      expect.objectContaining({ iconChanged: true, logoChanged: false }),
    );
  });
});
