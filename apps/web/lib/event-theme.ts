import type { CSSProperties } from 'react';
import {
  MAX_BACKGROUND_OVERLAY,
  MIN_BACKGROUND_OVERLAY,
  type EventTheme,
} from '@saas-events/types';
import { ALL_EVENT_FONT_CLASSNAMES, resolveEventFont } from '@/lib/event-fonts';

/**
 * Traduit le thème choisi par l'organisateur (EventPage.theme) en classes +
 * variables CSS posées sur le conteneur de la page publique.
 *
 * Principe : on surcharge des variables du design system EXISTANT plutôt que
 * d'ajouter des styles parallèles — `--color-primary` bascule donc toutes les
 * utilitaires `bg-primary`/`text-primary` déjà en place vers la couleur de
 * l'organisateur, sans toucher au balisage des composants.
 */

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

/** Luminance relative WCAG — sert à choisir un texte lisible sur l'accent. */
function luminance(hex: string): number {
  const channel = (start: number) => {
    const c = parseInt(hex.slice(start, start + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/**
 * Noir ou blanc sur la couleur de l’organisateur — celui des deux qui offre
 * le MEILLEUR contraste, mesuré.
 *
 * La version précédente tranchait sur un seuil de luminance fixe (0,45), ce
 * qui ne garantit aucun ratio : un accent légèrement au-dessus du seuil
 * recevait du texte noir à 3,79:1 alors que le blanc aurait mieux fait —
 * constaté en audit sur les boutons de la page publique, sous le minimum
 * WCAG AA de 4,5:1 pour du texte courant.
 */
export function readableForeground(hex: string): string {
  const bg = luminance(hex);
  const contrastWith = (fg: number) => {
    const [hi, lo] = fg > bg ? [fg, bg] : [bg, fg];
    return (hi + 0.05) / (lo + 0.05);
  };
  // Luminances de nos deux encres : #141312 et #ffffff.
  const withBlack = contrastWith(luminance('#141312'));
  const withWhite = contrastWith(1);
  return withBlack >= withWhite ? '#141312' : '#ffffff';
}

/* ─── Dérivation d’une palette sombre ────────────────────────────────────
 *
 * Une même couleur ne peut pas servir sur fond clair ET sur fond sombre.
 * Un accent bleu nuit choisi pour du blanc devient illisible sur du noir —
 * c’est exactement le défaut constaté sur la page publique : le thème
 * basculait, la couleur d’accent ne bougeait pas.
 *
 * On dérive donc une variante sombre à partir de la teinte choisie, en ne
 * touchant qu’à la LUMINOSITÉ : la teinte et la saturation portent
 * l’identité de l’organisateur, il n’y a aucune raison d’y toucher. La
 * dérivation reste un DÉFAUT — le panneau permet de la surcharger.
 */

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) / 6
      : max === g
        ? ((b - r) / d + 2) / 6
        : ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Variante sombre d’un ACCENT : on l’éclaircit s’il est trop sombre pour se
 * détacher d’un fond noir, on l’assombrit légèrement s’il est éblouissant.
 * Entre les deux, on n’y touche pas — une couleur déjà lisible n’a pas à
 * être « corrigée ».
 */
/** Encre sombre du design system — la référence des calculs de contraste. */
const FOND_SOMBRE = '#141312';

/** Ratio de contraste WCAG entre deux couleurs. */
function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Variante sombre d’un ACCENT, pilotée par le CONTRASTE et non par un seuil
 * de luminosité.
 *
 * Une première version se contentait d’éclaircir les couleurs « trop
 * sombres ». Elle laissait passer les teintes moyennes : un violet à 57 % de
 * luminosité restait à 3,17:1 sur fond sombre, sous le minimum lisible,
 * simplement parce qu’il ne tombait dans aucune des deux bornes.
 *
 * On monte donc la luminosité par paliers JUSQU’À atteindre 4,5:1, et on
 * s’arrête là : éclaircir au-delà délaverait l’identité sans rien gagner.
 * La teinte ne bouge jamais — c’est elle que l’organisateur a choisie.
 */
export function deriveDarkAccent(hex: string): string {
  if (contrastRatio(hex, FOND_SOMBRE) >= 4.5) {
    // Déjà lisible. Seul cas traité : un blanc quasi pur, éblouissant sur
    // fond sombre, qu’on adoucit à peine.
    const { h, s, l } = hexToHsl(hex);
    return l > 0.9 ? hslToHex(h, s, 0.82) : hex;
  }

  const { h, s } = hexToHsl(hex);
  // Une couleur sombre est souvent très saturée : l’éclaircir sans rien
  // retirer donnerait un fluo.
  const saturation = Math.min(s, 0.75);
  for (let l = hexToHsl(hex).l; l <= 0.92; l += 0.02) {
    const candidat = hslToHex(h, saturation, l);
    if (contrastRatio(candidat, FOND_SOMBRE) >= 4.5) return candidat;
  }
  return hslToHex(h, saturation, 0.92);
}

/**
 * Variante sombre d’un FOND : même teinte, mais ramenée à une valeur qui
 * tient un texte clair. On garde un soupçon de saturation pour que le fond
 * reste teinté plutôt que gris — c’est ce qui fait qu’une page sombre
 * appartient encore à l’organisateur.
 */
export function deriveDarkBackground(hex: string): string {
  const { h, s } = hexToHsl(hex);
  return hslToHex(h, Math.min(s, 0.35), 0.09);
}
export interface ResolvedEventTheme {
  /** Classes next/font à poser sur le conteneur (déclare les @font-face). */
  fontClassName: string;
  /** Variables CSS surchargeant le design system pour cette page. */
  style: CSSProperties;
  /** true si l'organisateur a défini un fond personnalisé. */
  hasCustomBackground: boolean;
  /**
   * Règles CSS à poser dans un <style> (2026-08-20).
   *
   * Un style INLINE ne sait pas exprimer « et en thème sombre, ceci » :
   * c'est exactement pourquoi la couleur d'accent ne bougeait pas quand la
   * page basculait. Ces règles portent les DEUX palettes et laissent le
   * sélecteur de thème trancher.
   */
  css: string;
  /**
   * Image de fond validée, prête à rendre — `null` s'il n'y en a pas. Le
   * voile est déjà borné à son plancher : l'appelant n'a plus de décision de
   * lisibilité à prendre.
   */
  backdrop: { imageUrl: string; overlay: number; blur: boolean } | null;
}

export function resolveEventTheme(theme: EventTheme | null | undefined): ResolvedEventTheme {
  const font = resolveEventFont(theme?.fontFamily);

  // Les valeurs viennent de la BDD, déjà validées en HEX strict à l'écriture
  // (ThemeSchema, backend). On revalide ici malgré tout : cette chaîne part
  // dans une propriété CSS, et une donnée non revalidée ne doit jamais y
  // atterrir (RULES.md).
  const accent = theme?.accentColor && HEX_RE.test(theme.accentColor) ? theme.accentColor : null;
  const background =
    theme?.backgroundColor && HEX_RE.test(theme.backgroundColor) ? theme.backgroundColor : null;

  // On redéclare `--font-event` (l'utilitaire Tailwind `font-event`) SUR ce
  // conteneur, plutôt que de poser seulement `--font-event-display` plus bas
  // dans l'arbre.
  //
  // Pourquoi : une custom property résout ses `var()` à l'endroit où elle est
  // DÉCLARÉE, puis c'est sa valeur déjà résolue qui hérite. `--font-event`
  // étant déclarée dans `@theme` (donc sur `:root`), où
  // `--font-event-display` n'existe pas, elle se fige sur son repli
  // (`--font-serif`) et descend ainsi jusqu'aux titres — définir
  // `--font-event-display` sur un descendant ne la ferait jamais
  // re-résoudre (bug réel rencontré : les couleurs du thème s'appliquaient,
  // jamais la police).
  const style: Record<string, string> = {
    '--font-event-display': `var(${font.variable})`,
    '--font-event': `var(${font.variable}), ui-serif, serif`,
  };

  const accent2 =
    theme?.accentColorSecondary && HEX_RE.test(theme.accentColorSecondary)
      ? theme.accentColorSecondary
      : null;



  /*
   * Seconde teinte (2026-08-20). Elle retombe TOUJOURS sur la première quand
   * elle n'est pas choisie : les dégradés continuent alors de fonctionner —
   * un dégradé d'une couleur vers elle-même est un aplat, pas un bug — et
   * aucune page existante ne change d'apparence.
   *
   * L'encre du bouton se calcule sur la couleur de DÉPART du dégradé : c'est
   * elle qui occupe la majorité de la surface, et un texte lisible sur une
   * moitié seulement ne l'est pas.
   */


  /*
   * Palette SOMBRE. L'organisateur peut la fixer lui-même ; sinon on la
   * dérive de la palette claire en garantissant 4,5:1 sur fond sombre.
   * Dériver plutôt que réutiliser la couleur claire est tout l’enjeu : un
   * accent bleu nuit choisi pour du blanc tombe à 1,4:1 sur du noir.
   */
  const accentDark =
    theme?.accentColorDark && HEX_RE.test(theme.accentColorDark)
      ? theme.accentColorDark
      : accent
        ? deriveDarkAccent(accent)
        : null;
  const accent2Dark =
    theme?.accentColorSecondaryDark && HEX_RE.test(theme.accentColorSecondaryDark)
      ? theme.accentColorSecondaryDark
      : accent2
        ? deriveDarkAccent(accent2)
        : null;
  const backgroundDark =
    theme?.backgroundColorDark && HEX_RE.test(theme.backgroundColorDark)
      ? theme.backgroundColorDark
      : background
        ? deriveDarkBackground(background)
        : null;

  const aBackdrop = Boolean(resolveBackdrop(theme));

  /** Variables d’une palette, prêtes à être injectées dans une règle CSS. */
  const palette = (a: string | null, a2: string | null): string => {
    if (!a && !a2) return '';
    const base = a ?? 'var(--color-primary)';
    const second = a2 ?? base;
    const parts: string[] = [];
    if (a) {
      parts.push(
        '--color-primary:' + a + ';',
        '--color-primaryho:' + a + ';',
        '--color-primary-foreground:' + readableForeground(a) + ';',
        '--color-accent-terracotta:' + a + ';',
        '--color-accent-terracotta-dark:' + a + ';',
      );
    }
    parts.push(
      '--color-accent-2:' + second + ';',
      '--gradient-accent:linear-gradient(115deg,' + base + ' 0%,' + second + ' 100%);',
    );
    return parts.join('');
  };

  // Le fond n’entre dans le CSS que SANS image de fond : avec une image, une
  // couleur opaque repeindrait par-dessus la couche fixe.
  const fond = (c: string | null): string =>
    c && !aBackdrop
      ? 'background-color:' + c + ';color:' + readableForeground(c) + ';'
      : '';

  const regleClaire = palette(accent, accent2) + fond(background);
  const regleSombre = palette(accentDark, accent2Dark) + fond(backgroundDark);

  const css = [
    regleClaire ? '.event-theme{' + regleClaire + '}' : '',
    regleSombre ? '.dark .event-theme{' + regleSombre + '}' : '',
  ]
    .filter(Boolean)
    .join('');

  const backdrop = resolveBackdrop(theme);

  // Une image de fond L'EMPORTE sur la couleur de fond : les deux sont posées
  // au même endroit, et une couleur opaque sur le conteneur repeindrait
  // par-dessus la couche fixe de l'image (un élément à z-index négatif est
  // peint avant les fonds des descendants en flux — l'image aurait
  // simplement disparu). L'encre suit alors le mode clair/sombre habituel,
  // comme le voile qui la protège.


  return {
    fontClassName: ALL_EVENT_FONT_CLASSNAMES,
    style: style as CSSProperties,
    hasCustomBackground: Boolean(background) || Boolean(backdrop),
    backdrop,
    css,
  };
}

/**
 * Image de fond de page. L'URL vient de la BDD, où elle a été validée contre
 * la whitelist de stockage à l'écriture — mais elle part ici dans un `url()`
 * CSS, et une donnée non revalidée ne doit jamais y atterrir (RULES.md, même
 * principe que les couleurs HEX ci-dessus). On revérifie donc que c'est bien
 * une URL http(s) analysable, et on refuse tout le reste.
 */
function resolveBackdrop(theme: EventTheme | null | undefined) {
  const raw = theme?.backgroundImageUrl?.trim();
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  // Une apostrophe, une parenthèse ou un blanc permettrait de sortir du
  // `url('…')` qui l'enveloppe. Aucune URL de stockage légitime n'en contient.
  if (/["'()\s\\]/.test(raw)) return null;

  // Le plancher s'applique ICI, pas seulement à la saisie : un thème
  // enregistré avant cette règle, ou écrit par un autre chemin, ne doit pas
  // pouvoir produire une page dont le texte est illisible sur la photo.
  const requested = theme?.backgroundOverlay;
  const overlay = Math.min(
    MAX_BACKGROUND_OVERLAY,
    Math.max(MIN_BACKGROUND_OVERLAY, typeof requested === 'number' ? requested : 55),
  );

  return { imageUrl: raw, overlay, blur: theme?.backgroundBlur === true };
}
