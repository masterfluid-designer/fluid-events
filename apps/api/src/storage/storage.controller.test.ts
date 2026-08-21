import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { Role } from '@saas-events/types';
import { StorageController } from './storage.controller';
import type { StorageService } from './storage.service';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

/**
 * Ce que ces tests protègent : la whitelist ne regardait que le `mimetype`
 * annoncé par le navigateur, qui se falsifie en une ligne. Le contrôleur doit
 * désormais trancher sur le CONTENU du fichier, et corriger le type stocké.
 */

const manager: RequestUser = { id: 'mgr_1', email: 'm@ex.com', role: Role.MANAGER };

function pngValide(largeur = 800, hauteur = 600): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(largeur, 16);
  buffer.writeUInt32BE(hauteur, 20);
  return buffer;
}

describe('StorageController — upload', () => {
  let service: { uploadBuffer: ReturnType<typeof vi.fn>; listObjectUrls: ReturnType<typeof vi.fn>; deleteObject: ReturnType<typeof vi.fn> };
  let controller: StorageController;

  beforeEach(() => {
    service = {
      uploadBuffer: vi.fn().mockResolvedValue('https://bucket.example/uploads/x.png'),
      listObjectUrls: vi.fn(),
      deleteObject: vi.fn(),
    };
    controller = new StorageController(service as unknown as StorageService);
  });

  it('accepte un PNG et stocke le type déduit du contenu', async () => {
    const buffer = pngValide();
    const resultat = await controller.upload({ buffer, mimetype: 'image/png', size: buffer.length }, manager);

    expect(resultat.url).toBe('https://bucket.example/uploads/x.png');
    const [cle, , contentType] = service.uploadBuffer.mock.calls[0];
    expect(cle).toMatch(/^uploads\/mgr_1\/.+\.png$/);
    expect(contentType).toBe('image/png');
  });

  it('refuse un exécutable déguisé en image, quel que soit le mimetype annoncé', async () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]);
    await expect(
      controller.upload({ buffer: exe, mimetype: 'image/png', size: exe.length }, manager),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.uploadBuffer).not.toHaveBeenCalled();
  });

  it('refuse un SVG — un script embarqué servi depuis notre domaine serait une faille', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(
      controller.upload({ buffer: svg, mimetype: 'image/svg+xml', size: svg.length }, manager),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse une image au-delà du plafond de 3 Mo', async () => {
    const buffer = pngValide();
    await expect(
      controller.upload({ buffer, mimetype: 'image/png', size: 4 * 1024 * 1024 }, manager),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse une image trop grande en pixels, même légère', async () => {
    const enorme = pngValide(6000, 4000);
    await expect(
      controller.upload({ buffer: enorme, mimetype: 'image/png', size: enorme.length }, manager),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepte une vidéo MP4 reconnue à sa signature', async () => {
    const mp4 = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom'), Buffer.alloc(32)]);
    await controller.upload({ buffer: mp4, mimetype: 'video/mp4', size: mp4.length }, manager);
    expect(service.uploadBuffer.mock.calls[0][0]).toMatch(/\.mp4$/);
  });

  it('refuse un fichier annoncé vidéo dont le conteneur est méconnaissable', async () => {
    const faux = Buffer.from('ceci n’est pas une vidéo, mais un très long texte de remplissage');
    await expect(
      controller.upload({ buffer: faux, mimetype: 'video/mp4', size: faux.length }, manager),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('applique le plafond image au dépôt de logos, jamais celui des vidéos', async () => {
    const buffer = pngValide();
    await expect(
      controller.uploadToMediaFolder('trusted-logos', {
        buffer,
        mimetype: 'image/png',
        size: 10 * 1024 * 1024,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
