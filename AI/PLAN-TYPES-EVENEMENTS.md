# PLAN-TYPES-ÉVÉNEMENTS.md — Trois types d'événements & multi-événement Premium

> **Plan d'exécution validé le 2026-08-21**, avant toute ligne de code. Chaque
> décision qu'il contient a été tranchée par le porteur du produit ; les
> alternatives écartées sont conservées avec leur motif, pour qu'une bonne
> intention future ne les réintroduise pas sans savoir pourquoi elles ont été
> écartées.
>
> Ce document a une durée de vie : quand les lots seront livrés, leur récit
> rejoindra `ROADMAP.md` et celui-ci ne servira plus qu'à retrouver le
> raisonnement.

---

## 1. Ce qu'on ajoute

Trois régimes d'accès, là où le produit n'en connaît qu'un :

| Type | Compte client | Billetterie | Ce que voit le visiteur |
|---|:--:|:--:|---|
| `RSVP` | non | non | Un formulaire d'inscription. Un seul bouton dans l'en-tête : « S'inscrire ». |
| `TICKETED_GUEST` | non | oui | Il achète et reçoit son billet par email. Pas de « Mon billet », pas de connexion. |
| `TICKETED_ACCOUNT` | oui | oui | Le parcours actuel, inchangé. **Défaut.** |

```prisma
enum EventAccessMode {
  RSVP
  TICKETED_GUEST
  TICKETED_ACCOUNT
}
```

`TICKETED_ACCOUNT` par défaut : **aucun événement existant ne change de
comportement à la migration**. La production vend des billets pendant qu'on
travaille — c'est la contrainte qui prime sur toutes les autres.

Et, transversalement : un manager **Premium peut porter jusqu'à 8 événements**,
de types librement différents.

---

## 2. Décisions d'architecture

### 2.1 L'option GUEST ne supprime pas le compte, elle le rend invisible

`Order.clientId` est **non nullable** et pointe vers `User`. Tout le tunnel est
en `@Roles(Role.CLIENT)`, et le scan, la rétention, l'analytique et l'export des
participants en dépendent.

**Écarté — rendre `clientId` nullable.** Il faudrait écrire un
`if (client === null)` dans chacun de ces chemins. Chaque `if` oublié est une
commande orpheline, ou pire, une commande visible par quelqu'un d'autre.

**Retenu — le compte fantôme.** À l'achat, on crée (ou retrouve par email) un
`User` CLIENT avec `passwordHash = null`, `googleId = null`, marqué `isGuest`.
Le visiteur ne voit ni login ni mot de passe : son billet arrive par email avec
un **lien signé** `/t/<jeton>` donnant accès à ce seul billet, jamais au
tableau de bord.

Le scanner, l'export, la rétention, les remboursements et l'analytique
continuent de fonctionner sans une ligne de changement.

Trois conséquences :

- « Mon billet » disparaît de l'en-tête, **imposé par le type** et non par la
  case `headerShowMyTicket` : un réglage se décoche par erreur, un type non.
- Si la personne se connecte plus tard avec Google sur le même email, **on
  fusionne** — elle récupère ses billets. C'est un gain, pas un risque.
- ⚠️ Vérifier que le `PhoneVerificationGate` ne se déclenche pas sur ces
  comptes. Il visait Client *et* Manager à l'origine, et son unique canal
  (WhatsApp Cloud API) est toujours hors service faute de template approuvé
  côté Meta. Un acheteur invité bloqué sur un overlay infranchissable serait
  le bug du 2026-08-16, en pire : cette fois il aurait payé.

### 2.2 L'option RSVP n'est pas une billetterie à 0 F

**Écarté — un billet gratuit réutilisant le tunnel.** Cela fabriquerait des
`Order`, des `OrderItem`, des QR et des PDF pour rien (file BullMQ, stockage
S3), ferait apparaître des « ventes à 0 F » dans l'analytique du manager, et
n'éviterait pas d'écrire le formulaire de toute façon.

**Retenu — une table dédiée.**

```prisma
model Registration {
  id, eventId, firstName, lastName, phone, email,
  extraLabel?, extraValue?,      // le champ libre, voir 2.3
  createdAt, source
  @@unique([eventId, email])
}
```

Ni `User`, ni `Order`. La page participants du manager les affiche et les
exporte — l'export CSV existe déjà côté navigateur, il suffit de l'alimenter.

