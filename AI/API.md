# API Endpoints — Fluid Events

Ce document décrit uniquement les routes **effectivement implémentées** dans
`apps/api/src`. Pour la conception complète prévue (tickets, paiements,
scanner, builder, dashboards), voir [cahier-des-charges.md](./cahier-des-charges.md)
— ces modules ne sont **pas encore développés** (aucun controller au moment
de la rédaction).

## ✅ Implémenté

### Authentication (`AuthController`, préfixe `/api/auth`)

#### GET /api/auth/google
Déclenche le flow OAuth Google (redirection, pas de body). Accepte deux query
params optionnels, propagés via `state` (`GoogleAuthGuard`) pour survivre à
l'aller-retour Google :
- `eventSlug` : session événementielle (durée du JWT calée sur `event.endDate + 24h`).
- `redirect` : URL de reprise post-connexion (ex : `/e/[slug]?resume=1` pour
  reprendre un achat démarré via `/api/buy-redirect`).

#### GET /api/auth/google/callback
Callback OAuth Google. Pose des cookies httpOnly (`access_token`,
`refresh_token`) puis redirige vers `redirect` (décodé du `state`) **si son
origine correspond à `FRONTEND_URL`** (anti open-redirect), sinon vers
`${FRONTEND_URL}/auth/callback` par défaut.

#### POST /api/auth/login
Connexion email/password générique (CLIENT/MANAGER/SUPER_ADMIN) — alternative
de test/dev à Google OAuth (comptes seedés dans `prisma/seed.ts`). Pose les
mêmes cookies httpOnly que le flow Google.

**Body:**
```json
{ "email": "client1@fluid-events.test", "password": "client123" }
```
**Réponse:** `{ "accessToken": "...", "role": "CLIENT" }`

#### POST /api/auth/login/scanner
Connexion email/password réservée aux comptes scanner.

**Body:**
```json
{ "email": "scanner@example.com", "password": "..." }
```

#### POST /api/auth/refresh
Rafraîchit la paire access/refresh token.

**Body:**
```json
{ "refreshToken": "..." }
```

#### POST /api/auth/logout
Efface les cookies d'authentification (`access_token`, `refresh_token`).

### Events (`EventsController`, préfixe `/api/events`)

#### POST /api/events
Créer un événement.

**Body:**
```json
{
  "title": "Conférence Tech 2026",
  "description": "...",
  "slug": "tech-conf-2026",
  "startDate": "2026-08-15T09:00:00Z",
  "endDate": "2026-08-15T18:00:00Z",
  "totalCapacity": 500,
  "image": "url-supabase-storage"
}
```

⚠️ Cette route n'a actuellement **aucun guard d'authentification** dans le
code (`events.controller.ts`) — à sécuriser avant mise en production.

#### GET /api/events/public/:slug
Récupérer la page publique d'un événement par son slug (route publique,
`@Public()`). Note : le slug est bien après `public/`, pas avant.

#### GET /api/events/:id
Récupérer un événement par id.

#### GET /api/events
Lister tous les événements.

#### GET /api/events/mine
Réservé au rôle `MANAGER`. Retourne l'événement du manager authentifié (CDC
§1.4 : 1 Manager = 1 Event), tickets inclus. Alimente le dashboard manager
("Mes billets" / page Billets).

#### GET /api/events/mine/overview
Réservé au rôle `MANAGER`. Statistiques réelles calculées à la volée depuis
les commandes payées et les logs de scan : `{ event, totalRevenue, currency,
ticketsSold, revenueByTicketType: [{name, revenue, count}], scansByScanner:
[{name, scans, lastScanAt}] }`.

#### PATCH /api/events/mine
Réservé au rôle `MANAGER`, ownership implicite (l'événement du manager
authentifié — pas de `:id` dans l'URL). Corps : tous les champs de
`UpdateEventDto` sont optionnels (`title`, `description`, `coverImageUrl`,
`location`, `startDate`, `endDate`, `status`). Aucune state-machine imposée
sur `status` — seule sa validité dans l'enum `EventStatus` est vérifiée
(BUSINESS.md §12 : cycle de vie complet non tranché produit).

**Annulation/republication d'un événement** (décision produit du 2026-07-13,
BUSINESS.md §12) : c'est une transition de statut, pas une suppression —
`{ status: 'CANCELLED' }` / `{ status: 'PUBLISHED' }`, réversible. Aucune
commande/billet n'est touché ; aucun remboursement automatique. Un événement
`CANCELLED` disparaît de `GET /api/events/public/:slug` (404), bloque
`POST /api/payments/init` (403/erreur métier) et fait renvoyer `EXPIRED` par
`POST /api/scan/validate` — les trois découlent du contrôle déjà existant
`event.status === 'PUBLISHED'`, aucun code supplémentaire n'a été nécessaire.
UI : bouton "Annuler l'événement" / "Republier l'événement" sur le dashboard
Manager (`apps/web/app/(dashboard)/manager/page.tsx`).

#### GET /api/events/:eventId/participants
Réservé au rôle `MANAGER`, ownership vérifiée. Liste les participants
(billets **payés** uniquement) : `{ orderNumber, clientName, clientEmail,
ticketName, purchasedAt, isScanned }[]`.

