/**
 * Métadonnées des 6 thèmes de couleur (page Apparence, Manager/Admin,
 * 2026-07-17). Les valeurs de couleur réelles vivent dans globals.css
 * ([data-color-theme="x"]) — ce fichier ne sert qu'à afficher les swatches
 * dans le sélecteur, avec les mêmes teintes pour que l'aperçu soit fidèle.
 */

export interface ColorTheme {
  id: string;
  label: string;
  tag: string;
  /** Bouton/badge/icône, dans l'ordre — mêmes valeurs que accent-terracotta/accent-2/accent-3 en mode clair. */
  swatches: [string, string, string];
}

export const COLOR_THEMES: ColorTheme[] = [
  {
    id: 'terracotta',
    label: 'Terracotta',
    tag: 'argile · défaut',
    swatches: ['oklch(58% 0.15 45)', 'oklch(66% 0.12 60)', 'oklch(70% 0.13 75)'],
  },
  {
    id: 'ocean',
    label: 'Océan',
    tag: 'marine · teal · azur',
    swatches: ['oklch(38% 0.09 250)', 'oklch(55% 0.13 215)', 'oklch(68% 0.1 195)'],
  },
  {
    id: 'emeraude',
    label: 'Émeraude',
    tag: 'forêt · lime · menthe',
    swatches: ['oklch(34% 0.07 150)', 'oklch(53% 0.14 155)', 'oklch(60% 0.1 175)'],
  },
  {
    id: 'aubergine',
    label: 'Aubergine',
    tag: 'prune · rose · lavande',
    swatches: ['oklch(34% 0.1 300)', 'oklch(48% 0.17 310)', 'oklch(66% 0.13 350)'],
  },
  {
    id: 'ambre',
    label: 'Ambre',
    tag: 'miel · corail · brique',
    swatches: ['oklch(38% 0.06 60)', 'oklch(66% 0.15 78)', 'oklch(62% 0.17 45)'],
  },
  {
    id: 'ardoise',
    label: 'Ardoise',
    tag: 'indigo · acier · nuit',
    swatches: ['oklch(30% 0.04 260)', 'oklch(50% 0.13 265)', 'oklch(64% 0.08 245)'],
  },
];

export const COLOR_THEME_IDS = COLOR_THEMES.map((t) => t.id);
export type ColorThemeId = (typeof COLOR_THEME_IDS)[number];
export const DEFAULT_COLOR_THEME: ColorThemeId = 'terracotta';
