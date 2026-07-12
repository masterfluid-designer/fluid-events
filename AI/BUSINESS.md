# BUSINESS.md — Règles métier Fluid Events

> Ce document couvre les règles métier telles que déduites de `api.md`, `architecture.md` et `cahier-des-charges.md`. Certains points (commissions, remboursements…) ne sont **pas encore spécifiés** dans les documents sources fournis : ils sont listés en section 12 comme points ouverts, plutôt que devinés. Merci de compléter ce fichier au fur et à mesure des décisions produit.

---

## 1. Vision produit

Plateforme SaaS tout-en-un permettant à des organisateurs africains de créer, vendre et contrôler l'accès à leurs événements sans compétence technique.

## 2. Rôles & permissions (RBAC)

```typescript
enum Role { SUPER_ADMIN, MANAGER, SCANNER, CLIENT }
```

| Action | Super Admin | Manager | Scanner | Client |
|---|:---:|:---:|:---:|:---:|
| Créer un événement | ✅ | ❌ | ❌ | ❌ |
| Modifier un événement | ✅ | ✅ (le sien) | ❌ | ❌ |
| Acheter un billet | ❌ | ❌ | ❌ | ✅ |
| Scanner un QR code | ❌ | ❌ | ✅ | ❌ |
| Voir les statistiques | ✅ | ✅ (le sien) | ❌ | ❌ |

