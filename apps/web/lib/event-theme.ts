import type { CSSProperties } from 'react';
import type { EventTheme } from '@saas-events/types';
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
 * Noir ou blanc selon la couleur de fond — un organisateur qui choisit un
 * accent clair (jaune, cyan...) ne doit pas se retrouver avec du texte blanc
 * illisible sur ses boutons.
 */
export function readableForeground(hex: string): string {
  return luminance(hex) > 0.45 ? '#141312' : '#ffffff';
}

export interface ResolvedEventTheme {
  /** Classes next/font à poser sur le conteneur (déclare les @font-face). */
  fontClassName: string;
  /** Variables CSS surchargeant le design system pour cette page. */
  style: CSSProperties;
  /** true si l'organisateur a défini un fond personnalisé. */
  hasCustomBackground: boolean;
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

  if (background) {
    style.backgroundColor = background;
    style.color = readableForeground(background);
  }

  return {
    fontClassName: ALL_EVENT_FONT_CLASSNAMES,
    style: style as CSSProperties,
    hasCustomBackground: Boolean(background),
  };
}
