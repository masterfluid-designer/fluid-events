import { DEFAULT_COLOR_THEME } from '@/lib/color-themes';
import type { Metadata } from "next";
import localFont from "next/font/local";

import "./globals.css";
import { Providers } from "@/components/providers";

// Fichiers versionnés (apps/web/fonts/) plutôt que téléchargés au build : une
// coupure passagère vers fonts.gstatic.com a déjà produit une image de
// production incomplète sans faire échouer le build. Voir lib/event-fonts.ts.
// Les fichiers variables couvrent toutes les graisses en un seul fichier.
const fontSans = localFont({
  src: [
    { path: "../fonts/Inter/Inter-VariableFont_opsz,wght.woff2", style: "normal" },
    { path: "../fonts/Inter/Inter-Italic-VariableFont_opsz,wght.woff2", style: "italic" },
  ],
  variable: "--font-sans",
});

// Serif du site (--font-serif). Playfair Display remplace Newsreader, qui
// était la dernière police encore téléchargée au build : plus aucun appel à
// fonts.gstatic.com pendant la compilation, donc plus de build capable de
// réussir en produisant une image sans polices.
const fontSerif = localFont({
  src: [
    { path: "../fonts/Playfair_Display/PlayfairDisplay-VariableFont_wght.woff2", style: "normal" },
    { path: "../fonts/Playfair_Display/PlayfairDisplay-Italic-VariableFont_wght.woff2", style: "italic" },
  ],
  variable: "--font-serif",
});

// Titres de la landing (Hero, sections, etc.) — pas le sans-serif par défaut
// du site, voir globals.css --font-space-grotesk.
const fontSpaceGrotesk = localFont({
  src: "../fonts/Space_Grotesk/SpaceGrotesk-VariableFont_wght.woff2",
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: "Fluid Events — SaaS Événementiel & Billetterie",
  description:
    "Créez, vendez et contrôlez l'accès à vos événements. Paiement Mobile Money, billetterie QR, scanner PWA.",
  // Icône dynamique (page Branding Admin, 2026-07-17) — coexiste avec le
  // favicon.ico statique, servi en repli par les navigateurs qui ne
  // supportent pas les favicons SVG.
  icons: { icon: { url: "/brand/icon", type: "image/svg+xml" } },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      // Thème par défaut posé côté SERVEUR : `ColorThemeProvider` ne lit
      // localStorage qu’après le montage, et sans cet attribut la première
      // peinture utiliserait les couleurs de base avant de basculer — un
      // clignotement à chaque chargement pour qui n’a jamais choisi de thème.
      data-color-theme={DEFAULT_COLOR_THEME}
      className={`${fontSans.variable} ${fontSerif.variable} ${fontSpaceGrotesk.variable} font-sans antialiased`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
