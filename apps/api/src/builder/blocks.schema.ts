import { z } from 'zod';

/**
 * Schéma Zod — Validation des blocs Event Builder côté backend (CDC §11.2).
 *
 * Toute sauvegarde de blocs DOIT passer ce schéma AVANT écriture BDD.
 * C'est la garantie que seules des structures autorisées sont persistées,
 * empêchant injection XSS (HEX strict), abus (limite 50 blocs) et corruption
 * de données (types/ordres valides).
 *
 * Types de blocs autorisés (CDC §11.1) :
 *  hero, text, image, video, gallery, countdown, tickets, faq, schedule,
 *  testimonials, sponsors.
 */

// HEX strict 6 chiffres — bloque toute injection CSS via backgroundColor
const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur HEX invalide');

const BlockStylesSchema = z
  .object({
    backgroundColor: HexColor.optional(),
    paddingY: z.enum(['sm', 'md', 'lg', 'xl']).optional(),
    textAlign: z.enum(['left', 'center', 'right']).optional(),
  })
  .optional();

const BlockSchema = z.object({
  id: z.string().uuid(),
  type: z.enum([
    'hero', 'text', 'image', 'video', 'gallery',
    'countdown', 'tickets', 'faq', 'schedule',
    'testimonials', 'sponsors',
  ]),
  order: z.number().int().min(0),
  // props est un record libre (validé plus finement par bloc au rendu si besoin)
  props: z.record(z.unknown()),
  styles: BlockStylesSchema,
});

/** Tableau de blocs, limité à 50 pour éviter les abus. */
export const BlocksArraySchema = z.array(BlockSchema).max(50);

/**
 * DTO de sauvegarde — inclut le contrôle de concurrence optimiste.
 * lastKnownUpdatedAt : ISO datetime (ou null pour la première sauvegarde).
 */
export const SaveBlocksDto = z.object({
  blocks: BlocksArraySchema,
  lastKnownUpdatedAt: z.string().datetime().nullable(),
});

export type ParsedBlock = z.infer<typeof BlockSchema>;
export { BlockSchema };
