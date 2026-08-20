import { z } from 'zod';
import { EVENT_FONT_KEYS, MAX_BACKGROUND_OVERLAY } from '@saas-events/types';

/**
 * Schéma Zod — Validation des blocs Event Builder côté backend (CDC §11.2).
 *
 * Toute sauvegarde de blocs DOIT passer ce schéma AVANT écriture BDD.
 * C'est la garantie que seules des structures autorisées sont persistées,
 * empêchant injection XSS (HEX strict, HTML nettoyé — voir `BuilderService`),
 * abus (limite 50 blocs) et corruption de données (types/ordres valides).
 *
 * Types de blocs autorisés (CDC §11.1 + décision produit 2026-07-13) :
 *  hero, text, image, video, gallery, countdown, tickets, faq, schedule, location,
 *  testimonials, sponsors, speakers, html.
 */

// HEX strict 6 chiffres — bloque toute injection CSS via backgroundColor
const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur HEX invalide');

// Classes Tailwind libres par bloc (décision produit 2026-07-13) — restreint
// à la syntaxe Tailwind (lettres/chiffres/- : / [ ] . # %) pour éviter qu'un
// texte libre serve à autre chose qu'une liste de classes CSS, en défense en
// profondeur (React échappe déjà la valeur d'attribut, donc pas un vecteur
// XSS en soi, mais on ne fait jamais confiance à du texte libre sans le
// contraindre — RULES.md).
const TailwindClassName = z
  .string()
  .max(300, 'Classes CSS trop longues (300 caractères max)')
  .regex(/^[a-zA-Z0-9\s\-:/[\].,#%]*$/, 'Classes CSS invalides')
  .optional();

const BlockStylesSchema = z
  .object({
    backgroundColor: HexColor.optional(),
    paddingY: z.enum(['sm', 'md', 'lg', 'xl']).optional(),
    textAlign: z.enum(['left', 'center', 'right']).optional(),
    customClassName: TailwindClassName,
  })
  .optional();

const BlockSchema = z.object({
  id: z.string().uuid(),
  type: z.enum([
    'hero', 'text', 'image', 'video', 'gallery',
    'countdown', 'tickets', 'faq', 'schedule',
    'testimonials', 'sponsors', 'speakers', 'html',
    'timeline', 'location',
  ]),
  order: z.number().int().min(0),
  // props est un record libre (validé plus finement par bloc au rendu si besoin)
  props: z.record(z.unknown()),
  styles: BlockStylesSchema,
});

/** Types dont un seul exemplaire est admis par page — voir @saas-events/types. */
const SINGLETON_TYPES = new Set<string>([
  'hero', 'tickets', 'countdown', 'faq', 'schedule',
  'speakers', 'gallery', 'sponsors', 'location',
]);

/**
 * Tableau de blocs, limité à 50 pour éviter les abus.
 *
 * L'unicité est vérifiée ICI et pas seulement dans la palette du Builder : une
 * règle que seul le client applique n'en est pas une (RULES.md §1). Une page de
 * production a accumulé six blocs `hero` faute de ce contrôle.
 */
export const BlocksArraySchema = z.array(BlockSchema)
  .max(50)
  .superRefine((blocks, ctx) => {
    const vus = new Set<string>();
    for (const [index, block] of blocks.entries()) {
      if (!SINGLETON_TYPES.has(block.type)) continue;
      if (vus.has(block.type)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'type'],
          message: `Un seul bloc « ${block.type} » est autorisé par page.`,
        });
      }
      vus.add(block.type);
    }
  });

/**
 * Thème de la page publique (personnalisation par organisateur) — persisté
 * dans `EventPage.theme`. Couleurs en HEX strict, même garde que
 * `BlockStylesSchema.backgroundColor` : aucune valeur libre ne doit pouvoir
 * atterrir dans une propriété CSS (RULES.md — jamais de texte libre non
 * contraint). La police est restreinte à la liste partagée `EVENT_FONT_KEYS`,
 * que le frontend sait mapper vers une police réellement embarquée.
 */
export const ThemeSchema = z.object({
  accentColor: HexColor.optional(),
  // Seconde couleur d'accent (2026-08-20) — elle ne remplace pas la première,
  // elle s'y marie : c'est le dégradé des deux qui habille les boutons et les
  // touches d'accent de la page. Absente, tout retombe sur la première et
  // l'apparence ne change pas d'un pixel.
  accentColorSecondary: HexColor.optional(),
  // Palette SOMBRE (2026-08-20). Facultative : sans elle, la variante est
  // dérivée de la palette claire avec un contraste garanti. Elle n'existe que
  // pour l'organisateur qui veut trancher lui-même.
  accentColorDark: HexColor.optional(),
  accentColorSecondaryDark: HexColor.optional(),
  backgroundColorDark: HexColor.optional(),
  backgroundColor: HexColor.optional(),
  fontFamily: z.enum(EVENT_FONT_KEYS).optional(),
  // Image de fond (2026-08-18). L'URL n'est PAS validée ici : le schéma ne
  // vérifie que la forme, l'origine est contrôlée dans le service contre la
  // whitelist de stockage — même traitement que `props.imageUrl` d'un bloc.
  // Une chaîne vide efface l'image (le panneau la renvoie ainsi).
  backgroundImageUrl: z.string().max(2048).optional(),
  backgroundOverlay: z.number().int().min(0).max(MAX_BACKGROUND_OVERLAY).optional(),
  backgroundBlur: z.boolean().optional(),
});

/**
 * DTO de sauvegarde — inclut le contrôle de concurrence optimiste.
 * lastKnownUpdatedAt : ISO datetime (ou null pour la première sauvegarde).
 * `theme` est optionnel : une sauvegarde de blocs seule ne l'écrase jamais.
 */
export const SaveBlocksDto = z.object({
  blocks: BlocksArraySchema,
  theme: ThemeSchema.optional(),
  lastKnownUpdatedAt: z.string().datetime().nullable(),
});

export type ParsedBlock = z.infer<typeof BlockSchema>;
export { BlockSchema };