Le formulaire est public et non authentifié : unicité `(eventId, email)`,
limitation de débit par IP, champ piège. **Pas de CAPTCHA** — sur l'inscription
à une soirée, il coûte plus d'inscrits qu'il n'arrête de robots.

### 2.3 Décisions produit tranchées le 2026-08-21

| Question | Décision | Motif |
|---|---|---|
| Confirmation RSVP | **Email, sans QR** | À l'entrée, l'accueil pointe les noms. Aucun PDF, aucune file, aucun stockage. |
| Champs du formulaire | **Figés + un champ libre optionnel** | Prénom, nom, téléphone, email, plus un champ que le manager active et nomme. Un formulaire entièrement configurable est un chantier à part : validation, stockage dynamique, export à colonnes variables. |
| Livraison du billet GUEST | **Email seul** | WhatsApp reste indisponible tant que le template Meta n'est pas approuvé. Bâtir dessus livrerait une fonctionnalité morte. |
| Changement de type après publication | **Oui, sauf commande payée** | Voir §4. |

---

## 3. Modules du Builder par type

| Bloc | RSVP | GUEST | ACCOUNT |
|---|:--:|:--:|:--:|
| `hero`, `text`, `image`, `video`, `gallery`, `faq`, `schedule`, `speakers`, `sponsors`, `timeline`, `testimonials`, `html`, `location`, `countdown` | ✅ | ✅ | ✅ |
| `tickets` | ❌ | ✅ | ✅ |
| `registration` *(nouveau, unique, imposé)* | ✅ | ❌ | ❌ |

**Règle qui garantit qu'aucune donnée n'est perdue : la palette filtre, le
rendu ignore, rien n'est supprimé.** Un événement qui passe de billetterie à
RSVP garde son bloc `tickets` en base — il n'est simplement plus proposé ni
rendu. Retour en arrière : la page revient à l'identique.

`registration` rejoint `SINGLETON_BLOCK_TYPES`. Il rend deux colonnes : titre +
description + liste à puces d'un côté, formulaire de l'autre. En RSVP,
l'en-tête se réduit à un bouton « S'inscrire » qui ancre vers le formulaire, et
le pied de page à sa version minimale.

---

## 4. Changement de type

**a. Rien n'est jamais détruit.** Changer de type change un champ. Blocs,
billets, commandes et inscriptions restent en base.

**b. Une seule bascule est interdite :**

| De → vers | Verdict |
|---|---|
| ACCOUNT → GUEST | Libre — on retire une exigence, les comptes existants marchent |
| GUEST → ACCOUNT | Libre — les liens signés déjà émis restent valides |
| RSVP → billetterie | Libre — les inscriptions restent consultables et exportables |
| billetterie → RSVP | **Bloqué s'il existe une commande `PAID`** |

Retirer sa page d'accès à quelqu'un qui a payé n'est pas rattrapable.

**c. Une trace.** `AuditService` existe : chaque bascule y est consignée avec
qui, quand, d'où vers où, et combien de commandes et d'inscriptions existaient
à ce moment. Sans cela, un manager qui bascule deux fois n'a aucun recours.

**d. Un écran de confirmation chiffré**, jamais un avertissement générique :
« 12 inscriptions seront conservées et resteront exportables ; le bloc
Billetterie sera masqué, pas supprimé ».

---

## 5. Multi-événement Premium

### 5.1 Le couplage réel, mesuré

Le `@@unique` sur `Event.managerId` fait peur ; le couplage est en surface :

- **5 requêtes** font `event.findUnique({ where: { managerId } })` (builder,
  events ×3, scanner-admin).
- Côté web, tout passe par `/api/events/mine`, `/api/builder/mine`,
  `/api/events/mine/overview`.
- `Ticket`, `Order`, `Scanner`, `EventPage`, `EventAnalytics` et
  `PaymentProviderConfig` sont **déjà** rattachés à `eventId`.

Il n'y a donc pas de dénormalisation à défaire : c'est un verrou posé en
surface, pas une hypothèse infusée dans les données.

### 5.2 L'événement vit dans l'URL, pas dans un état caché

**Livré le 2026-08-21 sous une forme voisine** : l'événement voyage dans
l'URL en paramètre de requête — `/manager/tickets?event=<id>` — et non dans
le chemin (`/manager/e/<id>/tickets`) comme annoncé ici.

