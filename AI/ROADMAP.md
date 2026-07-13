# ROADMAP.md — Fluid Events

> État consolidé à partir de `cahier-des-charges.md` (v4.0.0-r1, révision réaliste, juillet 2026). À mettre à jour à chaque fin de phase — c'est le document qui doit refléter la réalité du code, pas l'inverse.

---

## 1. État global

- **Phase 1 — Fondations** : ✅ **Terminée**
- **Phase 2 — Scanner & Paiements** : 🔴 **En cours**
- **Phase 3 — Events & Tickets** : 🟡 À venir
- **Phase 4 — Builder & Design** : 🔴 **En cours**
- **Phase 5 — Polish & Prod** : 🔵 À venir

## 2. État des modules V1

| Module | Statut |
|---|---|
| Gestion événements | ✅ Basic CRUD (`EventsService`) |
| Billetterie | ✅ CRUD Tickets (ownership Manager) |
| Paiement | ✅ Kkiapay (`init` + webhook + anti-fraude serveur), config **par événement** (décision produit 2026-07-13, Admin configure/active, Manager voit un statut + alerte) ; CinetPay/FedaPay : identifiants configurables (Admin), doc technique réunie, exécution non branchée |
| Scanner PWA | ✅ Page caméra + store Zustand + logique de décision + `POST /api/scan/validate` |
| Event Builder | ✅ `GET /api/builder/mine` + `PUT /api/builder/:eventId/blocks` branchés bout-en-bout (ownership + validation Zod + concurrence optimiste + ajout/édition/réordonnancement/suppression de blocs + color picker HEX + upload d'image whitelisté) ; page publique `/e/[slug]` rend réellement les blocs sauvegardés (`BlockRenderer`, fallback sur l'ancien template statique si aucun bloc). Testé en conditions réelles de bout en bout (backend + navigateur réel) ; reste à faire : preview iframe dans le Builder, drag & drop |
| Auth | ✅ Google OAuth + Scanner login + login email/password générique + JWT événementiel + RBAC + auth par cookie httpOnly, testé en conditions réelles (voir RULES.md §13-14) |
| Dashboard | ✅ Client (Mes billets), Manager (overview/billets/participants/builder) et Admin (vue plateforme) branchés sur données réelles ; page "commandes" client encore mockée |
| Notifications | ✅ `PhoneService` (validation E.164) ; Email/WhatsApp à coder |
| Design billet | ✅ QR generation + validation + `buildHtml` sanitisé |
| Analytics | ❌ Pas commencé |
| Storage S3 | ✅ `StorageService` S3-compatible (RustFS/MinIO dev, Supabase Storage prod), bucket public-read auto-provisionné |

## 3. Détail des phases

### Phase 1 — Fondations ✅ Terminée

- [x] Monorepo pnpm + Turborepo
- [x] NestJS + Prisma + PostgreSQL
- [x] Next.js 15 + Tailwind v4 + shadcn/ui
- [x] Schéma Prisma complet
- [x] Auth JWT (Google OAuth + Scanner login + session événementielle)
- [x] RBAC (`JwtAuthGuard` + `RolesGuard` + `@Public`)
- [x] `AuditService`, `CryptoService`, `PhoneService`
- [x] `StockService` (décrément atomique), `WebhookIdempotencyService`
- [x] `TicketDesignService` (génération QR, `buildHtml`, `verify`)
- [x] `ClientProfileService` (enrichissement post-paiement)
- [x] `BlocksSchema` (Zod), `BuilderConcurrency`
- [x] `ScanDecision` (fonction pure)
- [x] Landing page + Dashboards mockés (admin, manager, client)
- [x] Page scanner PWA + `scannerStore` Zustand
- [x] `AppModule` assemble tous les modules

### Phase 2 — Scanner & Paiements 🔴 En cours