- Un **Scanner** a un compte dédié avec login séparé (pas d'OAuth Google), pensé pour un usage mono-événement le jour J.
- Un **Manager** ne voit et ne modifie que son propre événement (contrainte V1 ci-dessous).

## 3. Contrainte produit V1 : 1 Manager = 1 Event

- Chaque Manager possède exactement un événement (`Event.managerId` unique).
- Objectif : simplifier l'isolation des données et le modèle de permissions pour la V1.
- Évolution prévisible mentionnée dans la doc technique : passer à N événements par manager reste possible plus tard (scalable "par duplication"), mais **pas dans le périmètre actuel** — voir `ROADMAP.md` avant de développer dans cette direction.

## 4. Cycle de vie d'un événement

1. Création par un Manager (`POST /api/events`) : titre, description, slug, dates, capacité totale, image.
2. Page publique accessible sans authentification via `GET /api/events/:slug/public` (SSR).
3. Édition du contenu visuel via l'Event Builder (blocs type "hero", etc.), avec contrôle de concurrence optimiste.
4. *(Statuts de publication - brouillon / publié / archivé - non détaillés dans les sources fournies, à clarifier, voir section 12.)*

## 5. Cycle de vie d'un billet / d'une commande

1. **Sélection** : le client choisit un type de billet (`ticketTypeId`) et une quantité, avec les infos des participants (`attendeeInfo`: nom, email, téléphone).
2. **Intent d'achat** : un `intentKey` (`timestamp:secret`) est généré pour sécuriser le tunnel avant paiement.
3. **Initialisation paiement** (`POST /api/payments/init`) : vérification d'ownership, vérification de l'intent, puis réservation atomique du stock (`$transaction` : décrément capacité + incrément `soldCount` + création `Order`/`Payment`).
4. **Redirection** vers le provider de paiement choisi.
5. **Webhook de confirmation** (idempotent) : création des `Tickets` + `QRCodes`, déclenchement des jobs asynchrones (génération PDF, envoi email, notification WhatsApp), mise à jour du dashboard client.
6. **Consultation** : le client peut ensuite consulter ses billets (`GET /api/tickets/:id`, `GET /api/dashboard/client`).

## 6. Règles de paiement

- Multi-provider : au moins Kkiapay identifié dans les exemples, avec CinetPay et FedaPay prévus au roadmap (mobile money africain).
- **Spécificité Kkiapay (implémentée)** : pas de "checkoutUrl" côté serveur — le paiement s'initie via le widget JS client (`openKkiapayWidget`), avec `partnerId` = notre `Order.id` transmis en donnée de corrélation. Le webhook (authentifié par un secret partagé, pas de HMAC) est **systématiquement re-vérifié côté serveur** via `k.verify(transactionId)` avant de considérer un paiement confirmé (recommandation explicite de la doc Kkiapay, anti-fraude).
- Un seul compte/config Kkiapay global (`PaymentProviderConfig.provider` `@unique`) — pas de clés par Manager en V1. Les modalités de reversement aux organisateurs restent un point ouvert (§12).
- Montants exprimés a minima en XOF dans les exemples fournis — *la gestion multi-devises pour d'autres pays n'est pas explicitement traitée, voir section 12.*
- Un `Order` n'est confirmé (billets + QR générés) qu'après réception et traitement du **webhook** du provider, jamais uniquement sur la redirection front (qui peut être interrompue).
- **Idempotence obligatoire** : un webhook reçu plusieurs fois (retry provider, jusqu'à 3 tentatives avec backoff exponentiel) ne doit générer les effets de bord (tickets, emails) qu'une seule fois.
- Réponse attendue par le provider suite à réception du webhook : `200 OK`.

## 7. Règles QR Code & contrôle d'accès

- Chaque billet a un QR code signé HS256, contenant un payload chiffré.
- Un QR code est valide jusqu'à `event.endDate + 24h`.
- **Un seul scan valide par billet** : le passage à l'état "scanné" est atomique, pour empêcher le double scan (ex : partage de la même photo du billet à plusieurs personnes).
- La validation d'un scan ne renvoie **jamais** de données personnelles sensibles (email, téléphone) — uniquement nom, type de billet, heure du scan. Ceci est une règle métier autant que sécurité : le staff sur le terrain n'a pas besoin (et ne doit pas avoir accès) à ces données.
- Cible de performance métier : un contrôle d'accès doit rester fluide même avec une file d'attente (< 500ms par scan).

## 8. Règles de session

- Un client reste connecté pendant toute la durée de l'événement + 24h après (facilite la consultation du billet le jour J sans reconnexion).

## 9. Notifications

- **Email** : confirmations d'achat, factures — via job asynchrone (BullMQ), pas dans le chemin critique du webhook.
- **WhatsApp** : notifications billet (numéro normalisé en E.164 via `PhoneService`) — *implémentation encore à faire (Meta Cloud API), voir `ROADMAP.md`.*

## 10. Design personnalisé des billets

- Couleurs personnalisables (format HEX strict attendu).
- Image associée au billet : uniquement via URL provenant d'une whitelist de domaines de storage autorisés (pas d'upload arbitraire d'URL externe).
- Prévisualisation attendue via iframe (fonctionnalité listée en roadmap, non encore codée).

## 11. Événement Builder (no-code)

- Le contenu de la page publique événement est composé de "blocs" (`type`, `position`, `content`) modifiables par le Manager propriétaire.
- Contrôle de concurrence optimiste : toute sauvegarde envoie `lastKnownUpdatedAt` ; si la valeur ne correspond plus à celle en base (quelqu'un d'autre a modifié entre temps), la sauvegarde est refusée (`409 Conflict`) plutôt que d'écraser silencieusement.

## 12. Points ouverts à clarifier avec l'équipe produit

Ces sujets ne sont pas couverts par les documents sources fournis. À documenter ici dès que la décision est prise, plutôt que de les laisser implicites dans le code :

- **Commissions** : Fluid Events prélève-t-il une commission sur les ventes ? Sous quelle forme (pourcentage, frais fixe, mixte) ? Prélevée à l'achat ou reversée au manager après déduction ?
- **Remboursements / annulations** : politique de remboursement client (délai, conditions), et politique d'annulation d'un événement par un Manager (que deviennent les billets déjà vendus ?).
- **Statuts de publication d'un événement** : cycle de vie exact (brouillon → publié → clôturé → archivé ?) et qui peut déclencher chaque transition.
- **Multi-devises** : le système gère-t-il d'autres devises que XOF pour d'autres pays africains ciblés ?
- **Transfert de billet** : un billet acheté peut-il être transféré à un autre participant après achat (le champ `attendeeInfo` par ticket le suggère, mais le processus n'est pas décrit) ?
- **Facturation / fiscalité** : génération de factures conformes, TVA éventuelle selon pays.
- **Politique anti-fraude** au-delà du HS256 (ex : limite de billets par personne, détection de bots à l'achat).
