# ROADMAP.md — Fluid Events

> État consolidé à partir de `cahier-des-charges.md` (v4.0.0-r1, révision réaliste, juillet 2026). À mettre à jour à chaque fin de phase — c'est le document qui doit refléter la réalité du code, pas l'inverse.

---

## 1. État global

- **Phase 1 — Fondations** : ✅ **Terminée**
- **Phase 2 — Scanner & Paiements** : 🔴 **En cours**
- **Phase 3 — Events & Tickets** : 🟡 À venir
- **Phase 4 — Builder & Design** : ✅ **Terminée**
- **Phase 5 — Polish & Prod** : 🟡 **En service** — déployée et joignable sur `https://fluidevent.online` depuis le 2026-08-16. Restent : le template WhatsApp approuvé côté Meta (les identifiants Cloud API se règlent depuis l’espace Admin depuis le 2026-08-19, mais aucun envoi réel n’est possible sans template validé — les Manager ne peuvent donc toujours pas se vérifier), un fournisseur de paiement réellement configuré en production (`payment_provider_configs` est vide, aucun encaissement n’aboutira), sauvegardes hors-site, supervision.

## 2. État des modules V1

| Module | Statut |
|---|---|
| Gestion événements | ✅ Basic CRUD (`EventsService`) |
| Billetterie | ✅ CRUD Tickets (ownership Manager) |
| Paiement | ✅ Kkiapay + CinetPay + FedaPay (`init` + webhook + anti-fraude serveur pour les 3), config **par événement** (décision produit 2026-07-13, Admin configure/active, Manager voit un statut + alerte, jamais de choix de provider côté client) |
| Scanner PWA | ✅ Page caméra + store Zustand + logique de décision + `POST /api/scan/validate` |
| Event Builder | ✅ `GET /api/builder/mine` + `PUT /api/builder/:eventId/blocks` branchés bout-en-bout (ownership + validation Zod + concurrence optimiste + ajout/édition/réordonnancement/suppression de blocs + color picker HEX + upload d'image whitelisté) ; page publique `/e/[slug]` rend réellement les blocs sauvegardés (`BlockRenderer`, fallback sur l'ancien template statique si aucun bloc). Testé en conditions réelles de bout en bout (backend + navigateur réel) ; reste à faire : preview iframe dans le Builder, drag & drop |
| Auth | ✅ Google OAuth + Scanner login + login email/password générique + JWT événementiel + RBAC + auth par cookie httpOnly, testé en conditions réelles (voir RULES.md §13-14) puis **en production** (2026-08-16 : `COOKIE_DOMAIN` partage le cookie entre `<domaine>` et `api.<domaine>`, sans quoi le middleware ne le voit jamais). Vérification téléphone WhatsApp : **Manager uniquement**, à la première connexion |
| Dashboard | ✅ Client (Mes billets, Mes commandes, Profil) — plus mockée —, Manager (overview/billets/participants/builder/analytics/profil, onboarding si aucun événement) et Admin (vue plateforme + gestion Managers + vue paiements/événements/logs plateforme) branchés sur données réelles |
| Comptes Manager | ✅ Invitation par email, self-service via Google (`intent=become_manager`), rétention automatique (managers non-abonnés 3j, clients anonymisés 7j après événement), impersonation Admin, 2026-07-14 |
| Notifications | ✅ `PhoneService` (validation E.164) + `EmailService` (Resend/SMTP) + `WhatsappService` (Meta Cloud API) + `SmsService` (Twilio) — 3 canaux "billets prêts" après génération PDF (2026-07-14). WhatsApp nécessite un template approuvé dans Meta Business Manager avant tout envoi réel (voir Phase 5) |
| Design billet | ✅ QR generation + validation + `buildHtml` sanitisé |
| Analytics | ✅ Ventes dans le temps (Manager + Admin) + taux de remplissage par type de billet (Manager), 2026-07-14 — voir Phase 5 |
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

- [x] **Notifications Email** (2026-07-14) — `EmailService` (`apps/api/src/notifications/email.service.ts`, `nodemailer`, déjà une dépendance non utilisée jusqu'ici) envoie un email "billets prêts" (lien de téléchargement PDF par billet) une fois que **tous** les `OrderItem` d'une commande ont leur PDF généré — un seul email récapitulatif par commande, jamais un par billet (`PdfProcessor.maybeSendTicketNotifications`, re-vérifie les billets frères via une requête Prisma dédiée à chaque job terminé). Best-effort volontaire : `EmailService` avale ses propres erreurs (log seulement) — un échec d'envoi ne doit jamais faire échouer la génération du billet, toujours téléchargeable depuis le dashboard client indépendamment de l'email. SMTP configuré via les variables d'env déjà présentes (`SMTP_HOST/PORT/USER/PASSWORD/FROM/SECURE`, Mailpit en dev — `docker-compose.yml`, interface web http://localhost:8025).
  - Testé en conditions réelles, chaîne complète : commande créée via `POST /api/payments/init` réel → `Order` marquée `PAID` + QR signé (mimant `finalizeOrderPaid`) → job réel poussé dans la queue BullMQ `ticket-pdf` (Redis réel) → `PdfProcessor` (serveur de dev réellement en cours d'exécution) a rendu le PDF via Puppeteer, uploadé 55 874 octets sur MinIO (`200 OK`, téléchargement public vérifié), puis déclenché `EmailService` → email reçu et vérifié dans l'interface Mailpit (sujet, destinataire, lien de téléchargement). Un premier essai avait échoué au lancement de Chromium (`TimeoutError: Timed out ... waiting for the WS endpoint URL`) ; confirmé transitoire (probablement Windows Defender scannant le binaire `chrome.exe` fraîchement extrait à son tout premier lancement) — un second essai identique a fonctionné du premier coup, aucune régression ni limitation d'environnement réelle. La logique de déclenchement (email envoyé seulement quand tous les billets d'une commande sont prêts, jamais avant, un seul email récapitulatif) est en plus vérifiée par 5 tests dédiés dans `pdf.processor.test.ts` (mocks Prisma/Puppeteer).
  - **Bascule Resend en prod (2026-07-14)** : `.env.example` anticipait déjà `RESEND_API_KEY`/`EMAIL_FROM` (jamais branché) — `EmailService` choisit maintenant le transport à l'exécution : Resend (`resend.emails.send`) si `RESEND_API_KEY` est configuré, sinon fallback SMTP/Mailpit (dev, inchangé). Resend n'est PAS utilisable en dev pour ce projet : sans domaine vérifié, l'API n'autorise l'envoi qu'à l'adresse du propriétaire du compte Resend lui-même, incompatible avec les adresses de seed `@fluid-events.test` et le confort catch-all de Mailpit — d'où le fallback conservé plutôt qu'un remplacement complet. Testé en conditions réelles : appel réel à `api.resend.com` avec une clé placeholder → rejet d'authentification réel (`401 API key is invalid`), même standard que les autres providers ; chaîne complète re-testée sans `RESEND_API_KEY` (fallback SMTP) → email toujours reçu dans Mailpit, aucune régression. 8 tests dédiés dans `email.service.test.ts` couvrant les deux transports.
- [x] **Notifications WhatsApp** (2026-07-14) — `WhatsappService` (`apps/api/src/notifications/whatsapp.service.ts`) appelle directement l'API Meta Cloud (`POST https://graph.facebook.com/{version}/{phoneNumberId}/messages`, `type: "template"`) — **Meta Cloud API directement, pas Twilio** (le bloc `.env` "WHATSAPP (Twilio)" était une exploration jamais branchée, remplacé par les vraies variables Meta). Déclenché depuis `PdfProcessor.maybeSendTicketNotifications` (renommé depuis `maybeSendTicketEmail`), en plus de l'email, seulement si `PhoneService.normalizeForWhatsapp(client.phone)` renvoie un numéro valide — sinon email seul, jamais d'erreur.
  - **Contrainte plateforme incontournable (pas une limitation de ce code)** : en dehors d'une fenêtre de conversation ouverte par le client (24h), WhatsApp Business n'autorise QUE l'envoi de "message templates" **pré-créés et approuvés manuellement dans Meta Business Manager** — jamais de texte libre. `WHATSAPP_TICKET_READY_TEMPLATE_NAME` (`.env`, défaut `ticket_ready`) référence un template qui doit être créé et approuvé côté Meta (catégorie **UTILITY** — confirmation de commande, pas MARKETING) avant tout envoi réel ; ni cette création ni cette approbation ne sont automatisables depuis le code. Body du template prévu : 3 variables (`{{1}}` nom client, `{{2}}` titre événement, `{{3}}` numéro de commande) — voir `WhatsappService.sendTicketReadyMessage` pour la structure exacte envoyée.
  - Testé en conditions réelles : chaîne complète paiement→PDF→notifications rejouée avec un client ayant un numéro de téléphone (`PhoneService.normalizeForWhatsapp` → format Meta sans `+`) → `WhatsappService` a bien appelé le **vrai** `graph.facebook.com` (pas de mock) et reçu un rejet d'authentification réel (`Invalid OAuth access token - Cannot parse access token`) avec les identifiants placeholder de `.env` — confirme la connectivité et la forme de la requête, même standard de test déjà appliqué à CinetPay/FedaPay/Kkiapay (un vrai succès nécessite un vrai compte WhatsApp Business + template approuvé, indisponibles ici). Email toujours envoyé en parallèle sur la même commande (vérifié dans Mailpit). Logique de déclenchement (skip WhatsApp si pas de téléphone, jamais de crash si l'API échoue, une seule notification par commande) vérifiée par 4 tests dédiés dans `whatsapp.service.test.ts` + 8 tests dans `pdf.processor.test.ts`.
