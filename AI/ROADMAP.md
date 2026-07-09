# ROADMAP.md — Fluid Events

> État consolidé à partir de `cahier-des-charges.md` (v4.0.0-r1, révision réaliste, juillet 2026). À mettre à jour à chaque fin de phase — c'est le document qui doit refléter la réalité du code, pas l'inverse.

---

## 1. État global

- **Phase 1 — Fondations** : ✅ **Terminée**
- **Phase 2 — Scanner & Paiements** : 🔴 **En cours**
- **Phase 3 — Events & Tickets** : 🟡 À venir
- **Phase 4 — Builder & Design** : 🟡 À venir
- **Phase 5 — Polish & Prod** : 🔵 À venir

## 2. État des modules V1

| Module | Statut |
|---|---|
| Gestion événements | ✅ Basic CRUD (`EventsService`) |
| Billetterie | 🟡 Module vide, prêt à coder |
| Paiement | 🟡 Module vide, services utilitaires prêts |
| Scanner PWA | ✅ Page caméra + store Zustand + logique de décision |
| Event Builder | 🟡 Module vide, schémas Zod prêts |
| Auth | ✅ Google OAuth + Scanner login + JWT événementiel + RBAC |
| Dashboard | ✅ Pages mockées (admin/manager/client) |
| Notifications | ✅ `PhoneService` (validation E.164) ; Email/WhatsApp à coder |
| Design billet | ✅ QR generation + validation + `buildHtml` sanitisé |
| Analytics | ❌ Pas commencé |
| Storage S3 | ❌ Pas commencé |

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

- [ ] Controller + service Scanner (`POST /api/scan/validate` + `$transaction`)
- [ ] Controller + providers Paiement (Kkiapay / CinetPay / FedaPay)
- [ ] Endpoint webhook avec idempotence + décrément stock atomique
- [ ] Setup BullMQ pour génération PDF asynchrone
- [ ] Génération QR dans `OrderItem` après paiement confirmé

### Phase 3 — Events & Tickets 🟡

- [ ] CRUD Events complet (ownership Manager, statuts, publication)
- [ ] CRUD Tickets (stock, prix, dates de vente)
- [ ] Pages événement publiques SSR (`/e/[slug]`)
- [ ] Export CSV des participants

### Phase 4 — Builder & Design 🟡

- [ ] Controller + service Builder (`saveBlocks` avec validation Zod + concurrence)
- [ ] Upload image design billet (whitelist d'URL)
- [ ] Color picker HEX strict
- [ ] Preview iframe

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
| Scanner `/api/scan/validate` | 🔴 Haute | §9.5 |
| Tickets CRUD | 🔴 Haute | §6.3 |
| Payments init + webhook | 🔴 Haute | §8 |
| Events PATCH/DELETE | 🟡 Moyenne | §6.2 |
| Builder endpoints | 🟡 Moyenne | §11 |
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
