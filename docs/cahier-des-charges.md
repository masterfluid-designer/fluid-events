# CAHIER DES CHARGES TECHNIQUE — SaaS Événementiel & Billetterie
**Version** : 4.0.0-r1 (révision réaliste)
**Date** : Juillet 2026
**Stack** : Next.js 15 / NestJS / PostgreSQL / Redis / Prisma / Docker
**Cible déploiement** : Docker Compose (dev) → Conteneurs séparés (prod)
**État actuel** : Phase 1 terminée (fondations), Phase 2 en cours (Events/Tickets)

---

## TABLE DES MATIÈRES

1. [Vision Produit & Périmètre V1](#1-vision-produit--périmètre-v1)
2. [Architecture Globale](#2-architecture-globale)
3. [Structure des Dossiers](#3-structure-des-dossiers)
4. [Rôles & Permissions (RBAC)](#4-rôles--permissions-rbac)
5. [Schéma Base de Données (Prisma)](#5-schéma-base-de-données-prisma)
6. [API Endpoints (NestJS)](#6-api-endpoints-nestjs)
7. [Système d'Authentification](#7-système-dauthentification)
8. [Système de Paiement Multi-Provider](#8-système-de-paiement-multi-provider)
9. [Génération & Validation QR Code](#9-génération--validation-qr-code)
10. [PWA Scanner Mobile](#10-pwa-scanner-mobile)
11. [Event Builder No-Code](#11-event-builder-no-code)
12. [Notifications WhatsApp](#12-notifications-whatsapp)
13. [Design Personnalisé des Billets](#13-design-personnalisé-des-billets)
14. [Dashboards par Rôle](#14-dashboards-par-rôle)
15. [Sécurité & Audit](#15-sécurité--audit)
16. [Variables d'Environnement](#16-variables-denvironnement)
17. [Plan d'Implémentation](#17-plan-dimplémentation)

---

## 1. VISION PRODUIT & PÉRIMÈTRE V1

### 1.1 Proposition de valeur

Plateforme SaaS tout-en-un permettant à des organisateurs africains de créer, vendre et contrôler l'accès à leurs événements sans compétence technique.

### 1.2 Modules V1

| Module | Statut |
|---|---|
| Gestion événements | ✅ Basic CRUD (EventsService) |
| Billetterie | 🟡 Module vide, prêt à coder |
| Paiement | 🟡 Module vide, services utilitaires prêts |
| Scanner PWA | ✅ Page caméra + store Zustand + logique décision |
| Event Builder | 🟡 Module vide, schémas Zod prêts |
| Auth | ✅ Google OAuth + Scanner login + JWT événementiel + RBAC |
| Dashboard | ✅ Pages mockées (admin/manager/client) |
| Notifications | ✅ PhoneService (validation E.164), Email/WhatsApp TODO |
| Design billet | ✅ QR generation + validation + buildHtml sanitisé |
| Analytics | ❌ Pas commencé |
| Storage S3 | ❌ Pas commencé |

### 1.3 Contraintes non-fonctionnelles

- **Performance** : Temps de scan QR < 500ms
- **Mobile-first** : Interface scanner optimisée 375px+
- **Sécurité** : QR signés HS256, anti double-scan, idempotence webhook, XSS mitigé
- **Session** : Client connecté pendant l'événement + 24h

---

## 2. ARCHITECTURE GLOBALE

```
Frontend (Next.js 15 :3000)  ←────→  Backend (NestJS :3001/api)
                                            │
                              ┌─────────────┼─────────────┐
                              ▼             ▼             ▼
                         PostgreSQL      Redis        (future)
                         (Prisma ORM)   (BullMQ)
```

**Règle de sécurité** : NestJS Guards = seul garant de la sécurité. Middleware Next.js = UX uniquement.

---

## 3. STRUCTURE DES DOSSIERS (réelle)

```
apps/
├── web/                        # Next.js 15
│   ├── app/
│   │   ├── page.tsx            # Landing page ✅
│   │   ├── layout.tsx          # Root layout + Providers ✅
│   │   ├── globals.css         # Tailwind v4 ✅
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx      # Sidebar selon rôle ✅
│   │   │   ├── admin/page.tsx  # Dashboard Super Admin ✅
│   │   │   ├── manager/page.tsx # Dashboard Manager ✅
│   │   │   └── client/page.tsx # Dashboard Client ✅
│   │   ├── auth/login/page.tsx # Login (Google + scanner) ✅
│   │   ├── scanner/
│   │   │   ├── page.tsx        # Landing scanner ✅
│   │   │   └── scan/page.tsx   # Caméra QR PWA ✅
│   │   └── (public)/e/         # Pages événement 🟡
│   ├── components/
│   │   ├── ui/                 # shadcn/ui (button, card, input, label, badge, spinner) ✅
│   │   ├── providers.tsx       # React Query + ThemeProvider ✅
│   │   └── dashboard/sidebar.tsx ✅
│   ├── lib/
│   │   ├── api.ts              # Client fetch + ApiError ✅
│   │   ├── auth.ts             # saveIntent / consumeIntent ✅
│   │   └── utils.ts            # cn() ✅
│   └── store/
│       └── scannerStore.ts     # Zustand scanner ✅
│
└── api/                        # NestJS Backend
    ├── src/
    │   ├── main.ts             # Bootstrap + CORS + ValidationPipe ✅
    │   ├── app.module.ts        # Assemble tous les modules ✅
    │   ├── prisma/
    │   │   ├── prisma.module.ts ✅
    │   │   └── prisma.service.ts ✅
    │   ├── auth/
    │   │   ├── auth.module.ts          ✅
    │   │   ├── auth.controller.ts      ✅ (Google OAuth, scanner login, refresh, logout)
    │   │   ├── auth.service.ts         ✅ (generateClientToken, generateScannerToken)
    │   │   ├── auth-orchestrator.service.ts ✅ (loginWithGoogle, loginScanner, refreshTokens)
    │   │   ├── strategies/ (jwt, google) ✅
    │   │   ├── guards/ (jwt-auth, roles) ✅
    │   │   ├── decorators/roles.decorator.ts ✅
    │   │   └── dto/ (login-scanner, refresh-token) ✅
    │   ├── events/
    │   │   ├── events.module.ts    ✅
    │   │   ├── events.controller.ts ✅ (CRUD basique)
    │   │   └── events.service.ts   ✅ (create, get, list)
    │   ├── tickets/         🟡 Module vide
    │   ├── payments/
    │   │   ├── payments.module.ts            🟡 Module vide
    │   │   ├── stock.service.ts              ✅ (décrément atomique)
    │   │   ├── webhook-idempotency.service.ts ✅
    │   │   └── client-profile.service.ts     ✅
    │   ├── scanner/
    │   │   ├── scanner.module.ts   🟡 Module vide
    │   │   └── scan-decision.ts    ✅ (fonction pure de décision)
    │   ├── builder/
    │   │   ├── builder.module.ts   🟡 Module vide
    │   │   ├── blocks.schema.ts    ✅ (Zod)
    │   │   └── builder.concurrency.ts ✅
    │   ├── ticket-design/
    │   │   ├── ticket-design.module.ts   🟡 Module vide
    │   │   └── ticket-design.service.ts  ✅ (QR, buildHtml, verifyQr)
    │   ├── notifications/
    │   │   ├── notifications.module.ts 🟡 Module vide
    │   │   └── phone.service.ts       ✅ (E.164, extraction provider)
    │   ├── pdf-queue/           🟡 Module vide
    │   ├── admin/               🟡 Module vide
    │   └── common/
    │       ├── audit.service.ts         ✅
    │       ├── crypto.service.ts        ✅ (AES-256-GCM)
    │       ├── constants.ts             ✅
    │       ├── filters/http-exception-filter.ts ✅
    │       ├── interceptors/response.interceptor.ts ✅
    │       └── decorators/ (current-user, public, roles) ✅
    └── prisma/
        └── schema.prisma       ✅ (modèle complet)
```

---

## 4. RÔLES & PERMISSIONS (RBAC)

```typescript
enum Role { SUPER_ADMIN, MANAGER, SCANNER, CLIENT }
```

| Action | Super Admin | Manager | Scanner | Client |
|---|:---:|:---:|:---:|:---:|
| Créer événement | ✅ | ❌ | ❌ | ❌ |
| Modifier événement | ✅ | ✅ (sien) | ❌ | ❌ |
| Acheter billet | ❌ | ❌ | ❌ | ✅ |
| Scanner QR | ❌ | ❌ | ✅ | ❌ |
| Voir stats | ✅ | ✅ (sien) | ❌ | ❌ |

---

## 5. SCHÉMA BASE DE DONNÉES (PRISMA)

Le schéma complet est dans `apps/api/prisma/schema.prisma` — il inclut :
- **User** (email, googleId, role, phone E.164, country, passwordHash pour scanners)
- **Event** (slug, title, dates, managerId @unique, status)
- **EventPage** (blocs JSON, contrôle concurrence optimiste)
- **Ticket** (prix, stock, stockSold, design colors)
- **Order** + **OrderItem** (statuts, QR token, isScanned)
- **WebhookEvent** (idempotence `@unique([provider, transactionId])`)
- **Scanner** + **ScannerLog**
- **PaymentProviderConfig** (clés chiffrées AES-256-GCM)
- **EventAnalytics**
- **AuditLog**

---

## 6. API ENDPOINTS IMPLÉMENTÉS

### 6.1 Auth — ✅ Fonctionnel

| Route | Méthode | Statut |
|---|---|---|
| `/api/auth/google` | GET | ✅ |
| `/api/auth/google/callback` | GET | ✅ |
| `/api/auth/login/scanner` | POST | ✅ |
| `/api/auth/refresh` | POST | ✅ |
| `/api/auth/logout` | POST | ✅ |

### 6.2 Events — ✅ Basique

| Route | Méthode | Statut |
|---|---|---|
| `/api/events` | POST | ✅ |
| `/api/events` | GET | ✅ |
| `/api/events/:id` | GET | ✅ |

### 6.3 À implémenter (priorité)

| Module | Priorité | CDC § |
|---|---|---|
| Scanner `/api/scan/validate` | 🔴 Haute | §9.5 |
| Tickets CRUD | 🔴 Haute | §6.3 |
| Payments init + webhook | 🔴 Haute | §8 |
| Events PATCH/DELETE | 🟡 Moyenne | §6.2 |
| Builder endpoints | 🟡 Moyenne | §11 |
| Admin endpoints | 🟢 Basse | §6.11 |

---

## 7. PLAN D'IMPLÉMENTATION

### Phase 1 — Foundation ✅ COMPLÉTÉE

- [x] Monorepo pnpm + Turborepo
- [x] NestJS + Prisma + PostgreSQL
- [x] Next.js 15 + Tailwind v4 + shadcn/ui
- [x] Schéma Prisma complet
- [x] Auth JWT (Google OAuth + Scanner login + session événementielle)
- [x] RBAC (JwtAuthGuard + RolesGuard + @Public)
- [x] AuditService, CryptoService, PhoneService
- [x] StockService (décrément atomique), WebhookIdempotencyService
- [x] TicketDesignService (QR generation, buildHtml, verify)
- [x] ClientProfileService (enrichissement post-paiement)
- [x] BlocksSchema (Zod), BuilderConcurrency
- [x] ScanDecision (fonction pure)
- [x] Landing page + Dashboard mocké (admin, manager, client)
- [x] Page scanner PWA + scannerStore Zustand
- [x] AppModule assemble tous les modules

### Phase 2 — Scanner & Payments 🔴 EN COURS

- [ ] Scanner controller + service (POST /api/scan/validate + $transaction)
- [ ] Payments controller + providers (Kkiapay/CinetPay/FedaPay)
- [ ] Webhook endpoint avec idempotence + stock atomique
- [ ] BullMQ setup pour génération PDF asynchrone
- [ ] QR dans OrderItem après paiement

### Phase 3 — Events & Tickets 🟡

- [ ] CRUD Events complet (ownership Manager, statuts, publication)
- [ ] CRUD Tickets (stock, prix, dates de vente)
- [ ] Pages événement publiques SSR (Next.js /e/[slug])
- [ ] Participants export CSV

### Phase 4 — Builder & Design 🟡

- [ ] Builder controller + service (saveBlocks avec Zod + concurrence)
- [ ] Upload image design billet (whitelist URL)
- [ ] Color picker HEX strict
- [ ] Preview iframe

### Phase 5 — Polish & Prod 🔵

- [ ] Docker compose dev complet
- [ ] Analytics
- [ ] WhatsApp (Meta Cloud API)
- [ ] PDF Puppeteer worker
- [ ] Tests E2E
- [ ] Déploiement production

---

## 16. VARIABLES D'ENVIRONNEMENT

Fichier `.env` dans `apps/api/` :

```bash
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3000
API_URL=http://localhost:3001

DATABASE_URL=postgresql://fluid_user:fluid_password_dev@localhost:5432/fluid_events?schema=public

JWT_SECRET=dev-jwt-secret-minimum-32-chars-xxxxxx
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=dev-refresh-secret-minimum-32-chars-xxx

QR_SECRET=dev-qr-secret-32-chars-minimum-xxxxxx
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000

SUPABASE_URL=https://placeholder.supabase.co
SUPABASE_SERVICE_ROLE_KEY=placeholder

GOOGLE_CLIENT_ID=placeholder
GOOGLE_CLIENT_SECRET=placeholder
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback

RESEND_API_KEY=re_placeholder
EMAIL_FROM=noreply@localhost.com

WHATSAPP_ACCESS_TOKEN=placeholder
WHATSAPP_PHONE_NUMBER_ID=123456789012345

REDIS_URL=redis://localhost:6379
```

---

## COMMANDES RAPIDES

```bash
# Installation
pnpm install

# Développement (2 terminaux)
cd apps/api && npx nest start --watch    # API :3001
cd apps/web && npx next dev             # Web :3000

# Typecheck
cd apps/api && npx tsc --noEmit
cd apps/web && npx tsc --noEmit

# Prisma
cd apps/api && npx prisma generate
cd apps/api && npx prisma migrate dev --name init

# Tests
cd apps/api && npx vitest run
```

---

*CDC v4.0.0-r1 — Révision réaliste Juillet 2026. Phase 1 fondations ✅, Phase 2 scanner/paiements en cours.*
