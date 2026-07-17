/**
 * lib/countries.ts — Liste des pays avec indicatif téléphonique international
 * (décision produit 2026-07-15 — sélecteur de pays façon Telegram pour la
 * vérification téléphone). Le drapeau n'est jamais stocké en dur : il est
 * calculé à la volée depuis le code ISO 3166-1 alpha-2 (deux "regional
 * indicator symbols" Unicode) — aucune image, aucune dépendance externe.
 */

export interface Country {
  name: string;
  iso2: string;
  dialCode: string;
}

/** Convertit un code ISO 3166-1 alpha-2 ("TG") en emoji drapeau ("🇹🇬"). */
export function countryFlagEmoji(iso2: string): string {
  return iso2
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

/**
 * Togo/Côte d'Ivoire en tête (marché cible principal, CDC/BUSINESS.md),
 * puis reste de l'Afrique francophone/anglophone, puis international par
 * ordre alphabétique.
 */
export const COUNTRIES: Country[] = [
  { name: 'Togo', iso2: 'TG', dialCode: '228' },
  { name: "Côte d'Ivoire", iso2: 'CI', dialCode: '225' },
  { name: 'Bénin', iso2: 'BJ', dialCode: '229' },
  { name: 'Burkina Faso', iso2: 'BF', dialCode: '226' },
  { name: 'Sénégal', iso2: 'SN', dialCode: '221' },
  { name: 'Mali', iso2: 'ML', dialCode: '223' },
  { name: 'Niger', iso2: 'NE', dialCode: '227' },
  { name: 'Guinée', iso2: 'GN', dialCode: '224' },
  { name: 'Ghana', iso2: 'GH', dialCode: '233' },
  { name: 'Nigeria', iso2: 'NG', dialCode: '234' },
  { name: 'Cameroun', iso2: 'CM', dialCode: '237' },
  { name: 'Gabon', iso2: 'GA', dialCode: '241' },
  { name: 'Congo-Brazzaville', iso2: 'CG', dialCode: '242' },
  { name: 'Congo (RDC)', iso2: 'CD', dialCode: '243' },
  { name: 'Tchad', iso2: 'TD', dialCode: '235' },
  { name: 'République centrafricaine', iso2: 'CF', dialCode: '236' },
  { name: 'Guinée-Bissau', iso2: 'GW', dialCode: '245' },
  { name: 'Guinée équatoriale', iso2: 'GQ', dialCode: '240' },
  { name: 'Sierra Leone', iso2: 'SL', dialCode: '232' },
  { name: 'Liberia', iso2: 'LR', dialCode: '231' },
  { name: 'Gambie', iso2: 'GM', dialCode: '220' },
  { name: 'Cap-Vert', iso2: 'CV', dialCode: '238' },
  { name: 'Mauritanie', iso2: 'MR', dialCode: '222' },
  { name: 'Maroc', iso2: 'MA', dialCode: '212' },
  { name: 'Algérie', iso2: 'DZ', dialCode: '213' },
  { name: 'Tunisie', iso2: 'TN', dialCode: '216' },
  { name: 'Libye', iso2: 'LY', dialCode: '218' },
  { name: 'Égypte', iso2: 'EG', dialCode: '20' },
  { name: 'Kenya', iso2: 'KE', dialCode: '254' },
  { name: 'Ouganda', iso2: 'UG', dialCode: '256' },
  { name: 'Tanzanie', iso2: 'TZ', dialCode: '255' },
  { name: 'Rwanda', iso2: 'RW', dialCode: '250' },
  { name: 'Burundi', iso2: 'BI', dialCode: '257' },
  { name: 'Éthiopie', iso2: 'ET', dialCode: '251' },
  { name: 'Afrique du Sud', iso2: 'ZA', dialCode: '27' },
  { name: 'Zambie', iso2: 'ZM', dialCode: '260' },
  { name: 'Zimbabwe', iso2: 'ZW', dialCode: '263' },
  { name: 'Mozambique', iso2: 'MZ', dialCode: '258' },
  { name: 'Angola', iso2: 'AO', dialCode: '244' },
  { name: 'Madagascar', iso2: 'MG', dialCode: '261' },
  { name: 'Maurice', iso2: 'MU', dialCode: '230' },
  { name: 'France', iso2: 'FR', dialCode: '33' },
  { name: 'Belgique', iso2: 'BE', dialCode: '32' },
  { name: 'Suisse', iso2: 'CH', dialCode: '41' },
  { name: 'Luxembourg', iso2: 'LU', dialCode: '352' },
  { name: 'Canada', iso2: 'CA', dialCode: '1' },
  { name: 'États-Unis', iso2: 'US', dialCode: '1' },
  { name: 'Royaume-Uni', iso2: 'GB', dialCode: '44' },
  { name: 'Irlande', iso2: 'IE', dialCode: '353' },
  { name: 'Allemagne', iso2: 'DE', dialCode: '49' },
  { name: 'Espagne', iso2: 'ES', dialCode: '34' },
  { name: 'Portugal', iso2: 'PT', dialCode: '351' },
  { name: 'Italie', iso2: 'IT', dialCode: '39' },
  { name: 'Pays-Bas', iso2: 'NL', dialCode: '31' },
  { name: 'Autriche', iso2: 'AT', dialCode: '43' },
  { name: 'Suède', iso2: 'SE', dialCode: '46' },
  { name: 'Norvège', iso2: 'NO', dialCode: '47' },
  { name: 'Danemark', iso2: 'DK', dialCode: '45' },
  { name: 'Finlande', iso2: 'FI', dialCode: '358' },
  { name: 'Pologne', iso2: 'PL', dialCode: '48' },
  { name: 'Grèce', iso2: 'GR', dialCode: '30' },
  { name: 'Turquie', iso2: 'TR', dialCode: '90' },
  { name: 'Russie', iso2: 'RU', dialCode: '7' },
  { name: 'Ukraine', iso2: 'UA', dialCode: '380' },
  { name: 'Chine', iso2: 'CN', dialCode: '86' },
  { name: 'Japon', iso2: 'JP', dialCode: '81' },
  { name: 'Corée du Sud', iso2: 'KR', dialCode: '82' },
  { name: 'Inde', iso2: 'IN', dialCode: '91' },
  { name: 'Pakistan', iso2: 'PK', dialCode: '92' },
  { name: 'Émirats arabes unis', iso2: 'AE', dialCode: '971' },
  { name: 'Arabie saoudite', iso2: 'SA', dialCode: '966' },
  { name: 'Qatar', iso2: 'QA', dialCode: '974' },
  { name: 'Liban', iso2: 'LB', dialCode: '961' },
  { name: 'Israël', iso2: 'IL', dialCode: '972' },
  { name: 'Brésil', iso2: 'BR', dialCode: '55' },
  { name: 'Mexique', iso2: 'MX', dialCode: '52' },
  { name: 'Argentine', iso2: 'AR', dialCode: '54' },
  { name: 'Colombie', iso2: 'CO', dialCode: '57' },
  { name: 'Chili', iso2: 'CL', dialCode: '56' },
  { name: 'Australie', iso2: 'AU', dialCode: '61' },
  { name: 'Nouvelle-Zélande', iso2: 'NZ', dialCode: '64' },
];