- [x] Controller + service Scanner (`POST /api/scan/validate` + verrou atomique anti-double-scan)
- [x] Controller + provider Paiement Kkiapay (`POST /api/payments/init`) — CinetPay/FedaPay : identifiants configurables, exécution non branchée (voir point dédié ci-dessous)
- [x] Endpoint webhook Kkiapay avec idempotence + décrément/relâche stock atomique + re-vérification serveur anti-fraude (`k.verify()`)
- [x] Flux d'achat client bout-en-bout : intent horodaté → OAuth (eventSlug + redirect propagés via `state`) → reprise sur `/e/[slug]?resume=1` → widget Kkiapay → `GET /api/payments/orders/:id` (polling, le webhook reste seule source de vérité)
  - Testé en conditions réelles (Docker Postgres/Redis, vraie DB) jusqu'à l'ouverture du widget Kkiapay : login, réservation stock atomique, création Order, signature/idempotence webhook, échec+relâche de stock. Non testé : un paiement Kkiapay réellement abouti (nécessite de vraies clés marchand sandbox — `PaymentProviderConfig` seedé avec des clés placeholder non fonctionnelles, à remplacer dans `prisma/seed.ts`).
- [x] Setup BullMQ pour génération PDF asynchrone (`PdfQueueService` + `PdfProcessor`, testé en conditions réelles : PDF de 56 Ko généré, uploadé et téléchargeable publiquement)
- [x] Génération QR dans `OrderItem` après paiement confirmé
- [x] Config paiement **par événement** (décision produit 2026-07-13, Admin — supersède BUSINESS.md §6 "un seul compte Kkiapay global") : `PaymentProviderConfig` gagne un `eventId` (migration `20260713120000_payment_provider_config_per_event`, `@@unique([eventId, provider])`), `PaymentsService.initPayment`/`handleKkiapayWebhook` résolvent la config par `(eventId, provider)` au lieu d'une ligne globale. Nouveaux endpoints `SUPER_ADMIN` : `GET/PUT/PATCH/DELETE /api/admin/events/:eventId/payment-config` (identifiants chiffrés AES-256-GCM via `CryptoService`, jamais renvoyés en clair). Le webhook Kkiapay résout désormais l'Order → eventId AVANT de vérifier la signature (il ne connaissait pas l'événement avant, la config étant globale) — comportement volontairement réordonné, voir `PaymentsService.handleKkiapayWebhook`.
  - `GET /api/events/mine/overview` expose `paymentStatus: { configured, provider }` (jamais les identifiants) — alimente le panneau Manager (`apps/web/app/(dashboard)/manager/page.tsx`) : badge "Paiement actif : X" ou bannière d'alerte "contactez l'administrateur" si non configuré.
  - Seul KKIAPAY peut être **activé** (`SUPPORTED_PAYMENT_PROVIDERS`, `apps/api/src/common/supported-payment-providers.ts`) — CinetPay/FedaPay acceptent l'enregistrement des identifiants (préparation) mais `isActive: true` est rejeté (400 `PROVIDER_EXECUTION_NOT_SUPPORTED`) tant que leur exécution n'est pas codée, pour éviter qu'un événement affiche "paiement actif" alors que l'achat échouerait réellement.
  - Testé en conditions réelles (Docker Postgres, navigateur réel, deux comptes Manager distincts) : configuration KKIAPAY + activation, tentative d'activation CINETPAY rejetée (400), isolation confirmée entre deux événements (chacun son propre secret webhook, un secret d'un événement rejeté sur l'autre — 401), panneau Manager mis à jour en temps réel après action Admin, régression vérifiée sur le flux d'achat déjà testé (paiement toujours résolu correctement par événement).

### Phase 3 — Events & Tickets 🟡

- [x] CRUD Events complet — `POST /api/events` (MANAGER, managerId dérivé du JWT — corrige une faille IDOR où le body pouvait imposer n'importe quel managerId), `PATCH /api/events/mine` (update + statut, pas de state-machine imposée — cycle de vie exact non tranché, BUSINESS.md §12)
- [x] CRUD Tickets (stock, prix, dates de vente, ownership Manager)
- [x] Pages événement publiques SSR (`/e/[slug]`)
- [x] Export CSV des participants (généré côté client depuis `GET /api/events/:eventId/participants` déjà chargé, pas d'endpoint dédié)
- [x] "Suppression" d'événement — décision produit (2026-07-13, BUSINESS.md §12) : annulation douce via `PATCH /api/events/mine { status: 'CANCELLED' }` (déjà accepté par `UpdateEventDto`, zéro changement backend requis), pas de hard-delete. Réversible (`PUBLISHED` ↔ `CANCELLED`). Bouton "Annuler l'événement" / "Republier l'événement" ajouté au dashboard Manager (`apps/web/app/(dashboard)/manager/page.tsx`). Un événement `CANCELLED` : disparaît de la page publique, bloque `POST /api/payments/init`, et le scanner renvoie `EXPIRED` — les trois découlaient déjà du contrôle existant `status === 'PUBLISHED'`, sans code additionnel.

### Phase 4 — Builder & Design 🔴 En cours

- [x] Controller + service Builder (`GET /api/builder/mine`, `PUT /api/builder/:eventId/blocks` — ownership Manager, validation `SaveBlocksDto` (Zod), concurrence optimiste `detectConcurrencyConflict` → 409 `BUILDER_CONFLICT`, upsert atomique sur `EventPage`)
  - Testé en conditions réelles (Docker Postgres) : sauvegarde initiale, relecture, 409 sur `lastKnownUpdatedAt` périmé, 400 sur couleur non-HEX, 403 cross-manager, 401 sans session, 403 rôle CLIENT, sauvegarde réussie avec `updatedAt` à jour.
- [x] Page `manager/builder` branchée sur les vrais endpoints (React Query + `apiPut`) : chargement des blocs existants, ajout de bloc depuis la bibliothèque (10 types), édition des propriétés (titre/contenu/alignement), color picker HEX pour le fond du hero, réordonnancement (haut/bas), suppression, sauvegarde explicite avec gestion du conflit 409 (toast + rechargement automatique des données à jour). Le bloc "Billets" affiche les vrais billets de l'événement (`GET /api/events/mine`).
  - Testé en conditions réelles dans un navigateur réel contre le serveur de dev + Docker Postgres : login, chargement, ajout/édition/réordonnancement/suppression de blocs, sauvegarde persistée après rechargement complet de la page, conflit 409 déclenché volontairement (sauvegarde concurrente via l'API) et récupéré proprement côté UI.
- [x] Upload image design billet + blocs Builder (whitelist d'URL, RULES.md §6) : `POST /api/storage/upload` (Manager, PNG/JPEG/WEBP, 5 Mo max, jamais SVG — risque XSS), stocké via `StorageService.uploadBuffer`. Whitelist revalidée à l'écriture (pas seulement au rendu) : `isAllowedImageUrl()` (nouveau, `apps/api/src/storage/image-whitelist.util.ts`) accepte le bucket Supabase (`buildAllowedImageBase`, prod) et/ou le stockage S3-compatible configuré (`buildAllowedStorageBase`, nouveau dans `packages/utils`, RustFS/MinIO dev) ; utilisé par `TicketsService` (`designImageUrl`) et `BuilderService` (`props.imageUrl` de chaque bloc). `ImageUploadField`/`ColorField` extraits en composants partagés (`apps/web/components/ui/`), réutilisés par le Builder (image de couverture du hero) et le formulaire de création de billet (design du billet, jusqu'ici totalement absent du frontend).
  - Bug corrigé au passage : `@IsUrl()` (class-validator) rejette `localhost` par défaut (pas de TLD) — bloquant en dev où `STORAGE_ENDPOINT=http://localhost:9000`. Ajout de `{ require_tld: false }` sur `CreateTicketDto`/`UpdateTicketDto.designImageUrl` (la whitelist applicative reste la vraie garde de sécurité, pas ce validateur de forme).
  - Testé en conditions réelles (Docker Postgres + MinIO) : upload réel d'un PNG → URL publique accessible (200 OK) → acceptée par `PATCH`/`PUT` billet et Builder → une URL externe (`https://evil.com/...`) rejetée (400) dans les deux ; vérifié aussi en navigateur réel (aperçu image dans le panneau de propriétés Builder, formulaire billet).
- [x] La page publique `/e/[slug]` consomme désormais `EventPage.blocks` — c'est la pièce qui referme la boucle du Builder (avant ça, sauvegarder une page n'avait aucun effet visible côté visiteur). `GET /api/events/public/:slug` inclut maintenant `eventPage.blocks` ; nouveau `BlockRenderer` (`apps/web/app/(public)/e/[slug]/block-renderer.tsx`) rend hero (image + titre + alignement + couleur de fond), texte, billets (réutilise exactement la même liste/logique d'achat que l'ancien template — même URL `buy-redirect`, aucune divergence du flux de paiement), et un rendu générique titre+contenu pour les 7 autres types (cohérent avec ce que le Builder édite réellement aujourd'hui). Si `blocks` est vide (page jamais construite), la page retombe sur l'ancien template statique — zéro régression pour tout événement n'ayant jamais touché au Builder.
  - Testé en conditions réelles (Docker Postgres + navigateur réel) : page construite avec hero (image uploadée)+texte+billets → rendu correct, image de fond chargée (200 OK), bouton "Acheter" pointant vers la même URL `buy-redirect` que l'ancien template ; blocs vidés → retour immédiat au template statique (aucune régression) ; piège de cache Next.js (`fetch(..., {next:{revalidate:30}})` sert du stale-while-revalidate persistant sur disque entre redémarrages du serveur dev — un premier chargement après une sauvegarde peut encore montrer l'ancien contenu, un second chargement est à jour) rencontré et documenté ici pour ne pas re-déboguer ça la prochaine fois.
- [ ] Preview iframe dans le Builder manager (le toggle desktop/mobile actuel ne fait que changer la largeur du canvas, ce n'est pas un rendu réel de `/e/[slug]` — maintenant que la page publique rend les blocs, un vrai iframe pointant vers `/e/[slug]` devient possible)
- [ ] Drag & drop réel dans le canvas (l'ajout se fait aujourd'hui en cliquant sur un bloc de la bibliothèque, pas en le glissant)

### Phase 5 — Polish & Prod 🔵

- [ ] Docker compose dev complet
- [ ] Analytics
- [ ] WhatsApp (Meta Cloud API)
- [ ] Worker PDF Puppeteer
- [ ] Tests E2E
- [ ] Déploiement production

## 4. Priorités immédiates (à date)

| Module | Priorité | Référence CDC |
|---|:---:|---|
| Scanner `/api/scan/validate` | ✅ Fait | §9.5 |
| Tickets CRUD | ✅ Fait | §6.3 |
| Payments init + webhook (Kkiapay) | ✅ Fait | §8 |
| Payments CinetPay / FedaPay — exécution (init + webhook) | 🟡 Moyenne (doc technique réunie 2026-07-13, voir §7 ci-dessous — plus bloqué par l'absence de doc, mais pas encore codé) | §8 |
| Config paiement par événement (Admin + statut Manager) | ✅ Fait | §8 |
| Events PATCH/DELETE | ✅ Fait (annulation douce via statut, décision produit 2026-07-13 — voir BUSINESS.md §12) | §6.2 |
| Builder endpoints (backend) | ✅ Fait | §11 |
| Builder — frontend branché (ajout/édition/réorg/suppression/color picker) | ✅ Fait | §11 |
| Upload image whitelisté (billet + Builder) | ✅ Fait | §11 |
| Page publique consommant les blocs Builder | ✅ Fait | §11 |
| Builder — preview iframe / drag & drop | 🟡 Moyenne | §11 |
| Admin endpoints | 🟢 Basse | §6.11 |

## 5. Hors périmètre actuel (backlog non scopé)

- Multi-événements par manager (au-delà de la contrainte "1 Manager = 1 Event" de la V1)
- Multi-devises (au-delà de XOF)
- Gestion des commissions / remboursements (voir `BUSINESS.md` §12 — décisions produit à prendre avant implémentation)
- Analytics avancées
- Storage S3 en production (au-delà de l'abstraction déjà prête)

## 6. CinetPay / FedaPay — doc technique réunie (2026-07-13), exécution pas encore codée

Recherche faite pour lever le blocage "pas de SDK/doc fournie" — l'Admin peut
déjà enregistrer les identifiants des deux (voir §2 ci-dessus), mais
`SUPPORTED_PAYMENT_PROVIDERS` (`apps/api/src/common/supported-payment-providers.ts`)
ne contient que `KKIAPAY` : personne n'a encore codé l'init/webhook pour ces
deux providers. Repères techniques pour ce travail futur :

**FedaPay** (SDK Node officiel — `npm install fedapay`) :
- `FedaPay.setApiKey(secretKey)` + `FedaPay.setEnvironment('sandbox'|'live')`
- Créer une transaction : `POST https://api.fedapay.com/v1/transactions`
  (ou `sandbox-api.fedapay.com`) — `{ description, amount, currency: { iso: 'XOF' }, callback_url, customer }`
- Récupérer/vérifier : `GET /v1/transactions/{id}` → `status` ∈ `pending|approved|declined|canceled|refunded`
  (équivalent de `k.verify()` pour Kkiapay)
- Webhook : header `X-FEDAPAY-SIGNATURE`, vérifié via `Webhook.constructEvent(body, sig, endpointSecret)`
  du SDK (secret par endpoint, différent sandbox/live, dans Workbench → Webhooks du dashboard FedaPay)
- Events : `transaction.approved` / `transaction.declined` / `transaction.canceled` / etc.

**CinetPay** (pas de SDK Node officiel — REST pur, `axios`/`fetch`) :
- Init : `POST https://api-checkout.cinetpay.com/v2/payment` —
  `{ apikey, site_id, transaction_id, amount, currency, description, notify_url, return_url, channels }`
  → réponse `{ code: '201', data: { payment_token, payment_url } }` (rediriger le client vers `payment_url`)
- Vérification : `POST https://api-checkout.cinetpay.com/v2/payment/check` —
  `{ apikey, site_id, transaction_id }` (équivalent de `k.verify()`)
- Notification : POST vers `notify_url` avec `cpm_trans_id` + champs `cpm_*`, header **`x-token`** =
  HMAC-SHA256(secret_key, concat(cpm_site_id + cpm_trans_id + cpm_trans_date + cpm_amount + cpm_currency + signature + payment_method + cel_phone_num + cpm_phone_prefixe + cpm_language + cpm_version + cpm_payment_config + cpm_page_action + cpm_custom + cpm_designation + cpm_error_message))
  — secret_key distinct de l'apikey, récupéré sur cinetpay.com (compte marchand)
- ⚠️ Toujours re-vérifier via `/v2/payment/check` après notification, jamais se fier au seul `x-token`
  (même principe anti-fraude que Kkiapay, RULES.md §2)

Champs déjà prévus dans `UpsertPaymentConfigDto`/`PaymentProviderConfig.config` (JSON) pour ces deux
providers : `siteId` (CinetPay) et `environment: 'sandbox'|'live'` (FedaPay) — prêts à l'usage le jour
où l'exécution sera codée.

## 7. Comment maintenir ce fichier

- À chaque fin de sous-tâche cochée dans une phase, mettre à jour la case correspondante.
- À chaque fin de phase, mettre à jour la section "État global" (section 1) et l'état des modules (section 2).
- Si une nouvelle décision produit vient combler un point ouvert de `BUSINESS.md`, ajouter la tâche correspondante ici avec sa priorité.
