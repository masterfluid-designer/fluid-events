import {
  Anton,
  Archivo_Black,
  Bebas_Neue,
  DM_Sans,
  Newsreader,
  Playfair_Display,
  Poppins,
  Space_Grotesk,
} from 'next/font/google';
import type { EventFontKey } from '@saas-events/types';

/**
 * Polices proposées à l'organisateur pour les titres de sa page publique
 * (décision produit : chaque événement choisit son identité typographique,
 * plutôt qu'une police unique imposée à tous les clients du SaaS).
 *
 * Toutes sont auto-hébergées par `next/font/google` (aucune requête vers
 * fonts.googleapis.com au runtime). `preload: false` sur toutes : le choix
 * n'est connu qu'à l'exécution, précharger les 8 pénaliserait chaque page
 * pour 7 polices inutilisées — le navigateur ne télécharge que la famille
 * réellement référencée par `font-family`.
 *
 * ⚠️ Les clés DOIVENT rester alignées avec `EVENT_FONT_KEYS`
 * (packages/types) — c'est cette liste que le backend valide à l'écriture.
 */

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-event-newsreader',
  preload: false,
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-event-space-grotesk',
  preload: false,
  display: 'swap',
});

const archivoBlack = Archivo_Black({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-event-archivo-black',
  preload: false,
  display: 'swap',
});

const anton = Anton({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-event-anton',
  preload: false,
  display: 'swap',
});

const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-event-bebas-neue',
  preload: false,
  display: 'swap',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-event-poppins',
  preload: false,
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-event-dm-sans',
  preload: false,
  display: 'swap',
});

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-event-playfair-display',
  preload: false,
  display: 'swap',
});

export interface EventFontDefinition {
  key: EventFontKey;
  label: string;
  /** Courte description du caractère de la police, affichée dans le Builder. */
  hint: string;
  /**
   * Classe next/font qui APPLIQUE directement la police (`font-family` posé
   * sur l'élément) — pour les aperçus du Builder, où chaque ligne de la liste
   * doit s'afficher dans sa propre police.
   */
  className: string;
  /**
   * Classe next/font qui DÉCLARE la variable CSS `--font-event-*` sans
   * imposer de `font-family`. C'est celle-ci qu'il faut poser sur le
   * conteneur de la page publique : `className` y écraserait la police de
   * tout le sous-arbre, et surtout ne définirait aucune variable — les
   * `var(--font-event-*)` resteraient vides (bug réel rencontré : le thème
   * appliquait bien les couleurs mais jamais la police).
   */
  variableClassName: string;
  /** Nom de la variable CSS émise par next/font (`--font-event-*`). */
  variable: string;
  /** Les display condensées/capitales ont besoin d'un interlignage plus serré. */
  tight?: boolean;
}

export const EVENT_FONTS: Record<EventFontKey, EventFontDefinition> = {
  newsreader: {
    key: 'newsreader',
    label: 'Newsreader',
    hint: 'Serif éditoriale — le style actuel',
    className: newsreader.className,
    variableClassName: newsreader.variable,
    variable: '--font-event-newsreader',
  },
  'space-grotesk': {
    key: 'space-grotesk',
    label: 'Space Grotesk',
    hint: 'Géométrique contemporaine',
    className: spaceGrotesk.className,
    variableClassName: spaceGrotesk.variable,
    variable: '--font-event-space-grotesk',
  },
  'archivo-black': {
    key: 'archivo-black',
    label: 'Archivo Black',
    hint: 'Display très grasse, fort impact',
    className: archivoBlack.className,
    variableClassName: archivoBlack.variable,
    variable: '--font-event-archivo-black',
    tight: true,
  },
  anton: {
    key: 'anton',
    label: 'Anton',
    hint: 'Condensée massive, style affiche',
    className: anton.className,
    variableClassName: anton.variable,
    variable: '--font-event-anton',
    tight: true,
  },
  'bebas-neue': {
    key: 'bebas-neue',
    label: 'Bebas Neue',
    hint: 'Capitales condensées, style festival',
    className: bebasNeue.className,
    variableClassName: bebasNeue.variable,
    variable: '--font-event-bebas-neue',
    tight: true,
  },
  poppins: {
    key: 'poppins',
    label: 'Poppins',
    hint: 'Ronde et chaleureuse',
    className: poppins.className,
    variableClassName: poppins.variable,
    variable: '--font-event-poppins',
  },
  'dm-sans': {
    key: 'dm-sans',
    label: 'DM Sans',
    hint: 'Neutre et lisible',
    className: dmSans.className,
    variableClassName: dmSans.variable,
    variable: '--font-event-dm-sans',
  },
  'playfair-display': {
    key: 'playfair-display',
    label: 'Playfair Display',
    hint: 'Serif classique à fort contraste',
    className: playfairDisplay.className,
    variableClassName: playfairDisplay.variable,
    variable: '--font-event-playfair-display',
  },
};

/** Police par défaut si l'organisateur n'a rien choisi — identité actuelle. */
export const DEFAULT_EVENT_FONT: EventFontKey = 'newsreader';

export function resolveEventFont(key: string | undefined | null): EventFontDefinition {
  if (key && key in EVENT_FONTS) return EVENT_FONTS[key as EventFontKey];
  return EVENT_FONTS[DEFAULT_EVENT_FONT];
}

/**
 * Toutes les classes-VARIABLES next/font, à poser une fois sur le conteneur
 * de la page publique : chacune déclare sa `@font-face` et sa variable
 * `--font-event-*`, sans imposer de `font-family`. C'est ensuite
 * `--font-event-display` (voir event-theme.ts) qui pointe vers celle choisie.
 *
 * ⚠️ Bien `variableClassName` et non `className` : ce dernier appliquerait
 * les 8 polices en cascade sur tout le sous-arbre et ne définirait aucune
 * variable.
 */
export const ALL_EVENT_FONT_CLASSNAMES = Object.values(EVENT_FONTS)
  .map((f) => f.variableClassName)
  .join(' ');

export const EVENT_FONT_LIST: EventFontDefinition[] = Object.values(EVENT_FONTS);