- [x] **Notifications SMS** (2026-07-14) — `SmsService` (`apps/api/src/notifications/sms.service.ts`, Twilio Messaging API — le `twilio` retiré du gap Email/WhatsApp précédent redevient une dépendance réelle, mais pour un usage différent : SMS, pas WhatsApp). 3e canal, envoyé en parallèle d'Email/WhatsApp (pas un vrai repli conditionné à l'échec de WhatsApp — le Cloud API Meta ne renvoie le statut de livraison que de façon asynchrone via webhook, non implémenté ; simplification assumée pour la V1). Contrairement à WhatsApp, aucun template pré-approuvé requis — texte libre, envoyable dès que `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_SMS_FROM` sont configurés. Skip silencieux si le client n'a pas de téléphone valide (`PhoneService.normalizeToE164`).
  - Testé en conditions réelles : chaîne complète paiement→PDF→notifications rejouée avec un client ayant un téléphone → les 3 services ont réagi sur la même commande (Email livré dans Mailpit, WhatsApp et SMS ont chacun atteint leur **vraie** API respective — `graph.facebook.com` et `api.twilio.com`, pas de mock — et reçu un rejet d'authentification réel avec les identifiants placeholder : `401 Authentication Error - invalid username` côté Twilio, code `20003`). Même standard de test que les autres providers du projet. 3 tests dédiés dans `sms.service.test.ts` + couverture étendue dans `pdf.processor.test.ts` (8 tests).
- [x] **Docker compose dev complet** (2026-07-14) — `docker compose up api web` (en plus des services infra déjà utilisés tout du long : postgres/redis/minio/mailpit) construit et démarre réellement toute la stack. Le fichier existait déjà mais n'avait jamais été testé bout-en-bout ; six bugs réels trouvés et corrigés, du plus structurel au plus superficiel :
  1. **`pnpm-workspace.yaml` jamais copié dans l'image** — sans lui, pnpm ne reconnaît pas `/app` comme un workspace et n'installe QUE les devDependencies du `package.json` racine (`turbo`/`typescript`), ignorant silencieusement TOUTES les dépendances de `apps/api`/`apps/web` (`ls node_modules | wc -l` → 2, alors que le log `pnpm install` affichait pourtant "94 packages added" avec succès — la cause racine de presque toute la suite). `apps/api/Dockerfile` et `apps/web/Dockerfile` copient maintenant explicitement ce fichier.
  2. `pnpm dlx prisma generate` récupérait la **dernière** version de Prisma (v7.8.0) au lieu de la version épinglée du projet (v5.22.0) — Prisma 7 a supprimé le support de `url = env(...)` directement dans `schema.prisma`, cassant la génération. Remplacé par `npx prisma generate` (résout la version locale installée).
  3. `packages/types`/`packages/utils` ne sont jamais buildés par `pnpm install` (leur `dist/` — requis par `package.json` `main`/`types` — doit être compilé explicitement, aucun alias tsconfig ne pointe vers `src/`) : ajouté `npx tsc -p packages/{types,utils}/tsconfig.build.json` dans les deux Dockerfiles. Piège rencontré en chemin : un `tsconfig.build.tsbuildinfo` local périmé (mode `composite`) faisait croire à `tsc` que la compilation était déjà à jour et lui faisait sauter l'écriture de `dist/` sans erreur — ajouté à `.dockerignore` (nouveau fichier, absent jusqu'ici) pour ne jamais laisser un cache incrémental local fausser un build "propre". `packages/utils/tsconfig.build.json` excluait aussi mal `*.test.ts`, cassant la compilation sur `Cannot find module 'vitest'` dans ce contexte.
  4. Les volumes anonymes du service `api` protégeaient `/app/node_modules` du bind mount du code source, mais pas `/app/apps/api/node_modules` (les symlinks pnpm per-package vers le store) — `nest` redevenait introuvable au runtime malgré une image qui build correctement. Ajout d'un volume anonyme dédié (et son équivalent pour `web`), plus `/app/packages/{types,utils}/dist`. `/app/apps/api/dist` a dû être retiré des volumes anonymes : `nest start --watch` essaie de le `rmdir()` à chaque redémarrage, ce qu'un point de montage volume interdit (`EBUSY`) — inutile de le protéger en mode watch de toute façon, Nest le régénère en continu. Piège annexe : les volumes anonymes Docker **persistent** entre un `docker compose build` + `up` tant que le conteneur n'est pas explicitement supprimé (`docker compose rm -v`) — reconstruire l'image ne suffit pas à rafraîchir leur contenu.
  5. `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` utilisaient une substitution `${VAR:-}` que `docker compose` ne résout que depuis un `.env` **à la racine du repo** — jamais alimenté (les vraies valeurs vivent dans `apps/api/.env`, un chemin que docker-compose ne lit pas pour cette substitution). Un `.env` racine (gitignored, même convention que le reste) a été créé avec les mêmes valeurs de dev.
  6. `DATABASE_URL` du service `api` contenait littéralement le texte `[REDACTED]` à la place du mot de passe (bug préexistant, pas introduit ici) — remplacé par la vraie valeur de dev, cohérente avec `POSTGRES_PASSWORD`.
  7. Après tout ce qui précède, l'app démarrait mais la page publique `/e/[slug]` restait bloquée indéfiniment ("The user aborted a request", en boucle) : son fetch SSR (composant serveur, s'exécute **dans le conteneur** `web`) utilisait `NEXT_PUBLIC_API_URL=http://localhost:4000` — correct pour le navigateur (le port est mappé sur l'hôte), mais `localhost:4000` depuis l'intérieur du conteneur `web` ne pointe nulle part (c'est le conteneur `web` lui-même, pas `api`). Nouvelle variable serveur-uniquement `INTERNAL_API_URL=http://api:4000` (DNS interne du réseau Docker, jamais préfixée `NEXT_PUBLIC_` donc jamais exposée au bundle client), utilisée en priorité par `fetchEvent()` dans `apps/web/app/(public)/e/[slug]/page.tsx` — les autres usages de `NEXT_PUBLIC_API_URL` (login, scanner, redirection OAuth) restent inchangés, ce sont soit des composants client (s'exécutent dans le navigateur), soit des URLs délibérément construites pour être suivies PAR le navigateur.
  - Testé en conditions réelles, bout en bout : `docker compose up -d api web` (infra déjà démarrée séparément) → les deux conteneurs démarrent sans erreur → `POST /api/auth/login` via `http://localhost:4000` répond `201` avec un vrai JWT → `GET http://localhost:3000/e/concert-festa-2026` répond `200` et contient le vrai contenu de l'événement ("Concert FESTA 2026", "Mon ticket") rendu côté serveur via le réseau Docker interne. Suite de tests + typecheck natifs (hors Docker) revérifiés après coup pour confirmer qu'aucun changement (schema.prisma, tsconfig.build.json) n'a cassé le flux de dev habituel.
  - **Correctif sécurité pendant ce travail** : une première version committait `ENCRYPTION_KEY`/`QR_SECRET`/`JWT_SECRET`/le mot de passe Postgres en clair dans `docker-compose.yml` (fichier tracké, poussé sur un dépôt public) — copiés depuis `apps/api/.env` (gitignored) sans réfléchir au fait que ce fichier-ci ne l'est pas. Repéré et bloqué par le classificateur de sécurité de l'outil Bash avant le push. Corrigé en généralisant le même motif de substitution `${VAR:?message si absent}` déjà utilisé pour `GOOGLE_CLIENT_ID`/`SECRET` — plus aucune valeur à caractère secret en clair dans `docker-compose.yml`.
  - **Prérequis désormais documentés** pour quiconque veut utiliser `docker compose up` en plus du mode hybride (infra Docker + apps natives) déjà utilisé tout du long de ce projet : créer un `.env` à la racine avec `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`POSTGRES_PASSWORD`/`JWT_SECRET`/`QR_SECRET`/`ENCRYPTION_KEY` (voir `apps/api/.env` pour les valeurs de dev — le fichier `.env` racine reste gitignored comme le reste).
  - **Trouvaille annexe, hors périmètre de ce correctif** : `.env.example` à la racine du dépôt (tracké depuis la mise en place initiale du monorepo, `2026-07-08`) contient ce qui ressemble à de vraies valeurs `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (identiques à `apps/api/.env`), pas des placeholders — contrairement à `apps/api/.env.example` qui utilise bien des valeurs factices (`EAAxxxxxxxxxxxx`, etc.). Pré-existant, signalé à l'utilisateur pour décision (rotation des identifiants Google OAuth ?), pas corrigé dans ce commit.
- [x] **Analytics** (2026-07-14) — le CDC ne spécifie concrètement rien ici (§14 "Dashboards par Rôle" et §6.11 sont des renvois vers des sections qui n'existent pas dans le document, probablement perdues lors de la révision "v4.0.0-r1 réaliste" ; `EventAnalytics` n'apparaît que comme nom de modèle, sans détail) — cadré avec l'utilisateur avant d'implémenter plutôt que deviné. Le dashboard Manager avait déjà des KPIs réels (revenus, billets vendus, taux de scan, revenus par type de billet) ; deux ajouts concrets, Manager **et** Admin (décision utilisateur, périmètre initialement proposé pour le Manager seul) :
  - **Ventes dans le temps** — nouveau composant partagé `apps/web/components/ui/sales-trend-chart.tsx` (barres SVG, 30 jours, zero-fill pour ne jamais avoir de trou, infobulle au survol). Un seul axe (revenu) — billets vendus en infobulle plutôt qu'un second axe, jamais de double axe. Nouveau helper pur `apps/api/src/common/analytics.util.ts` (`bucketSalesByDay`, testé isolément) réutilisé par `EventsService.getMyEventOverview` (un seul événement, Manager) et `AdminService.getOverview` (tous événements confondus, Admin — extension demandée en plus du périmètre Manager initial).
  - **Taux de remplissage par type de billet** (Manager uniquement — pas de sens platform-wide, chaque événement a ses propres types de billets) — `stockSold / stock`, donnée déjà en base (`Ticket.stock`/`stockSold`) mais jamais affichée ; réutilise le même style de barre de progression que "Revenus par type de billet" (déjà existant), barre rouge à partir de 90% de remplissage.
  - Testé en conditions réelles : 10 commandes payées créées avec des `paidAt` répartis sur les 30 derniers jours (en plus des commandes déjà accumulées pendant les phases précédentes de cette session), dashboards Manager et Admin rechargés dans un vrai navigateur — inspection directe du DOM (pas seulement une capture d'écran, une lecture visuelle initiale d'une capture compressée avait été trompeuse) confirmant les 30 barres, le zero-fill, les hauteurs proportionnelles au revenu, et le pic du jour courant agrégeant plusieurs commandes ; infobulle au survol vérifiée (date, montant, nombre de billets). Taux de remplissage vérifié avec des données réelles (`Early Bird 139/139 100%` en rouge, `VIP Or 413/468 88%` en terracotta). 4 nouveaux tests dans `analytics.util.test.ts`, tests étendus dans `events.service.test.ts` et `admin.service.test.ts`.
- [x] Worker PDF Puppeteer — re-confirmé fonctionnel en conditions réelles le 2026-07-14 (voir ci-dessus), après un faux-positif transitoire (Chromium/Windows Defender) sur ce même hôte de dev. Coché car aucun gap réel identifié.
- [x] **Tests E2E** (2026-07-14) — Playwright (`apps/web/playwright.config.ts`, `apps/web/e2e/`), scope V1 volontairement resserré sur les flux critiques déjà validés manuellement tout au long de ce développement plutôt que d'essayer de tout couvrir d'un coup :
  - `auth.spec.ts` — connexion email/mot de passe, redirection par rôle (CLIENT → `/`, MANAGER → `/manager`, SUPER_ADMIN → `/admin`), erreur explicite sur identifiants invalides.
  - `builder.spec.ts` — chargement de la bibliothèque de blocs + canvas (`GET /api/builder/mine` réel), ajout d'un bloc Texte, et confirmation qu'un CLIENT authentifié ne voit pas le contenu du Builder (RolesGuard backend, **pas** le middleware Next.js — `middleware.ts` ne vérifie que la présence du cookie, jamais le rôle, comme documenté dans son propre commentaire).
  - `mon-ticket.spec.ts` — le bouton "Mon ticket" du header public mène au dashboard client filtré par événement (`?event=`), et son absence montre bien toutes les commandes.
  - `public-event-page.spec.ts` — header obligatoire, liste de billets, 404 sur slug inexistant, et le CTA "Acheter" construit la bonne URL OAuth (`intent=buy&eventSlug=...`) — la requête vers `/api/auth/google` est interceptée et avortée avant de quitter localhost, un vrai passage par l'écran de consentement Google n'étant pas pilotable sans compte de test OAuth réel.
  - Le flux d'achat complet (webhook provider → paiement confirmé) n'est **pas** testé en E2E — même limitation que le reste du projet (pas de vraies clés marchand sandbox pour Kkiapay/CinetPay/FedaPay), déjà couvert par les tests unitaires + vérifications manuelles en conditions réelles documentées plus haut dans ce fichier.
  - `apps/web/e2e/global-setup.ts` reseed la base avant la suite (comptes de test stables) et supprime spécifiquement l'`EventPage` de l'événement seedé (`prisma/e2e-reset-event-pages.js`, filtré par slug — **jamais** un `deleteMany({})` sans condition, une première version avec suppression non filtrée a été bloquée par le classificateur de sécurité de l'outil Bash à raison, corrigée avant exécution) : `prisma db seed` ne touche jamais `EventPage` (upsert-only), une page Builder sauvegardée pendant une session de dev antérieure restait donc collée à l'événement de test entre deux reseeds et cassait le rendu attendu (template statique de repli) des tests sur la page publique.
  - Testé en conditions réelles à plusieurs reprises : Next.js dev compile chaque route à la demande lors de sa toute première visite, ce qui a d'abord causé de faux échecs par timeout (10s) sur des routes jamais visitées depuis le démarrage du serveur — corrigé en portant les délais d'attente de navigation à 45s et le timeout global par test à 60s. Suite complète (13 tests) exécutée avec succès contre les vrais serveurs de dev (Next.js + NestJS) et Docker Postgres.
  - `pnpm test:e2e` (racine ou `apps/web`) — nécessite Docker infra + `pnpm db:seed` au moins une fois (prérequis non orchestrés par Playwright lui-même, voir le commentaire en tête de `playwright.config.ts`).
- [x] **Comptes Manager étendus — invitation, self-service, rétention, impersonation** (2026-07-14, décision produit — l'Admin n'avait jusqu'ici aucun moyen de créer un compte Manager hors script de seed, aucun toggle actif/suspendu, et 4 liens morts dans la sidebar Admin : `/admin/managers`, `/admin/providers` comblés ici, `/admin/events`/`/admin/logs` restent hors périmètre, non demandés)
  - **Invitation par email** — `POST /api/admin/managers` (`AdminService.inviteManager`) crée le compte immédiatement (`isActive`/`subscriptionActive: true`, `isSelfService: false` — l'Admin l'a déjà vérifié, pas de fenêtre d'essai), `passwordHash` reste `null` jusqu'à ce que le lien reçu (`inviteToken`, `crypto.randomBytes(32)`, expire 7 jours) soit consommé via `POST /api/auth/set-password` (nouvelle page publique `/auth/set-password`, même gabarit visuel que `/auth/login`). `EmailService.sendManagerInviteEmail` **propage** ses erreurs à l'appelant (contrairement à `sendTicketReadyEmail`, best-effort) — le compte reste créé même si l'envoi échoue (`emailSent: false` dans la réponse, l'Admin peut relancer manuellement).
  - **Inscription self-service via Google** (CTA "Devenir organisateur" sur la page d'accueil, `Hero.tsx` → `startGoogleManagerSignup()`) — le frontend envoyait déjà un `intent=buy` à `GET /api/auth/google` depuis longtemps sans que le backend ne le lise jamais (mort silencieux, découvert en creusant ce chantier) ; `GoogleAuthGuard`/`decodeState`/`AuthOrchestratorService.loginWithGoogle` propagent et lisent désormais `intent` via le paramètre `state` OAuth. `intent=become_manager` ne crée un compte `MANAGER` (`isSelfService: true`, `subscriptionActive: false`) que si **aucun compte n'existe encore** pour ce `googleId` (vérifié par un `findUnique` avant l'`upsert`) — un compte existant ne voit jamais son rôle modifié par ce paramètre, aucune escalade de privilège silencieuse possible.
  - **Rétention automatique** (`RetentionService`, `apps/api/src/retention/`, `@nestjs/schedule` — nouvelle dépendance, cron quotidien `EVERY_DAY_AT_3AM`) : les comptes Manager self-service sans abonnement actif depuis plus de 3 jours sont supprimés (compte + événement associé s'il existe, cascade Prisma) — **sauf** si l'événement a au moins une commande enregistrée (`Order.count`), auquel cas la suppression est explicitement annulée et un simple avertissement loggé (la contrainte FK `Order.event` — `Restrict` par défaut, non nullable — l'aurait de toute façon empêchée, et perdre une commande même `PENDING` serait inacceptable). Les comptes Client dont **toutes** les commandes pointent vers des événements terminés depuis plus de 7 jours sont **anonymisés**, jamais supprimés (nom/téléphone/pays/avatar/googleId effacés, email remplacé par une adresse `deleted-{id}@anonymized...` pour libérer la contrainte unique et permettre une réinscription Google propre) — `Order`/`OrderItem` restent intacts pour la comptabilité, `Order.client` étant une relation requise qui interdirait de toute façon la suppression du compte.
  - **Impersonation Admin** — `POST /api/admin/managers/:id/impersonate` émet un JWT `MANAGER` pour le compte ciblé et pose deux cookies httpOnly : `access_token` (session Manager) et `impersonator_token` (le token Admin d'origine, capturé depuis la requête). Volontairement **sans** `refresh_token` pendant l'impersonation (`setImpersonatedAccessCookie`, nouveau `apps/api/src/common/cookies.util.ts` partagé avec `AuthController`) — un refresh token Manager qui traînerait après un retour à l'Admin (`POST /api/auth/stop-impersonation`, `@Public()` car il doit fonctionner même si le token Manager actif a expiré, sécurité entièrement portée par la vérification de signature du cookie `impersonator_token`) aurait pu silencieusement réémettre une session Manager. `GET /api/auth/me` (nouveau) expose `isImpersonating` pour la bannière frontend (`ImpersonationBanner`, injectée dans `app/(dashboard)/layout.tsx`, interroge `/api/auth/me` et affiche "Retour à l'administration").
  - **Vue plateforme paiements** — `GET /api/admin/payment-configs` (nouvelle page `/admin/providers`, lecture seule) liste les configs de tous les événements avec contexte manager/événement, en réutilisant `SAFE_CONFIG_SELECT` (jamais les secrets chiffrés) déjà établi pour la vue par événement.
  - **Onboarding Manager sans événement** — `/manager` détectait déjà `EVENT_NOT_FOUND` mais affichait un message d'erreur générique, bloquant tout compte self-service fraîchement créé (aucune page de création d'événement n'existait côté frontend malgré `POST /api/events` déjà exposé). Nouveau formulaire `CreateFirstEventOnboarding` (co-located dans `manager/page.tsx`) affiché à la place, slug auto-dérivé du titre (filtrage par code point Unicode plutôt qu'une plage regex — un piège d'encodage réel rencontré en cours de route avec des caractères combinants mal transmis).
  - Nouveaux codes d'erreur partagés (`packages/types`) : `EMAIL_ALREADY_EXISTS`, `INVITE_TOKEN_INVALID`, `INVITE_TOKEN_EXPIRED`, `MANAGER_NOT_FOUND`, `NOT_IMPERSONATING`, `USER_NOT_FOUND` ; nouveau `GoogleAuthIntent` (`buy` | `become_manager`).
  - Testé en conditions réelles de bout en bout (Docker Postgres/Redis/Mailpit, navigateur réel) : invitation → email reçu dans Mailpit avec le bon lien → `/auth/set-password` avec le vrai token → mot de passe défini → connexion réussie avec ce mot de passe ; toggle actif/abonnement vérifiés en base ; impersonation → bannière affichée → retour à l'Admin → session restaurée sans ré-authentification, confirmé via `GET /api/auth/me` avant/après ; CTA "Devenir organisateur" cliqué réellement → redirection confirmée jusqu'à `accounts.google.com` (limite connue du projet : un vrai login Google ne peut pas être automatisé sans compte de test OAuth réel) ; onboarding testé de bout en bout — compte self-service sans événement → formulaire → événement créé → dashboard normal affiché. tests backend étendus (`admin.service.test.ts`, `auth-orchestrator.service.test.ts`, nouveau `retention.service.test.ts`), 365 tests backend au total, clean typecheck sur les deux apps.
- [x] **Pages Admin/Manager manquantes + responsive mobile** (2026-07-14) — l'utilisateur a demandé de vérifier "tous les boutons et pages" des deux panels, révélant 3 liens de sidebar morts (`/admin/events`, `/admin/logs`, `/manager/analytics` — sans lien avec `/admin/managers`/`/admin/providers` déjà comblés juste avant) et un constat plus large : le groupe de routes `(dashboard)` (admin/manager/client) n'était pas du tout utilisable sur mobile, jamais vérifié en conditions réelles avant ce jour (les pages publiques — accueil, `/e/[slug]`, login — l'étaient déjà, testées avec leur propre gabarit responsive dès le départ).
  - **Pages manquantes** : `GET /api/admin/events` + `/admin/events` (vue plateforme, revenu/billets vendus recalculés en mémoire depuis les commandes payées — même approche que `getMyEventOverview`) ; `GET /api/admin/logs` + `/admin/logs` (historique paginé + filtrable par action — `getOverview()` n'exposait que les 10 derniers) ; `/manager/analytics` (réutilise `GET /api/events/mine/overview` déjà existant, React Query dédoublonne l'appel avec `/manager` — page dédiée aux graphiques, distincte du dashboard opérationnel qui garde le statut d'événement et le bouton d'annulation).
  - **Diagnostic mobile réel** (redimensionnement du navigateur à 375px, pas une supposition) : `DashboardSidebar` n'avait strictement aucun repli mobile (`hidden md:flex`, rien à la place) — impossible de naviguer hors de la page atterrie sur téléphone, tout dashboard confondu. Corrigé par un menu hamburger + tiroir coulissant (mêmes liens, se ferme à la navigation). Plusieurs grilles CSS à colonnes fixes (`/admin/providers`, `/manager/participants`) coupaient des colonnes hors écran — reconstruites en rangées `flex-wrap` (le motif déjà qui fonctionnait sur `/admin/managers`) plutôt que de forcer une grille à 5 colonnes à devenir responsive. Plusieurs en-têtes (`flex items-center justify-between` sans `flex-wrap`) chevauchaient titre/badges/boutons à 375px. La page Builder était le pire cas : trois panneaux côte à côte (bibliothèque, canvas, propriétés) dans une ligne flex à largeurs fixes, le canvas literalement coupé hors écran — désormais empilés verticalement sous `md` (bibliothèque puis canvas puis propriétés, chacun pleine largeur), le canvas garde un défilement horizontal propre à lui pour le cadre de simulation d'appareil (largeur virtuelle fixe assumée, pas la vraie largeur d'écran).
  - Testé en conditions réelles à 375px et revérifié en desktop pour chaque page touchée (aucune régression) : tiroir mobile ouvre/ferme/navigue, les 3 nouvelles pages chargent de vraies données (pagination et filtre testés sur `/admin/logs`), Builder testé en pile mobile de bout en bout (ajout de bloc → sélection → panneau propriétés → sauvegarde, le tout fonctionnel empilé). 371 tests backend, clean typecheck sur les deux apps.
- [x] **Déploiement production — EXÉCUTÉ EN RÉEL (2026-08-16)**. Historique : guide écrit — **guide écrit** (`AI/DEPLOYMENT.md`, 2026-07-14 : création des comptes Supabase/Upstash/Resend, VPS Hostinger + DNS, TLS/Nginx, `docker compose ... up --build`, migrations). VPS pas encore acheté par l'utilisateur au moment de la rédaction — non exécuté en conditions réelles, contrairement au reste de ce projet. Deux bugs réels trouvés et corrigés dans `docker-compose.prod.yml` en écrivant ce guide (`docker compose config` aurait échoué au premier `up` réel) : cycle de dépendance `api ↔ nginx` (les deux se déclaraient mutuellement `depends_on`, `nginx` devrait être seul à dépendre de `api`/`web`) et plusieurs variables jamais propagées au conteneur `api` en prod (`RESEND_API_KEY`, `GOOGLE_CALLBACK_URL` — restait figé sur `localhost:4000`, cassant tout OAuth en prod —, `TWILIO_SMS_FROM`, `WHATSAPP_*`), plus `INTERNAL_API_URL` manquant côté `web` (même piège SSR déjà documenté et corrigé pour le compose de dev, reproduit à l'identique en prod faute d'override).
  - **Mis en service** sur `https://fluidevent.online` (VPS Hostinger, Nginx + TLS, `docker compose ... up -d --build`). Trois bugs réels n’apparaissant QUE derrière le proxy et le découpage en sous-domaines, tous corrigés :
    1. **Cookie d’auth invisible par le front** — l’API pose ses cookies sans attribut `domain`, ils restaient donc cantonnés à `api.fluidevent.online` tandis que le middleware Next.js tourne sur le domaine nu : dashboard inatteignable malgré une authentification réussie. Nouvelle variable `COOKIE_DOMAIN` (`.fluidevent.online`), vide en dev. Les `clearCookie` la répètent — le navigateur inclut `domain` dans l’identité d’un cookie, un effacement qui ne la reproduit pas échoue en silence.
    2. **URL de retour pointant sur `localhost:3000`** — `request.url` porte l’adresse interne du conteneur derrière Nginx ; remplacé par `request.nextUrl` et un chemin relatif.
    3. **Double encodage** — `encodeURIComponent()` par-dessus `searchParams.set()` produisait `%253A`, renvoyé ensuite en chemin littéral (404).
  - **Blocage produit découvert dans la foulée** : le `PhoneVerificationGate` visait Manager ET Client, or son unique canal (WhatsApp Cloud API) exige des identifiants Meta et un template approuvé à la main — absents en production. Tout client authentifié tombait sur un overlay infranchissable. En place depuis le 2026-07-15, invisible tant que personne n’atteignait le dashboard. Voir la décision produit 2026-08-16 ci-dessous.
  - **Reste ouvert** : identifiants Meta + template AUTHENTICATION approuvé (les Manager restent bloqués sans eux) ; sauvegardes hors-site ; SSH par mot de passe à désactiver ; aucune supervision (voir `DEPLOYMENT.md` §12).
- [x] **Événement : localisation exacte, contact, capacité (2026-08-16)** — `Event` gagne `venueName`/`addressLine`/`city`/`country`/`accessNotes`/`latitude`/`longitude`/`contactPhone`/`expectedAttendees`. Nouveau type de bloc `location` (« Lieu & accès ») rendu sur la page publique, avec bouton Maps construit **sans clé d’API** (les coordonnées priment sur l’adresse — un géocodage peut tomber à plusieurs rues). `location` (texte libre historique) conservé comme repli, sinon les événements antérieurs perdaient leur adresse. `expectedAttendees` est un **plafond réel** : somme des stocks refusée au-delà, à la création d’un billet uniquement (`stock` est absent d’`UpdateTicketDto`, la somme ne peut plus bouger ensuite). Vérifié en navigateur réel (desktop + 375 px).
- [x] **Palier Manager Premium (2026-08-17)** — `User.isPremium`, accordé à la main par l’Admin depuis `/admin/managers`. **Distinct de `subscriptionActive`** à dessein : ce dernier commande la suppression par rétention et vaut déjà `true` pour tout manager invité — le réutiliser aurait rendu Premium l’ensemble d’entre eux. Test dédié : l’endpoint Premium n’écrit jamais l’abonnement ni le statut actif au passage.
- [x] **Événements multi-jours (2026-08-17, réservé Premium)** — trois régimes : `SINGLE_DAY` (défaut, comportement historique), `PASS_ALL_DAYS`, `PER_DAY`.
  - **Modèle** : table `EventDay` (et non du JSON comme `faqs`/`speakers` — le scanner valide contre elle et les billets la référencent, un JSON ne porte ni FK ni unicité), `Ticket.eventDayId`, et `TicketDayScan` avec index unique `(orderItemId, eventDayId)`. `Ticket.dayLabel` reste le texte d’affichage qu’il a toujours été ; le scanner ne l’a jamais lu.
  - **Garde-fous serveur** : quitter SINGLE_DAY exige Premium ; au moins deux journées ; pas deux journées à la même date ; **une journée portant des billets ne peut pas être supprimée** (`eventDayId` est en `SetNull` — l’effacer détacherait des billets vendus, qui n’ouvriraient plus rien). Billet : journée obligatoire en PER_DAY, interdite ailleurs, et appartenant à son propre événement.
  - **Scanner** : `SINGLE_DAY` intouché (aucun calcul de date, même `updateMany` gardé). `PER_DAY` refuse un billet hors de son jour, et refuse un billet sans journée plutôt que d’ouvrir par défaut (cas réel : billet antérieur au changement de régime). `PASS_ALL_DAYS` ne consomme jamais `isScanned` — une ligne `TicketDayScan` par journée, un `P2002` valant `ALREADY_USED`. **Comparaison du jour dans le fuseau de l’événement, pas en UTC** : à 20 h à New York le serveur est déjà au lendemain en UTC, et lire la mauvaise horloge refuserait un porteur le soir même de sa journée (test dédié). Nouveau résultat `WRONG_DAY`, ajouté **des deux côtés** — enum partagé ET enum Prisma, sans quoi l’écriture du journal de scan aurait échoué au premier refus.
  - **Non testé en réel** : aucun événement multi-jours n’existe encore en production, la chaîne complète (déclaration → achat → scan sur deux jours) reste à éprouver.
- [x] **Aperçu du Builder réparé + lien public (2026-08-17)** — la CSP déclarait `frame-src` sans `'self' : le Builder ne pouvait pas embarquer sa propre page publique (« Ce contenu est bloqué »). Corrigé, et piège annexe documenté au §11 de DEPLOYMENT.md : `nginx.conf` est monté comme **fichier**, `git pull` le remplace (nouvel inode) et le conteneur sert l’ancien — `nginx -t`/`reload` valident l’ancien contenu sans erreur, il faut `--force-recreate`. Ajout d’un lien public copiable (tableau de bord + barre du Builder).
- [x] **Tunnel d’achat client — décisions produit 2026-08-16** (aligné sur le parcours ORN City) :
  - **Vérification téléphone = Manager uniquement**, et seulement à la première connexion (`phoneVerifiedAt`, une fois posé, survit à toute reconnexion Google — `loginWithGoogle` n’écrit que le nom et l’avatar). Un client revient voir ses billets avec Google seul.
  - **Récapitulatif détaillé** dans le panier (ligne par ligne + sous-totaux + total), bouton « Payer ». Construit depuis `tickets` complet et non `visibleTickets` : le panier reste cumulé sur tous les onglets de jour.
  - **Numéro collecté pendant le tunnel, sans vérification** (`POST /api/auth/phone`, nouveau) — entre l’authentification Google et l’initiation du paiement, sauté si le compte en a déjà un. `phoneVerifiedAt` reste `null` : un numéro déclaré n’est pas vérifié, les confondre ferait passer un Manager à travers son propre gate.
  - **Pré-remplissage du prestataire** — deux mécanismes distincts : Kkiapay est un widget JS (champs passés côté navigateur), CinetPay et FedaPay sont des pages hébergées (champs client transmis depuis `initPayment`, sous les noms propres à chaque API). Champs omis plutôt qu’envoyés vides.
  - **Compte client après paiement** — lecture retenue : aucun compte *utilisable* pour qui n’a jamais acheté, pas d’absence de ligne en base. La ligne naît à l’OAuth parce que `Order.clientId` est une FK obligatoire posée dès l’initiation ; `RetentionService.deleteOrphanClients()` supprime après 24 h les comptes Google sans aucune commande. `anonymizeStaleClients` ne pouvait pas s’en charger : elle filtre sur `orders: { some: {} }`.
  - **Non vérifié en réel** : le pré-remplissage CinetPay/FedaPay est écrit d’après la documentation — aucune clé marchand sandbox ne permet d’aller jusqu’au formulaire hébergé, même limitation que partout ailleurs sur les paiements.
- [x] **Vérification téléphone obligatoire par code WhatsApp** (2026-07-15) — décision produit : Manager et Client doivent renseigner un numéro de téléphone et le vérifier par code WhatsApp avant de pouvoir utiliser leur dashboard, le pays étant déduit automatiquement de l'indicatif (jamais redemandé séparément) — objectif produit : pouvoir contacter tous les comptes par WhatsApp.
  - **Backend** : 3 nouveaux champs sur `User` (`phoneVerifiedAt`, `phoneVerificationCode`, `phoneVerificationCodeExpiresAt`) ; `PhoneService.deriveCountry()` (déduction pays via `libphonenumber-js`, déjà en dépendance) ; `WhatsappService.sendVerificationCode()` — nouveau template Meta dédié catégorie AUTHENTICATION (`WHATSAPP_VERIFICATION_TEMPLATE_NAME`, distinct de `WHATSAPP_TICKET_READY_TEMPLATE_NAME`), **propage l'erreur à l'appelant** contrairement à l'envoi best-effort des billets (l'utilisateur attend activement ce code) ; `POST /api/auth/phone/request-verification` (code à 6 chiffres, expire 10 min, soumettre un nouveau numéro invalide toujours une vérification précédente) et `POST /api/auth/phone/confirm-verification` (usage unique).
  - **Frontend** : `PhoneVerificationGate` — overlay plein écran bloquant (aucune fermeture possible) dans le layout `(dashboard)`, Manager/Client uniquement ; exemption explicite pour une session Admin en impersonation (sinon un Admin resterait bloqué en assistant un manager non vérifié). Nouvelle page `/manager/profile` (n'existait pas) et mise à jour de `/client/profile`, toutes deux en lecture seule (email/téléphone jamais modifiables depuis aucun formulaire, décision produit explicite) avec badge Vérifié/Non vérifié.
  - **Saisie du numéro façon Telegram** (affinage demandé après un premier essai à l'espacement générique par 2 chiffres, incorrect hors Afrique de l'Ouest francophone) : nouveau `CountryPicker` (`components/ui/country-picker.tsx`) — bouton drapeau+indicatif ouvrant un panneau recherchable par nom de pays OU indicatif numérique (`lib/countries.ts`, ~80 pays, drapeau calculé à la volée depuis le code ISO via les "regional indicator symbols" Unicode, jamais une image) ; formatage du numéro national réellement adapté à chaque pays via `libphonenumber-js` `AsYouType` (nouvelle dépendance côté `apps/web`, déjà présente côté `apps/api`) plutôt qu'un espacement uniforme — vérifié réellement différent entre la France (`06 12 34 56 78`, 2-2-2-2-2) et les États-Unis (`(202) 555-1234`, 3-3-4).
  - **Piège Docker réel rencontré en vérifiant** : les conteneurs `api`/`web` du compose dev montent `apps/api`/`packages` en bind mount mais préservent `node_modules` et `packages/*/dist` en volumes anonymes (protection déjà documentée) — un conteneur démarré avant l'ajout de `@nestjs/schedule` (tâche rétention, 2026-07-14) ou avant une modification de `packages/types` reste desynchronisé indéfiniment tant qu'on ne relance pas `pnpm install`/rebuild **dans le conteneur lui-même** (`docker exec ... pnpm install`, `docker exec ... tsc -p tsconfig.build.json`) — un `prisma generate`/`npm i` côté host ne change rien à l'intérieur du conteneur. Autre piège Prisma : le fichier réellement chargé par le client généré vit sous `.prisma/client/index.d.ts` (858 Ko), pas sous les stubs `@prisma/client/*.d.ts` (~40 octets, simples ré-exports qui ne changent jamais) — grep le mauvais fichier fait croire à tort que `prisma generate` n'a rien fait.
  - Testé en conditions réelles de bout en bout (Docker Postgres réel, navigateur réel, desktop + mobile 375px) : popup bloque un Manager et un Client fraîchement connectés (y compris un compte avec un téléphone déjà présent mais jamais vérifié) ; soumission déclenche un vrai appel à l'API Meta Cloud, rejeté proprement (`Invalid OAuth access token` — attendu sans vrai compte Meta, même limitation déjà documentée pour les billets), erreur affichée en toast sans crash, formulaire reste à l'étape téléphone ; une fois `phoneVerifiedAt` posé en base, la popup disparaît et `/manager/profile`/`/client/profile` affichent le numéro, le pays déduit et le badge "Vérifié". 390 tests backend (46 nouveaux), clean typecheck sur les deux apps.
- [x] **Bascule clair/sombre visible sur toutes les pages** (2026-07-17) — le contrôle n'existait auparavant que sur les pages publiques marketing (`Header/ThemeToggler.tsx`) ; nouveau composant partagé `components/ui/theme-toggle.tsx` (mêmes primitives shadcn/ui `Button` ghost/icon) ajouté dans `DashboardSidebar` (topbar mobile + en-tête desktop, tous rôles) et dans l'en-tête de la page événement publique `/e/[slug]` à côté de "Mon ticket".
  - **Piège réel rencontré en écrivant le composant** : `next-themes` expose `theme` (reste littéralement `"system"` tant que l'utilisateur n'a jamais basculé explicitement) et `resolvedTheme` (le thème réellement appliqué, jamais `"system"`) — comparer `theme === 'dark'` restait bloqué sur l'icône "clair" et le clic rebasculait sur le thème système déjà affiché sans aucun effet visible. Corrigé en lisant `resolvedTheme` partout (même logique que le raccourci clavier `d` préexistant, `ThemeHotkey`).
  - **Faux positif de test rencontré en vérifiant** : le clic automatisé du navigateur (`computer` du pane de prévisualisation) sur ce bouton précis ne déclenchait pas l'événement `onClick` (aucun changement d'état, ni `localStorage`, ni classe `dark` sur `<html>`), laissant croire à un bug de code. Un `.click()` natif déclenché depuis `javascript_tool` a immédiatement confirmé le contraire : bascule correcte de `localStorage`, classe `dark`/`light` sur `<html>`, libellé ARIA, et rendu visuel — sur desktop (1280px), mobile (375px) et la page événement publique. Le bug était une limitation de l'outil d'automatisation sur ce bouton précis, pas dans le code.
  - Clean typecheck web (aucune régression backend, aucun changement backend dans cette tâche).
- [x] **6 thèmes de couleur + sidebar détachée/rétractable** (2026-07-17) — décision produit : Manager et Admin peuvent choisir un thème de couleur pour leur tableau de bord (page "Apparence" dédiée), en plus du clair/sombre déjà existant ; palettes validées par l'utilisateur via un aperçu avant implémentation (artifact HTML, mélanges de 7 teintes par thème).
  - **Architecture CSS** (`globals.css`) : chaque thème (Terracotta/défaut, Océan, Émeraude, Aubergine, Ambre, Ardoise) redéfinit les mêmes primitives de couleur que `@theme` via `[data-color-theme="x"]` (clair) et `[data-color-theme="x"].dark` (sombre) — attribut indépendant de `.dark` (next-themes), les deux se combinent librement sur `<html>`. Aucun composant existant à modifier : tout ce qui utilise déjà `bg-alabaster`/`dark:bg-blackho`/`text-accent-terracotta`/etc. change de couleur automatiquement. `--color-primary` (boutons, lien de nav actif) référence désormais `--color-accent-terracotta` au lieu d'un ink noir/blanc fixe — décision explicitement validée sur l'aperçu (les CTA portent la couleur de marque du thème actif) ; `--color-primaryho` calculé via la syntaxe de couleur relative CSS (`oklch(from var(--color-accent-terracotta) calc(l - 0.1) c h)`) pour rester correct automatiquement, thème par thème, sans dupliquer une valeur.
  - **Frontend** : `ColorThemeProvider` (`components/color-theme-provider.tsx`, même mécanisme que le clair/sombre — attribut sur `<html>`, persisté en `localStorage`, préférence personnelle par navigateur, pas de champ backend) ; `ColorThemePicker` (grille de swatches, application instantanée) ; pages `/manager/appearance` et `/admin/appearance` (pas Client/Scanner) + entrées de sidebar correspondantes.
  - **Piège Tailwind v4 rencontré en vérifiant** : les nouvelles primitives (`--color-accent-2/3`, `--color-chart-1..4`) n'apparaissaient dans aucune règle générée tant qu'aucune classe (`bg-accent-2`, etc.) ne les référençait dans le code scanné — `@theme` seul ne suffit pas, Tailwind v4 élague les tokens jamais utilisés par une classe réelle.
  - **Refonte sidebar** (`components/dashboard/sidebar.tsx`, demandée avec image de référence) : panneau desktop détaché (marge + coins arrondis + ombre plutôt qu'une barre plein bord) et rétractable (icônes seules, bouton dédié, état persisté en `localStorage` séparément du thème) ; tiroir mobile existant inchangé.
  - **Piège Docker réel rencontré (x3 dans cette tâche)** : les mêmes symptômes déjà documentés pour `packages/types`/`node_modules` désynchronisés s'appliquent aussi à `globals.css` et aux nouveaux fichiers de route (`page.tsx` neufs) — le serveur Next.js dev de ce conteneur ne les détecte pas toujours via le bind mount seul (variable de couleur CSS lue comme figée dans le navigateur, nouvelle route retournant 404 malgré le fichier présent sur disque) ; `docker restart fluid-events-web` résout à chaque fois, un simple rechargement navigateur ne suffit pas.
  - Testé en conditions réelles (Docker, navigateur réel, vraie session Super Admin et Client — pas seulement Manager) : les 6 thèmes vérifiés en clair ET en sombre, desktop (1280px) et mobile (375px), sur `/manager`, `/manager/appearance`, `/admin/appearance`, `/manager/tickets` ; persistance confirmée après rechargement complet ; sidebar rétractable testée (collapse/expand, icônes+tooltips, glyphe "F" en mode réduit) sans régression sur le tiroir mobile ni sur aucune page (Builder 3 panneaux, tableaux `/admin/providers`/`/admin/managers`/`/admin/logs`, `/client`/`/client/orders`/`/client/profile`, `/scanner/scan`). Clean typecheck web.
- [x] **Branding plateforme — logo/icône SVG configurables (page Admin dédiée)** (2026-07-17) — décision produit : le Super Admin peut uploader un logo SVG complet et une icône SVG compacte qui remplacent le texte "Fluid Events" partout où un logo devrait apparaître (sidebar étendue/réduite, tiroir mobile, en-tête du site public, icône de la page de connexion, favicon) — réglage plateforme unique (pas une préférence personnelle comme le thème de couleur), rendu automatiquement en blanc en mode sombre quelle que soit la couleur d'origine.
  - **Backend** : modèle Prisma singleton `PlatformSettings` (`id` fixe `"singleton"`, `logoSvg`/`iconSvg` en `Text`) ; `svg-sanitizer.util.ts` (réutilise `sanitize-html`, déjà en dépendance pour le bloc HTML du Builder) — allowlist stricte de tags/attributs de dessin vectoriel, rejette `script`/`foreignObject`/`use` (référence externe) et tout gestionnaire d'événement `on*`, jamais dans la liste autorisée. `PlatformSettingsService`/`Controller` : lecture publique `GET /api/platform-settings` (`@Public()` — nécessaire pour les pages marketing/connexion non authentifiées), écriture `PUT /api/admin/platform-settings` (`SUPER_ADMIN` uniquement, ajoutée à `AdminController` par convention). Tri-état par champ côté DTO (absent = ne pas toucher, `null` = réinitialiser, chaîne = nouveau SVG à assainir).
  - **Frontend** : `BrandLogo`/`BrandIcon` (`components/brand/brand-logo.tsx`) — rendu SVG inline (`dangerouslySetInnerHTML`, contenu déjà assaini côté API) plutôt qu'un `<img>`, pour que le filtre `dark:img-white` s'applique quelle que soit la couleur d'origine ; repli sur le texte "Fluid Events" (logo) ou un `fallback` fourni par l'appelant (icône) tant que rien n'est configuré. Page `/admin/branding` (upload `.svg` via `FileReader`, aperçu live clair+sombre côte à côte, réinitialisation par champ). Route dynamique `/brand/icon` servant `iconSvg` comme favicon via `metadata.icons` (coexiste avec le `favicon.ico` statique existant, repli automatique pour les navigateurs sans support SVG).
  - **`img-white` corrigé** (`globals.css`) : l'utilitaire existait déjà (calibré à l'origine pour un usage jamais branché) mais utilisait une chaîne de filtres CSS approximative ; remplacé par `brightness(0) invert(1)`, qui garantit un blanc pur quelle que soit la couleur/teinte d'entrée (la chaîne précédente ne l'aurait pas fait pour un logo multicolore).
  - **Trois bugs réels trouvés en vérifiant en conditions réelles** (aucun détecté par les tests unitaires ni le typecheck — seule la vérification navigateur les a révélés) :
    1. *DI cassée au démarrage* : `PlatformSettingsModule` n'importait pas `AuthModule`, qui fournit et exporte `AuditService` (pas un provider global dans ce projet) — l'app NestJS refusait de démarrer (`Nest can't resolve dependencies of PlatformSettingsService`). Les tests unitaires (mocks constructeur direct) ne testent jamais le câblage réel des modules — seul un vrai boot Nest le révèle.
    2. *Casse SVG cassée par le parser HTML* : `sanitize-html` (basé sur `htmlparser2`, orienté HTML donc insensible à la casse par défaut) mettait en minuscule `viewBox`→`viewbox`, `clipPath`→`clippath`, `linearGradient`→`lineargradient` — attributs/balises à casse mixte et significative en SVG/XML, qui ne matchaient alors plus l'allowlist et disparaissaient silencieusement (aucune erreur). Corrigé via l'option `parser: { lowerCaseTags: false, lowerCaseAttributeNames: false }`. `<text>` avait aussi été oublié de l'allowlist — son contenu texte fuyait en dehors de la balise plutôt que d'être supprimé avec elle (`disallowedTagsMode: 'discard'` retire la balise mais garde son contenu).
    3. *Logo invisible (0×0px)* : le composant enveloppait le SVG injecté dans un `<span>` avec `[&_svg]:h-full`, mais aucun appel du composant ne donnait de hauteur explicite au `<span>` lui-même — `height: 100%` d'un parent sans hauteur définie se résout à 0. Corrigé en ajoutant une hauteur explicite (`h-6`/`h-7`) à chaque emplacement (sidebar ×3, en-tête public).
  - Testé en conditions réelles de bout en bout (Docker, navigateur réel, vraie session Super Admin) : upload simulé via `fetch` authentifié (le pane de prévisualisation ne peut pas piloter un vrai sélecteur de fichier natif) avec un logo (`viewBox` + `<text>`) et une icône (`linearGradient`) réels — sanitization vérifiée correcte sur la réponse API ; un SVG malveillant (`<script>` + `onload`) confirmé entièrement supprimé par un vrai appel `PUT` ; rendu confirmé visuellement correct (logo/icône visibles, badge blanc plein en mode sombre) sur `/admin`, la sidebar réduite, la barre mobile, l'en-tête public et la page de connexion, en clair ET en sombre, desktop et mobile. 410 tests backend (20 nouveaux), clean typecheck sur les deux apps. Données de test réinitialisées (`logoSvg`/`iconSvg` remis à `null`) avant de conclure.
- [x] **États hover/focus/pressed cohérents + configuration paiement retrouvable** (2026-07-17) — deux retours utilisateur traités ensemble : (1) les états clavier/souris des éléments cliquables étaient mal gérés/incohérents sur l'ensemble de l'app ; (2) impossible de retrouver où configurer les clés de paiement.
  - **Paiements introuvable — cause réelle** : `/admin/providers` (libellé "Paiements" dans la sidebar) n'affichait qu'un résumé LECTURE SEULE des configurations déjà existantes ; la vraie configuration (`PaymentConfigPanel` — formulaire complet clé publique/secrète/webhook/site ID) n'était accessible que via une icône engrenage sans aucun libellé sur "Vue d'ensemble", et n'apparaissait même pas pour un événement sans configuration existante. Corrigé : `/admin/providers` récupère désormais tous les managers (`GET /api/admin/managers`, événement configuré ou non) et ouvre le même `PaymentConfigPanel` par ligne — cette page est maintenant le vrai point d'entrée. Bouton ramené à une icône simple (avec `title`/`aria-label`, sans texte visible) sur demande explicite après un premier essai avec libellé texte — suffisant maintenant que l'emplacement est correct.
  - **Filet de sécurité clavier global** (`globals.css`) : `button/a/input/select/textarea/[role="button"]/[tabindex] :focus-visible` reçoivent un anneau visible (`outline: 2px solid var(--color-ring)`) — l'app mélangeait le composant `Button` (déjà correct) avec des `<button>`/`<select>` bruts un peu partout (panneaux de config, pickers, Builder) sans aucun retour clavier. La couleur suit `--color-ring`, donc le thème de couleur actif et le mode sombre automatiquement — vérifié sur le thème Océan en sombre (anneau cyan) et Terracotta en clair (anneau orange). `:focus-visible` uniquement, jamais au simple clic souris.
  - **Composant `Button`** : ajout d'un état pressé (`active:scale-[0.97]`, `active:transition-none` pour un retour instantané) commun à tous les variants, plus un assombrissement `active:bg-*/70-80` par variant — l'état "pressed" était totalement absent auparavant (seuls hover/focus existaient).
  - **"Traits stroke" trop marqués en mode sombre — mauvaise cible corrigée après coup** : le retour initial ("traits stroke trop prononcés en dark mode") a d'abord été mal interprété comme les TRAITS D'ICÔNES (lucide-react) — deux essais dans cette direction (`stroke-width`/`opacity` réduits, puis `stroke-opacity: 0.2` sur toutes les icônes) ont été explicitement rejetés par l'utilisateur ("tu n'as pas fait ce que je voulais") et intégralement annulés (icônes revenues à 100%, comme à l'origine). La vraie cible : les **bordures** (`border`) des cartes/en-têtes/sidebar en mode sombre, uniquement — corrigé en ajoutant un alpha 20% à `--color-strokedark` (hex8 `#2e2c2933` pour Terracotta, `/ 0.2` en oklch pour les 5 autres thèmes), qui alimente `--color-border`/`--color-input` (`.dark` partagé) donc toutes les bordures, quel que soit le thème actif — jamais en clair (`--color-stroke` reste plein).
  - **Correctif restant après un premier essai incomplet** : l'alpha 20% posé sur `--color-strokedark` ne suffisait pas partout — capture d'écran utilisateur à l'appui, le séparateur en pied de sidebar (au-dessus de "Réduire"/"Déconnexion") restait plein/tranché. Cause : le reset Tailwind de base (`*, ::after, ::before... { border-color: var(--color-gray-200, currentcolor) }`) donne sa couleur à TOUT `border`/`border-t`/`border-b`/etc. utilisé SANS classe de couleur explicite (`border-t` seul, très répandu dans l'app) — `--color-gray-200` est un gris Tailwind générique jamais personnalisé ici, totalement indépendant du thème actif et du mode sombre. Recâblé sur `var(--color-border, currentcolor)` : chaque bordure de l'app, avec ou sans utilitaire de couleur explicite, suit désormais le thème et le mode actifs.
  - Vérifié en conditions réelles : anneau de focus confirmé visible au clavier sur un `<select>` brut (aucun avant), couleur confirmée suivre le thème Océan + mode sombre ; boutons "Configurer" confirmés icône seule avec tooltip sur `/admin` et `/admin/providers` ; nouveau flux de configuration testé de bout en bout (ouverture du panneau sur un événement sans configuration existante). Icônes reconfirmées à 100% d'opacité (`getComputedStyle` : `opacity`/`strokeOpacity` = 1) après annulation des deux essais rejetés ; séparateur de pied de sidebar (celui pointé par l'utilisateur) confirmé `rgba(46, 44, 41, 0.2)` en sombre/Terracotta, bordure de carte confirmée `oklch(0.29 0.02 232 / 0.2)` en sombre/Océan (20% exact, thème par thème, reset global inclus), et confirmée pleine/opaque en clair sur les deux (aucune régression). Clean typecheck web.

### Refonte page publique + espaces client/scanner (2026-08-17)

Brief utilisateur traité point par point, tout déployé et vérifié en production.

- **Partenaires invisibles sur desktop/tablette** — bug arithmétique : le marquee translate de -50%, ce qui n’est continu que si une copie couvre le conteneur. Trois logos ≈ 600 px contre 1152 px → la bande sortait du champ. Un `min-w-full` NE corrige PAS (le pourcentage se résout contre la bande `w-max`, dont la largeur vient de son contenu : contrainte circulaire, mesurée sans effet). Le composant mesure et répète jusqu’à couvrir, recalcule au redimensionnement.
- **Bouton WhatsApp** dans la box contact (lien `wa.me`, chiffres seuls), aligné sur le style de « Ouvrir dans Maps » ; hauteurs des box égalisées côte à côte (c’étaient les cartes INTERNES qui ne remplissaient pas la colonne, pas la grille).
- **Cartes de billet** : nom + indications + prix sur une ligne, incrémenteur dévoilé au clic et replié au second (l’en-tête est un `<button>`, l’incrémenteur EN DEHORS — imbriquer des boutons est invalide). Désélectionner remet la quantité à 0.
- **Témoignages** en carrousel `scroll-snap` (entrées dans `block.props`, comme la frise — pas de migration). L’état des flèches ne dépend plus des seuls événements `scroll` : certains contextes n’en émettent aucun.
- **Bloc vidéo + hero en deux colonnes** — composant `MediaShowcase` partagé : autoplay muet à l’entrée dans le viewport, curseur en bouton play, lecture sonore en pop-up. Formats réels 4:5 / 1:1 / 9:16 / 16:9. Fond du hero = même média, flouté+assombri (image) ou en cover muet (vidéo). **Upload étendu à MP4/WEBM, 40 Mo** (images toujours 5 Mo ; endpoint logos inchangé). Les URL média passent la même whitelist d’origine que les images.
- **Espace client hors du gabarit dashboard** — groupe de routes `(client)`, en-tête au lieu de sidebar, apparence de la page publique. **Scanner** idem, écran noir conservé (salles sombres) avec l’accent de l’organisateur ; `/api/auth/me` expose désormais `eventSlug` pour un compte SCANNER.
- **`.public-surface`** (globals.css) : les thèmes de couleur des dashboards sont posés sur `<html>` et héritent PARTOUT — « ne pas les appliquer » ne suffit pas, il faut redeclarer la palette de base. Attention : redeclarer les SOURCES ne suffit pas non plus, les variables dérivées (`--color-primary-foreground`) se figent sur `:root` (même piège que la police, cf. event-theme.ts).
- **Contraste mode sombre : 19 échecs WCAG AA → 0** (pire ratio de la page 2,18 → 5,71). Causes : paire de gris inversée à 21 endroits (`text-manatee dark:text-waterloo` — la convention est l’inverse), héritage du thème Océan sur la page publique, variables dérivées non re-résolues, accent clair du mode sombre perdu. `readableForeground` choisit désormais l’encre au meilleur contraste MESURÉ, plus sur un seuil de luminance fixe qui ne garantissait aucun ratio.
  - **Non couvert** : le mode clair signale encore des textes blancs sur images assombries. Non mesurable par l’audit DOM (la couche d’assombrissement est un FRÈRE derrière le texte, pas un ancêtre) — non prouvé fautif, non prouvé correct.
- **Reste** : harmonisation du rythme vertical entre sections.

### Plafond de places par commande enfin modifiable (2026-08-17)

Relevé champ par champ entre `schema.prisma`, les DTO et les deux formulaires
de billet : `maxPerOrder` était saisissable à la CRÉATION seulement. Un billet
créé avant l'ajout de ce champ restait donc à la valeur par défaut du schéma
(1) à vie, et l'incrémenteur de la page publique n'apparaissait jamais —
l'acheteur ne pouvait prendre qu'une place, sans qu'aucun écran ne l'explique.

- **Cause du point aveugle** : le commentaire du schéma justifiait `@default(1)`
  par « V1 : 1 billet = 1 QR = 1 personne ». Les deux notions sont
  indépendantes — une commande de N places émet N billets, donc N QR. Le défaut
  était un plafond restrictif, pas une contrainte technique. Commentaire réécrit.
- **Correctif** : `maxPerOrder` ajouté au type `TicketRow`, à l'amorce du
  formulaire d'édition et au corps du PATCH. Le serveur l'acceptait déjà
  (`UpdateTicketDto`) — rien à changer côté API. Vide = champ inchangé, la
  mise à jour restant partielle.
- **Champ étiqueté** plutôt que placeholder seul : en modification il est
  pré-rempli, et un « 1 » nu dans une case sans libellé n'apprend rien.
- **Vérifié en conditions réelles** (stack Docker) : PATCH → 200 + persistance
  en base ; soumission depuis le vrai formulaire (Standard 1 → 10) écrite en
  base ; `/api/events/public/:slug` renvoie 10 ; l'incrémenteur de
  `/e/concert-festa-2026` apparaît, monte jusqu'à 10 et se bloque au plafond.
  Suite API : 468 tests / 35 fichiers au vert.
- **Au passage** : le client Prisma du conteneur API était périmé (34 erreurs
  `ticketPolicy`/`eventDay` inconnus, API en échec de compilation depuis
  plusieurs heures). `prisma generate` dans le conteneur — la BDD, elle, était
  déjà à jour (18 migrations).

**Écarts relevés et NON traités** (même défaut, mêmes symptômes) :

| Champ | Statut |
|---|---|
| `saleStartDate` / `saleEndDate` | Appliqués par le serveur (`TICKET_SALE_NOT_STARTED`, `TICKET_SALE_ENDED`) mais saisissables nulle part → préventes et clôtures impossibles à régler, alors que la page publique affiche déjà un bandeau « Prévente ». |
| `isActive` | La liste affiche un badge « Inactif » qu'aucune action ne peut produire ; c'est pourtant la réponse conseillée par l'API quand la suppression est refusée (« désactivez-le plutôt »). |
| `category`, `designTextColor` | Jamais exposés. `designBgColor` l'est sans son pendant texte — un billet illisible est déjà possible. |
| `currency` | À ne PAS exposer : le panier somme sans conversion, le multi-devises est hors périmètre V1. |

### Fenêtre de vente saisissable, plafond figé après la première vente (2026-08-18)

Suite directe de l'entrée précédente : `saleStartDate` / `saleEndDate` étaient
le même défaut que `maxPerOrder`, en pire. Le serveur les faisait respecter
depuis toujours (`TICKET_SALE_NOT_STARTED`, `TICKET_SALE_ENDED` dans
`payments.service.ts`), mais AUCUN écran ne permettait de les définir : les
préventes étaient impossibles à mettre en place, alors que la page publique
affiche déjà un bandeau « Prévente ».

- **Saisie** : deux champs « Ouverture / Clôture des ventes » dans le formulaire
  de billet (création ET modification), bornés l'un par l'autre. Une fenêtre
  inversée bloque l'enregistrement — elle produirait un billet jamais vendable.
- **Effacement possible** : `updateTicket` faisait `dto.saleStartDate ? new
  Date(...) : undefined`, ce qui confond « non transmis » et « vide ». Une date
  posée par erreur ne pouvait donc plus être retirée. Un helper
  `toNullableDate()` distingue les trois cas ; le DTO accepte `null`.
- **Piège évité** : le formulaire de modification ne ré-affichait NI la promo,
  NI la fenêtre, NI le design. Tant que ces champs partaient en `undefined`
  c'était sans conséquence — mais dès qu'une case vide veut dire « efface »,
  rouvrir un billet et enregistrer aurait supprimé ses dates. `startEdit()`
  pré-remplit désormais tout ce que le formulaire réémet. Les dates passent par
  `toLocalInput()` : un `slice(0, 16)` sur l'ISO aurait affiché l'heure UTC.
- **Page publique alignée** : elle proposait les billets hors fenêtre comme
  n'importe quels autres — l'acheteur ne l'apprenait qu'au paiement. Trois
  états distincts désormais (« Épuisé », « En vente à partir du… », « Ventes
  clôturées »), un seul comportement d'interaction. L'affichage n'est qu'un
  confort : la garde reste côté serveur, comme pour `maxPerOrder`.

**Plafond par commande figé dès la première vente** (décision produit
2026-08-18) : les acheteurs suivants joueraient sinon sous une autre règle que
les précédents — même raisonnement que `TICKET_POLICY_LOCKED`. Nouveau code
`TICKET_MAX_PER_ORDER_LOCKED` (409), champ en lecture seule côté formulaire
avec le nombre de ventes en explication. Renvoyer la MÊME valeur reste accepté :
le formulaire réémet tous ses champs, il ne faut pas le punir pour ça.

**Vérification** : 6 tests unitaires ajoutés à `tickets.service.test.ts`
(verrou, valeur identique tolérée, billet invendu libre, `null` efface,
`undefined` n'efface pas, chaîne convertie en `Date`) — 29/29 au vert.

⚠️ **Piège d'environnement à connaître** : `nest start --watch` dans le
conteneur API NE VOIT PAS les écritures faites depuis l'hôte sur le montage
lié. L'API tournait sur un `dist` antérieur, et un premier test « en conditions
réelles » a donc validé du code périmé — le PATCH passait alors que le verrou
existait dans les sources. `docker restart fluid-events-api` force une
reconstruction complète. Toujours vérifier
`grep <symbole nouveau> apps/api/dist/...` avant de conclure quoi que ce soit
d'un test HTTP après une modification côté API.

### Retirer un billet de la vente sans le supprimer (2026-08-18)

Troisième et dernier champ du même défaut : `isActive` existait au modèle et
aux deux DTO, la page publique le respectait (`where: { isActive: true }`),
l'achat le refusait (`payments.service.ts`), et la liste affichait même un
badge « Inactif » — mais **aucune action ne pouvait le produire**. C'était
pourtant la réponse que l'API conseille elle-même quand la suppression est
refusée : le bouton Supprimer d'un billet vendu affiche « Billet déjà vendu —
désactivez-le plutôt », conseil jusqu'ici inapplicable.

- **Un bouton par ligne** (œil / œil barré) en tête du groupe d'actions, à
  côté de celui qui y renvoie. Action réversible et immédiate : pas un champ
  de formulaire, parce que ce n'est pas un attribut qu'on édite, c'est un
  geste qu'on fait.
- **PATCH d'un seul champ** : les dates absentes du corps restent inchangées
  (`toNullableDate`), et le verrou de `maxPerOrder` ne se déclenche pas
  (`dto.maxPerOrder === undefined`) — vérifié sur `Standard`, 696 ventes :
  retrait accepté, plafond intact à 10.
- **Pas de champ à la création** : un billet naît actif, et préparer une vente
  à l'avance relève désormais de la fenêtre de vente, pas d'un billet caché.

**Vérifié en conditions réelles** : retrait de « Test Design OK » → `isActive`
à `false` en base, disparition de `/api/events/public/:slug`, badge « Inactif »
affiché, bouton inversé en « Remettre en vente » ; remise en vente → retour à
l'état initial. « Early Bird », inactif depuis le seed, propose bien « Remettre
en vente ».

**Point de sûreté vérifié par lecture du code** : le scan ne lit JAMAIS
`ticket.isActive` (`scanner.service.ts` ne sélectionne que `name` et
`eventDayId` du billet ; le `isActive` qu'on y trouve est celui du COMPTE
SCANNER). Retirer de la vente un billet déjà vendu ne bloque donc pas l'entrée
de ceux qui l'ont acheté — c'est bien un retrait de vitrine, pas une annulation.

### Refonte haute fidélité de la billetterie publique (2026-08-18)

Refonte menée à partir des captures d'une page concurrente rassemblées par le
client dans `docs/model ui/` — on en reprend la **disposition, l'architecture
d'interface et les patterns d'interaction**, jamais les contenus textuels.

**Épuisement dit à trois niveaux.** Un billet épuisé se signalait par une
opacité et le mot « Épuisé » en gris clair : à l'écran, ça ressemble à un
chargement raté. Désormais l'onglet de la journée porte « Sold out », un
bandeau s'intercale au-dessus de la liste, et un tampon barre la carte (prix
barré). Tampon qui rebondit, bandeau qui clignote — deux rythmes différents et
lents, coupés sous `prefers-reduced-motion`. Nouveau token `--color-soldout`,
distinct de `--color-destructive` : l'un est une enseigne, l'autre un
avertissement, les mélanger tirait l'un des deux hors de son rôle.

**Trois indisponibilités, trois traitements.** Épuisé et clôturé s'éteignent ;
« pas encore en vente » garde son contraste plein et un badge à la couleur de
l'événement — c'est une promesse, pas un reliquat.

**Récapitulatif persistant.** Il n'apparaissait qu'après une première
sélection alors qu'il portait le seul bouton d'achat ET la seule mention de
sécurité du paiement : la réassurance arrivait après la décision. Colonne de
droite visible dès l'état vide (total à zéro, bouton éteint), barre collante
sous `lg`.

**Frise de quatre étapes** (Billets → Vos infos → Paiement → Confirmation) :
on passait d'une carte de billet à une pop-up d'authentification sans préavis.

**Incrémenteur toujours visible** — il fallait d'abord cliquer la carte pour la
« sélectionner ». La carte n'est plus un bouton.

**Deux champs pour alimenter tout ça.** `category` existait en base depuis
l'origine, saisissable nulle part et jamais transmise à la page publique : elle
regroupe maintenant les billets sous un libellé de rang. `features` est nouveau
(migration `20260818090000_add_ticket_features`) : les bénéfices inclus, en
puces cochées sur deux colonnes — une liste se balaie pour comparer deux
formules, un paragraphe se lit. Les deux s'éditent depuis la page Billets. Le
service élague les lignes vides et retronque à 12 × 80 caractères : les bornes
du DTO sont une validation, pas une garantie.

**Carte OpenStreetMap.** Le bloc « Où ça se passe » s'en privait au motif,
écrit dans son propre en-tête, qu'elle « imposerait une clé d'API facturée ».
C'était faux : Leaflet est libre et les tuiles OSM/CARTO ne demandent ni compte
ni clé — seule l'attribution est obligatoire, et elle est affichée. La carte
suit le thème clair/sombre sans rechargement (MutationObserver sur `<html>`),
et le lien d'itinéraire reste à côté d'elle : la carte situe, l'itinéraire fait
partir.

**Trois défauts trouvés en vérifiant :**

- un billet **sans `dayLabel` disparaissait purement et simplement** dès qu'un
  seul autre billet en portait un — le filtre par onglet ne gardait que la
  journée active. Un pass « toutes journées » ou un backstage n'était donc
  jamais proposé, sans le moindre signal à l'organisateur ;
- le bouton WhatsApp du bloc Accès remontait sur la ligne du numéro et le
  recouvrait (`inline-block` → `block`) ;
- sur 375 px, `flex-wrap` gardait le texte et le bloc prix sur la même ligne et
  comprimait le premier jusqu'à un mot par ligne (`basis-full md:basis-0`).

**Vérifié en conditions réelles** : 478 tests API au vert, typechecks web et
API propres, section parcourue en 1451 px et en 375 px — rangs, bénéfices,
frise, sélection, total, bascule colonne/barre, et les trois états d'un billet
en clair comme en sombre, tuiles et attribution comprises.

**Piège d'environnement rencontré** : le conteneur Docker `fluid-events-api`
(build figé) occupait le port 4000, le serveur NestJS local échouait en
`EADDRINUSE` — on testait donc le nouveau frontend contre l'ancienne API sans
le voir. Vérifier `docker ps` avant de conclure quoi que ce soit d'une session
de vérification.

### Image de fond de la page publique (2026-08-18)

`EventTheme` gagne `backgroundImageUrl`, `backgroundOverlay` et
`backgroundBlur` — l'affiche de l'organisateur derrière TOUTE la page, à ne pas
confondre avec `Event.coverImageUrl`, qui n'illustre que le hero et les
partages. Édition dans l'onglet Thème du Builder (dépôt, curseur
d'assombrissement, flou, retrait).

- **Plancher de voile à 35 %, appliqué au RENDU** (`MIN_BACKGROUND_OVERLAY`,
  partagé backend/frontend) — pas seulement à la saisie : un thème écrit avant
  cette règle ne doit pas pouvoir produire une page illisible.
  `readableForeground` sait juger une couleur, pas une photo.
- **Le voile suit l'encre** : blanc en mode clair, noir en mode sombre. La
  première version le mettait en noir dans les deux cas — la page claire
  devenait illisible, du texte sombre sur une photo assombrie.
- **Les gris secondaires sont resserrés** (`--color-waterloo`/`--color-manatee`)
  dès qu'une image est posée : ils sont calibrés contre un aplat connu, or le
  voile borne le fond sans le fixer.
- **Sections « muted » en verre dépoli** : leur voile à 3,5 % ne produit que du
  gris sale au-dessus d'une photo, c'est le flou qui rend au texte un fond calme
  (classe stable `section-tone-muted`, ciblée par `.event-has-backdrop`).
- **Sûreté** : URL soumise à `isAllowedImageUrl` à l'écriture (même garde que
  `props.imageUrl`), puis REVALIDÉE au rendu (protocole http(s), aucun caractère
  capable de sortir du `url('…')`) — une donnée qui part dans une propriété CSS
  ne se relit jamais sur parole. Chaîne vide = geste « retirer ».
- **`position: fixed` et non `background-attachment: fixed`**, ignorée par
  Safari iOS. L'image l'emporte sur la couleur de fond du thème : cette couleur,
  opaque sur le conteneur, repeindrait par-dessus une couche à z-index négatif.

**Vérifié en conditions réelles** : 481 tests API au vert, image servie depuis
MinIO et rendue en clair comme en sombre, panneau Thème piloté dans le
navigateur (curseur borné à 35–90, flou, retrait).

### Formules sur réservation (2026-08-18)

Les tables et packages groupe n'existaient pas dans le modèle : les
organisateurs les fabriquaient en billets ordinaires, annulés à la main après
chaque demande. Un billet payable en ligne pour une formule dont le prix se
discute est un piège pour l'acheteur autant qu'une corvée pour l'organisateur.

- **`Ticket.saleMode`** (`ONLINE` | `ON_REQUEST`, migration
  `20260818100000_add_ticket_sale_mode`) + `requestBadge`, pastille de
  qualification libre affichée AU-DESSUS du nom : c'est une condition d'accès,
  elle se lit avant la formule.
- **Bouton WhatsApp** vers `Event.contactPhone` au lieu de l'incrémenteur, et
  « Réservation sur mesure » au lieu de « / personne » — rien n'est encaissé
  ici, le montant affiché n'est qu'un ordre de grandeur. Sans numéro renseigné,
  la carte dit « Sur réservation » plutôt que d'inventer un canal.
- **Le refus vit dans `payments.service.ts`** (`TICKET_ON_REQUEST_ONLY`), pas
  dans l'affichage : un appel direct à `POST /api/payments/init` se heurte au
  même mur (RULES.md §1). Deux tests le verrouillent, dont le cas passant.
- **Exclues des calculs d'épuisement** : une table créée à stock zéro — cas
  courant, le stock n'ayant pas de sens pour elle — aurait sinon déclaré toute
  une journée complète, bandeau « Sold out » compris.
- **Corrigé au rendu** : les bénéfices passaient à trois lignes par puce sur ces
  cartes, le bouton WhatsApp élargissant la colonne de droite. La grille suit
  désormais la place réellement disponible (`auto-fit`) et non la largeur de la
  fenêtre.

**Vérifié en conditions réelles** : 483 tests API au vert, deux formules rendues
et cadrées en clair comme en sombre, lien WhatsApp construit sur le numéro de
l'événement.

### FAQ deux colonnes et finitions du hero (2026-08-18)

- **FAQ** — l'ancienne version empilait titre puis accordéon étroit : le titre
  disparaissait dès la première question ouverte, et le visiteur déroulait une
  liste sans plus savoir de quoi elle traitait ni à qui s'adresser si sa
  question n'y était pas. Titre, intro et bouton de contact tiennent maintenant
  dans une colonne gauche COLLANTE (`event-faq.tsx`). Accordéon dédié plutôt que
  `ui/accordion`, qui sert aussi le Builder : ici un « + » pivote de 45° pour
  devenir une croix — la même forme dit « ouvrir » puis « fermer ».
- **Hero** — mot d'accent coloré, CHOISI par l'organisateur (champ dans le
  Builder, `props.accentWord`) et jamais deviné : colorer d'office le dernier
  mot mettrait « 2026 » en avant sur « Concert FESTA 2026 ». Sans choix, le
  titre reste d'une seule encre. Ajout d'un indicateur de défilement, masqué
  sous `md` où le pouce trouve le défilement tout seul.
- **Bug de la carte corrigé** (visible en capture) : en mode sombre elle
  s'affichait en damier de tuiles claires et sombres. Deux causes — l'état du
  thème démarrait à « clair » et n'était lu qu'APRÈS la première peinture
  (`useState` initialisé par lecture directe, le composant ne tournant jamais
  côté serveur), et Leaflet conservait ses tuiles au changement d'URL (`key` sur
  le thème pour remonter la couche).

**Vérifié en conditions réelles** : 483 tests API au vert, typecheck web propre,
FAQ parcourue et question ouverte en clair comme en sombre, hero et carte
recapturés après correction.

### Chaque journée avec son lieu et ses horaires (2026-08-18)

Demande produit : sur un événement multi-jours, chaque journée se tient
souvent ailleurs. `EventDay` gagne `location`, `startTime` et `endTime`.

- **Heures civiles « HH:mm » en `String`**, pas en `DateTime` : `date` est
  déjà `@db.Date` pour que le scanner compare un jour du calendrier et non un
  instant. Un `DateTime` aurait rouvert exactement l’ambiguïté de fuseau que
  ce choix ferme. La journée commence à 20h SUR PLACE.
- **Lieu facultatif** : vide, celui de l’événement s’applique — on ne fait pas
  ressaisir ce qui ne change pas.
- **Le piège de l’`upsert`** : il ne mettait à jour que `label` et `order`. Sans
  y ajouter les trois champs, le lieu aurait été saisissable une fois puis figé
  — le défaut même corrigé toute la journée. Idem côté web : `setDays()` ne
  relisait que `label`/`date`, donc ré-enregistrer depuis l’écran Billetterie
  aurait effacé ce qui venait d’être saisi.
- **Garde de cohérence** : une journée qui finit avant de commencer est
  refusée (400 `EVENT_DAYS_INVALID`), et signalée dans le panneau avant l’envoi.

**Un bug de fond découvert en vérifiant** : la page publique construisait ses
onglets de journée sur `Ticket.dayLabel`, le champ décoratif hérité. Or en
régime `PER_DAY` le formulaire ne l’envoie plus — il rattache le billet par
`eventDayId`. Conséquence : **un événement multi-jours n’affichait AUCUN onglet
de journée**, tous ses billets étant fondus dans une seule liste. Vérifié sur
des billets réels : `dayLabel` NULL, `eventDayId` renseigné. Le regroupement
passe désormais par `dayKeyOf()` — la journée rattachée fait foi, `dayLabel`
ne sert plus que de repli pour les événements créés avant les journées.

Les journées manquaient aussi à `getPublicEventBySlug` : sans elles, le lieu
par journée aurait été un champ que personne ne voit.

**Vérifié en conditions réelles** (`conference-tech-2026`, deux journées, deux
lieux) : saisie → base ; modification du lieu et des horaires → persistée
(l’`upsert` corrigé) ; lieu vidé → `NULL` ; horaire inversé → 400. Panneau des
journées pré-rempli des cinq champs, cartes de journée du formulaire de billet
affichant date, horaires et lieu, et page publique basculant
« Palais des Congrès · 09:00–18:00 » ↔ « Campus INP-HB · 10:00–17:30 » selon
l’onglet. 483 tests API au vert, typechecks web et API propres.

### `designTextColor` exposé (2026-08-18)

Dernier champ mort de l’audit du 2026-08-17 : la couleur de FOND du billet
était réglable, pas celle du texte — on pouvait donc déjà fabriquer un billet
illisible sans aucun recours. Les deux sélecteurs sont désormais côte à côte.

`currency` reste volontairement non exposé : le panier somme sans conversion,
le multi-devises est hors périmètre V1.

### Le mode d'achat plutôt qu'un nombre à taper (2026-08-18)

Dernier lot du chantier ouvert le 2026-08-17. `maxPerOrder` était devenu
saisissable, mais sous la forme d’une case numérique nue : un nombre
n'apprend rien à qui ignore sa conséquence. Deux cartes NOMMÉES disent ce qui
se passera à l'achat — « Une place par commande » (billet nominatif, catégorie
rare) et « Plusieurs places » (l'acheteur choisit sa quantité).

- **Le mode se déduit du plafond**, il n’est pas un second état : rien à tenir
  synchronisé, donc rien à désynchroniser. `1` ⇢ première carte, tout le reste
  ⇢ seconde.
- **Le nombre ne s’affiche que dans le second cas** — le montrer toujours
  ramènerait la case nue qu’on vient de remplacer. `min=2` : « 1 » est l’AUTRE
  carte, pas une valeur de ce champ.
- **Défaut « plusieurs places, 10 » affiché**, et non laissé vide : le plafond 1
  du schéma n’est presque jamais l’intention, et une case vide laissait le
  serveur trancher sans le dire.
- **Verrouillé après la première vente** (décision produit du 2026-08-18) : les
  cartes cèdent la place à une phrase qui énonce la règle EN VIGUEUR et sa
  raison — « Jusqu’à 10 places par commande. Figé : 696 place(s) déjà vendue(s)
  sous cette règle. »

**Vérifié à l’écran sur les trois états** : création (carte « Plusieurs »
cochée, plafond 10, champ masqué en basculant sur « Une place ») ; modification
libre sur un billet invendu (état déduit de la vraie valeur, 1 ⇢ 6 enregistré
en base) ; modification verrouillée sur un billet à 696 ventes (cartes
remplacées par la phrase). 483 tests API au vert.

⚠️ **Incohérence du jeu de seed relevée au passage** : `concert-festa-2026`
déclare `expectedAttendees = 500` pour 1 987 places réparties entre ses
billets. Le garde `EVENT_CAPACITY_EXCEEDED` refuse donc TOUTE création de
billet sur cet événement. Ce n’est pas une régression — la donnée de seed est
née hors contrainte — mais elle rend l’écran de création intestable sur cet
événement.

### L'incrémenteur de billet redevient une bascule (2026-08-18)

Le matin même, la sélection au clic avait été retirée au motif qu’elle ajoutait
« un clic et un état à comprendre pour aucun gain », l’incrémenteur devenant
toujours visible. La demande produit a été reformulée : elle est rétablie.

Ce que le compteur permanent coûtait, et qui justifie le retour : sur une
billetterie de plusieurs formules, autant de « 0 » alignés que de cartes, et
aucun état lisible disant lesquelles sont retenues. La sélection porte
désormais cette information.

- **La bascule n’enveloppe pas la carte dans un `<button>`** : celle-ci contient
  une liste de bénéfices (contenu de flux) et l’incrémenteur est lui-même fait
  de boutons — imbriquer des boutons est invalide et casse la navigation
  clavier. C’est donc une surface transparente superposée (`absolute inset-0`),
  au-dessus de laquelle on remonte les seuls éléments qui gardent leur propre
  action : l’incrémenteur et le lien WhatsApp des formules sur mesure.
- **Ni les billets épuisés, ni les formules sur demande, ni les billets hors
  fenêtre de vente ne reçoivent de surface de bascule** — rien à sélectionner.
- **Déselectionner remet la quantité à 0** : garder des places dans un panier
  dont le compteur est masqué serait un piège.

**Vérifié à l’écran** : état initial sans incrémenteur ; premier clic → 1 place,
incrémenteur dévoilé, `aria-pressed=true` ; montée à 3 ; second clic → tout se
referme, panier vide, aucune place résiduelle. Deux billets sélectionnés
simultanément → « 2 billets sélectionnés » au récapitulatif.

⚠️ **Coordination** : ce comportement a été ajouté puis retiré puis rétabli dans
la même journée, par deux sessions différentes. Le commentaire du composant
porte maintenant l’historique et la raison, pour qu’il ne soit pas retiré une
troisième fois par bonne intention.

### Agents de contrôle créés par le manager (2026-08-19)

Le CDC prévoyait des comptes Scanner ; rien dans le dashboard Manager ne
permettait d’en créer un. Les comptes existaient donc, mais seul un accès
direct à la base pouvait en produire — impasse pour un organisateur.

`/api/scanners` (list / invite / promote / setActive / remove) est **toujours
porté par l’événement du manager authentifié**, jamais par un `eventId` reçu du
client : sans cela, un manager pourrait rattacher un agent à l’événement d’un
autre. Deux voies d’entrée, parce que les deux existent dans la réalité :
inviter une adresse qui n’a pas encore de compte (email dédié), ou promouvoir
un client déjà inscrit à l’événement.

Désactiver plutôt que supprimer est l’action par défaut : un agent retiré en
plein contrôle d’accès doit pouvoir être remis en service sans réinvitation.

### Kkiapay essayable, WhatsApp réglable depuis l’Admin (2026-08-19)

Kkiapay n’avait pas la bascule sandbox / live que FedaPay possédait — impossible
d’essayer l’encaissement sans clés de production. Ajoutée.

Les identifiants WhatsApp Cloud API vivaient en variables d’environnement : les
changer imposait un redéploiement. Ils se règlent désormais depuis l’espace
Admin. C’est le verrou qui empêchait les managers de se vérifier (voir Phase 5).

### Le compte à rebours dit le vrai délai (2026-08-19)

Il affichait « L’événement a commencé ! » sur un événement à venir : il comptait
depuis une date sans heure, donc depuis minuit. Redessiné en anneaux (jours /
heures / minutes / secondes) et recalé sur l’horaire réel de la journée.

### Habillage de la page publique (2026-08-20)

Lot d’animation et de couleur demandé d’un bloc :

- **Seconde couleur d’accent** combinée à la première en dégradé sur les boutons
  d’action, avec halo (`color-mix`) et déplacement du dégradé au survol.
- **Dérive du hero** : l’affiche et le badge flottent sur des durées de rapport
  premier (13 s / 8,5 s) — un rapport entier synchroniserait les deux mouvements
  toutes les quelques secondes, et l’œil verrait la boucle. Le survol met en
  pause : on ne lit pas une affiche qui bouge.
- **Révélations à l’entrée dans le viewport** (`reveal.tsx`). Le contenu est
  rendu **visible côté serveur** et n’est masqué que dans l’`useEffect` : sans
  JavaScript, la page reste lisible au lieu d’être blanche.
- Hero centré au mobile seulement, opacité du fond baissée pour laisser
  transparaître la couleur du corps, marges internes du bandeau CTA reprises.

Tout est sous garde `prefers-reduced-motion`.

### Thème clair / sombre réellement piloté (2026-08-20)

**La cause du bug** : le thème de l’événement était injecté en `style` inline.
Un attribut `style` ne peut pas exprimer de variante `.dark` — la page sombre
héritait donc des couleurs claires, en-tête compris. Le thème est maintenant
émis dans une balise `<style>` scopée qui porte `.event-theme` **et**
`.dark .event-theme`.

La palette sombre est **dérivée** de la claire (`deriveDarkAccent`,
`deriveDarkBackground`) en remontant la luminosité jusqu’à un contraste WCAG
d’au moins 4,5:1 sur fond sombre : `#1a237e` passe de 1,40 à 4,85, `#0d5c4d` de
2,35 à 4,74, `#000000` de 1,13 à 4,70. L’organisateur n’a donc rien à régler
pour que sa page tienne dans les deux modes ; un bouton « Personnaliser » ouvre
les trois champs pour qui veut décider lui-même. Imposer trois sélecteurs de
plus à tout le monde ferait payer à la majorité la liberté d’une minorité.

### En-tête paramétrable (2026-08-20)

Logo, titre, entrées de menu et boutons vivaient en dur. Un organisateur dont le
logo disparaissait sur fond sombre n’avait aucun recours. Le Builder expose
désormais : titre, **deux logos** (clair / sombre, le second facultatif), les
entrées de menu à afficher, et les boutons « Acheter » / « Mon ticket » /
bascule de thème.

Deux `<img>` dont l’une est masquée par `dark:hidden`, plutôt qu’un `src` changé
en JS : celui-ci clignoterait au basculement et serait faux au premier rendu
serveur, qui ignore le thème du visiteur.

Partout, **absent = affiché** : un événement qui n’a rien réglé garde exactement
l’en-tête qu’il avait.

### Palette du Builder séparée, et blocs uniques (2026-08-20)

La page publique de production affichait six hero et deux billetteries empilés :
`SINGLETON_BLOCK_TYPES` ignorait `hero` et `tickets`, et n’existait que côté
client. La palette distingue maintenant « Sections de l’événement » (bascules,
un seul exemplaire) et « Blocs libres » (empilables), et décocher une section
retire **toutes** ses occurrences.

### Email d’invitation Manager complété (2026-08-20)

Il n’indiquait ni ce que contient le tableau de bord, ni comment se reconnecter,
ni où trouver de l’aide. Réécrit avec les quatre liens de retour (`/manager`,
`/auth/login`, `/docs`, `/support`) et le délai de 7 jours. `APP_URL` est lu au
chargement du module — le test recharge donc le module avant de l’observer.

### Bloc Accès : carte à gauche, lieu et contact à droite (2026-08-20)

La grille comptait trois enfants, dont un contact posé dans une grille séparée
en dessous. Elle en compte exactement deux : la carte, et une colonne réunissant
lieu et contact. Les deux colonnes gardent la même hauteur, **au desktop
seulement** (416/416 px vérifiés, et 585/585 avec un bloc de plus).

Cause annexe traitée : la carte ne s’affichait sur aucun écran parce que
l’événement n’avait ni latitude ni longitude, et que rien ne le disait à
l’organisateur. Un avertissement l’indique, et coller un lien Google Maps
renseigne les coordonnées (`@lat,lng`, `?q=`, `mlat`/`mlon`, `!3d!4d`, ou
« lat, lon » ; les liens courts et les valeurs hors bornes sont refusés).

### Bloc « Notre histoire » ouvert, et sa frise animée (2026-08-20)

Le bloc ne portait qu’une suite de jalons : ni visuel, ni récit, et rien
d’activable. Un organisateur sans image se voyait imposer un cadre vide, celui
qui n’avait qu’une photo devait inventer trois jalons.

Il accueille désormais une image et un texte, et chaque élément — image, texte,
frise — s’active séparément. Absent = affiché, comme partout ailleurs.

La frise se remplit à l’entrée dans le viewport avec un décalage de 160 ms par
jalon, ce qui fait courir la barre de gauche à droite, dans le sens de la
lecture. Ce n’est pas décoratif : une frise statique se parcourt rarement
jusqu’au bout, et le remplissage dit combien de chemin elle couvre. La barre
s’étire en `scaleX` et non en largeur — animer la largeur forcerait un recalcul
de mise en page à chaque image. Sous `prefers-reduced-motion`, elle est rendue
pleine d’emblée : à moitié remplie et figée, elle passerait pour un bug.

**Vérifié à l’écran** : 0 → 163/325/163 px, décalages de 0 / 0,16 / 0,32 s,
trois points allumés, et décocher un élément le retire du panneau.

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
| Admin endpoints (invitation/self-service/rétention/impersonation Manager, vue plateforme paiements) | ✅ Fait (2026-07-14) | §6.11 |
| Comptes Scanner créés par le Manager (invitation + promotion d’un client) | ✅ Fait (2026-08-19) | §9.5 |
| Identifiants WhatsApp réglables depuis l’Admin | ✅ Fait (2026-08-19) | §10 |
| Thème clair/sombre de la page publique + en-tête paramétrable | ✅ Fait (2026-08-20) | §11 |
| Fournisseur de paiement configuré en production | 🔴 À faire (bloque tout encaissement réel) | §8 |
| Déploiement production (VPS, TLS, cookies inter-sous-domaines) | ✅ Fait (2026-08-16, en service) | — |
| Tunnel d’achat : récapitulatif détaillé + « Payer » | ✅ Fait (2026-08-16) | §8 |
| Tunnel d’achat : numéro collecté sans vérification + pré-remplissage prestataire | ✅ Fait (2026-08-16) | §8 |
| Suppression des comptes clients sans commande (24 h) | ✅ Fait (2026-08-16) | — |
| **WhatsApp Meta : identifiants + template AUTHENTICATION approuvé** | 🔴 **Bloquant** — sans lui aucun Manager ne peut se vérifier | — |
| Paiement réellement abouti (clés marchand sandbox) | 🔴 Jamais testé, les 3 providers | §8 |

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
