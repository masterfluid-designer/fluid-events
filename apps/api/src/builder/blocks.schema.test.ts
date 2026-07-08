/**
 * Tests unitaires — Builder Schema (Zod)
 * Validation des blocs Event Builder côté backend (CDC §11.2).
 *
 * Garanties : seuls les types autorisés, HEX strict, structure conforme,
 * limite de 50 blocs. Toute entrée malveillante est rejetée avant écriture BDD.
 */
import { describe, it, expect } from 'vitest';
import { BlocksArraySchema, SaveBlocksDto, BlockSchema } from './blocks.schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const UUID = '550e8400-e29b-41d4-a716-446655440000';
const validBlock = (overrides: Partial<any> = {}) => ({
  id: UUID,
  type: 'hero',
  order: 0,
  props: { title: 'Concert' },
  styles: { backgroundColor: '#d4ac0d', paddingY: 'md', textAlign: 'center' },
  ...overrides,
});

describe('BlockSchema', () => {
  it('valide un bloc hero conforme', () => {
    const result = BlockSchema.safeParse(validBlock());
    expect(result.success).toBe(true);
  });

  it('valide tous les types de blocs autorisés', () => {
    const types = [
      'hero', 'text', 'image', 'video', 'gallery',
      'countdown', 'tickets', 'faq', 'schedule',
      'testimonials', 'sponsors',
    ];
    for (const type of types) {
      const result = BlockSchema.safeParse(validBlock({ type }));
      expect(result.success, `type ${type} devrait être valide`).toBe(true);
    }
  });

  it('rejette un type de bloc inconnu', () => {
    const result = BlockSchema.safeParse(validBlock({ type: 'malicious' }));
    expect(result.success).toBe(false);
  });

  it('rejette un id non-UUID', () => {
    const result = BlockSchema.safeParse(validBlock({ id: 'not-a-uuid' }));
    expect(result.success).toBe(false);
  });

  it('rejette un order négatif', () => {
    const result = BlockSchema.safeParse(validBlock({ order: -1 }));
    expect(result.success).toBe(false);
  });

  it('rejette un order non-entier', () => {
    const result = BlockSchema.safeParse(validBlock({ order: 1.5 }));
    expect(result.success).toBe(false);
  });

  it('rejette une couleur HEX 3 chiffres (forme courte)', () => {
    const result = BlockSchema.safeParse(
      validBlock({ styles: { backgroundColor: '#fff' } }),
    );
    expect(result.success).toBe(false);
  });

  it('rejette une tentative d\'injection CSS dans la couleur', () => {
    const result = BlockSchema.safeParse(
      validBlock({ styles: { backgroundColor: '#fff;</style><script>' } }),
    );
    expect(result.success).toBe(false);
  });

  it('rejette un paddingY invalide', () => {
    const result = BlockSchema.safeParse(
      validBlock({ styles: { paddingY: 'huge' } }),
    );
    expect(result.success).toBe(false);
  });

  it('rejette un textAlign invalide', () => {
    const result = BlockSchema.safeParse(
      validBlock({ styles: { textAlign: 'diagonal' } }),
    );
    expect(result.success).toBe(false);
  });

  it('accepte un bloc sans styles (optionnel)', () => {
    const result = BlockSchema.safeParse(
      validBlock({ styles: undefined }),
    );
    expect(result.success).toBe(true);
  });
});

describe('BlocksArraySchema', () => {
  it('valide un tableau vide', () => {
    expect(BlocksArraySchema.safeParse([]).success).toBe(true);
  });

  it('valide plusieurs blocs triés', () => {
    const blocks = [
      validBlock({ id: UUID, order: 0 }),
      validBlock({ id: '660e8400-e29b-41d4-a716-446655440000', order: 1 }),
    ];
    expect(BlocksArraySchema.safeParse(blocks).success).toBe(true);
  });

  it('rejette plus de 50 blocs (limite)', () => {
    const blocks = Array.from({ length: 51 }, (_, i) =>
      validBlock({
        id: `550e8400-e29b-41d4-a71${(i % 10)}-44665544000${i}`,
        order: i,
      }),
    );
    const result = BlocksArraySchema.safeParse(blocks);
    expect(result.success).toBe(false);
  });

  it('accepte exactement 50 blocs (limite incluse)', () => {
    // Génère 50 UUIDs valides distincts au format canonique 8-4-4-4-12
    const blocks = Array.from({ length: 50 }, (_, i) =>
      validBlock({
        id: `${(0x550e8400 + i).toString(16).padStart(8, '0')}-e29b-41d4-a716-446655440000`,
        order: i,
      }),
    );
    const result = BlocksArraySchema.safeParse(blocks);
    expect(result.success).toBe(true);
  });

  it('rejette un bloc invalide dans le tableau', () => {
    const blocks = [
      validBlock(),
      validBlock({ type: 'EVIL_TYPE' }), // un invalide suffit
    ];
    expect(BlocksArraySchema.safeParse(blocks).success).toBe(false);
  });

  it('rejette un payload non-tableau', () => {
    expect(BlocksArraySchema.safeParse({ not: 'array' }).success).toBe(false);
    expect(BlocksArraySchema.safeParse('string').success).toBe(false);
    expect(BlocksArraySchema.safeParse(null).success).toBe(false);
  });
});

describe('SaveBlocksDto', () => {
  it('valide un DTO complet avec lastKnownUpdatedAt ISO', () => {
    const result = SaveBlocksDto.safeParse({
      blocks: [validBlock()],
      lastKnownUpdatedAt: '2026-06-01T12:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepte lastKnownUpdatedAt null (première sauvegarde)', () => {
    const result = SaveBlocksDto.safeParse({
      blocks: [validBlock()],
      lastKnownUpdatedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejette un lastKnownUpdatedAt non-ISO', () => {
    const result = SaveBlocksDto.safeParse({
      blocks: [],
      lastKnownUpdatedAt: 'pas-une-date',
    });
    expect(result.success).toBe(false);
  });

  it('rejette un DTO sans blocks', () => {
    const result = SaveBlocksDto.safeParse({
      lastKnownUpdatedAt: '2026-06-01T12:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});