Ce qui comptait est acquis : chaque onglet garde son contexte, un lien envoyé
à un collègue ouvre bien ce qu'on lui montrait, et rien n'est mémorisé
globalement. Déplacer l'arborescence complète des routes aurait coûté la
réécriture de huit pages pour la même propriété — la différence est
cosmétique, le prix ne l’était pas.

**Écarté — un `User.activeEventId` avec les écrans inchangés**, malgré son coût
plus faible : avec un événement « actif » global, ouvrir deux onglets sur deux
événements fait que le second écrase le contexte du premier, et le manager
édite la billetterie du mauvais événement sans le voir. Sur un produit qui
manipule des stocks et des prix, c'est inacceptable.

`/mine` est conservé comme alias résolvant vers l'unique événement quand il n'y
en a qu'un : **les managers non-Premium ne voient aucun changement**. Les 5
`findUnique` passent par un helper unique
`resoudreEvenementDuManager(user, eventId)` — un seul contrôle d'appartenance,
plutôt que cinq copies.

### 5.3 Les limites viennent de l'abonnement

```prisma
enum SubscriptionPlan { FREE, PREMIUM }
User.plan SubscriptionPlan @default(FREE)
```

```ts
export const LIMITES_PLAN = {
  FREE:    { maxEvenements: 1, maxScannersParEvenement: 3, multiJours: false },
  PREMIUM: { maxEvenements: 8, maxScannersParEvenement: 6, multiJours: true  },
};
```

Les limites vivent **en code**, pas en base : un changement d'offre imposerait
sinon une migration de données et laisserait les valeurs dériver d'un abonné à
l'autre.

**`isPremium` disparaît**, migré en `plan = PREMIUM`. Le garder en parallèle
créerait deux sources de vérité qui divergent — le piège déjà documenté entre
`isPremium` et `subscriptionActive`. À ce jour `isPremium` ne commande qu'une
seule chose, le multi-jours (`events.service.ts:139`) : c'est le bon moment
pour poser la structure, avant qu'un troisième privilège ne s'y accroche.

**⚠️ `Event.maxScanners` ne limite rien aujourd'hui.** Zéro occurrence hors de
sa déclaration : la colonne vaut `3` partout et personne ne la lit. Un manager
peut créer autant de comptes scanner qu'il veut. « 6 pour les Premium » ne
consiste donc pas à changer une limite, mais à **l'implémenter** — dans
`scanner-admin.service.ts`, à l'invitation comme à la promotion d'un client,
côté serveur.

La colonne devient **nullable** : `null` = suivre le plan, une valeur = cas
particulier accordé par l'Admin (un festival qui a besoin de 12 agents) sans
toucher à l'offre. Migration : passer à `NULL` les valeurs restées à `3`, sinon
les événements d'un manager qui passe Premium resteraient bloqués à 3.

### 5.4 La rétrogradation ne détruit rien

Un manager qui redescend en FREE avec 6 événements ou 6 agents : **tout
continue de vivre, de vendre et de scanner**. Seule la création d'un nouvel
événement, ou l'invitation d'un nouvel agent, est refusée tant qu'il dépasse.

Un quota rétroactif qui dépublierait des événements en cours de vente, ou
révoquerait trois agents la veille d'une soirée, transformerait un problème de
facturation en fiasco d'exploitation.

Le tableau de bord affiche « 3 / 8 événements » : un manager qui atteint son
plafond doit comprendre pourquoi, pas se heurter à une erreur.

---

## 6. Lots d'exécution

| Lot | Contenu | Pourquoi là |
|---|---|---|
| **0-bis** | ✅ **Livré le 2026-08-21** — multi-événement : migration `plan`, retrait du `@@unique`, URL porteuse, helper d'appartenance, quota d'événements, **implémentation** du plafond de scanners, `maxScanners` nullable | Tout le reste s'écrit différemment selon ce choix |
| **0** | `EventAccessMode`, défaut, audit, filtrage de la palette, garde-fou de bascule | Socle des trois types |
| **1** | GUEST — compte fantôme, tunnel public, lien signé, livraison email, en-tête sans « Mon billet » | Réutilise le tunnel existant ; valide le mécanisme de type sur un cas simple |
| **2** | RSVP — `Registration`, endpoint public, bloc `registration`, en-tête et pied de page minimaux, alimentation de la page participants et de l'export | Le plus de code neuf |
| **3** | Bascule assistée : écran de changement de type, chiffres réels, récapitulatif de ce qui est conservé | Se pose sur le reste |

