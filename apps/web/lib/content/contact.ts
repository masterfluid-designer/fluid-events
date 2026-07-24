/**
 * Contenu de la page /contact et du formulaire partagé — édité à la main,
 * pas depuis l'admin. Consommé par app/contact/page.tsx et
 * components/landing/Contact.tsx (ce dernier est aussi réutilisé, avec un
 * eyebrow/titre/description différents, par app/support/page.tsx — voir
 * lib/content/support.ts).
 */
export const contactPageContent = {
  eyebrow: "CONTACT",
  title: "Parlez-nous de votre prochain événement",
  description:
    "Concert, conférence, festival ou soirée privée : dites-nous ce que vous préparez, nous vous aidons à choisir le bon parcours de billetterie.",
};

export const contactFormContent = {
  formHeading: "Envoyer un message",
  placeholders: {
    name: "Nom complet",
    email: "Adresse email",
    subject: "Sujet",
    phone: "Téléphone",
    message: "Message",
  },
  consentText:
    "En envoyant ce message, vous acceptez d'être recontacté au sujet de Fluid Events.",
  submitLabel: "Envoyer",
  sidebarHeading: "Nous trouver",
  location: { label: "Localisation", value: "Abidjan, Côte d'Ivoire" },
  email: { label: "Email", value: "hello@fluidevents.africa" },
  quickNeed: {
    heading: "Besoin rapide ?",
    text: "Support organisateur, onboarding paiement et accompagnement scanner.",
  },
};
