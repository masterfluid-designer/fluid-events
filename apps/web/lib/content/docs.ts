/**
 * Contenu de la page /docs — édité à la main, pas depuis l'admin.
 * Consommé par app/docs/page.tsx.
 */
export const docsContent = {
  badge: "DOCUMENTATION",
  title: "Démarrer avec Fluid Events",
  intro:
    "Cette documentation vous guide dans le parcours complet : créer une page événement, vendre des tickets, encaisser et contrôler les entrées.",
  helpBlock: {
    title: "Besoin d'un accompagnement ?",
    text: "Le support peut vous aider à préparer un premier événement ou à tester le parcours scanner avant le jour J.",
    linkLabel: "Contacter le support",
  },
  sections: [
    {
      title: "Créer un événement",
      body: "Configurez le titre, les dates, l'image, les quotas scanner et la page publique de vente.",
    },
    {
      title: "Vendre des billets",
      body: "Ajoutez vos catégories, prix, stocks et limites par commande. Fluid Events protège le stock contre la survente.",
    },
    {
      title: "Encaisser localement",
      body: "Activez Kkiapay, CinetPay ou FedaPay pour accepter Mobile Money et cartes selon votre marché.",
    },
    {
      title: "Scanner les entrées",
      body: "Invitez vos agents scanner et utilisez la PWA pour valider les QR codes à l'entrée.",
    },
  ],
};