**Le lot 0-bis est le plus risqué des cinq** : il touche des chemins que la
production emprunte à chaque requête du tableau de bord. Il part **seul** dans
son déploiement, avec les tests d'appartenance écrits **avant**. Le danger n'est
pas un écran cassé — c'est un manager qui atteint l'événement d'un autre en
changeant un identifiant dans l'URL.

---

## 7. Journal du lot 0-bis (2026-08-21)

Livré et vérifié contre l'API réelle, pas seulement en tests :

| Vérification | Résultat |
|---|---|
| Deuxième événement en FREE | refusé, `EVENT_QUOTA_REACHED` |
| Deuxième événement en PREMIUM | créé |
| `/mine` sans identifiant, avec deux événements | refusé, `EVENT_SELECTION_REQUIRED` |
| `/mine?eventId=` d'un **autre** manager | refusé, `EVENT_NOT_FOUND` — même message que « inexistant » |
| Septième agent de contrôle en PREMIUM | refusé, `SCANNER_QUOTA_EXCEEDED` (plafond 6) |
| Rétrogradation PREMIUM → FREE | deux événements et six agents conservés, création suivante refusée |
| Manager mono-événement après le lot | aucun sélecteur, URL sans paramètre, liens de menu inchangés |
| Bascule entre deux événements dans le navigateur | titre, lien public, menu et données suivent ; aucun mélange de cache |

**Deux constats de code faits en chemin**, qui ont changé le travail :

- `Event.maxScanners` ne limitait rien — la colonne valait 3 partout et
  personne ne la lisait. Le lot ne modifie donc pas une limite, il en crée une.
- `isPremium` ne commandait que le multi-jours. Le remplacer coûtait peu
  aujourd’hui ; il aurait porté quatre privilèges dans six mois.

**Reste à faire avant le lot 0** : rien. Le socle est en place, les trois
types peuvent s’y poser.

---

## 7. Nouveaux moyens de paiement (demande du 2026-08-22)

> Chantier distinct de celui des trois régimes. Consigné ici parce qu’il
> touche le même tunnel, et qu’une erreur de modèle au départ coûterait une
> migration plus tard.

### 7.1 Google Pay et Apple Pay ne sont pas des fournisseurs

C’est la décision qui structure tout le reste. `PaymentProviderType` est un
enum de **fournisseurs** — Kkiapay, CinetPay, FedaPay. Y ajouter `GOOGLE_PAY`
et `APPLE_PAY` serait une erreur de modèle : ce sont des **portefeuilles**,
des façons de présenter une carte, et ils n’encaissent rien par eux-mêmes.
Ils transitent par un fournisseur — Stripe chez nous.

Concrètement : une intégration Stripe correcte les propose **toutes seules**.
Le Payment Request Button affiche Apple Pay sur Safari/iOS et Google Pay sur
Chrome/Android, selon ce que le navigateur et le portefeuille du visiteur
permettent. Il n’y a rien à choisir côté organisateur, et rien à stocker.

Les modéliser en fournisseurs distincts obligerait à leur inventer des clés
d’API qui n’existent pas, et ferait apparaître dans l’espace Admin deux
lignes à configurer que personne ne peut remplir.

**Donc :** deux fournisseurs à ajouter, `STRIPE` et `PAYPAL`. Google Pay et
Apple Pay arrivent avec Stripe, sans ligne de configuration.

### 7.2 Ce que chacun demande

| Fournisseur | Ce qu’il faut | Webhook | Remarque |
|---|---|---|---|
| **Stripe** | Clé publique + clé secrète | `checkout.session.completed`, signature `Stripe-Signature` (HMAC) | Apporte Google Pay et Apple Pay. Apple Pay exige de **vérifier le domaine** chez Apple : un fichier à servir sous `/.well-known/`. |
| **PayPal** | Client ID + secret | `CHECKOUT.ORDER.APPROVED`, vérification par appel retour à PayPal | Pas de HMAC : la signature se vérifie en réinterrogeant leur API. |

Les deux suivent le contrat déjà en place : `init` crée la session, le
**webhook reste seule source de vérité** pour confirmer, jamais le retour de
redirection côté client. C’est la règle qui a été posée pour Kkiapay et qui
n’a aucune raison de changer.

