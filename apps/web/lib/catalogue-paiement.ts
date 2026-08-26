import { PaymentProviderType } from '@saas-events/types';

/**
 * Catalogue des moyens d'encaissement (2026-08-24).
 *
 * Un organisateur qui découvre la plateforme ne sait pas ce qu'est un
 * « webhook secret », ni où le trouver chez CinetPay. Il ouvrait donc un
 * formulaire de six champs sans savoir quoi y mettre — et repartait.
 *
 * Ce fichier tient la documentation intégrée : ce qu'est chaque fournisseur,
 * comment il se comporte à l'achat, où récupérer chaque identifiant, et les
 * liens vers les tableaux de bord officiels.
 *
 * ⚠️ **Google Pay et Apple Pay y figurent mais ne sont PAS configurables** —
 * et c'est le renseignement le plus utile de la page. Ce sont des
 * portefeuilles qui présentent une carte : ils n'encaissent rien par eux-mêmes
 * et n'ont aucune clé à donner. Stripe Checkout les affiche de lui-même selon
 * le navigateur du visiteur. Les taire aurait laissé chacun les chercher en
 * vain dans la liste.
 */
export type IdentifiantCatalogue = PaymentProviderType | 'GOOGLE_PAY' | 'APPLE_PAY';

export interface ChampIdentifiant {
  /** Le nom du champ dans notre formulaire. */
  champ: string;
  /** Le nom que lui donne le fournisseur, mot pour mot. */
  chezLeFournisseur: string;
  /** Où le trouver, en une phrase. */
  ou: string;
}

export interface FicheProvider {
  id: IdentifiantCatalogue;
  nom: string;
  /** Vrai si l'organisateur peut poser des clés pour ce moyen. */
  configurable: boolean;
  /** Une ligne : ce que c'est. */
  resume: string;
  zone: string;
  moyens: string[];
  devises: string;
  /** Ce que vit l'acheteur, du clic au billet. */
  parcours: string[];
  /** Les identifiants à récupérer, dans l'ordre du formulaire. */
  identifiants: ChampIdentifiant[];
  /** La marche à suivre pour ouvrir le compte et sortir les clés. */
  etapes: string[];
  liens: Array<{ libelle: string; url: string }>;
  /** Ce qui surprend, et qu'on préfère dire avant. */
  aSavoir?: string[];
}

/** L'URL que le fournisseur doit appeler quand un paiement aboutit. */
export function urlWebhook(provider: string, base: string): string {
  return `${base}/api/payments/webhook/${provider.toLowerCase()}`;
}

