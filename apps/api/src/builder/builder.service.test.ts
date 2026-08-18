/**
 * Tests unitaires — BuilderService
 * Ownership Manager (RULES.md §1), validation Zod (RULES.md §6) et
 * concurrence optimiste (RULES.md §5) sur la sauvegarde des blocs.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BuilderService } from './builder.service';

const OWNED_EVENT = { id: 'ev-1', managerId: 'mgr-1' };
const OTHER_EVENT = { id: 'ev-2', managerId: 'mgr-2' };

const VALID_BLOCKS = [
  { id: '11111111-1111-1111-1111-111111111111', type: 'hero', order: 0, props: {} },
];

function makePrisma() {
  return {
    event: { findUnique: vi.fn() },
    eventPage: { findUnique: vi.fn(), upsert: vi.fn() },
  };
}

describe('BuilderService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: BuilderService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new BuilderService(prisma as any);
  });

  describe('getMyBlocks()', () => {
    it("retourne les blocs de l'EventPage existante", async () => {
      const updatedAt = new Date('2026-01-01T00:00:00Z');
      prisma.event.findUnique.mockResolvedValue({
        id: 'ev-1',
        eventPage: { blocks: VALID_BLOCKS, theme: { primary: '#000000' }, isPublished: true, updatedAt },
      });

      const result = await service.getMyBlocks('mgr-1');

      expect(result).toEqual({
        eventId: 'ev-1',
        blocks: VALID_BLOCKS,
        theme: { primary: '#000000' },
        isPublished: true,
        updatedAt,
      });
    });

    it("retourne des valeurs par défaut si aucune EventPage n'existe encore", async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'ev-1', eventPage: null });

      const result = await service.getMyBlocks('mgr-1');

      expect(result).toEqual({
        eventId: 'ev-1',
        blocks: [],
        theme: {},
        isPublished: false,
        updatedAt: null,
      });
    });

    it("404 si le manager n'a pas d'événement", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.getMyBlocks('mgr-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('saveBlocks()', () => {
    it('sauvegarde (upsert) quand le manager possède l’événement, schéma valide, pas de conflit', async () => {
      prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);
      prisma.eventPage.findUnique.mockResolvedValue(null);
      prisma.eventPage.upsert.mockResolvedValue({ eventId: 'ev-1', blocks: VALID_BLOCKS });

      const result = await service.saveBlocks('ev-1', 'mgr-1', {
        blocks: VALID_BLOCKS,
        lastKnownUpdatedAt: null,
      });

      expect(result).toEqual({ eventId: 'ev-1', blocks: VALID_BLOCKS });
      // `theme` absent du corps → `undefined` en update (Prisma l'ignore, le
      // thème existant survit) et `{}` à la création.
      expect(prisma.eventPage.upsert).toHaveBeenCalledWith({
        where: { eventId: 'ev-1' },
        create: { eventId: 'ev-1', blocks: VALID_BLOCKS, theme: {} },
        update: { blocks: VALID_BLOCKS, theme: undefined },
      });
    });

    it('persiste le thème quand il est fourni (police + couleurs de l’organisateur)', async () => {
      prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);
      prisma.eventPage.findUnique.mockResolvedValue(null);
      prisma.eventPage.upsert.mockResolvedValue({ eventId: 'ev-1' });

      const theme = { accentColor: '#1a7f4b', backgroundColor: '#0b1f14', fontFamily: 'anton' };
      await service.saveBlocks('ev-1', 'mgr-1', {
        blocks: VALID_BLOCKS,
        theme,
        lastKnownUpdatedAt: null,
      });

      expect(prisma.eventPage.upsert).toHaveBeenCalledWith({
        where: { eventId: 'ev-1' },
        create: { eventId: 'ev-1', blocks: VALID_BLOCKS, theme },
        update: { blocks: VALID_BLOCKS, theme },
      });
    });

    it('rejette une couleur de thème qui n’est pas un HEX strict (anti-injection CSS)', async () => {
      prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);
      prisma.eventPage.findUnique.mockResolvedValue(null);

      await expect(
        service.saveBlocks('ev-1', 'mgr-1', {
          blocks: VALID_BLOCKS,
          theme: { accentColor: 'red; background: url(evil)' },
          lastKnownUpdatedAt: null,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.eventPage.upsert).not.toHaveBeenCalled();
    });

    it('rejette une police hors de la liste autorisée', async () => {
      prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);
      prisma.eventPage.findUnique.mockResolvedValue(null);

      await expect(
        service.saveBlocks('ev-1', 'mgr-1', {
          blocks: VALID_BLOCKS,
          theme: { fontFamily: 'Comic Sans MS' },
          lastKnownUpdatedAt: null,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.eventPage.upsert).not.toHaveBeenCalled();
    });

    it("refuse (403) si le manager ne possède pas l'événement", async () => {
      prisma.event.findUnique.mockResolvedValue(OTHER_EVENT);

      await expect(
        service.saveBlocks('ev-2', 'mgr-1', { blocks: VALID_BLOCKS, lastKnownUpdatedAt: null }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.eventPage.upsert).not.toHaveBeenCalled();
    });

    it("404 si l'événement n'existe pas", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(
        service.saveBlocks('ev-404', 'mgr-1', { blocks: VALID_BLOCKS, lastKnownUpdatedAt: null }),
      ).rejects.toThrow(NotFoundException);
    });

    it('400 si le corps ne respecte pas SaveBlocksDto (couleur non-HEX)', async () => {
      prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);

      await expect(
        service.saveBlocks('ev-1', 'mgr-1', {
          blocks: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              type: 'hero',
              order: 0,
              props: {},
              styles: { backgroundColor: 'red' },
            },
          ],
          lastKnownUpdatedAt: null,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.eventPage.upsert).not.toHaveBeenCalled();
    });

    it('400 si plus de 50 blocs', async () => {
      prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);
      const tooMany = Array.from({ length: 51 }, (_, i) => ({
        id: `11111111-1111-1111-1111-11111111${String(i).padStart(4, '0')}`,
        type: 'text',
        order: i,
        props: {},
      }));

      await expect(
        service.saveBlocks('ev-1', 'mgr-1', { blocks: tooMany, lastKnownUpdatedAt: null }),
      ).rejects.toThrow(BadRequestException);
    });

    it('409 si la page a été modifiée après la lecture du client (conflit de concurrence)', async () => {
      prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);
      prisma.eventPage.findUnique.mockResolvedValue({ updatedAt: new Date('2026-01-02T00:00:00Z') });

      await expect(
        service.saveBlocks('ev-1', 'mgr-1', {
          blocks: VALID_BLOCKS,
          lastKnownUpdatedAt: '2026-01-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.eventPage.upsert).not.toHaveBeenCalled();
    });

    it('sauvegarde sans conflit quand lastKnownUpdatedAt correspond à updatedAt en base', async () => {
      const updatedAt = new Date('2026-01-01T00:00:00.000Z');
      prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);
      prisma.eventPage.findUnique.mockResolvedValue({ updatedAt });
      prisma.eventPage.upsert.mockResolvedValue({ eventId: 'ev-1', blocks: VALID_BLOCKS });

      await service.saveBlocks('ev-1', 'mgr-1', {
        blocks: VALID_BLOCKS,
        lastKnownUpdatedAt: updatedAt.toISOString(),
      });

      expect(prisma.eventPage.upsert).toHaveBeenCalled();
    });

    describe("whitelist d'URL image (RULES.md §6)", () => {
      const ORIGINAL_ENV = { ...process.env };

      beforeEach(() => {
        process.env.STORAGE_ENDPOINT = 'http://localhost:9000';
        process.env.STORAGE_BUCKET = 'fluid-events';
      });

      afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
      });

      it("400 si props.imageUrl pointe vers un domaine hors whitelist", async () => {
        prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);

        await expect(
          service.saveBlocks('ev-1', 'mgr-1', {
            blocks: [
              {
                id: '11111111-1111-1111-1111-111111111111',
                type: 'image',
                order: 0,
                props: { imageUrl: 'https://evil.com/x.png' },
              },
            ],
            lastKnownUpdatedAt: null,
          }),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.eventPage.upsert).not.toHaveBeenCalled();
      });

      // L'image de fond de page (thème) part dans un `url()` CSS chez chaque
      // visiteur : elle doit passer la même garde que les images de blocs.
      it("400 si l'image de fond du thème pointe hors whitelist", async () => {
        prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);

        await expect(
          service.saveBlocks('ev-1', 'mgr-1', {
            blocks: [],
            theme: { backgroundImageUrl: 'https://evil.com/fond.jpg' },
            lastKnownUpdatedAt: null,
          } as any),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.eventPage.upsert).not.toHaveBeenCalled();
      });

      it("sauvegarde quand l'image de fond du thème vient du stockage whitelisté", async () => {
        prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);
        prisma.eventPage.findUnique.mockResolvedValue(null);
        prisma.eventPage.upsert.mockResolvedValue({ eventId: 'ev-1' });

        await service.saveBlocks('ev-1', 'mgr-1', {
          blocks: [],
          theme: {
            backgroundImageUrl: 'http://localhost:9000/fluid-events/uploads/mgr-1/fond.jpg',
            backgroundOverlay: 55,
          },
          lastKnownUpdatedAt: null,
        } as any);

        expect(prisma.eventPage.upsert).toHaveBeenCalled();
      });

      // Retirer l'image se fait en renvoyant une chaîne vide : rien à valider,
      // et surtout pas un refus qui empêcherait de défaire son propre choix.
      it("accepte une image de fond vide (geste « retirer »)", async () => {
        prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);
        prisma.eventPage.findUnique.mockResolvedValue(null);
        prisma.eventPage.upsert.mockResolvedValue({ eventId: 'ev-1' });

        await service.saveBlocks('ev-1', 'mgr-1', {
          blocks: [],
          theme: { backgroundImageUrl: '' },
          lastKnownUpdatedAt: null,
        } as any);

        expect(prisma.eventPage.upsert).toHaveBeenCalled();
      });

      it('sauvegarde quand props.imageUrl pointe vers le stockage whitelisté', async () => {
        prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);
        prisma.eventPage.findUnique.mockResolvedValue(null);
        prisma.eventPage.upsert.mockResolvedValue({ eventId: 'ev-1' });

        const imageUrl = 'http://localhost:9000/fluid-events/uploads/mgr-1/x.png';
        await service.saveBlocks('ev-1', 'mgr-1', {
          blocks: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              type: 'image',
              order: 0,
              props: { imageUrl },
            },
          ],
          lastKnownUpdatedAt: null,
        });

        expect(prisma.eventPage.upsert).toHaveBeenCalled();
      });
    });

    describe('nettoyage du bloc html (décision produit 2026-07-13)', () => {
      it('retire le <script> de props.htmlContent avant persistance', async () => {
        prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);
        prisma.eventPage.findUnique.mockResolvedValue(null);
        prisma.eventPage.upsert.mockResolvedValue({ eventId: 'ev-1' });

        await service.saveBlocks('ev-1', 'mgr-1', {
          blocks: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              type: 'html',
              order: 0,
              props: { htmlContent: '<p>Bonjour</p><script>alert(1)</script>' },
            },
          ],
          lastKnownUpdatedAt: null,
        });

        const upsertArg = prisma.eventPage.upsert.mock.calls[0][0];
        const savedHtml = upsertArg.create.blocks[0].props.htmlContent;
        expect(savedHtml).not.toContain('<script');
        expect(savedHtml).toContain('<p>Bonjour</p>');
      });

      it("n'affecte pas les blocs d'un autre type", async () => {
        prisma.event.findUnique.mockResolvedValue(OWNED_EVENT);
        prisma.eventPage.findUnique.mockResolvedValue(null);
        prisma.eventPage.upsert.mockResolvedValue({ eventId: 'ev-1' });

        await service.saveBlocks('ev-1', 'mgr-1', {
          blocks: VALID_BLOCKS,
          lastKnownUpdatedAt: null,
        });

        expect(prisma.eventPage.upsert).toHaveBeenCalledWith({
          where: { eventId: 'ev-1' },
          create: { eventId: 'ev-1', blocks: VALID_BLOCKS, theme: {} },
          update: { blocks: VALID_BLOCKS, theme: undefined },
        });
      });
    });
  });
});
