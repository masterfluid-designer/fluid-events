import { CreditCard, Rocket, BarChart3, Palette, QrCode } from "lucide-react";

/**
 * Contenu de la section Blog (landing) — édité à la main, pas depuis
 * l'admin. Consommé par components/concept-antigravity/BlogCarousel.tsx.
 *
 * Chaque article n'a pour l'instant ni image ni lien réel (icon + dégradé
 * en guise de visuel, href="#") — ajoute `imageUrl`/`linkUrl` ici le jour où
 * de vrais articles existent, et mets à jour BlogCarousel.tsx en conséquence.
 */
export const blogContent = {
  eyebrow: "Blog",
  title: "Dernières actualités",
  viewMoreLabel: "Voir plus de blog",
  readLabel: "Lire l'article",
  posts: [
    {
      id: "paiements-unifies",
      icon: CreditCard,
      gradient: "from-primary via-orange-500 to-amber-400",
      category: "Produit",
      date: "21 juil. 2026",
      title: "Kkiapay, CinetPay, FedaPay : trois moyens d'encaissement, un seul flux",
    },
    {
      id: "digital-africa-summit",
      icon: Rocket,
      gradient: "from-sky-500 via-blue-600 to-indigo-600",
      category: "Événement",
      date: "14 juil. 2026",
      title: "Fluid Events au Digital Africa Summit 2026",
    },
    {
      id: "dashboard-analytics",
      icon: BarChart3,
      gradient: "from-emerald-500 via-teal-500 to-cyan-500",
      category: "Produit",
      date: "3 juil. 2026",
      title: "Nouveau : dashboard analytics en temps réel",
    },
    {
      id: "guide-no-code",
      icon: Palette,
      gradient: "from-fuchsia-500 via-purple-500 to-violet-600",
      category: "Guide",
      date: "26 juin 2026",
      title: "Composer votre première page événement en no-code",
    },
    {
      id: "scanner-rapide",
      icon: QrCode,
      gradient: "from-rose-500 via-red-500 to-orange-500",
      category: "Produit",
      date: "18 juin 2026",
      title: "Scanner PWA : valider 500 billets en moins d'une minute",
    },
  ],
};
