/**
 * Contenu des pages légales et institutionnelles.
 *
 * ⚠️ Les valeurs marquées `À COMPLÉTER` sont des informations d'identité
 * juridique que seul l'exploitant peut fournir — elles ne peuvent pas être
 * devinées ni inventées. Tant qu'elles ne sont pas renseignées, les mentions
 * légales sont incomplètes au regard de la loi (obligation d'identification
 * de l'éditeur pour tout site marchand).
 *
 * Centralisé ici plutôt que dans le JSX pour que la relecture juridique se
 * fasse sur un seul fichier, sans toucher aux composants.
 */

export const TO_FILL = 'À COMPLÉTER';

/** Identité de l'éditeur — à renseigner avant toute exploitation commerciale. */
export const publisher = {
  legalName: 'Fluid Events',
  legalForm: 'PME',
  address: '63 Rue galinas bè pas desouza, lomé, Togo',
  registration: '123456789',
  director: "Eric KOUASSI",
  email: 'contact@fluidevent.online',
  phone: "987654321",
};

export const host = {
  name: 'Hostinger International Ltd.',
  address: '61 Lordou Vironos Street, 6023 Larnaca, Chypre',
  site: 'https://www.hostinger.fr',
};

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export const aboutContent = {
  eyebrow: 'À propos',
  title: 'La billetterie pensée pour les événements africains',
  intro:
    "Fluid Events est une plateforme de billetterie en ligne conçue pour les organisateurs d'événements en Afrique de l'Ouest : concerts, festivals, conférences et soirées privées.",
  sections: [
    {
      heading: 'Ce que fait la plateforme',
      paragraphs: [
        "Un organisateur crée sa page d'événement, définit ses catégories de billets et ouvre la vente. Les visiteurs achètent en ligne et reçoivent un billet numérique contenant un QR code. À l'entrée, une application de scan valide chaque billet et bloque les doublons.",
      ],
      bullets: [
        'Page publique personnalisable, sans compétence technique',
        'Paiement par Mobile Money et carte bancaire',
        'Billet numérique envoyé par email, avec QR code sécurisé',
        "Contrôle d'accès par scan, utilisable hors connexion instable",
        'Suivi des ventes en temps réel',
      ],
    },
    {
      heading: 'Paiements',
      paragraphs: [
        "Les paiements sont traités par des prestataires agréés — Kkiapay, CinetPay et FedaPay. Aucune donnée de carte bancaire ne transite par nos serveurs, et aucune n'y est stockée : la saisie se fait toujours chez le prestataire de paiement.",
      ],
    },
    {
      heading: 'Contact',
      paragraphs: [
        `Pour toute question sur un événement, un billet ou un remboursement, écrivez à ${publisher.email}. Les demandes liées à un événement précis sont transmises à son organisateur, qui en est responsable.`,
      ],
    },
  ] satisfies LegalSection[],
};

export const legalNoticeContent = {
  eyebrow: 'Mentions légales',
  title: 'Mentions légales',
  intro: "Informations relatives à l'éditeur et à l'hébergeur du site fluidevent.online.",
  sections: [
    {
      heading: 'Éditeur du site',
      paragraphs: [
        `Dénomination sociale : ${publisher.legalName}`,
        `Forme juridique : ${publisher.legalForm}`,
        `Siège social : ${publisher.address}`,
        `Immatriculation : ${publisher.registration}`,
        `Directeur de la publication : ${publisher.director}`,
        `Email : ${publisher.email}`,
        `Téléphone : ${publisher.phone}`,
      ],
    },
    {
      heading: 'Hébergeur',
      paragraphs: [`${host.name}`, `${host.address}`, `${host.site}`],
    },
    {
      heading: 'Propriété intellectuelle',
      paragraphs: [
        "La structure du site, son code et ses éléments graphiques sont la propriété de l'éditeur. Les contenus publiés par les organisateurs sur leurs pages d'événement (textes, visuels, programmations) restent la propriété de leurs auteurs respectifs, qui en assument seuls la responsabilité.",
      ],
    },
    {
      heading: 'Responsabilité',
      paragraphs: [
        "Fluid Events fournit un outil technique de billetterie. Chaque événement est organisé sous la responsabilité exclusive de son organisateur, qui répond de la tenue de l'événement, de son contenu et des informations qu'il publie. En cas d'annulation ou de modification d'un événement, l'organisateur est l'interlocuteur des acheteurs.",
      ],
    },
  ] satisfies LegalSection[],
};

