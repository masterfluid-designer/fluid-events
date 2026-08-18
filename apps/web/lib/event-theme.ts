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

export interface ResolvedEventTheme {
  /** Classes next/font à poser sur le conteneur (déclare les @font-face). */
  fontClassName: string;
  /** Variables CSS surchargeant le design system pour cette page. */
  style: CSSProperties;
  /** true si l'organisateur a défini un fond personnalisé. */
  hasCustomBackground: boolean;
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

  if (accent) {
    style['--color-primary'] = accent;
    style['--color-primaryho'] = accent;
    style['--color-primary-foreground'] = readableForeground(accent);
    style['--color-accent-terracotta'] = accent;
    style['--color-accent-terracotta-dark'] = accent;
  }

  const backdrop = resolveBackdrop(theme);

  // Une image de fond L'EMPORTE sur la couleur de fond : les deux sont posées
  // au même endroit, et une couleur opaque sur le conteneur repeindrait
  // par-dessus la couche fixe de l'image (un élément à z-index négatif est
  // peint avant les fonds des descendants en flux — l'image aurait
  // simplement disparu). L'encre suit alors le mode clair/sombre habituel,
  // comme le voile qui la protège.
  if (background && !backdrop) {
    style.backgroundColor = background;
    style.color = readableForeground(background);
  }

  return {
    fontClassName: ALL_EVENT_FONT_CLASSNAMES,
    style: style as CSSProperties,
    hasCustomBackground: Boolean(background) || Boolean(backdrop),
    backdrop,
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
