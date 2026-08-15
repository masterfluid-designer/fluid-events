# Polices auto-hébergées

Déposez ici les fichiers de police que vous fournissez vous-même, au lieu de
les faire télécharger depuis Google Fonts au moment du build.

## Pourquoi

Les polices actuellement proposées aux organisateurs passent par
`next/font/google`, qui **télécharge les fichiers pendant le build**. Le
13 août 2026, une coupure passagère vers `fonts.gstatic.com` a produit une
image de production sans aucune police embarquée — le site est passé en
polices système sans qu'aucune erreur ne fasse échouer le build. Des fichiers
versionnés dans le dépôt suppriment cette dépendance : le build ne peut plus
échouer à moitié, et le rendu est identique quel que soit le réseau du
serveur.

## Organisation

Un dossier par famille, en minuscules, correspondant à la clé utilisée dans
`lib/event-fonts.ts` :

```
apps/web/fonts/
├── anton/
│   └── Anton-Regular.woff2
├── bebas-neue/
│   └── BebasNeue-Regular.woff2
└── archivo-black/
    └── ArchivoBlack-Regular.woff2
```

**Format recommandé : `.woff2`.** C'est le plus compressé et il est reconnu
par tous les navigateurs actuels. Inutile de fournir aussi `.woff`, `.ttf` ou
`.otf` — ils alourdiraient le dépôt sans bénéfice.

**Nommage :** `NomDeLaFamille-Variante.woff2`, par exemple
`Anton-Regular.woff2`, `Poppins-Bold.woff2`, `Poppins-Italic.woff2`.

## Déclarer une police déposée

Les chemins de `next/font/local` doivent être **écrits en toutes lettres** :
Next.js les analyse à la compilation et ne sait pas parcourir un dossier. Une
police déposée ici n'est donc pas détectée automatiquement — il faut ajouter
sa déclaration dans `apps/web/lib/event-fonts.ts`.

Remplacer une police Google par sa version locale :

```ts
// Avant — téléchargée au build
import { Anton } from 'next/font/google';
const anton = Anton({
  subsets: ['latin'], weight: ['400'],
  variable: '--font-event-anton', preload: false, display: 'swap',
});

// Après — fichier du dépôt
import localFont from 'next/font/local';
const anton = localFont({
  src: '../fonts/anton/Anton-Regular.woff2',
  variable: '--font-event-anton',
  display: 'swap',
});
```

Le reste ne bouge pas : l'entrée correspondante de `EVENT_FONTS` continue
d'exposer `className`, `variableClassName` et `variable`, et l'onglet Thème du
Builder la proposera sans modification.

## Plusieurs variantes d'une même famille

`src` accepte un tableau. Chaque variante doit préciser son poids et son style,
sinon le navigateur synthétisera un faux gras ou un faux italique — plus lourd
visuellement et souvent laid.

```ts
const poppins = localFont({
  src: [
    { path: '../fonts/poppins/Poppins-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/poppins/Poppins-Bold.woff2',    weight: '700', style: 'normal' },
    { path: '../fonts/poppins/Poppins-Italic.woff2',  weight: '400', style: 'italic' },
  ],
  variable: '--font-event-poppins',
  display: 'swap',
});
```

## Licences

Vérifiez que chaque police autorise l'usage web et la redistribution avant de
la verser au dépôt. Les familles actuellement utilisées (Anton, Bebas Neue,
Archivo Black, Poppins, DM Sans, Space Grotesk, Playfair Display, Newsreader)
sont sous SIL Open Font License, qui le permet. Une police sous licence
commerciale ne doit pas être commitée sans les droits correspondants.

## Après dépôt

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build web
```

Vérifier que les polices sont bien embarquées :

```bash
curl -s https://fluidevent.online/ | grep -o '/_next/static/media/[a-zA-Z0-9_-]*\.woff2' | sort -u
```

La commande doit renvoyer au moins une ligne. Si elle ne renvoie rien, le
build n'a pas embarqué de police — c'est précisément le symptôme décrit plus
haut.