export const privacyContent = {
  eyebrow: 'Confidentialité',
  title: 'Politique de confidentialité',
  intro:
    'Cette page décrit les données que nous collectons, pourquoi nous les collectons, et les droits dont vous disposez.',
  sections: [
    {
      heading: 'Données collectées',
      paragraphs: ['Nous collectons uniquement ce qui est nécessaire au fonctionnement de la billetterie :'],
      bullets: [
        'Compte : adresse email, nom et photo de profil transmis par Google lors de la connexion',
        'Commande : billets achetés, montant, date, statut du paiement',
        "Téléphone : uniquement si vous le renseignez, pour l'envoi des billets par SMS ou WhatsApp",
        "Contrôle d'accès : date et heure du scan de votre billet à l'entrée",
      ],
    },
    {
      heading: 'Ce que nous ne collectons pas',
      paragraphs: [
        "Aucune donnée de carte bancaire n'est collectée ni stockée par Fluid Events. La saisie du moyen de paiement se fait intégralement chez le prestataire agréé, qui ne nous transmet que le résultat de la transaction.",
        "Nous n'utilisons pas de traceur publicitaire et ne revendons aucune donnée.",
      ],
    },
    {
      heading: 'Pourquoi ces données',
      paragraphs: [
        "Vous authentifier, émettre et vous transmettre vos billets, permettre leur validation à l'entrée, et fournir à l'organisateur les statistiques de vente de son événement.",
      ],
    },
    {
      heading: 'Qui y a accès',
      paragraphs: [
        "L'organisateur de l'événement pour lequel vous avez acheté un billet accède à la liste de ses participants. Les personnes chargées du contrôle à l'entrée voient uniquement le nom et le type de billet au moment du scan — jamais votre email ni votre téléphone.",
      ],
    },
    {
      heading: 'Durée de conservation',
      paragraphs: [
        "Les données de commande sont conservées le temps nécessaire au suivi de l'événement et aux obligations comptables. Un compte resté inactif et sans commande est supprimé automatiquement.",
      ],
    },
    {
      heading: 'Vos droits',
      paragraphs: [
        `Vous pouvez demander l'accès, la rectification ou la suppression de vos données en écrivant à ${publisher.email}. Vous pouvez également consulter et télécharger vos billets à tout moment depuis votre espace personnel.`,
      ],
    },
    {
      heading: 'Cookies',
      paragraphs: [
        "Le site dépose uniquement des cookies strictement nécessaires : ceux qui maintiennent votre session une fois connecté. Aucun cookie de mesure d'audience ou de publicité n'est utilisé.",
      ],
    },
  ] satisfies LegalSection[],
};

export const termsContent = {
  eyebrow: 'Conditions',
  title: "Conditions générales d'utilisation et de vente",
  intro:
    "Ces conditions encadrent l'utilisation de la plateforme Fluid Events et l'achat de billets par son intermédiaire.",
  sections: [
    {
      heading: 'Rôle de la plateforme',
      paragraphs: [
        "Fluid Events est un intermédiaire technique. Le contrat de vente d'un billet est conclu entre l'acheteur et l'organisateur de l'événement. Fluid Events n'est ni producteur ni coorganisateur des événements diffusés sur la plateforme.",
      ],
    },
    {
      heading: 'Achat et validité du billet',
      paragraphs: [
        "Un billet est valide dès confirmation du paiement par le prestataire. Il vous est transmis par email sous forme de fichier contenant un QR code.",
        "Chaque QR code n'est valable que pour une seule entrée. Toute tentative de réutilisation, de duplication ou de revente non autorisée entraîne le refus d'accès, sans remboursement.",
      ],
    },
    {
      heading: 'Prix et paiement',
      paragraphs: [
        "Les prix sont indiqués en francs CFA (XOF), toutes taxes comprises, et fixés par l'organisateur. Le paiement s'effectue par Mobile Money ou carte bancaire auprès d'un prestataire agréé.",
      ],
    },
    {
      heading: 'Annulation et remboursement',
      paragraphs: [
        "Conformément à l'usage en matière de billetterie de spectacle, les billets ne sont ni repris ni échangés.",
        "En cas d'annulation de l'événement par l'organisateur, les modalités de remboursement relèvent de ce dernier. Fluid Events transmet la demande mais ne peut se substituer à l'organisateur.",
      ],
    },
    {
      heading: 'Obligations des organisateurs',
      paragraphs: [
        "L'organisateur garantit détenir les autorisations nécessaires à la tenue de son événement et répond de l'exactitude des informations publiées. Tout contenu illicite, trompeur ou portant atteinte aux droits de tiers entraîne la suspension immédiate de la page d'événement.",
      ],
    },
    {
      heading: 'Perte de billet',
      paragraphs: [
        "Un billet égaré peut être renvoyé depuis la page « J'ai perdu mes billets », à partir du numéro de commande et de l'adresse email utilisée lors de l'achat.",
      ],
    },
  ] satisfies LegalSection[],
};
