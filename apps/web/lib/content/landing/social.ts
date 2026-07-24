/**
 * Contenu éditable du footer — tagline, email de contact, texte newsletter
 * et liens réseaux sociaux. Édité à la main, pas depuis l'admin. Consommé
 * par components/Footer/index.tsx.
 *
 * Les 3 réseaux sont à "#" (aucun lien réel pour l'instant) — remplace par
 * les vraies URLs Facebook/Twitter (X)/LinkedIn dès qu'elles existent.
 */
export const footerContent = {
  tagline:
    "Plateforme de billetterie et gestion d'événements pour l'Afrique. Paiement Mobile Money, scanner QR, no-code builder.",
  contactEmail: "hello@fluidevents.africa",
  newsletterText: "Recevez nos actualités et mises à jour.",
  social: {
    facebookUrl: "#",
    twitterUrl: "#",
    linkedinUrl: "#",
  },
};
