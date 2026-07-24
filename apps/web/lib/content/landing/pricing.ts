/**
 * Contenu de la section Tarifs (landing, id="pricing") — édité à la main,
 * pas depuis l'admin. Consommé par components/concept-antigravity/Pricing.tsx.
 */
export const pricingContent = {
  title: "Tarifs",
  subtitle: "Du premier événement à la programmation régulière.",
  plans: [
    {
      id: "evenement",
      name: "Un événement",
      description:
        "Idéal pour organiser un événement ponctuel, sans engagement ni abonnement.",
      price: "2,5 %",
      unit: "par billet vendu",
      timelineLabel: "Mise en ligne",
      timelineValue: "Immédiate",
      features: [
        "Page événement no-code",
        "Paiement Mobile Money",
        "Scanner PWA illimité",
        "QR codes sécurisés",
        "Support par email",
      ],
      cta: "Créer mon événement",
      featured: false,
    },
    {
      id: "abonnement",
      name: "Abonnement Pro",
      description:
        "Pour les organisateurs réguliers qui veulent plus d'événements et d'analytics.",
      price: "9 900",
      unit: "FCFA / mois",
      timelineLabel: "Engagement",
      timelineValue: "Sans engagement",
      features: [
        "Événements illimités",
        "Tout le plan Un événement",
        "Dashboard analytics avancé",
        "Notifications WhatsApp",
        "Export CSV des participants",
        "Support prioritaire",
      ],
      cta: "S'abonner",
      featured: true,
    },
  ],
};
