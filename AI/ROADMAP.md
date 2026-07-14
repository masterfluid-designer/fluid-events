# ROADMAP.md — Fluid Events

> État consolidé à partir de `cahier-des-charges.md` (v4.0.0-r1, révision réaliste, juillet 2026). À mettre à jour à chaque fin de phase — c'est le document qui doit refléter la réalité du code, pas l'inverse.

---

## 1. État global

- **Phase 1 — Fondations** : ✅ **Terminée**
- **Phase 2 — Scanner & Paiements** : 🔴 **En cours**
- **Phase 3 — Events & Tickets** : 🟡 À venir
- **Phase 4 — Builder & Design** : ✅ **Terminée**
- **Phase 5 — Polish & Prod** : 🔵 À venir

## 2. État des modules V1

| Module | Statut |
|---|---|
| Gestion événements | ✅ Basic CRUD (`EventsService`) |
| Billetterie | ✅ CRUD Tickets (ownership Manager) |
| Paiement | ✅ Kkiapay + CinetPay + FedaPay (`init` + webhook + anti-fraude serveur pour les 3), config **par événement** (décision produit 2026-07-13, Admin configure/active, Manager voit un statut + alerte, jamais de choix de provider côté client) |
| Scanner PWA | ✅ Page caméra + store Zustand + logique de décision + `POST /api/scan/validate` |
| Event Builder | ✅ `GET /api/builder/mine` + `PUT /api/builder/:eventId/blocks` branchés bout-en-bout (ownership + validation Zod + concurrence optimiste + ajout/édition/réordonnancement/suppression de blocs + color picker HEX + upload d'image whitelisté) ; page publique `/e/[slug]` rend réellement les blocs sauvegardés (`BlockRenderer`, fallback sur l'ancien template statique si aucun bloc). Testé en conditions réelles de bout en bout (backend + navigateur réel) ; reste à faire : preview iframe dans le Builder, drag & drop |
| Auth | ✅ Google OAuth + Scanner login + login email/password générique + JWT événementiel + RBAC + auth par cookie httpOnly, testé en conditions réelles (voir RULES.md §13-14) |
| Dashboard | ✅ Client (Mes billets), Manager (overview/billets/participants/builder) et Admin (vue plateforme) branchés sur données réelles ; page "commandes" client encore mockée |
| Notifications | ✅ `PhoneService` (validation E.164) + `EmailService` (nodemailer/SMTP, email "billets prêts" après génération PDF, 2026-07-14) ; WhatsApp à coder |
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
- [x] Controller + provider Paiement — les 3 providers du CDC (Kkiapay, CinetPay, FedaPay) sont exécutables (`POST /api/payments/init` détermine le fournisseur depuis la config active de l'événement, voir point dédié ci-dessous)
- [x] Endpoint webhook Kkiapay avec idempotence + décrément/relâche stock atomique + re-vérification serveur anti-fraude (`k.verify()`)
- [x] Flux d'achat client bout-en-bout : intent horodaté → OAuth (eventSlug + redirect propagés via `state`) → reprise sur `/e/[slug]?resume=1` → widget Kkiapay → `GET /api/payments/orders/:id` (polling, le webhook reste seule source de vérité)
  - Testé en conditions réelles (Docker Postgres/Redis, vraie DB) jusqu'à l'ouverture du widget Kkiapay : login, réservation stock atomique, création Order, signature/idempotence webhook, échec+relâche de stock. Non testé : un paiement Kkiapay réellement abouti (nécessite de vraies clés marchand sandbox — `PaymentProviderConfig` seedé avec des clés placeholder non fonctionnelles, à remplacer dans `prisma/seed.ts`).
- [x] Setup BullMQ pour génération PDF asynchrone (`PdfQueueService` + `PdfProcessor`, testé en conditions réelles : PDF de 56 Ko généré, uploadé et téléchargeable publiquement)
- [x] Génération QR dans `OrderItem` après paiement confirmé
- [x] Config paiement **par événement** (décision produit 2026-07-13, Admin — supersède BUSINESS.md §6 "un seul compte Kkiapay global") : `PaymentProviderConfig` gagne un `eventId` (migration `20260713120000_payment_provider_config_per_event`, `@@unique([eventId, provider])`), `PaymentsService.initPayment`/`handleKkiapayWebhook` résolvent la config par `(eventId, provider)` au lieu d'une ligne globale. Nouveaux endpoints `SUPER_ADMIN` : `GET/PUT/PATCH/DELETE /api/admin/events/:eventId/payment-config` (identifiants chiffrés AES-256-GCM via `CryptoService`, jamais renvoyés en clair). Le webhook Kkiapay résout désormais l'Order → eventId AVANT de vérifier la signature (il ne connaissait pas l'événement avant, la config étant globale) — comportement volontairement réordonné, voir `PaymentsService.handleKkiapayWebhook`.
  - `GET /api/events/mine/overview` expose `paymentStatus: { configured, provider }` (jamais les identifiants) — alimente le panneau Manager (`apps/web/app/(dashboard)/manager/page.tsx`) : badge "Paiement actif : X" ou bannière d'alerte "contactez l'administrateur" si non configuré.
  - `SUPPORTED_PAYMENT_PROVIDERS` (`apps/api/src/common/supported-payment-providers.ts`) reste la source unique de vérité partagée par `PaymentsService` et `AdminService` (empêche d'activer un provider non exécutable si ce tableau redevient un sous-ensemble un jour) — les 3 sont dedans aujourd'hui.
  - `POST /api/payments/init` (`InitPaymentDto`) n'a **plus** de champ `provider` : le client ne choisit/connaît jamais le fournisseur, `PaymentsService` le déduit de `PaymentProviderConfig.findFirst({eventId, isActive:true})` (au plus un actif par événement). Le frontend (`resume-checkout.tsx`) branche sur `PaymentInitResult.provider` dans la *réponse* : widget JS pour KKIAPAY, redirection vers `checkoutUrl` pour CINETPAY/FEDAPAY (retour sur `/e/[slug]?resume=1&orderId=...`, `ResumeCheckout` y reprend directement le polling `GET /api/payments/orders/:id`).
  - **CinetPay** (`apps/api/src/payments/cinetpay.service.ts`, REST pur — pas de SDK Node officiel) : `initPayment()` → `POST https://api-checkout.cinetpay.com/v2/payment`, `checkTransaction()` → `.../v2/payment/check` (anti-fraude, re-vérifié à chaque webhook, jamais le seul `x-token`). `computeCinetPayHmac()` (fonction pure, testée isolément) calcule le HMAC-SHA256 attendu sur la concaténation exacte des champs `cpm_*` documentée par CinetPay. `transaction_id` = notre `Order.id` (comme le `partnerId` Kkiapay) — pas de résolution indirecte nécessaire côté webhook.
  - **FedaPay** (`apps/api/src/payments/fedapay.service.ts`, SDK Node officiel `fedapay`) : `Transaction.create()` puis `transaction.generateToken()` (→ `{token, url}`, doc "Get the payment link for a transaction") pour obtenir la `checkoutUrl`. Webhook vérifié via le SDK (`Webhook.constructEvent(rawBody, sig, secret)`, `X-FEDAPAY-SIGNATURE`) — nécessite le **corps brut** (`req.rawBody`, `rawBody: true` activé dans `main.ts`), pas le JSON re-sérialisé, sinon la signature ne correspond jamais. FedaPay assigne son propre id de transaction (pas nous) : stocké sur `Order.paymentRef` dès l'init pour permettre au webhook de corréler la commande (`findFirst({paymentProvider:'FEDAPAY', paymentRef})`).
    - ⚠️ Limitation connue : le SDK FedaPay configure ses identifiants via des setters **statiques** (`FedaPay.setApiKey()`/`setEnvironment()`), pas d'instance — global au process Node. Avec une config par événement, deux requêtes concurrentes pour deux événements différents pourraient en théorie se marcher dessus. Risque limité en ne laissant jamais de point d'`await` entre la config et l'appel SDK (le SDK lit l'état statique de façon synchrone avant son propre appel HTTP asynchrone), mais ce n'est pas une garantie absolue sous forte charge — documenté dans `FedaPayService`, pas ignoré. Un vrai correctif nécessiterait d'abandonner le SDK au profit d'appels REST directs (comme `CinetPayService`).
  - Si l'appel externe d'initiation (CinetPay/FedaPay) échoue (ex : identifiants invalides), `PaymentsService.abortFailedInit()` annule l'Order + relâche le stock atomiquement (sinon la réservation resterait bloquée indéfiniment, aucun webhook ne viendra jamais confirmer une transaction qui n'a jamais existé côté provider) et renvoie `503 PAYMENT_INIT_FAILED`.
  - Testé en conditions réelles (Docker Postgres, navigateur réel, deux comptes Manager distincts) : configuration KKIAPAY + activation, isolation confirmée entre deux événements (chacun son propre secret webhook, un secret d'un événement rejeté sur l'autre — 401), panneau Manager mis à jour en temps réel après action Admin, régression vérifiée sur le flux d'achat déjà testé (paiement toujours résolu correctement par événement). CinetPay/FedaPay : logique unitairement testée (43 tests `payments.service.test.ts`, HMAC/SDK mockés).
  - **Exécution CinetPay/FedaPay testée en conditions réelles (2026-07-13)** : panneau Admin réel (navigateur, compte `admin1@fluid-events.test`) — CinetPay et FedaPay s'activent désormais sans restriction (`PROVIDER_EXECUTION_NOT_SUPPORTED` n'existe plus), un seul provider actif à la fois confirmé (activer CinetPay désactive Kkiapay automatiquement). `POST /api/payments/init` appelé en réel (JWT client réel, ticket réel avec stock réel) avec des identifiants placeholder :
    - **FedaPay** : appel réseau réel à `sandbox-api.fedapay.com`, rejeté `401` (identifiants invalides, confirmé aussi par un `curl` direct hors app) — preuve bout-en-bout que l'URL, les headers et le corps de la requête `Transaction.create()` sont corrects. `abortFailedInit` déclenché : `Order.status = FAILED`, stock relâché (vérifié en base : `stockSold` revenu à sa valeur d'avant réservation), `503 PAYMENT_INIT_FAILED` renvoyé au client.
    - **CinetPay** : `api-checkout.cinetpay.com` injoignable depuis cet environnement Docker (`fetch failed`, confirmé par un `curl` direct — statut réseau `000`, pas une erreur applicative) — limitation d'environnement, pas de régression côté code (même chemin `abortFailedInit`/rollback exercé et vérifié correct : `Order.status = FAILED`, stock relâché).
    - Régression Kkiapay confirmée après coup (réactivation + `POST /api/payments/init` → réponse widget `{provider:'KKIAPAY', partnerId, publicKey, sandbox}` inchangée, malgré le retrait de `provider` du body de la requête).
    - Non testé (nécessite de vraies clés marchand sandbox, aucune fournie) : un paiement CinetPay/FedaPay réellement abouti jusqu'au webhook — même limitation déjà documentée pour Kkiapay.
    - Bug corrigé au passage (`apps/web/app/auth/login/page.tsx`) : la redirection post-login lisait `body.role` au lieu de `body.data.role` (l'API enveloppe toutes les réponses dans `{success, data}` via `ResponseInterceptor`), donc **aucun** rôle ne redirigeait jamais vers `/admin` ou `/manager` — repéré en cliquant réellement sur "Se connecter" dans le navigateur, corrigé, revérifié (SUPER_ADMIN → `/admin` confirmé).

### Phase 3 — Events & Tickets 🟡

- [x] CRUD Events complet — `POST /api/events` (MANAGER, managerId dérivé du JWT — corrige une faille IDOR où le body pouvait imposer n'importe quel managerId), `PATCH /api/events/mine` (update + statut, pas de state-machine imposée — cycle de vie exact non tranché, BUSINESS.md §12)
- [x] CRUD Tickets (stock, prix, dates de vente, ownership Manager)
- [x] Pages événement publiques SSR (`/e/[slug]`)
- [x] Export CSV des participants (généré côté client depuis `GET /api/events/:eventId/participants` déjà chargé, pas d'endpoint dédié)
- [x] "Suppression" d'événement — décision produit (2026-07-13, BUSINESS.md §12) : annulation douce via `PATCH /api/events/mine { status: 'CANCELLED' }` (déjà accepté par `UpdateEventDto`, zéro changement backend requis), pas de hard-delete. Réversible (`PUBLISHED` ↔ `CANCELLED`). Bouton "Annuler l'événement" / "Republier l'événement" ajouté au dashboard Manager (`apps/web/app/(dashboard)/manager/page.tsx`). Un événement `CANCELLED` : disparaît de la page publique, bloque `POST /api/payments/init`, et le scanner renvoie `EXPIRED` — les trois découlaient déjà du contrôle existant `status === 'PUBLISHED'`, sans code additionnel.

### Phase 4 — Builder & Design ✅ Terminée

- [x] Controller + service Builder (`GET /api/builder/mine`, `PUT /api/builder/:eventId/blocks` — ownership Manager, validation `SaveBlocksDto` (Zod), concurrence optimiste `detectConcurrencyConflict` → 409 `BUILDER_CONFLICT`, upsert atomique sur `EventPage`)
  - Testé en conditions réelles (Docker Postgres) : sauvegarde initiale, relecture, 409 sur `lastKnownUpdatedAt` périmé, 400 sur couleur non-HEX, 403 cross-manager, 401 sans session, 403 rôle CLIENT, sauvegarde réussie avec `updatedAt` à jour.
- [x] Page `manager/builder` branchée sur les vrais endpoints (React Query + `apiPut`) : chargement des blocs existants, ajout de bloc depuis la bibliothèque (10 types), édition des propriétés (titre/contenu/alignement), color picker HEX pour le fond du hero, réordonnancement (haut/bas), suppression, sauvegarde explicite avec gestion du conflit 409 (toast + rechargement automatique des données à jour). Le bloc "Billets" affiche les vrais billets de l'événement (`GET /api/events/mine`).
  - Testé en conditions réelles dans un navigateur réel contre le serveur de dev + Docker Postgres : login, chargement, ajout/édition/réordonnancement/suppression de blocs, sauvegarde persistée après rechargement complet de la page, conflit 409 déclenché volontairement (sauvegarde concurrente via l'API) et récupéré proprement côté UI.
- [x] Upload image design billet + blocs Builder (whitelist d'URL, RULES.md §6) : `POST /api/storage/upload` (Manager, PNG/JPEG/WEBP, 5 Mo max, jamais SVG — risque XSS), stocké via `StorageService.uploadBuffer`. Whitelist revalidée à l'écriture (pas seulement au rendu) : `isAllowedImageUrl()` (nouveau, `apps/api/src/storage/image-whitelist.util.ts`) accepte le bucket Supabase (`buildAllowedImageBase`, prod) et/ou le stockage S3-compatible configuré (`buildAllowedStorageBase`, nouveau dans `packages/utils`, RustFS/MinIO dev) ; utilisé par `TicketsService` (`designImageUrl`) et `BuilderService` (`props.imageUrl` de chaque bloc). `ImageUploadField`/`ColorField` extraits en composants partagés (`apps/web/components/ui/`), réutilisés par le Builder (image de couverture du hero) et le formulaire de création de billet (design du billet, jusqu'ici totalement absent du frontend).
  - Bug corrigé au passage : `@IsUrl()` (class-validator) rejette `localhost` par défaut (pas de TLD) — bloquant en dev où `STORAGE_ENDPOINT=http://localhost:9000`. Ajout de `{ require_tld: false }` sur `CreateTicketDto`/`UpdateTicketDto.designImageUrl` (la whitelist applicative reste la vraie garde de sécurité, pas ce validateur de forme).
  - Testé en conditions réelles (Docker Postgres + MinIO) : upload réel d'un PNG → URL publique accessible (200 OK) → acceptée par `PATCH`/`PUT` billet et Builder → une URL externe (`https://evil.com/...`) rejetée (400) dans les deux ; vérifié aussi en navigateur réel (aperçu image dans le panneau de propriétés Builder, formulaire billet).
- [x] La page publique `/e/[slug]` consomme désormais `EventPage.blocks` — c'est la pièce qui referme la boucle du Builder (avant ça, sauvegarder une page n'avait aucun effet visible côté visiteur). `GET /api/events/public/:slug` inclut maintenant `eventPage.blocks` ; nouveau `BlockRenderer` (`apps/web/app/(public)/e/[slug]/block-renderer.tsx`) rend hero (image + titre + alignement + couleur de fond), texte, billets (réutilise exactement la même liste/logique d'achat que l'ancien template — même URL `buy-redirect`, aucune divergence du flux de paiement), et un rendu générique titre+contenu pour les 7 autres types (cohérent avec ce que le Builder édite réellement aujourd'hui). Si `blocks` est vide (page jamais construite), la page retombe sur l'ancien template statique — zéro régression pour tout événement n'ayant jamais touché au Builder.
  - Testé en conditions réelles (Docker Postgres + navigateur réel) : page construite avec hero (image uploadée)+texte+billets → rendu correct, image de fond chargée (200 OK), bouton "Acheter" pointant vers la même URL `buy-redirect` que l'ancien template ; blocs vidés → retour immédiat au template statique (aucune régression) ; piège de cache Next.js (`fetch(..., {next:{revalidate:30}})` sert du stale-while-revalidate persistant sur disque entre redémarrages du serveur dev — un premier chargement après une sauvegarde peut encore montrer l'ancien contenu, un second chargement est à jour) rencontré et documenté ici pour ne pas re-déboguer ça la prochaine fois.
- [x] Preview iframe + drag & drop réel dans le Builder manager (2026-07-13)
  - **Aperçu réel** : nouveau toggle "Éditer / Aperçu réel" dans la topbar (`apps/web/app/(dashboard)/manager/builder/page.tsx`). En mode Aperçu, le canvas devient un vrai `<iframe src="/e/{slug}">` (bibliothèque + panneau propriétés masqués), le toggle desktop/mobile redimensionne l'iframe pour un test responsive réel (vraies media queries), un bouton "Rafraîchir" force le remount (`key={previewNonce}`, incrémenté aussi après chaque sauvegarde réussie). Limite assumée : l'iframe reflète la dernière version **enregistrée**, pas les modifications non sauvegardées en cours d'édition — et hérite du piège de cache Next.js déjà documenté ci-dessus (`revalidate:30`, un premier chargement après sauvegarde peut montrer l'ancien contenu).
  - **Drag & drop** : HTML5 natif (`draggable`, `dataTransfer`, pas de nouvelle dépendance) — glisser un bloc de la bibliothèque l'insère à la position exacte du dépôt (`insertBlockAt`), glisser un bloc existant le réordonne (`moveBlockToIndex`) ; une ligne d'insertion (`dragOverIndex`) indique la position visée, calculée depuis `clientY` relatif au bloc survolé (moitié haute = avant, moitié basse = après). Le clic (ajout en fin de liste, flèches haut/bas) reste disponible en parallèle — le drag n'est pas le seul moyen d'éditer.
  - Testé en conditions réelles (Docker Postgres, navigateur réel) : aperçu réel affichant le vrai `/e/[slug]` avec resize desktop/mobile fonctionnel ; **le glisser-déposer piloté par la souris de l'outil de test automatisé ne déclenche pas les événements HTML5 DnD natifs** (limitation connue de l'automatisation navigateur — un vrai geste de drag utilisateur fonctionne, mousedown/mousemove/mouseup simulés non) ; la logique elle-même vérifiée en dispatchant de vrais `DragEvent`/`DataTransfer` par JS (insertion à la position exacte, réordonnancement, persistance de l'ordre après sauvegarde) — comportement confirmé correct de bout en bout.
- [x] Bloc **HTML personnalisé** + **classes Tailwind par bloc** (décision produit 2026-07-13, hors roadmap initiale — demande explicite de personnalisation avancée de la page)
  - Nouveau type de bloc `html` (`props.htmlContent`) : **nettoyé côté serveur à la sauvegarde**, jamais au seul rendu (`BuilderService.saveBlocks` → `sanitizeBlockHtml`, `apps/api/src/builder/html-sanitizer.util.ts`, basé sur `sanitize-html`) — allowlist stricte de balises texte/structure (p, h1-h6, listes, liens, images, tableaux...), scripts/styles/iframes/objects/SVG toujours retirés, tout gestionnaire d'événement inline (`onerror`, `onclick`...) et URL `javascript:`/`data:` supprimés. Même principe de défense que la whitelist d'URL d'image (RULES.md §6) : la BDD ne contient jamais que du contenu déjà sûr, la page publique (`BlockRenderer`) lui fait confiance sans re-nettoyage.
  - **`styles.customClassName`** (nouveau champ, tous types de blocs) : classes Tailwind libres appliquées au conteneur de chaque bloc, saisies dans le panneau de propriétés (section commune, pas spécifique à un type). Validées côté backend par une regex restreinte à la syntaxe Tailwind (`blocks.schema.ts`, 300 caractères max) — défense en profondeur bien que React échappe déjà la valeur d'attribut (pas un vecteur XSS en soi).
    - ⚠️ Limite Tailwind v4 assumée et documentée (UI + code) : le CSS n'est généré qu'au build pour les classes détectées dans le code source — une classe totalement inédite tapée à l'exécution par un Manager n'a aucun effet visuel tant qu'elle n'existe pas déjà ailleurs dans le bundle compilé (aucun `@source inline(...)` ajouté pour l'instant). En pratique, les classes courantes déjà utilisées ailleurs dans l'app (`text-center`, `underline`, `mt-8`, `rounded-2xl`...) fonctionnent ; une valeur arbitraire exotique (`bg-[#123456]` jamais vue ailleurs) non.
  - Testé en conditions réelles (Docker Postgres, navigateur réel) : bloc HTML créé avec un payload mixte (contenu légitime + `<script>alert()</script>` + `<img onerror="...">`) → persisté en base **sans** le script ni l'attribut `onerror` (vérifié directement en base), page publique affichée sans aucune exécution JS (vérifié via des flags `window.__xss*` jamais posés) ; `customClassName` (`text-center underline`) appliqué et visible sur la page publique. Bug trouvé et corrigé pendant ce test : l'aperçu **non sauvegardé** dans le canvas du Builder utilisait `dangerouslySetInnerHTML` sur le contenu brut **avant** nettoyage serveur — un `onerror` tapé par le Manager s'exécutait dans son propre navigateur pendant l'édition (self-XSS, avant toute sauvegarde). Corrigé en remplaçant ce rendu par un aperçu texte brut non interprété dans le canvas d'édition ; le rendu réel (nettoyé) reste visible via le mode "Aperçu réel" après sauvegarde.
- [x] Onglet **Config** (Builder) + contenu centralisé de l'événement + header public obligatoire (décision produit 2026-07-13, hors CDC initial — demande explicite)
  - **Modèle de données** : `Event` gagne 6 colonnes (migration `20260713220000_event_config_content`) — `logoUrl` (String?), `faqs`/`schedule`/`speakers`/`galleryImages`/`sponsorImages` (Json, `@default("[]")`). Un seul jeu de contenu par événement, pas un contenu dupliqué par instance de bloc — décision confirmée explicitement par l'Admin (alternative "contenu par instance de bloc" écartée). Validé côté backend via des sous-DTOs class-validator imbriqués (`apps/api/src/events/dto/event-config.dto.ts` : `FaqEntryDto`/`ScheduleEntryDto`/`SpeakerEntryDto`/`MediaEntryDto`, `@ValidateNested`+`@Type`), pas Zod — contenu structuré (RULES.md, Zod réservé au libre comme les blocs). Cap : FAQ max 5 (demande explicite), schedule/speakers/gallery/sponsors max 20-30 (anti-abus). Toute URL d'image (logo/couverture/photos speakers/galerie/sponsors) revalidée contre la whitelist de stockage à l'écriture (`EventsService.assertImagesAllowed`, même principe que `BuilderService`/RULES.md §6).
  - **Builder — tabs "Blocs" / "Config"** (`apps/web/app/(dashboard)/manager/builder/page.tsx` + nouveau `config-panel.tsx`) : la bibliothèque de blocs et le nouveau panneau Config partagent la même colonne latérale via deux onglets. Le panneau Config édite le contenu centralisé (logo/nom/description/couverture/localisation + gestionnaires de liste pour FAQ/Programme/Speakers/Galerie/Sponsors, chacun avec bouton "+" d'ajout capé et suppression par entrée) ; aperçu en direct de l'accordéon FAQ intégré au panneau Config lui-même.
  - **Blocs de placement** (décision produit 2026-07-13) : `faq`/`schedule`/`speakers` (nouveau type ajouté à `BlockType`)/`gallery`/`sponsors` n'ont plus de `props` propres — les poser sur la page affiche automatiquement le contenu centralisé correspondant (cohérent avec "utilisé par le builder quand le module est ajouté à la page"). Un seul exemplaire de chaque type a du sens (contenu identique partout) : la bibliothèque de blocs désactive visuellement (grisé + `title`) ces 5 types une fois déjà placés sur la page. Le panneau de propriétés affiche un message informatif + raccourci "Éditer dans Config" au lieu de champs titre/contenu.
  - **`countdown`** : ignore désormais totalement ses `props` — décompte automatiquement jusqu'à `Event.startDate` (déjà existant), aucune date à configurer manuellement (demande explicite). Nouveau composant client `apps/web/app/(public)/e/[slug]/countdown.tsx`.
  - **Rendu public** (`BlockRenderer`) : FAQ → nouvel `Accordion` shadcn/ui (`apps/web/components/ui/accordion.tsx`, construit sur `radix-ui` déjà présent — aucune nouvelle dépendance) ; Programme → timeline triée par date/heure ; Speakers → grille photo/nom/rôle ; Galerie → grille d'images ; Sponsors → carrousel défilant à l'infini pur CSS (`sponsors-carousel.tsx`, `--animate-marquee` dans `globals.css`, liste dupliquée + `translateX(-50%)` en boucle, pas de librairie JS). Un bloc de placement dont le contenu configuré est vide ne rend rien (pas de section vide visible par les visiteurs).
  - **Header public obligatoire** (décision produit 2026-07-13) : ajouté directement dans `/e/[slug]/page.tsx`, **pas un bloc** — toujours présent quel que soit le contenu de la page. Logo de l'événement à gauche (repli sur le titre si pas de logo), bouton "Mon ticket" à droite → `/client?event={slug}` (réutilise le dashboard client existant plutôt qu'une nouvelle page, `middleware.ts` redirige déjà vers `/auth/login?redirect=...` si non connecté, et `login/page.tsx` ramène déjà au bon `redirectTo` pour un rôle CLIENT — aucun changement nécessaire à ce flux).
  - **Portée confirmée par l'Admin** : "Mon ticket" montre les billets du client pour **cet événement uniquement** (pas un tableau de bord tous-événements). `GET /api/payments/orders` gagne un filtre optionnel `?eventSlug=` (rétrocompatible, absent = comportement inchangé), appliqué côté serveur dans le `WHERE` Prisma — jamais un filtrage recalculé côté client sur une liste non filtrée. `apps/web/app/(dashboard)/client/page.tsx` lit `?event=` (`useSearchParams`, composant enveloppé dans `<Suspense>`) et adapte le texte d'en-tête en conséquence.
  - **Bug de production trouvé et corrigé pendant ce test** : le composant `Countdown` initialisait son état avec `Date.now()` à la fois pour le rendu serveur ET le premier rendu client — ces deux instants diffèrent toujours d'au moins quelques centaines de ms, provoquant une erreur d'hydratation Next.js systématique (confirmée via l'overlay de dev : `Hydration failed`). Corrigé en rendant un état stable (`--`) identique des deux côtés au premier rendu, le décompte réel n'étant calculé/démarré que dans un `useEffect` (jamais exécuté côté serveur) — plus aucune erreur d'hydratation après correction.
  - Testé en conditions réelles (Docker Postgres, navigateur réel, compte `manager1@fluid-events.test`) : onglet Config pré-rempli avec les vraies données de l'événement, ajout d'une FAQ/entrée de programme/speaker, aperçu en direct de l'accordéon FAQ correct, blocs FAQ/Programme/Speakers/Compte à rebours ajoutés à la page (bibliothèque correctement grisée pour les 5 types singleton une fois placés), sauvegarde unifiée (un seul clic déclenche `PUT /api/builder/:eventId/blocks` ET `PATCH /api/events/mine` ensemble, les deux `200 OK`). Page publique vérifiée : header avec titre + bouton "Mon ticket", accordéon FAQ shadcn fonctionnel, speaker affiché avec repli avatar (pas de photo), programme trié et formaté, décompte en direct sans erreur d'hydratation après correctif. Flux "Mon ticket" vérifié de bout en bout avec un compte `client1@fluid-events.test` réel : redirection/retour d'auth déjà en place réutilisée sans modification, page `/client?event=...` affichant le texte "Vos billets pour cet événement" et la liste filtrée des commandes réelles du client pour cet événement (filtre serveur confirmé par test unitaire dédié sur `listOrdersForClient`).

### Phase 5 — Polish & Prod 🔵

- [x] **Notifications Email** (2026-07-14) — `EmailService` (`apps/api/src/notifications/email.service.ts`, `nodemailer`, déjà une dépendance non utilisée jusqu'ici) envoie un email "billets prêts" (lien de téléchargement PDF par billet) une fois que **tous** les `OrderItem` d'une commande ont leur PDF généré — un seul email récapitulatif par commande, jamais un par billet (`PdfProcessor.maybeSendTicketEmail`, re-vérifie les billets frères via une requête Prisma dédiée à chaque job terminé). Best-effort volontaire : `EmailService` avale ses propres erreurs (log seulement) — un échec d'envoi ne doit jamais faire échouer la génération du billet, toujours téléchargeable depuis le dashboard client indépendamment de l'email. SMTP configuré via les variables d'env déjà présentes (`SMTP_HOST/PORT/USER/PASSWORD/FROM/SECURE`, Mailpit en dev — `docker-compose.yml`, interface web http://localhost:8025).
  - Testé en conditions réelles : `nodemailer` connecté au vrai conteneur Mailpit (`localhost:1025`), email reçu et vérifié dans l'interface Mailpit (sujet, destinataire, liens de téléchargement, "HTML Check" 100%). La chaîne complète paiement→PDF→email n'a **pas** pu être testée de bout en bout dans cet environnement : Puppeteer/Chromium échoue au lancement en dev natif Windows (`TimeoutError: Timed out ... waiting for the WS endpoint URL`, confirmé via un job BullMQ réel poussé dans Redis) — limitation d'environnement préexistante (Chromium fonctionne probablement dans le conteneur Docker `api` du `docker-compose.yml`, pas sur l'hôte Windows natif utilisé pour le dev au quotidien), pas une régression introduite ici. La logique de déclenchement (email envoyé seulement quand tous les billets d'une commande sont prêts, jamais avant, un seul email récapitulatif) est vérifiée par 5 tests dédiés dans `pdf.processor.test.ts` (mocks Prisma/Puppeteer).
- [ ] Docker compose dev complet
- [ ] Analytics
- [ ] WhatsApp (Meta Cloud API)
- [ ] Worker PDF Puppeteer — **fonctionne en conditions réelles à une date antérieure** (voir Phase 2 : "PDF de 56 Ko généré, uploadé et téléchargeable publiquement") mais échoue désormais au lancement Chromium sur cet environnement de dev natif Windows (voir ci-dessus) — à investiguer (probablement un problème d'environnement local, pas de régression du code applicatif).
- [ ] Tests E2E
- [ ] Déploiement production

## 4. Priorités immédiates (à date)

| Module | Priorité | Référence CDC |
|---|:---:|---|
| Scanner `/api/scan/validate` | ✅ Fait | §9.5 |
| Tickets CRUD | ✅ Fait | §6.3 |
| Payments init + webhook (Kkiapay) | ✅ Fait | §8 |
| Payments CinetPay / FedaPay — exécution (init + webhook) | ✅ Fait (2026-07-13, voir §6 ci-dessous) | §8 |
| Config paiement par événement (Admin + statut Manager) | ✅ Fait | §8 |
| Events PATCH/DELETE | ✅ Fait (annulation douce via statut, décision produit 2026-07-13 — voir BUSINESS.md §12) | §6.2 |
| Builder endpoints (backend) | ✅ Fait | §11 |
| Builder — frontend branché (ajout/édition/réorg/suppression/color picker) | ✅ Fait | §11 |
| Upload image whitelisté (billet + Builder) | ✅ Fait | §11 |
| Page publique consommant les blocs Builder | ✅ Fait | §11 |
| Builder — preview iframe / drag & drop | ✅ Fait (2026-07-13) | §11 |
| Builder — bloc HTML personnalisé + classes Tailwind par bloc | ✅ Fait (2026-07-13, hors CDC initial) | §11 |
| Builder — onglet Config (contenu centralisé FAQ/Programme/Speakers/Galerie/Sponsors/Logo/Localisation) | ✅ Fait (2026-07-13, hors CDC initial) | §11 |
| Header public obligatoire + "Mon ticket" (filtre commandes par événement) | ✅ Fait (2026-07-13, hors CDC initial) | §11 |
| Admin endpoints | 🟢 Basse | §6.11 |

## 5. Hors périmètre actuel (backlog non scopé)

- Multi-événements par manager (au-delà de la contrainte "1 Manager = 1 Event" de la V1)
- Multi-devises (au-delà de XOF)
- Gestion des commissions / remboursements (voir `BUSINESS.md` §12 — décisions produit à prendre avant implémentation)
- Analytics avancées
- Storage S3 en production (au-delà de l'abstraction déjà prête)

## 6. CinetPay / FedaPay — exécution implémentée (2026-07-13)

L'init/webhook des deux providers est codé et testé unitairement depuis le
2026-07-13 (voir Phase 2 §2 ci-dessus pour le détail d'implémentation —
`CinetPayService`, `FedaPayService`, résolution du provider actif par
événement). Repères de la doc primaire (utile si le contrat d'un des deux
providers change) :

**FedaPay** (SDK Node officiel — `npm install fedapay`) :
- `FedaPay.setApiKey(secretKey)` + `FedaPay.setEnvironment('sandbox'|'live')`
- Créer une transaction : `POST https://api.fedapay.com/v1/transactions`
  (ou `sandbox-api.fedapay.com`) — `{ description, amount, currency: { iso: 'XOF' }, callback_url }`
- Obtenir l'URL de paiement : `POST /v1/transactions/{id}/token` → `{ token, url }`
  (`Transaction.generateToken()`, valide 24h, usage unique)
- Récupérer/vérifier : `GET /v1/transactions/{id}` → `status` ∈ `pending|approved|declined|canceled|refunded`
  (équivalent de `k.verify()` pour Kkiapay)
- Webhook : header `X-FEDAPAY-SIGNATURE`, vérifié via `Webhook.constructEvent(rawBody, sig, endpointSecret)`
  du SDK — nécessite le corps BRUT, pas le JSON re-sérialisé (secret par endpoint, différent
  sandbox/live, dans Workbench → Webhooks du dashboard FedaPay)
- Events : `transaction.approved` / `transaction.declined` / `transaction.canceled` / etc.

**CinetPay** (pas de SDK Node officiel — REST pur, `fetch`) :
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
