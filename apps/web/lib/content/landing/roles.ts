import { PartyPopper, ScanLine, Ticket } from "lucide-react";

/**
 * Contenu de la section "Pensé pour chaque rôle" (landing) — édité à la
 * main, pas depuis l'admin. Consommé par
 * components/concept-antigravity/RolesCarousel.tsx.
 */
export const rolesContent = {
  eyebrow: "Pensé pour chaque rôle",
  title: "Une expérience pensée pour chacun",
  roles: [
    {
      id: "organisateur",
      icon: PartyPopper,
      title: "Organisateur",
      description:
        "Créez votre événement, composez votre page en no-code et encaissez en Mobile Money dès la première vente.",
      gradient: "from-primary/30 to-transparent",
    },
    {
      id: "scanner",
      icon: ScanLine,
      title: "Agent scanner",
      description:
        "Validez les entrées avec n'importe quel téléphone. Fonctionne hors ligne, aucune formation nécessaire.",
      gradient: "from-emerald-500/30 to-transparent",
    },
    {
      id: "client",
      icon: Ticket,
      title: "Client",
      description:
        "Achetez en Mobile Money, recevez votre billet QR instantanément par email ou WhatsApp.",
      gradient: "from-sky-500/30 to-transparent",
    },
  ] satisfies Array<{
    id: string;
    icon: typeof PartyPopper;
    title: string;
    description: string;
    gradient: string;
  }>,
};
