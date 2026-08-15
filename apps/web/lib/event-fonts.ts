import localFont from 'next/font/local';
import type { EventFontKey } from '@saas-events/types';

/**
 * Polices proposées à l'organisateur pour les titres de sa page publique
 * (décision produit : chaque événement choisit son identité typographique,
 * plutôt qu'une police unique imposée à tous les clients du SaaS).
 *
 * Les fichiers sont VERSIONNÉS dans `apps/web/fonts/` et chargés via
 * `next/font/local`, plus via `next/font/google`. Motif : `next/font/google`
 * télécharge les fichiers pendant le build, et une coupure passagère vers
 * `fonts.gstatic.com` a déjà produit une image de production incomplète sans
 * faire échouer le build. Des fichiers locaux rendent le build reproductible
 * et indépendant du réseau du serveur.
 *
 * `preload: false` partout : le choix de police n'est connu qu'à l'exécution
 * (il vient du thème de l'événement), précharger les 10 pénaliserait chaque
 * page pour 9 polices inutilisées. Le navigateur ne télécharge que la famille
 * réellement référencée par `font-family`.
 *
 * On utilise les fichiers VARIABLES quand ils existent : un seul fichier
 * couvre toutes les graisses, au lieu d'en déclarer une par poids.
 *
 * ⚠️ Les chemins de `next/font/local` sont analysés à la compilation : ils
 * doivent être écrits littéralement. Impossible de parcourir le dossier pour
 * découvrir les polices — toute police déposée doit être déclarée ici.
 *
 * ⚠️ Les clés DOIVENT rester alignées avec `EVENT_FONT_KEYS`
 * (packages/types) — c'est cette liste que le backend valide à l'écriture.
 */

const inter = localFont({
  src: [
    { path: '../fonts/Inter/Inter-VariableFont_opsz,wght.woff2', style: 'normal' },
    { path: '../fonts/Inter/Inter-Italic-VariableFont_opsz,wght.woff2', style: 'italic' },
  ],
  variable: '--font-event-inter',
  preload: false,
  display: 'swap',
});

const spaceGrotesk = localFont({
  src: '../fonts/Space_Grotesk/SpaceGrotesk-VariableFont_wght.woff2',
  variable: '--font-event-space-grotesk',
  preload: false,
  display: 'swap',
});

const anton = localFont({
  src: '../fonts/anton/Anton-Regular.woff2',
  variable: '--font-event-anton',
  preload: false,
  display: 'swap',
});

const bebasNeue = localFont({
  src: '../fonts/Bebas_Neue/BebasNeue-Regular.woff2',
  variable: '--font-event-bebas-neue',
  preload: false,
  display: 'swap',
});

const poppins = localFont({
  src: [
    { path: '../fonts/poppins/Poppins-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/poppins/Poppins-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/poppins/Poppins-SemiBold.woff2', weight: '600', style: 'normal' },
    { path: '../fonts/poppins/Poppins-Bold.woff2', weight: '700', style: 'normal' },
    { path: '../fonts/poppins/Poppins-Italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-event-poppins',
  preload: false,
  display: 'swap',
});

const playfairDisplay = localFont({
  src: [
    { path: '../fonts/Playfair_Display/PlayfairDisplay-VariableFont_wght.woff2', style: 'normal' },
    { path: '../fonts/Playfair_Display/PlayfairDisplay-Italic-VariableFont_wght.woff2', style: 'italic' },
  ],
  variable: '--font-event-playfair-display',
  preload: false,
  display: 'swap',
});

const montserrat = localFont({
  src: [
    { path: '../fonts/Montserrat/Montserrat-VariableFont_wght.woff2', style: 'normal' },
    { path: '../fonts/Montserrat/Montserrat-Italic-VariableFont_wght.woff2', style: 'italic' },
  ],
  variable: '--font-event-montserrat',
  preload: false,
  display: 'swap',
});

const datatype = localFont({
  src: '../fonts/Datatype/Datatype-VariableFont_wdth,wght.woff2',
  variable: '--font-event-datatype',
  preload: false,
  display: 'swap',
});

const googleSansFlex = localFont({
  src: '../fonts/Google_Sans_Flex/GoogleSansFlex-VariableFont_GRAD,ROND,opsz,slnt,wdth,wght.woff2',
  variable: '--font-event-google-sans-flex',
  preload: false,
  display: 'swap',
});

const alexBrush = localFont({
  src: '../fonts/Alex_Brush/AlexBrush-Regular.woff2',
  variable: '--font-event-alex-brush',
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
  inter: {
    key: 'inter',
    label: 'Inter',
    hint: 'Sans-serif neutre, très lisible',
    className: inter.className,
    variableClassName: inter.variable,
    variable: '--font-event-inter',
  },
  'space-grotesk': {
    key: 'space-grotesk',
    label: 'Space Grotesk',
    hint: 'Géométrique contemporaine',
    className: spaceGrotesk.className,
    variableClassName: spaceGrotesk.variable,
    variable: '--font-event-space-grotesk',
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
  'playfair-display': {
    key: 'playfair-display',
    label: 'Playfair Display',
    hint: 'Serif classique à fort contraste',
    className: playfairDisplay.className,
    variableClassName: playfairDisplay.variable,
    variable: '--font-event-playfair-display',
  },
  montserrat: {
    key: 'montserrat',
    label: 'Montserrat',
    hint: 'Sans-serif large, allure urbaine',
    className: montserrat.className,
    variableClassName: montserrat.variable,
    variable: '--font-event-montserrat',
  },
  datatype: {
    key: 'datatype',
    label: 'Datatype',
    hint: 'Technique, largeurs multiples',
    className: datatype.className,
    variableClassName: datatype.variable,
    variable: '--font-event-datatype',
  },
  'google-sans-flex': {
    key: 'google-sans-flex',
    label: 'Google Sans Flex',
    hint: 'Sans-serif souple et moderne',
    className: googleSansFlex.className,
    variableClassName: googleSansFlex.variable,
    variable: '--font-event-google-sans-flex',
  },
  'alex-brush': {
    key: 'alex-brush',
    label: 'Alex Brush',
    hint: 'Manuscrite élégante, pour événements festifs',
    className: alexBrush.className,
    variableClassName: alexBrush.variable,
    variable: '--font-event-alex-brush',
  },
};

/** Police par défaut si l'organisateur n'a rien choisi. */
export const DEFAULT_EVENT_FONT: EventFontKey = 'playfair-display';

export function resolveEventFont(key: string | undefined | null): EventFontDefinition {
  if (key && key in EVENT_FONTS) return EVENT_FONTS[key as EventFontKey];
  return EVENT_FONTS[DEFAULT_EVENT_FONT];
}

/**
 * Toutes les classes-VARIABLES next/font, à poser une fois sur le conteneur
 * de la page publique : chacune déclare sa `@font-face` et sa variable
 * `--font-event-*`, sans imposer de `font-family`. C'est ensuite
 * `--font-event` (voir event-theme.ts) qui pointe vers celle choisie.
 *
 * ⚠️ Bien `variableClassName` et non `className` : ce dernier appliquerait
 * les polices en cascade sur tout le sous-arbre et ne définirait aucune
 * variable.
 */
export const ALL_EVENT_FONT_CLASSNAMES = Object.values(EVENT_FONTS)
  .map((f) => f.variableClassName)
  .join(' ');

export const EVENT_FONT_LIST: EventFontDefinition[] = Object.values(EVENT_FONTS);