### Scanner (`ScannerController`, préfixe `/api/scan`)

#### POST /api/scan/validate
Valide un QR code scanné (CDC §9.5). Réservé au rôle `SCANNER`
(`@Roles(Role.SCANNER)`, guards globaux).

**Body:**
```json
{ "qrToken": "<jwt signé HS256>" }
```

**Réponse (`ScanValidationResult`):**
```json
{
  "result": "VALID",
  "attendee": { "name": "Jean Dupont", "ticketName": "VIP", "scannedAt": "2026-07-12T..." }
}
```
`result` ∈ `VALID | ALREADY_USED | EXPIRED | INVALID | EVENT_MISMATCH`.
`attendee` n'est présent QUE si `result === "VALID"` et ne contient **jamais**
email/téléphone (minimisation des données, CDC §2.2). Le passage à
`isScanned` est verrouillé via un `updateMany` gardé (`isScanned: false` dans
le WHERE) — anti double-scan garanti au niveau ligne PostgreSQL.

### Tickets (`TicketsController`) — CRUD, réservé au rôle `MANAGER`

Ownership vérifié dans `TicketsService` : un Manager ne peut agir que sur les
tickets de **son propre** événement (`event.managerId === user.id`).

#### POST /api/events/:eventId/tickets
Crée un type de billet pour l'événement `:eventId`.

**Body:**
```json
{ "name": "VIP", "price": 5000, "stock": 100, "currency": "XOF" }
```

#### GET /api/events/:eventId/tickets
Liste tous les tickets (actifs et inactifs) de l'événement.

#### GET /api/tickets/:id
Récupère un ticket par id.

#### PATCH /api/tickets/:id
Met à jour un ticket (tous champs optionnels, `stock` exclu volontairement —
voir `BUSINESS.md` §12).

#### DELETE /api/tickets/:id
Supprime un ticket. Renvoie `409 CONFLICT` (`TICKET_HAS_ORDERS`) si des
commandes existent déjà pour ce ticket (contrainte FK Prisma) — désactiver
(`isActive: false`) plutôt que supprimer dans ce cas.

### Payments (`PaymentsController`, préfixe `/api/payments`)

