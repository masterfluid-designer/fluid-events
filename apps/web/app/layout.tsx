import type { Metadata } from "next";
import { Inter, Newsreader, Space_Grotesk } from "next/font/google";

import "./globals.css";
import { Providers } from "@/components/providers";

const fontSans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});

const fontSerif = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-serif",
});

// Réservée à la page concept /concept/antigravity (titres) — pas le sans-serif
// par défaut du site, voir globals.css --font-space-grotesk.
const fontSpaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
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
      className={`${fontSans.variable} ${fontSerif.variable} ${fontSpaceGrotesk.variable} font-sans antialiased`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
