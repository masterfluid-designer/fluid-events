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
| Paiement | ✅ Kkiapay (`init` + webhook + anti-fraude serveur) ; CinetPay/FedaPay à faire |
| Scanner PWA | ✅ Page caméra + store Zustand + logique de décision + `POST /api/scan/validate` |
| Event Builder | 🟡 `GET /api/builder/mine` + `PUT /api/builder/:eventId/blocks` branchés bout-en-bout (ownership + validation Zod + concurrence optimiste + ajout/édition/réordonnancement/suppression de blocs + color picker HEX), testé en conditions réelles (backend + navigateur réel) ; reste à faire : upload image (whitelist), preview iframe de la page publique, drag & drop |
| Auth | ✅ Google OAuth + Scanner login + login email/password générique + JWT événementiel + RBAC + auth par cookie httpOnly, testé en conditions réelles (voir RULES.md §13-14) |
| Dashboard | ✅ Client (Mes billets), Manager (overview/billets/participants) et Admin (vue plateforme) branchés sur données réelles ; pages "commandes"/"profil" client et "Page builder" manager encore mockées |
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
- [x] Controller + provider Paiement Kkiapay (`POST /api/payments/init`) — CinetPay/FedaPay non branchés (pas de SDK/doc fournie, V1 se concentre sur Kkiapay)
- [x] Endpoint webhook Kkiapay avec idempotence + décrément/relâche stock atomique + re-vérification serveur anti-fraude (`k.verify()`)
- [x] Flux d'achat client bout-en-bout : intent horodaté → OAuth (eventSlug + redirect propagés via `state`) → reprise sur `/e/[slug]?resume=1` → widget Kkiapay → `GET /api/payments/orders/:id` (polling, le webhook reste seule source de vérité)
  - Testé en conditions réelles (Docker Postgres/Redis, vraie DB) jusqu'à l'ouverture du widget Kkiapay : login, réservation stock atomique, création Order, signature/idempotence webhook, échec+relâche de stock. Non testé : un paiement Kkiapay réellement abouti (nécessite de vraies clés marchand sandbox — `PaymentProviderConfig` seedé avec des clés placeholder non fonctionnelles, à remplacer dans `prisma/seed.ts`).
- [x] Setup BullMQ pour génération PDF asynchrone (`PdfQueueService` + `PdfProcessor`, testé en conditions réelles : PDF de 56 Ko généré, uploadé et téléchargeable publiquement)
- [x] Génération QR dans `OrderItem` après paiement confirmé

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
- [ ] Upload image design billet (whitelist d'URL) — réutiliser le pattern `sanitizeImageUrl`/`buildAllowedImageBase` de `packages/utils` déjà utilisé par `TicketDesignService`
- [ ] Preview iframe de la page publique (le toggle desktop/mobile actuel ne fait que changer la largeur du canvas, ce n'est pas un rendu réel de `/e/[slug]`)
- [ ] Drag & drop réel dans le canvas (l'ajout se fait aujourd'hui en cliquant sur un bloc de la bibliothèque, pas en le glissant)
- [ ] La page publique `/e/[slug]` ne consomme toujours pas `EventPage.blocks` (template statique séparé) — nécessaire pour que la sauvegarde builder ait un effet visible côté visiteur

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
| Payments CinetPay / FedaPay | 🟡 Moyenne (pas de SDK/doc fournie) | §8 |
| Events PATCH/DELETE | ✅ Fait (annulation douce via statut, décision produit 2026-07-13 — voir BUSINESS.md §12) | §6.2 |
| Builder endpoints (backend) | ✅ Fait | §11 |
| Builder — frontend branché (ajout/édition/réorg/suppression/color picker) | ✅ Fait | §11 |
| Builder — upload image / preview iframe / drag & drop | 🟡 Moyenne | §11 |
| Admin endpoints | 🟢 Basse | §6.11 |

## 5. Hors périmètre actuel (backlog non scopé)

- Multi-événements par manager (au-delà de la contrainte "1 Manager = 1 Event" de la V1)
- Multi-devises (au-delà de XOF)
- Gestion des commissions / remboursements (voir `BUSINESS.md` §12 — décisions produit à prendre avant implémentation)
- Analytics avancées
- Storage S3 en production (au-delà de l'abstraction déjà prête)

## 6. Comment maintenir ce fichier

- À chaque fin de sous-tâche cochée dans une phase, mettre à jour la case correspondante.
- À chaque fin de phase, mettre à jour la section "État global" (section 1) et l'état des modules (section 2).
- Si une nouvelle décision produit vient combler un point ouvert de `BUSINESS.md`, ajouter la tâche correspondante ici avec sa priorité.