V1 se concentre sur **Kkiapay** uniquement (CinetPay/FedaPay : aucun SDK ni
doc fournis pour l'instant — voir `ROADMAP.md`).

#### POST /api/payments/init
Réservé au rôle `CLIENT`. Vérifie le billet/événement/fenêtre de vente/stock,
réserve le stock atomiquement et crée un `Order` (`PENDING`) + `OrderItem`
dans une `$transaction`. Kkiapay n'a pas de "checkoutUrl" serveur : le
paiement s'initie côté client via son widget JS — cette route renvoie donc
les paramètres nécessaires à `openKkiapayWidget(...)`, pas une URL de
redirection.

**Body:**
```json
{ "ticketId": "tk-1", "provider": "KKIAPAY" }
```

**Réponse (`KkiapayInitResult`):**
```json
{
  "provider": "KKIAPAY",
  "orderId": "order-1",
  "partnerId": "order-1",
  "amount": 5000,
  "currency": "XOF",
  "publicKey": "pk_live_...",
  "sandbox": true
}
```
`partnerId` (= `orderId`) doit être passé tel quel au widget Kkiapay
(`partnerId` / `data`) — c'est la donnée de corrélation retrouvée dans le
webhook.

#### POST /api/payments/webhook/kkiapay
Route `@Public()` (pas de JWT), authentifiée via l'en-tête `x-kkiapay-secret`
(secret partagé configuré sur le dashboard Kkiapay, comparé en temps constant
via `CryptoService.safeEqual`). Idempotent (`WebhookIdempotencyService`).

⚠️ Anti-fraude obligatoire (doc Kkiapay) : le webhook seul n'est **jamais**
suffisant — la transaction est re-vérifiée côté serveur via `k.verify()`
(`@kkiapay-org/nodejs-sdk`), en comparant `status === 'SUCCESS'` ET le
montant retourné avec `order.totalAmount`, avant de marquer la commande payée.

- Succès confirmé → `Order.status = PAID`, QR généré par `OrderItem`
  (`TicketDesignService.generateQrToken`), profil client enrichi, job PDF
  ajouté à la queue BullMQ `ticket-pdf` (`PdfQueueService.enqueueGeneratePdf`,
  un job par `OrderItem`) — le rendu réel (Puppeteer → upload S3 → mise à jour
  `OrderItem.qrCodeUrl`) se fait de façon asynchrone dans `PdfProcessor`, hors
  du chemin critique du webhook.
- Échec ou incohérence de vérification → `Order.status = FAILED`, stock
  relâché (`StockService.releaseStockAtomic`).
- Toujours répond `200 OK` sauf signature invalide (`401`).

#### GET /api/payments/orders
Réservé au rôle `CLIENT`. Liste les commandes du client authentifié (scoping
par `clientId` directement dans la requête), triées de la plus récente à la
plus ancienne. Alimente le dashboard "Mes billets" (`apps/web/app/(dashboard)/client/page.tsx`).

**Réponse:** tableau d'objets `{ id, orderNumber, status, totalAmount, currency, paidAt, createdAt, event: {title, startDate, location}, items: [{id, ticketName, hasTicket, isScanned}] }`.

#### GET /api/payments/orders/:id
Réservé au rôle `CLIENT`, ownership vérifiée (`order.clientId === user.id`).
Contrairement à la liste, inclut le `qrCode` brut de chaque item (utilisé par
le dashboard pour générer l'image QR à l'affichage, jamais stocké côté client).
Utilisé par le frontend pour poller le statut réel d'une commande après
fermeture du widget Kkiapay (le callback client ne déclenche jamais lui-même
une confirmation — seul le webhook, re-vérifié serveur, fait foi).

**Réponse:**
```json
{
  "id": "order-1",
  "status": "PENDING",
  "totalAmount": 5000,
  "currency": "XOF",
  "paidAt": null,
  "items": [{ "id": "oi-1", "ticketName": "VIP", "hasTicket": false, "isScanned": false }]
}
```

### Builder (`BuilderController`, préfixe `/api/builder`)

#### GET /api/builder/mine
Réservé au rôle `MANAGER`. Retourne l'état actuel de l'`EventPage` de
l'événement du manager authentifié : `{ eventId, blocks, theme, isPublished,
updatedAt }`. Valeurs par défaut (`blocks: []`, `theme: {}`, `isPublished:
false`, `updatedAt: null`) si aucune `EventPage` n'a encore été sauvegardée.

#### PUT /api/builder/:eventId/blocks
Réservé au rôle `MANAGER`, ownership vérifiée (`event.managerId === user.id`,
`eventId` de l'URL jamais fait confiance sans ce contrôle — RULES.md §1).

Corps attendu (validé par `SaveBlocksDto`, schéma Zod — jamais de
`class-validator` ici, RULES.md §6) : `{ blocks: Block[], lastKnownUpdatedAt:
string | null }`. `blocks` limité à 50 éléments, `styles.backgroundColor` en
HEX strict 6 chiffres.

Concurrence optimiste (RULES.md §5, CDC §11.3) : si `EventPage.updatedAt` en
base est strictement postérieur à `lastKnownUpdatedAt`, renvoie `409` (`code:
BUILDER_CONFLICT`) sans écraser le travail d'une autre session.
`lastKnownUpdatedAt: null` signifie « première sauvegarde », jamais de conflit
possible dans ce cas.

**Erreurs** : `400` (`BUILDER_SCHEMA_INVALID`, corps invalide), `403`
(`FORBIDDEN`, événement d'un autre manager), `404` (`EVENT_NOT_FOUND`), `409`
(`BUILDER_CONFLICT`).

Upsert atomique sur `EventPage` (1:1 avec `Event`, `eventId` unique) — ne
touche que le champ `blocks` ; `theme`/`isPublished` sont hors scope de cet
endpoint pour l'instant.

Testé en conditions réelles (Docker Postgres) : sauvegarde initiale,
relecture, 409 sur `lastKnownUpdatedAt` périmé, 400 sur couleur non-HEX, 403
cross-manager, 401 sans session, 403 rôle `CLIENT`, sauvegarde réussie avec
`updatedAt` à jour.

⚠️ Le frontend `apps/web/app/(dashboard)/manager/builder/page.tsx` reste une
maquette statique sans appel réseau — pas encore branché sur ces endpoints.

### Admin (`AdminController`, préfixe `/api/admin`)

#### GET /api/admin/overview
Réservé au rôle `SUPER_ADMIN`. Vue plateforme calculée à la volée : `{
activeEvents, managersCount, revenue30d, currency, ticketsSold, managers:
[{name, email, isActive, eventTitle, eventStatus}], providers: [{name,
configured, isActive, isDefault}], recentLogs: [{action, createdAt}] }`.
`providers` couvre toujours les 3 providers connus (`KKIAPAY`, `CINETPAY`,
`FEDAPAY`), `configured: false` si aucune ligne `PaymentProviderConfig`.

## 🚧 Prévu, pas encore implémenté

Ces routes existent dans le cahier des charges mais n'ont **aucun controller
NestJS correspondant** dans `apps/api/src` pour l'instant :

- `POST /api/tickets/purchase`, `GET /api/tickets/:id` (achat côté client — le CRUD Manager existe, pas encore le flux d'achat public)
- `POST /api/payments/webhook/cinetpay`, `POST /api/payments/webhook/fedapay`

Ne pas les appeler depuis le frontend tant qu'ils ne sont pas livrés.

## Errors

### Standard Response Format (NestJS par défaut)

```json
{
  "statusCode": 400,
  "message": "Erreur détaillée",
  "error": "Bad Request"
}
```

### Common Status Codes

- **200**: Success
- **201**: Created
- **400**: Bad Request (validation error)
- **401**: Unauthorized (missing token)
- **403**: Forbidden (insufficient permissions)
- **404**: Not Found
- **429**: Too Many Requests (rate limit — `ThrottlerModule`)
- **500**: Internal Server Error
