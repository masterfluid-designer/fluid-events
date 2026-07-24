import { Palette, QrCode, CreditCard, BarChart3 } from "lucide-react";

/**
 * Contenu de la section Fonctionnalités (landing, id="features") — édité à
 * la main, pas depuis l'admin. Consommé par
 * components/concept-antigravity/Showcase.tsx.
 */
export const featuresContent = {
  panels: [
    {
      id: "builder",
      icon: Palette,
      title: "No-code Builder",
      description:
        "Composez la page de votre événement par blocs. Hero, description, galerie — sans écrire une ligne de code.",
      glow: "from-primary/40 via-primary/10 to-transparent",
    },
    {
      id: "scanner",
      icon: QrCode,
      title: "Scanner PWA",
      description:
        "Transformez n'importe quel téléphone en scanner de billets QR. Installation en 1 clic, fonctionne hors ligne.",
      glow: "from-emerald-500/30 via-emerald-500/10 to-transparent",
    },
    {
      id: "payments",
      icon: CreditCard,
      title: "Paiements Mobile Money",
      description:
        "Kkiapay, CinetPay, FedaPay — acceptez les paiements que vos clients utilisent vraiment.",
      glow: "from-amber-500/30 via-amber-500/10 to-transparent",
    },
    {
      id: "dashboard",
      icon: BarChart3,
      title: "Dashboard temps réel",
      description:
        "Suivez vos ventes, scans et revenus en direct. Export CSV des participants.",
      glow: "from-sky-500/30 via-sky-500/10 to-transparent",
    },
  ],
};