### 7.3 La vraie question : qui peut payer avec quoi

Kkiapay, CinetPay et FedaPay servent le mobile money d’Afrique de l’Ouest.
Stripe et PayPal servent la carte internationale. Ce ne sont pas des
concurrents, ce sont **deux publics** : la diaspora qui achète un billet pour
un proche, et le public local qui paie en mobile money.

Or la configuration est aujourd’hui **un fournisseur actif par événement**.
Ajouter Stripe sans toucher à ce modèle obligerait l’organisateur à choisir
entre encaisser à Lomé ou encaisser à Paris.

**À trancher avant d’implémenter :** garde-t-on un fournisseur unique par
événement, ou permet-on d’en activer plusieurs et de laisser l’acheteur
choisir ? La décision produit du 2026-07-13 disait explicitement « jamais de
choix de provider côté client » — elle a été prise quand tous les
fournisseurs faisaient la même chose. Ce n’est plus le cas.

Recommandation : **plusieurs fournisseurs activables, un choix côté acheteur
limité au moyen de paiement** (« Mobile money » / « Carte bancaire »), pas au
nom du prestataire. L’acheteur n’a que faire de savoir si sa carte passe par
Stripe ; il veut savoir s’il peut payer avec sa carte.

### 7.4 Ordre proposé

1. **Stripe d’abord.** Il apporte carte + Google Pay + Apple Pay d’un coup,
   son webhook est signé en HMAC comme ceux qu’on gère déjà, et son bac à
   sable est utilisable immédiatement sans validation de compte.
2. **Le choix du moyen de paiement** côté acheteur, une fois deux
   fournisseurs actifs sur un même événement.
3. **PayPal ensuite**, dont la vérification de webhook est la plus
   inhabituelle des trois et mérite d’être traitée seule.

⚠️ **Rappel qui prime sur ce chantier** : `payment_provider_configs` est vide
en production. Ajouter deux fournisseurs à une plateforme qui n’en a aucun de
configuré n’avance à rien tant qu’un seul n’encaisse pour de vrai.

---

## 8. Ce qui a été livré (2026-08-22)

Les quatre lots sont écrits, testés et poussés. Ce qui suit remplace le
tableau du §6 comme état de référence.

| Lot | Livré | Commit |
|---|---|---|
| **0-bis** | Multi-événement Premium : plan d’abonnement, quota, URL porteuse, plafond de scanners réellement appliqué | `1bc976a`, `3394f85` |
| **0** | `EventAccessMode`, garde-fou de bascule, filtrage des blocs | `79b82fb`, `64d6be7` |
| **1** | Achat sans compte : compte fantôme, lien signé, page du billet, email, tunnel | `db93b93`, `e7d85d0`, `79f9073`, `eda5e81` |
| **2** | Inscription simple : table dédiée, formulaire public, bloc, confirmation | `e1ed369` |
| **3** | Changement de régime assisté, liste des inscrits et son export | `56aa6da` |

### Décisions confirmées à l’usage

Trois choix du plan ont été vérifiés en conditions réelles plutôt que
seulement raisonnés :

- **Le compte fantôme tient sa promesse.** Le tunnel d’achat n’a pas bougé
  d’une ligne : `initPayment` ne lit que l’identifiant du porteur. Aucun
  `if (client === null)` n’a eu à être écrit nulle part.
- **« La palette filtre, le rendu ignore, rien n’est supprimé »** a été
  éprouvé sur un événement réel : sept blocs rendus en inscription, huit au
  retour, `tickets` compris. La base ne l’avait jamais perdu.
- **Refuser un bloc hors régime à l’ÉCRITURE aurait piégé le manager** — sa
  page contient encore le bloc, chaque enregistrement le renvoie, chaque
  enregistrement serait refusé. Le filtre porte sur l’affichage seul.

### Ce qui reste ouvert

- ⚠️ **`payment_provider_configs` est vide en production.** Aucun encaissement
  n’aboutit, quel que soit le régime. C’est le seul vrai blocage produit.
- Le canal du code de vérification (SMS via Twilio) est écrit mais Twilio
  n’est pas configuré. Le gate de vérification s’efface tant que le canal est
  absent, et se réactivera seul.
- Les nouveaux moyens de paiement (§7) ne sont pas commencés.