export const CATALOGUE: FicheProvider[] = [
  {
    id: PaymentProviderType.KKIAPAY,
    nom: 'KkiaPay',
    configurable: true,
    resume:
      'Agrégateur béninois de Mobile Money et de carte bancaire, très répandu en Afrique de l’Ouest francophone.',
    zone: 'Bénin, Côte d’Ivoire, Togo, Sénégal, Burkina Faso',
    moyens: ['MTN Mobile Money', 'Moov Money', 'Orange Money', 'Carte bancaire'],
    devises: 'XOF principalement',
    parcours: [
      'L’acheteur choisit ses billets et clique sur Payer.',
      'Un widget KkiaPay s’ouvre par-dessus votre page — il ne quitte pas votre site.',
      'Il saisit son numéro Mobile Money et valide sur son téléphone.',
      'KkiaPay nous prévient, et le billet part par email.',
    ],
    identifiants: [
      {
        champ: 'Clé publique',
        chezLeFournisseur: 'Public key',
        ou: 'Tableau de bord KkiaPay → Paramètres → API keys',
      },
      {
        champ: 'Clé privée',
        chezLeFournisseur: 'Private key',
        ou: 'Même écran, juste en dessous — ne la partagez jamais',
      },
      {
        champ: 'Secret webhook',
        chezLeFournisseur: 'Secret key',
        ou: 'Même écran ; c’est elle qui signe les notifications de paiement',
      },
    ],
    etapes: [
      'Créez un compte marchand sur app.kkiapay.me et faites vérifier votre identité.',
      'Ouvrez Paramètres → API keys : les trois clés y sont, en mode Test et en mode Live.',
      'Commencez par les clés de TEST et laissez le mode sur « Bac à sable » : vous pourrez acheter un billet fictif de bout en bout.',
      'Collez l’URL de notification indiquée ci-dessous dans Paramètres → Webhooks.',
      'Une fois un achat de test réussi, revenez ici avec les clés Live et passez le mode sur « Production ».',
    ],
    liens: [
      { libelle: 'Tableau de bord KkiaPay', url: 'https://app.kkiapay.me' },
      { libelle: 'Documentation développeur', url: 'https://docs.kkiapay.me' },
    ],
    aSavoir: [
      'Le mode (bac à sable ou production) est un réglage à part : des clés Live avec le mode « bac à sable » ne prendront aucun argent.',
    ],
  },
  {
    id: PaymentProviderType.CINETPAY,
    nom: 'CinetPay',
    configurable: true,
    resume:
      'Agrégateur ivoirien couvrant une large part de l’Afrique de l’Ouest et centrale, en Mobile Money comme en carte.',
    zone: 'Côte d’Ivoire, Sénégal, Cameroun, Mali, Burkina Faso, Togo, Bénin, Guinée, RDC',
    moyens: ['Orange Money', 'MTN Money', 'Moov Money', 'Wave', 'Carte bancaire'],
    devises: 'XOF, XAF, GNF, CDF',
    parcours: [
      'L’acheteur clique sur Payer et part sur une page CinetPay.',
      'Il y choisit son opérateur et valide.',
      'CinetPay le renvoie sur votre page, puis nous notifie.',
      'Le billet part par email dès la notification reçue.',
    ],
    identifiants: [
      {
        champ: 'Identifiant du site',
        chezLeFournisseur: 'site_id',
        ou: 'Back-office CinetPay → Intégrations → votre service marchand',
      },
      {
        champ: 'Clé privée',
        chezLeFournisseur: 'API key',
        ou: 'Même écran — c’est la clé serveur, jamais exposée au navigateur',
      },
      {
        champ: 'Secret webhook',
        chezLeFournisseur: 'Secret Key (HMAC, en-tête x-token)',
        ou: 'Back-office → Paramètres → Sécurité',
      },
    ],
    etapes: [
      'Créez un compte marchand sur cinetpay.com et faites valider votre dossier.',
      'Déclarez un « service marchand » : c’est lui qui porte le site_id.',
      'Relevez l’API key sur le même écran, puis la Secret Key HMAC dans les paramètres de sécurité.',
      'Renseignez l’URL de notification ci-dessous dans la configuration de votre service.',
    ],
    liens: [
      { libelle: 'Back-office CinetPay', url: 'https://admin.cinetpay.com' },
      { libelle: 'Documentation API', url: 'https://docs.cinetpay.com' },
    ],
    aSavoir: [
      'CinetPay n’a pas de réglage « bac à sable » chez nous : ce sont vos clés qui portent le mode, la même adresse servant les deux.',
      'La Secret Key HMAC n’est pas l’API key. Les confondre fait rejeter toutes les notifications, et aucun billet ne part.',
    ],
  },
  {
    id: PaymentProviderType.FEDAPAY,
    nom: 'FedaPay',
    configurable: true,
    resume:
      'Agrégateur béninois, apprécié pour son bac à sable complet et sa mise en route rapide.',
    zone: 'Bénin, Côte d’Ivoire, Togo, Sénégal, Niger, Guinée',
    moyens: ['MTN Mobile Money', 'Moov Money', 'Orange Money', 'Carte bancaire'],
    devises: 'XOF, XAF, GNF',
    parcours: [
      'L’acheteur clique sur Payer et part sur une page FedaPay.',
      'Il choisit son moyen et valide.',
      'FedaPay le renvoie sur votre page, puis nous notifie.',
      'Le billet part par email dès la notification reçue.',
    ],
    identifiants: [
      {
        champ: 'Clé publique',
        chezLeFournisseur: 'Clé publique (pk_…)',
        ou: 'Tableau de bord FedaPay → Paramètres → Clés API',
      },
      {
        champ: 'Clé privée',
        chezLeFournisseur: 'Clé secrète (sk_…)',
        ou: 'Même écran — visible une seule fois à la création',
      },
      {
        champ: 'Secret webhook',
        chezLeFournisseur: 'Signature du webhook',
        ou: 'Tableau de bord → Webhooks, après avoir déclaré l’URL',
      },
    ],
    etapes: [
      'Créez un compte sur fedapay.com — le bac à sable est ouvert tout de suite, sans dossier à faire valider.',
      'Dans Paramètres → Clés API, relevez la paire du mode Sandbox.',
      'Déclarez l’URL de notification ci-dessous dans Webhooks : la signature apparaît alors.',
      'Faites un achat de test complet, puis repassez ici avec les clés Live en mode « Production ».',
    ],
    liens: [
      { libelle: 'Tableau de bord FedaPay', url: 'https://app.fedapay.com' },
      { libelle: 'Documentation', url: 'https://docs.fedapay.com' },
    ],
    aSavoir: [
      'Les clés sandbox et live sont distinctes et ne se mélangent pas : une clé sk_sandbox en mode Production sera refusée.',
    ],
  },
  {
    id: PaymentProviderType.STRIPE,
    nom: 'Stripe',
    configurable: true,
    resume:
      'Le standard international de la carte bancaire. C’est aussi lui qui apporte Google Pay et Apple Pay, sans réglage supplémentaire.',
    zone: 'Mondial — mais l’ouverture d’un compte demande une société dans un pays couvert par Stripe',
    moyens: ['Carte bancaire', 'Google Pay', 'Apple Pay', 'Link'],
    devises: 'Plus de 135, dont XOF (sans décimales)',
    parcours: [
      'L’acheteur clique sur Payer et part sur une page Stripe Checkout.',
      'Selon son navigateur et son téléphone, Stripe lui propose de lui-même Apple Pay ou Google Pay — vous n’avez rien à activer.',
      'Il valide, Stripe le renvoie sur votre page et nous notifie.',
      'Le billet part par email dès la notification reçue.',
    ],
    identifiants: [
      {
        champ: 'Clé privée',
        chezLeFournisseur: 'Secret key (sk_live_… ou sk_test_…)',
        ou: 'Dashboard Stripe → Developers → API keys',
      },
      {
        champ: 'Secret webhook',
        chezLeFournisseur: 'Signing secret (whsec_…)',
        ou: 'Developers → Webhooks → votre endpoint → Signing secret',
      },
    ],
    etapes: [
      'Créez un compte sur stripe.com et renseignez votre société.',
      'Dans Developers → API keys, copiez la Secret key. La clé publiable ne nous sert pas : le paiement est initié côté serveur.',
      'Dans Developers → Webhooks, ajoutez un endpoint pointant sur l’URL ci-dessous et abonnez-le à l’événement checkout.session.completed.',
      'Copiez le Signing secret (whsec_…) que Stripe affiche pour cet endpoint.',
    ],
    liens: [
      { libelle: 'Dashboard Stripe', url: 'https://dashboard.stripe.com' },
      { libelle: 'Clés API', url: 'https://dashboard.stripe.com/apikeys' },
      { libelle: 'Webhooks', url: 'https://dashboard.stripe.com/webhooks' },
    ],
    aSavoir: [
      'Le XOF est une devise sans décimales : nous envoyons les montants tels quels, sans les multiplier par cent. Rien à régler de votre côté.',
      'Sans le Signing secret, nous refusons toutes les notifications — c’est ce qui empêche un tiers de nous annoncer de faux paiements.',
    ],
  },
  {
    id: PaymentProviderType.PAYPAL,
    nom: 'PayPal',
    configurable: true,
    resume:
      'Portefeuille international, utile pour une billetterie qui vend au-delà du continent.',
    zone: 'Mondial',
    moyens: ['Solde PayPal', 'Carte bancaire via PayPal'],
    devises: 'Devises PayPal courantes — le XOF n’en fait pas partie',
    parcours: [
      'L’acheteur clique sur Payer et part sur PayPal.',
      'Il se connecte ou paie par carte en invité.',
      'PayPal le renvoie sur votre page, puis nous notifie.',
      'Le billet part par email dès la notification reçue.',
    ],
    identifiants: [
      {
        champ: 'Clé publique',
        chezLeFournisseur: 'Client ID',
        ou: 'Developer Dashboard → My Apps & Credentials → votre application',
      },
      {
        champ: 'Clé privée',
        chezLeFournisseur: 'Secret',
        ou: 'Même écran, bouton « Show » à côté du secret',
      },
      {
        champ: 'Secret webhook',
        chezLeFournisseur: 'Webhook ID',
        ou: 'Même application → Webhooks, après avoir déclaré l’URL',
      },
    ],
    etapes: [
      'Créez un compte professionnel, puis une application sur developer.paypal.com.',
      'Relevez le Client ID et le Secret de l’application — attention au bandeau Sandbox / Live, ce sont deux jeux distincts.',
      'Ajoutez un webhook pointant sur l’URL ci-dessous, abonné à CHECKOUT.ORDER.APPROVED et PAYMENT.CAPTURE.COMPLETED.',
      'Copiez le Webhook ID que PayPal affiche : c’est lui qui va dans le champ « Secret webhook ».',
    ],
    liens: [
      { libelle: 'Developer Dashboard', url: 'https://developer.paypal.com/dashboard' },
      { libelle: 'Documentation Orders API', url: 'https://developer.paypal.com/docs/api/orders/v2/' },
    ],
    aSavoir: [
      'Le champ « Secret webhook » attend un Webhook ID, pas une clé secrète : nous vérifions chaque notification en rappelant PayPal avec cet identifiant.',
      'PayPal ne traite pas le XOF. Une billetterie libellée en francs CFA doit passer par un autre fournisseur.',
    ],
  },
  {
    id: 'GOOGLE_PAY',
    nom: 'Google Pay',
    configurable: false,
    resume:
      'Portefeuille Google. Il ne s’ajoute pas ici : il arrive tout seul avec Stripe.',
    zone: 'Là où Google Pay est disponible',
    moyens: ['Cartes enregistrées dans le compte Google de l’acheteur'],
    devises: 'Celles de Stripe',
    parcours: [
      'L’acheteur arrive sur la page Stripe Checkout.',
      'Si son navigateur porte une carte Google Pay, Stripe lui propose le bouton de lui-même.',
      'Il valide en une touche, sans saisir de numéro.',
    ],
    identifiants: [],
    etapes: [
      'Configurez Stripe sur cet événement.',
      'C’est tout : Google Pay apparaît de lui-même chez les acheteurs qui l’ont.',
    ],
    liens: [{ libelle: 'Ce que Stripe en dit', url: 'https://stripe.com/docs/payments/google-pay' }],
    aSavoir: [
      'Google Pay ne prend pas l’argent : il présente une carte. C’est pourquoi il n’a ni compte marchand ni clés, et n’apparaît pas dans la liste à configurer.',
    ],
  },
  {
    id: 'APPLE_PAY',
    nom: 'Apple Pay',
    configurable: false,
    resume:
      'Portefeuille Apple. Comme Google Pay, il arrive avec Stripe et ne se configure pas ici.',
    zone: 'Là où Apple Pay est disponible',
    moyens: ['Cartes enregistrées dans le compte Apple de l’acheteur'],
    devises: 'Celles de Stripe',
    parcours: [
      'L’acheteur arrive sur la page Stripe Checkout depuis Safari, un iPhone ou un Mac.',
      'Stripe lui propose le bouton Apple Pay de lui-même.',
      'Il valide par Face ID ou Touch ID.',
    ],
    identifiants: [],
    etapes: [
      'Configurez Stripe sur cet événement.',
      'Apple Pay apparaît de lui-même sur les appareils Apple compatibles.',
    ],
    liens: [{ libelle: 'Ce que Stripe en dit', url: 'https://stripe.com/docs/apple-pay' }],
    aSavoir: [
      'Le domaine doit être vérifié côté Stripe pour un bouton Apple Pay hors Checkout. Notre tunnel passe par Checkout, où Stripe s’en charge.',
    ],
  },
];

export const FICHES_CONFIGURABLES = CATALOGUE.filter((f) => f.configurable);

export function fiche(id: IdentifiantCatalogue): FicheProvider | undefined {
  return CATALOGUE.find((f) => f.id === id);
}
