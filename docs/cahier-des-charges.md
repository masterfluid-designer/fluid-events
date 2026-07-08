# CAHIER DES CHARGES TECHNIQUE — SaaS Événementiel & Billetterie
**Version** : 4.0.0
**Date** : Juillet 2026
**Stack** : Next.js 15 / NestJS / PostgreSQL / Redis / RustFS (dev) / Supabase Storage (prod) / Prisma / BullMQ / AWS SDK S3 / Docker
**Cible déploiement** : Docker Compose (dev) → Conteneurs séparés + Supabase PostgreSQL + Supabase Storage (prod)

**Changelog v4.0.0** — Couche de stockage S3-compatible (RustFS dev / Supabase Storage prod) :
- 📦 `StorageService` abstrait via AWS SDK S3 — code identique dev et prod
- 🦀 RustFS en Docker local (remplaçant MinIO, Apache 2.0, image officielle)
- ⚠️ MinIO déprécié — archivé sur GitHub en avril 2026, plus d'images Docker officielles
- 🔀 Bascule dev→prod par variables d'environnement uniquement (zéro modification de code)
- 🗂️ Section 20 dédiée : Couche de Stockage S3-Compatible

**Changelog v3.0.0** — Architecture Docker & environnement professionnel :
- 🐳 Environnement Docker complet (dev + prod) — `docker compose up` suffit
- 🐘 PostgreSQL local en développement → Supabase PostgreSQL en production (même `DATABASE_URL`)
- 🔴 Redis conteneurisé (BullMQ, cache, sessions)
- 📧 Mailpit local pour intercepter tous les emails de développement
- 🔁 Nginx reverse proxy en production
- 📁 Structure `docker/`, `docs/` ajoutée au monorepo
- 🔐 `.env.example` complet — séparation dev/prod explicite
- 📋 Règles d'architecture Docker strictes (1 conteneur = 1 responsabilité)

**Changelog v2.0.0** — 20 corrections d'audit intégrées :
- 🔴 Race condition stock → `updateMany` atomique avec guard capacité
- 🔴 Session client liée à la durée de l'événement (JWT dynamique)
- 🔴 Injection XSS template billet → whitelist URL Supabase + regex HEX strict
- 🔴 Idempotence webhook → table `WebhookEvent` avec contrainte `@unique`
- 🟡 Expiration QR liée à `event.endDate + 24h`
- 🟡 Données scanner minimisées (email/phone exclus de la réponse)
- 🟡 Puppeteer en file BullMQ asynchrone (hors webhook)
- 🟡 Middleware Next.js documenté UX-only (sécurité dans NestJS Guards)
- 🟡 Contrainte 1 Manager = 1 Événement documentée et assumée
- 🟡 Guard ownership commande dans `initPayment`
- 🟠 Intent d'achat avec timestamp + clé spécifique à l'événement
- 🟠 `isScanningRef` en `useRef` (pas `useState`) — anti double-scan fiable
- 🟠 Validation téléphone E.164 via `libphonenumber-js`
- 🟠 Blocs builder validés par schéma Zod côté backend
- 🟠 Enrichissement profil : logique explicite (ne jamais écraser)
- 🟠 RLS Supabase désactivé — sécurité centralisée dans NestJS
- 🟠 Builder avec contrôle de concurrence optimiste (`lastKnownUpdatedAt`)

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
17. [Flux Métier Complets](#17-flux-métier-complets)
18. [Infrastructure Docker](#18-infrastructure-docker)
19. [Plan d'Implémentation](#19-plan-dimplémentation)
20. [Couche de Stockage S3-Compatible](#20-couche-de-stockage-s3-compatible)

---

## 1. VISION PRODUIT & PÉRIMÈTRE V1

### 1.1 Proposition de valeur

Plateforme SaaS tout-en-un permettant à des organisateurs africains de créer, vendre et contrôler l'accès à leurs événements sans compétence technique, avec des moyens de paiement locaux (Mobile Money, cartes Afrique).

### 1.2 Modules V1 — Périmètre strict

| Module | Inclus V1 | Exclu V1 |
|---|---|---|
| Gestion événements | ✅ Création, publication, expiration | ❌ Événements récurrents |
| Billetterie | ✅ Types de billets, stock, prix | ❌ Plans de salle (seating) |
| Paiement | ✅ Kkiapay, CinetPay, FedaPay | ❌ Stripe, PayPal |
| Scanner PWA | ✅ Scan QR, validation, historique | ❌ Mode offline complet |
| Event Builder | ✅ Blocs drag & drop, templates | ❌ CSS custom avancé |
| Auth Client | ✅ Google OAuth | ❌ Apple, Facebook |
| Dashboard | ✅ Super Admin, Manager, Client | ❌ Portail partenaire |
| Notifications | ✅ Email + WhatsApp (confirmation, billet) | ❌ SMS, Push native |
| Design billet | ✅ Image custom + template HTML → PDF | ❌ Billet animé |
| Stockage fichiers | ✅ RustFS (dev) + Supabase Storage (prod) via AWS SDK S3 | ❌ Gestion multi-région |
| Analytics | ✅ Ventes, scans, revenus | ❌ BI avancé |

### 1.3 Contraintes non-fonctionnelles

- **Performance** : Temps de scan QR < 500ms (API validation)
- **Disponibilité** : 99.5% uptime minimum
- **Mobile-first** : Interface scanner optimisée 375px+
- **Sécurité** : QR signés HS256, anti double-scan atomique, idempotence webhook robuste, XSS mitigé
- **Scalabilité** : Architecture stateless, sécurité centralisée dans NestJS Guards
- **Session** : Client authentifié reste connecté pendant toute la durée de vie de l'événement + 24h de grâce
- **Stockage** : Couche S3-compatible abstraite — RustFS en dev, Supabase Storage en prod, zéro modification de code

### 1.4 Décision d'architecture : 1 Manager = 1 Événement (V1)

En V1, un compte Manager est assigné à **un seul événement**. Contrainte volontaire et simplificatrice. Si un organisateur gère plusieurs événements, il possède plusieurs comptes Manager distincts. Appliquée au niveau du schéma Prisma (`managerId @unique` sur `Event`).

---

## 2. ARCHITECTURE GLOBALE

### 2.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                   │
│  Browser (Next.js 15)  │  PWA Scanner (Next.js)  │  Mobile App  │
└──────────┬─────────────────────────┬──────────────────────┬──────┘
           │                         │                      │
           ▼                         ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│        NGINX reverse proxy (prod uniquement — port 80/443)       │
│        web:3000  ◄──────────────────────►  api:4000             │
└──────────┬──────────────────────────────────────────────────────┘
           │
    ┌──────┴──────┐
    ▼             ▼
┌──────────────────┐    ┌─────────────────────────────────────────┐
│ FRONTEND         │    │ BACKEND (NestJS)                         │
│ Next.js 15       │    │ /api/auth  /api/events  /api/tickets     │
│ container: web   │    │ /api/payments  /api/builder  /api/scan   │
│ :3000            │    │ container: api  :4000                    │
└──────────────────┘    └──────────┬──────────────────────────────┘
                                   │
         ┌──────────────┬──────────┴─────────┬──────────────────┐
         ▼              ▼                     ▼                  ▼
┌──────────────┐ ┌────────────┐   ┌────────────────┐  ┌────────────────┐
│  PostgreSQL  │ │   Redis    │   │ Supabase       │  │ Mailpit        │
│  DEV: Docker │ │  container │   │ Storage        │  │ (dev only)     │
│  PROD: Supa  │ │  :6379     │   │ (dev + prod)   │  │ SMTP: :1025    │
│  :5432       │ │  BullMQ    │   │ Images/PDFs/QR │  │ UI:   :8025    │
│  Prisma ORM  │ │  cache     │   │ Compatible S3  │  └────────────────┘
└──────────────┘ └────────────┘   └────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────┐
│  PAYMENT PROVIDERS (externes, pas de container)   │
│  Kkiapay   │   CinetPay   │   FedaPay            │
└──────────────────────────────────────────────────┘
```

### 2.2 Services Docker — correspondance dev / prod

| Service | Container dev | Port local | Production |
|---|---|---|---|
| Frontend Next.js | `web` (hot reload) | :3000 | Container build optimisé |
| Backend NestJS | `api` (watch mode) | :4000 | Container compilé |
| PostgreSQL | `postgres` | :5432 | Supabase PostgreSQL (`DATABASE_URL` seul) |
| Redis | `redis` | :6379 | Redis managé (Upstash, Railway…) |
| Email | `mailpit` (intercepteur) | :8025 (UI) :1025 (SMTP) | Resend via SMTP réel |
| Reverse proxy | ❌ accès direct ports | — | `nginx` container |
| Stockage fichiers | `rustfs` container :9000/:9001 (console) | :9000 :9001 | Supabase Storage S3 (`STORAGE_ENDPOINT` seul change) |

### 2.3 Flux de données critiques

```
[Achat ticket]
Client → POST /api/payments/init (JwtAuthGuard + ownership) → Provider
→ Webhook → Idempotence check (WebhookEvent @unique) → $transaction atomique
(stock guard updateMany) → BullMQ job → PDF Puppeteer + Email + WhatsApp
→ Dashboard client

[Scan entrée]
Scanner PWA → POST /api/scan/validate → $transaction atomic lock (isScanned)
→ Réponse { name, ticketName } uniquement (pas email/phone) → Log scan

[Builder]
Manager → PUT /api/builder/:eventId/blocks
→ Zod schema validation → check lastKnownUpdatedAt (409 si conflit)
→ DB Postgres → Rendu SSR public page
```

### 2.4 Principe de sécurité — une seule source de vérité

**La sécurité applicative est entièrement portée par NestJS Guards.**
Supabase est utilisé avec `SERVICE_ROLE_KEY` côté backend (bypass RLS volontaire).
Les politiques RLS ne sont **PAS activées** — elles seraient systématiquement bypassées par la
service role key et créeraient une fausse impression de sécurité.
Toute restriction d'accès est implémentée via `JwtAuthGuard + RolesGuard + ownership check` dans les services NestJS.

---

## 3. STRUCTURE DES DOSSIERS

```
saas-events/
├── apps/
│   ├── web/                        # Next.js 15 — Dashboard + Landing
│   │   ├── app/
│   │   │   ├── (public)/
│   │   │   │   └── e/[slug]/       # Page événement SSR
│   │   │   ├── (auth)/             # Login, OAuth callback
│   │   │   ├── (dashboard)/        # Zone protégée
│   │   │   │   ├── admin/          # Super Admin
│   │   │   │   ├── manager/        # Manager événement
│   │   │   │   └── client/         # Client acheteur
│   │   │   └── scanner/            # PWA Scanner (route isolée)
│   │   ├── components/
│   │   │   ├── ui/                 # shadcn/ui — composants atomiques
│   │   │   ├── builder/            # Blocs Event Builder
│   │   │   ├── scanner/            # Interface scan (caméra, feedback)
│   │   │   ├── dashboard/          # Composants dashboards
│   │   │   └── payment/            # Checkout, providers
│   │   ├── lib/
│   │   │   ├── api.ts              # Client API (React Query)
│   │   │   ├── auth.ts             # saveIntent / consumeIntent (horodaté)
│   │   │   ├── qr.ts               # QR generation client
│   │   │   └── utils.ts
│   │   ├── store/
│   │   │   ├── builderStore.ts     # Zustand + lastSavedAt (concurrence)
│   │   │   └── scannerStore.ts
│   │   ├── public/
│   │   │   ├── manifest.json       # PWA manifest
│   │   │   └── sw.js               # Service Worker
│   │   ├── middleware.ts           # Redirections UX uniquement (pas sécurité)
│   │   ├── Dockerfile              # Multi-stage : dev (hot reload) + prod (build)
│   │   └── next.config.ts
│   │
│   └── api/                        # NestJS Backend
│       ├── src/
│       │   ├── main.ts
│       │   ├── app.module.ts
│       │   ├── prisma/
│       │   │   └── prisma.service.ts
│       │   ├── auth/
│       │   │   ├── auth.module.ts
│       │   │   ├── auth.controller.ts
│       │   │   ├── auth.service.ts   # generateClientToken() dynamique
│       │   │   ├── strategies/
│       │   │   │   ├── jwt.strategy.ts
│       │   │   │   └── google.strategy.ts
│       │   │   └── guards/
│       │   │       ├── jwt-auth.guard.ts
│       │   │       └── roles.guard.ts
│       │   ├── events/
│       │   ├── tickets/
│       │   ├── payments/
│       │   │   ├── payments.module.ts
│       │   │   ├── payments.controller.ts
│       │   │   ├── payments.service.ts   # idempotence + stock atomique
│       │   │   └── providers/
│       │   │       ├── kkiapay.provider.ts
│       │   │       ├── cinetpay.provider.ts
│       │   │       └── fedapay.provider.ts
│       │   ├── scanner/
│       │   ├── builder/
│       │   │   └── schemas/
│       │   │       └── blocks.schema.ts  # Schémas Zod
│       │   ├── admin/
│       │   ├── notifications/
│       │   │   ├── email.service.ts
│       │   │   └── whatsapp.service.ts   # E.164 via libphonenumber-js
│       │   ├── ticket-design/
│       │   │   ├── ticket-design.service.ts  # sanitizeBgColor + sanitizeImageUrl
│       │   │   └── ticket-design.controller.ts
│       │   ├── pdf-queue/
│       │   │   ├── pdf-queue.module.ts
│       │   │   └── pdf.processor.ts       # BullMQ worker asynchrone
│       │   └── common/
│       │       ├── decorators/
│       │       │   └── roles.decorator.ts
│       │       ├── filters/
│       │       ├── interceptors/
│       │       └── crypto.service.ts      # AES-256-GCM clés API
│       ├── prisma/
│       │   └── schema.prisma
│       └── Dockerfile              # Multi-stage : dev (watch) + prod (compile)
│
├── docker/                         # ── DOCKER CONFIGS PAR SERVICE ──
│   ├── postgres/
│   │   └── init.sql                # Init DB + extensions si besoin
│   ├── redis/
│   │   └── redis.conf              # Config Redis (maxmemory, policy)
│   ├── mailpit/                    # Aucune config requise (image officielle)
│   └── nginx/
│       ├── nginx.conf              # Config reverse proxy prod
│       └── Dockerfile              # Image Nginx custom si besoin
│
├── docs/                           # ── DOCUMENTATION ──
│   ├── cahier-des-charges.md       # Ce document
│   ├── architecture.md             # Diagrammes C4 + décisions ADR
│   ├── api.md                      # Documentation endpoints (OpenAPI)
│   └── database.md                 # Schéma ERD + décisions Prisma
│
├── packages/
│   ├── types/index.ts              # Types partagés TS
│   └── utils/
│
├── docker-compose.yml              # Dev complet (postgres + redis + mailpit)
├── docker-compose.prod.yml         # Prod (web + api + redis + nginx)
├── .env                            # Variables locales (gitignored)
├── .env.example                    # Template commenté (versionné)
├── .gitignore
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

### 3.1 Règles d'architecture Docker (non négociables)

- **1 conteneur = 1 responsabilité** : pas de PostgreSQL dans le conteneur `api`
- **Pas de stockage fichier dans les conteneurs** : RustFS (dev) ou Supabase Storage (prod) exclusivement
- **Couche de stockage abstraite** : `StorageService` via AWS SDK S3 — même code, variables différentes
- **Réseaux Docker internes** : les services communiquent par nom (ex: `redis`, `postgres`)
- **Healthchecks** sur tous les services critiques (postgres, redis)
- **Volumes persistants** pour PostgreSQL et Redis
- **Aucune clé secrète dans le code** ou les Dockerfiles — uniquement via `.env`

---

## 4. RÔLES & PERMISSIONS (RBAC)

### 4.1 Définition des rôles

```typescript
// packages/types/index.ts
export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  MANAGER     = 'MANAGER',
  SCANNER     = 'SCANNER',
  CLIENT      = 'CLIENT',
}
```

### 4.2 Matrice de permissions

| Action | Super Admin | Manager | Scanner | Client |
|---|:---:|:---:|:---:|:---:|
| Créer un événement | ✅ | ❌ | ❌ | ❌ |
| Modifier un événement | ✅ | ✅ (sien) | ❌ | ❌ |
| Supprimer un événement | ✅ | ❌ | ❌ | ❌ |
| Activer/désactiver événement | ✅ | ❌ | ❌ | ❌ |
| Voir tous les événements | ✅ | ❌ | ❌ | ❌ |
| Configurer builder | ✅ | ✅ (sien) | ❌ | ❌ |
| Créer types de billets | ✅ | ✅ (sien) | ❌ | ❌ |
| Personnaliser design billet | ✅ | ✅ (sien) | ❌ | ❌ |
| Acheter un billet | ❌ | ❌ | ❌ | ✅ |
| Voir ses billets | ❌ | ❌ | ❌ | ✅ |
| Créer un scanner | ✅ | ✅ (dans quota) | ❌ | ❌ |
| Scanner un QR | ❌ | ❌ | ✅ | ❌ |
| Voir stats ventes | ✅ | ✅ (sien) | ❌ | ❌ |
| Gérer clés API paiement | ✅ | ❌ | ❌ | ❌ |
| Exporter participants | ✅ | ✅ (sien) | ❌ | ❌ |
| Voir logs système | ✅ | ❌ | ❌ | ❌ |

### 4.3 Guards NestJS — application systématique

```typescript
// common/decorators/roles.decorator.ts
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);

// common/guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user.role === role);
  }
}

// ⚠️ Règle absolue : JwtAuthGuard TOUJOURS en premier
@Get('admin/events')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
findAll() { ... }
```

### 4.4 Guard ownership — ressource appartenant à l'utilisateur

```typescript
// Toujours vérifier côté service que la ressource appartient au user JWT

// Commande client
@Get('orders/:id')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CLIENT)
async getOrder(@Param('id') id: string, @Request() req) {
  const order = await this.ordersService.findOne(id);
  if (!order || order.clientId !== req.user.id) throw new ForbiddenException();
  return order;
}

// Événement Manager
async updateEvent(eventId: string, dto: UpdateEventDto, managerId: string) {
  const event = await this.prisma.event.findUnique({ where: { id: eventId } });
  if (!event || event.managerId !== managerId) throw new ForbiddenException();
  // ...
}
```

---

## 5. SCHÉMA BASE DE DONNÉES (PRISMA)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────
// UTILISATEURS & AUTH
// ─────────────────────────────────────────

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  avatarUrl     String?
  googleId      String?   @unique
  role          Role      @default(CLIENT)
  isActive      Boolean   @default(true)
  // Enrichi post-paiement via webhook provider (jamais écrasé si déjà renseigné)
  phone         String?   // Format E.164 ex: +22890123456
  country       String?   // Code ISO 2 lettres ex: TG, CI, BJ
  profileCompletedAt DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  managedEvent   Event?      @relation("EventManager")
  scannerProfile Scanner?
  orders         Order[]
  auditLogs      AuditLog[]

  @@map("users")
}

enum Role {
  SUPER_ADMIN
  MANAGER
  SCANNER
  CLIENT
}

// ─────────────────────────────────────────
// ÉVÉNEMENTS
// ─────────────────────────────────────────

model Event {
  id              String      @id @default(cuid())
  slug            String      @unique
  title           String
  description     String?
  coverImageUrl   String?
  location        String?
  startDate       DateTime
  endDate         DateTime    // Détermine la durée de session client (endDate + 24h)
  timezone        String      @default("Africa/Abidjan")
  status          EventStatus @default(DRAFT)
  maxScanners     Int         @default(3)
  paymentProvider PaymentProviderType?
  allowManagerChooseProvider Boolean @default(true)
  expiresAt       DateTime?   // Désactivation automatique
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  // V1 : 1 Manager = 1 Event — contrainte volontaire
  managerId     String  @unique
  manager       User    @relation("EventManager", fields: [managerId], references: [id])
  tickets       Ticket[]
  orders        Order[]
  scanners      Scanner[]
  eventPage     EventPage?
  analytics     EventAnalytics?

  @@map("events")
}

enum EventStatus {
  DRAFT
  PUBLISHED
  CANCELLED
  EXPIRED
}

// ─────────────────────────────────────────
// PAGE BUILDER
// ─────────────────────────────────────────

model EventPage {
  id          String   @id @default(cuid())
  eventId     String   @unique
  event       Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  blocks      Json     @default("[]")  // Validé par BlocksArraySchema (Zod) avant écriture
  theme       Json     @default("{}")
  isPublished Boolean  @default(false)
  publishedAt DateTime?
  updatedAt   DateTime @updatedAt     // Verrou optimiste — contrôle de concurrence
  createdAt   DateTime @default(now())

  @@map("event_pages")
}

// ─────────────────────────────────────────
// BILLETTERIE
// ─────────────────────────────────────────

model Ticket {
  id            String     @id @default(cuid())
  eventId       String
  event         Event      @relation(fields: [eventId], references: [id], onDelete: Cascade)
  name          String
  description   String?
  price         Decimal    @db.Decimal(10, 2)
  currency      String     @default("XOF")
  stock         Int        // Capacité totale
  stockSold     Int        @default(0)  // Décrémenté via updateMany atomique avec guard
  maxPerOrder   Int        @default(1)  // V1 : 1 billet = 1 QR = 1 personne
  category      String?
  isActive      Boolean    @default(true)
  saleStartDate DateTime?
  saleEndDate   DateTime?
  // Design billet (valeurs validées HEX/URL avant stockage)
  designImageUrl  String?  // URL Supabase Storage bucket ticket-designs/ (whitélistée)
  designBgColor   String?  @default("#d4ac0d")  // HEX strict uniquement
  designTextColor String?  @default("#333333")  // HEX strict uniquement
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  orderItems    OrderItem[]

  @@map("tickets")
}

// ─────────────────────────────────────────
// COMMANDES & PAIEMENTS
// ─────────────────────────────────────────

model Order {
  id              String      @id @default(cuid())
  orderNumber     String      @unique @default(cuid())
  eventId         String
  event           Event       @relation(fields: [eventId], references: [id])
  clientId        String
  client          User        @relation(fields: [clientId], references: [id])
  status          OrderStatus @default(PENDING)
  totalAmount     Decimal     @db.Decimal(10, 2)
  currency        String      @default("XOF")
  paymentProvider PaymentProviderType
  paymentRef      String?     // Référence provider
  paymentData     Json?       // Payload webhook brut (audit)
  paidAt          DateTime?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  items           OrderItem[]

  @@map("orders")
}

enum OrderStatus {
  PENDING
  PAID
  FAILED
  REFUNDED
  CANCELLED
}

model OrderItem {
  id          String   @id @default(cuid())
  orderId     String
  order       Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  ticketId    String
  ticket      Ticket   @relation(fields: [ticketId], references: [id])
  quantity    Int      @default(1)   // V1 : toujours 1 (1 OrderItem = 1 QR)
  unitPrice   Decimal  @db.Decimal(10, 2)
  // Généré par BullMQ worker après confirmation paiement
  qrCode      String?  // JWT signé HS256 avec exp = event.endDate + 24h
  qrCodeUrl   String?  // URL PDF Supabase Storage
  isScanned   Boolean  @default(false)
  scannedAt   DateTime?
  scannedById String?
  createdAt   DateTime @default(now())

  @@map("order_items")
}

// ─────────────────────────────────────────
// IDEMPOTENCE WEBHOOK
// Empêche le double-traitement d'un webhook rejoué par le provider
// ─────────────────────────────────────────

model WebhookEvent {
  id            String   @id @default(cuid())
  provider      String   // "KKIAPAY" | "CINETPAY" | "FEDAPAY"
  transactionId String   // ID unique côté provider
  processedAt   DateTime @default(now())

  @@unique([provider, transactionId])  // Garantit l'atomicité de l'idempotence
  @@map("webhook_events")
}

// ─────────────────────────────────────────
// SCANNERS
// ─────────────────────────────────────────

model Scanner {
  id        String   @id @default(cuid())
  eventId   String
  event     Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id])
  name      String
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  logs      ScannerLog[]

  @@map("scanners")
}

model ScannerLog {
  id          String     @id @default(cuid())
  scannerId   String
  scanner     Scanner    @relation(fields: [scannerId], references: [id])
  orderItemId String
  result      ScanResult
  ip          String?
  userAgent   String?
  scannedAt   DateTime   @default(now())

  @@map("scanner_logs")
}

enum ScanResult {
  VALID
  ALREADY_USED
  EXPIRED
  INVALID
  EVENT_MISMATCH
}

// ─────────────────────────────────────────
// PAIEMENTS PROVIDERS
// ─────────────────────────────────────────

model PaymentProviderConfig {
  id           String              @id @default(cuid())
  provider     PaymentProviderType @unique
  isActive     Boolean             @default(false)
  isDefault    Boolean             @default(false)
  publicKey    String?
  privateKey   String              // Chiffré AES-256-GCM avant stockage
  webhookSecret String?            // Chiffré AES-256-GCM avant stockage
  config       Json?
  updatedAt    DateTime            @updatedAt

  @@map("payment_provider_configs")
}

enum PaymentProviderType {
  KKIAPAY
  CINETPAY
  FEDAPAY
}

// ─────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────

model EventAnalytics {
  id              String   @id @default(cuid())
  eventId         String   @unique
  event           Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  totalRevenue    Decimal  @default(0) @db.Decimal(10, 2)
  ticketsSold     Int      @default(0)
  totalScans      Int      @default(0)
  uniqueAttendees Int      @default(0)
  conversionRate  Decimal  @default(0) @db.Decimal(5, 2)
  lastUpdatedAt   DateTime @default(now())

  @@map("event_analytics")
}

// ─────────────────────────────────────────
// AUDIT
// ─────────────────────────────────────────

model AuditLog {
  id         String   @id @default(cuid())
  userId     String?
  user       User?    @relation(fields: [userId], references: [id])
  action     String   // ex: "payment.webhook.success", "scan.valid"
  entityType String?
  entityId   String?
  metadata   Json?
  ip         String?
  userAgent  String?
  createdAt  DateTime @default(now())

  @@index([action])
  @@index([entityType, entityId])
  @@map("audit_logs")
}
```

---

## 6. API ENDPOINTS (NESTJS)

### 6.1 Auth — `/api/auth`

```
POST   /api/auth/google
       QueryParams: ?redirect=URL&intent=buy&eventSlug=slug
       → Initier OAuth Google (slug passé dans state OAuth)

GET    /api/auth/google/callback
       → Callback OAuth → calcul JWT durée événementielle → cookies httpOnly

POST   /api/auth/scanner/login
       Body: { email, password }
       → JWT scanner avec exp = event.endDate + 1h

POST   /api/auth/refresh
       → Renouvelle access_token (même durée calée sur event.endDate)

POST   /api/auth/logout
       → Clear cookies

GET    /api/auth/me
       → Profil utilisateur courant (JwtAuthGuard)
```

### 6.2 Events — `/api/events`

```
# Super Admin uniquement
POST   /api/events                   → Créer événement + assigner Manager
GET    /api/events                   → Tous événements (paginé)
PATCH  /api/events/:id/status        → Changer statut
DELETE /api/events/:id               → Supprimer

# Manager (ownership vérifié systématiquement)
GET    /api/events/:id               → Détail événement
PATCH  /api/events/:id               → Modifier
GET    /api/events/:id/stats         → Stats agrégées

# Public (pas d'auth)
GET    /api/events/public/:slug      → Data SSR page événement
```

### 6.3 Tickets — `/api/events/:eventId/tickets`

```
POST   /tickets          → Créer (Manager, ownership)
GET    /tickets          → Lister
GET    /tickets/:id      → Détail
PATCH  /tickets/:id      → Modifier
DELETE /tickets/:id      → Supprimer
GET    /tickets/public   → Billets disponibles (public, pas d'auth)
```

### 6.4 Payments — `/api/payments`

```
POST   /api/payments/init
       Guards: JwtAuthGuard + Roles(CLIENT)
       Body: { ticketId, provider }
       Validation ownership: ticket.event.managerId accessible
       Vérification stock préventive (avant initiation paiement)
       Response: { checkoutUrl, transactionId, orderId }

POST   /api/payments/webhook/kkiapay
POST   /api/payments/webhook/cinetpay
POST   /api/payments/webhook/fedapay
       Public (pas de JWT) — sécurisé par signature HMAC timingSafeEqual
       Flow: signature → idempotence (WebhookEvent @unique) → $transaction
       → BullMQ job → réponse 200 immédiate au provider

GET    /api/payments/orders          → Mes commandes (JWT CLIENT)
GET    /api/payments/orders/:id      → Détail (ownership: clientId === jwt.sub)

# Admin
GET    /api/payments/admin/providers
PATCH  /api/payments/admin/providers/:type
POST   /api/payments/admin/providers/:type/test
```

### 6.5 Scanner — `/api/scan`

```
POST   /api/scan/validate
       Guards: JwtAuthGuard + Roles(SCANNER)
       Body: { qrToken }
       Response: { result: ScanResult, attendee?: { name, ticketName } }
       ⚠️ email et phone du client ne sont JAMAIS retournés

GET    /api/scan/history             → Historique scans (ce scanner)
GET    /api/scan/stats               → Stats temps réel (scans du jour)
```

### 6.6 Builder — `/api/builder`

```
GET    /api/builder/:eventId                  → Récupérer blocs + updatedAt
PUT    /api/builder/:eventId/blocks
       Body: { blocks: Block[], lastKnownUpdatedAt: string }
       Validation: Zod BlocksArraySchema
       → 409 BUILDER_CONFLICT si EventPage.updatedAt > lastKnownUpdatedAt
PATCH  /api/builder/:eventId/blocks/:blockId  → Modifier un bloc
POST   /api/builder/:eventId/blocks           → Ajouter bloc
DELETE /api/builder/:eventId/blocks/:blockId  → Supprimer bloc
POST   /api/builder/:eventId/publish          → Publier la page
POST   /api/builder/:eventId/upload           → Upload image (→ Supabase Storage)
GET    /api/builder/templates                 → Liste templates
```

### 6.7 Design Billet — `/api/tickets/:eventId/:ticketId/design`

```
POST   /design/upload
       Guards: JwtAuthGuard + Roles(MANAGER) + ownership
       Body: multipart/form-data { image: File }
       Contraintes: max 5MB, formats: image/jpeg|png|webp
       L'URL stockée est whitélistée sur bucket ticket-designs/

PATCH  /design
       Guards: JwtAuthGuard + Roles(MANAGER) + ownership
       Body: { designBgColor?: string, designTextColor?: string }
       Validation: regex /^#[0-9A-Fa-f]{6}$/ sur chaque couleur

GET    /design/preview
       → HTML rendu dans iframe (même sanitisation que PDF final)

DELETE /design/image
       → Supprime image bucket + revient couleur de fond
```

### 6.8 Scanners Management — `/api/scanners`

```
POST   /api/scanners/:eventId                → Créer (Manager, quota vérifié)
GET    /api/scanners/:eventId                → Lister
PATCH  /api/scanners/:eventId/:scannerId     → Activer/désactiver
DELETE /api/scanners/:eventId/:scannerId     → Supprimer
```

### 6.9 Participants — `/api/participants`

```
GET    /api/participants/:eventId            → Liste (Manager, ownership)
       QueryParams: ?page=1&limit=50&search=nom
GET    /api/participants/:eventId/export     → Export CSV
GET    /api/participants/:eventId/export-pdf → Export PDF
```

### 6.10 Client — `/api/client`

```
GET    /api/client/tickets                   → Mes billets (JWT CLIENT)
GET    /api/client/tickets/:orderItemId/qr   → QR + PDF URL (ownership)
GET    /api/client/orders                    → Historique commandes
```

### 6.11 Admin — `/api/admin`

```
GET    /api/admin/overview
GET    /api/admin/events
POST   /api/admin/events
PATCH  /api/admin/events/:id
GET    /api/admin/managers
PATCH  /api/admin/managers/:id/status
GET    /api/admin/logs               → Filtrable par action/date/entityType
GET    /api/admin/scanner-quotas
```

### 6.12 Format de réponse standardisé

```typescript
// Succès
{ "success": true, "data": {...}, "meta": { "page": 1, "limit": 20, "total": 145 } }

// Erreur
{
  "success": false,
  "error": {
    "code": "TICKET_SOLD_OUT",
    "message": "Stock épuisé pour ce type de billet",
    "details": {}
  }
}
```

---

## 7. SYSTÈME D'AUTHENTIFICATION

### 7.1 Principe : Auth obligatoire avant achat + session calée sur l'événement

Le client DOIT être authentifié via Google pour acheter un billet. Après connexion, **la durée de la session JWT est calculée dynamiquement** pour couvrir toute la durée de l'événement ciblé + 24h de grâce. Le client n'est jamais déconnecté pendant un événement actif.

```
[Client non-authentifié clique "Acheter"]
→ saveIntent(slug, ticketId) → sessionStorage avec timestamp (TTL 30min)
→ Redirect → /api/auth/google?redirect=/e/[slug]&intent=buy&eventSlug=[slug]
→ Google OAuth → callback
→ Upsert User (googleId, email, name, avatar)
→ Calcul durée session = event.endDate + 24h (si eventSlug fourni + event PUBLISHED)
→ JWT dynamique + Refresh token (même durée)
→ Cookies httpOnly → redirect /e/[slug]?resume=1
→ Frontend : consumeIntent(slug) → vérifie timestamp < 30min → reprend checkout
→ POST /api/payments/init (authentifié)
```

### 7.2 Calcul de la durée de session événementielle

```typescript
// auth/auth.service.ts
async generateClientToken(user: User, eventSlug?: string): Promise<TokenPair> {
  let expiresIn = process.env.JWT_EXPIRES_IN ?? '7d'; // Défaut sans événement
  let sessionExpiresAt: number | undefined;

  if (eventSlug) {
    const event = await this.prisma.event.findUnique({
      where: { slug: eventSlug },
      select: { endDate: true, status: true },
    });

    if (event && event.status === 'PUBLISHED') {
      const graceMs = 24 * 60 * 60 * 1000; // 24h après la fin
      const msUntilExpiry = event.endDate.getTime() - Date.now() + graceMs;

      if (msUntilExpiry > 0) {
        const seconds = Math.max(Math.ceil(msUntilExpiry / 1000), 3600); // min 1h
        expiresIn = `${seconds}s`;
        sessionExpiresAt = Math.floor(event.endDate.getTime() / 1000) + 86400;
      }
    }
    // Si événement non trouvé ou non publié → fallback JWT_EXPIRES_IN
  }

  const payload: JwtPayload = {
    sub:              user.id,
    email:            user.email,
    role:             user.role,
    sessionExpiresAt, // Timestamp Unix fin de validité (lisible côté frontend)
    iat:              Math.floor(Date.now() / 1000),
    exp:              Math.floor(Date.now() / 1000) + parseDurationToSeconds(expiresIn),
  };

  const accessToken  = this.jwtService.sign(payload, { expiresIn });
  const refreshToken = this.jwtService.sign(
    { sub: user.id, type: 'refresh', sessionExpiresAt },
    { secret: process.env.JWT_REFRESH_SECRET!, expiresIn }, // Même durée
  );

  return { accessToken, refreshToken };
}

function parseDurationToSeconds(dur: string): number {
  if (dur.endsWith('s')) return parseInt(dur);
  if (dur.endsWith('m')) return parseInt(dur) * 60;
  if (dur.endsWith('h')) return parseInt(dur) * 3600;
  if (dur.endsWith('d')) return parseInt(dur) * 86400;
  return 3600;
}
```

### 7.3 Cycle de vie de la session client

```
Événement créé avec endDate = 2026-12-31T23:59:59Z

[J-30 : Client achète]
→ JWT exp = 2027-01-01T23:59:59Z (endDate + 24h)
→ Client reste connecté sans interruption

[Pendant l'événement]
→ JWT toujours valide, accès billets sans friction

[J+1 après la fin]
→ JWT expire → client redirigé vers login pour accès historique
→ Fallback : JWT_EXPIRES_IN=7d si pas d'eventSlug (ex: connexion directe)

[Scanner]
→ JWT scanner : exp = event.endDate + 1h (pas de refresh token)
→ Se reconnecte si token expiré
```

### 7.4 Gestion de l'intent d'achat (frontend)

```typescript
// lib/auth.ts — Intent horodaté, clé spécifique à l'événement
const INTENT_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function saveIntent(eventSlug: string, ticketId: string): void {
  sessionStorage.setItem(`buy_intent_${eventSlug}`, JSON.stringify({
    ticketId,
    timestamp: Date.now(),
  }));
}

export function consumeIntent(eventSlug: string): { ticketId: string } | null {
  const key = `buy_intent_${eventSlug}`;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const intent = JSON.parse(raw);
    sessionStorage.removeItem(key); // Toujours consommer = supprimer
    if (Date.now() - intent.timestamp > INTENT_TTL_MS) return null; // Intent expiré
    return { ticketId: intent.ticketId };
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}
```

### 7.5 Flux Scanner Login

```
1. Scanner → POST /api/auth/scanner/login { email, password }
2. Vérification : role=SCANNER + isActive + event.status=PUBLISHED
3. JWT avec exp = event.endDate + 1h (pas de refresh token)
4. Response → { accessToken, eventId, eventName }
```

### 7.6 JWT Payload

```typescript
interface JwtPayload {
  sub:               string;   // userId
  email:             string;
  role:              Role;
  eventId?:          string;   // Scanners uniquement
  sessionExpiresAt?: number;   // Clients : timestamp Unix (event.endDate + 24h)
  iat:               number;
  exp:               number;
}
```

### 7.7 Stratégie JWT NestJS

```typescript
// auth/strategies/jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => request?.cookies?.['access_token'],
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);
    if (!user?.isActive) throw new UnauthorizedException();
    return user;
  }
}
```

### 7.8 Middleware frontend — UX uniquement

```typescript
// middleware.ts (Next.js)
// ⚠️ Protection UX seulement — redirections côté client
// La vraie sécurité est dans NestJS JwtAuthGuard (backend)
export function middleware(request: NextRequest) {
  const token = request.cookies.get('access_token');
  const { pathname } = request.nextUrl;

  if ((pathname.startsWith('/admin') ||
       pathname.startsWith('/manager') ||
       pathname.startsWith('/client') ||
       pathname.startsWith('/scanner/scan')) && !token) {
    return NextResponse.redirect(
      new URL(`/auth/google?redirect=${encodeURIComponent(request.url)}`, request.url)
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/manager/:path*', '/client/:path*', '/scanner/scan'],
};
```

### 7.9 Enrichissement profil post-paiement

Les providers africains collectent téléphone et pays au checkout. Ces données sont récupérées dans le webhook et enregistrées **uniquement si les champs sont absents en base** (jamais écrasés).

```typescript
// payments.service.ts
async enrichClientProfile(clientId: string, paymentData: any): Promise<void> {
  const user = await this.prisma.user.findUnique({ where: { id: clientId } });
  if (!user) return;

  const phone   = this.extractAndValidatePhone(paymentData);
  const country = this.extractCountry(paymentData);

  // Mise à jour conditionnelle explicite — ne jamais écraser
  await this.prisma.user.update({
    where: { id: clientId },
    data: {
      phone:   (!user.phone   && phone)   ? phone   : undefined,
      country: (!user.country && country) ? country : undefined,
      profileCompletedAt: new Date(),
    },
  });
}

// Extraction téléphone avec validation E.164 via libphonenumber-js
private extractAndValidatePhone(payload: any): string | null {
  const raw = payload.phone
    ?? payload.customer_phone_number
    ?? payload.transaction?.customer?.phone
    ?? null;
  if (!raw) return null;
  try {
    const parsed = parsePhoneNumber(String(raw));
    return parsed.isValid() ? parsed.format('E.164') : null;
  } catch { return null; }
}

private extractCountry(payload: any): string | null {
  const raw = payload.country
    ?? payload.customer_country
    ?? payload.transaction?.customer?.country
    ?? null;
  return raw && /^[A-Z]{2}$/.test(String(raw).toUpperCase())
    ? String(raw).toUpperCase()
    : null;
}
```

---

## 8. SYSTÈME DE PAIEMENT MULTI-PROVIDER

### 8.1 Interface commune Provider

```typescript
// payments/providers/payment-provider.interface.ts
export interface IPaymentProvider {
  initPayment(params: InitPaymentParams): Promise<PaymentInitResult>;
  verifyWebhook(payload: any, signature: string): boolean;
  getTransactionStatus(transactionId: string): Promise<TransactionStatus>;
}

interface InitPaymentParams {
  amount:        number;   // En centimes
  currency:      string;   // XOF, XAF, GNF...
  orderId:       string;
  description:   string;
  callbackUrl:   string;   // URL webhook
  returnUrl:     string;   // Redirect succès
  cancelUrl:     string;   // Redirect annulation
  customerEmail: string;
  customerName:  string;
  customerPhone?: string;
}
```

### 8.2 Initialisation paiement — guard stock préventif + ownership

```typescript
// payments/payments.service.ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CLIENT)
async initPayment(dto: InitPaymentDto, clientId: string): Promise<PaymentInitResult> {
  const { ticketId, provider } = dto;

  // 1. Vérifier ticket actif
  const ticket = await this.prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { event: true },
  });
  if (!ticket || !ticket.isActive) throw new NotFoundException('Ticket introuvable');

  // 2. Guard stock préventif (décrémentation atomique se fait côté webhook)
  if (ticket.stockSold >= ticket.stock) throw new ConflictException('Stock épuisé');

  // 3. Vérifier dates de vente
  const now = new Date();
  if (ticket.saleStartDate && now < ticket.saleStartDate)
    throw new BadRequestException('Vente pas encore ouverte');
  if (ticket.saleEndDate && now > ticket.saleEndDate)
    throw new BadRequestException('Vente terminée');

  // 4. Créer commande PENDING avec clientId du JWT (ownership garanti)
  const order = await this.prisma.order.create({
    data: {
      eventId:         ticket.eventId,
      clientId,             // Toujours le user authentifié — jamais un param externe
      status:          'PENDING',
      totalAmount:     ticket.price,
      currency:        ticket.currency,
      paymentProvider: provider,
      items: { create: { ticketId, quantity: 1, unitPrice: ticket.price } },
    },
  });

  // 5. Initier paiement provider
  const providerInstance = this.getProvider(provider);
  return providerInstance.initPayment({
    amount:        Number(ticket.price) * 100,
    currency:      ticket.currency,
    orderId:       order.id,
    description:   `Billet : ${ticket.name}`,
    callbackUrl:   `${process.env.API_URL}/api/payments/webhook/${provider.toLowerCase()}`,
    returnUrl:     `${process.env.FRONTEND_URL}/client/tickets?success=1`,
    cancelUrl:     `${process.env.FRONTEND_URL}/e/${ticket.event.slug}?cancelled=1`,
    customerEmail: '', // Récupéré depuis le service appelant via req.user
    customerName:  '',
  });
}
```

### 8.3 Webhook complet — idempotence + stock atomique

```typescript
// payments/payments.service.ts
async processWebhook(
  provider: PaymentProviderType,
  payload:  any,
  rawBody:  string,   // Corps brut — obligatoire pour HMAC
  signature: string,
): Promise<void> {

  // 1. Vérification signature HMAC (timing-safe sur rawBody, pas JSON parsé)
  const providerInstance = this.getProvider(provider);
  if (!providerInstance.verifyWebhook(rawBody, signature)) {
    throw new UnauthorizedException('Signature webhook invalide');
  }

  const transactionId = payload.transactionId ?? payload.transaction_id;
  if (!transactionId) { this.logger.warn('Webhook sans transactionId ignoré'); return; }

  // 2. Idempotence — insert atomique @unique → double webhook ignoré proprement
  try {
    await this.prisma.webhookEvent.create({
      data: { provider: provider.toString(), transactionId },
    });
  } catch (e) {
    if (e.code === 'P2002') {
      this.logger.warn(`Webhook ${provider}/${transactionId} déjà traité — ignoré`);
      await this.auditService.log('payment.webhook.duplicate', 'Order', null, { transactionId });
      return;
    }
    throw e;
  }

  // 3. Récupérer commande
  const orderId = payload.orderId ?? payload.metadata?.orderId;
  const order = await this.prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { ticket: true } }, client: true, event: true },
  });
  if (!order) { this.logger.error(`Commande ${orderId} introuvable`); return; }
  if (order.status === 'PAID') return; // Double sécurité

  // 4. Vérifier statut chez le provider (ne jamais faire confiance au payload seul)
  const txStatus = await providerInstance.getTransactionStatus(transactionId);
  if (txStatus !== 'SUCCESS') {
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'FAILED', paymentData: payload },
    });
    return;
  }

  // 5. Transaction atomique courte — pas de Puppeteer ici
  await this.prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { status: 'PAID', paidAt: new Date(), paymentRef: transactionId, paymentData: payload },
    });

    for (const item of order.items) {
      // ─── DÉCRÉMENTATION ATOMIQUE AVEC GUARD CAPACITÉ ──────────────────
      // updateMany retourne { count: N }. Si count === 0, le stock est épuisé.
      // Condition : stockSold + quantity <= stock  ⟺  stockSold <= stock - quantity
      const updated = await tx.ticket.updateMany({
        where: {
          id:        item.ticketId,
          stockSold: { lte: { subtract: [{ ref: 'stock' }, item.quantity] } as any },
        },
        data: { stockSold: { increment: item.quantity } },
      });

      if (updated.count === 0) {
        // Race condition détectée — rollback automatique de la $transaction
        await this.auditService.log('payment.stock.race', 'Ticket', item.ticketId);
        throw new ConflictException(`Race condition stock pour ticket ${item.ticketId}`);
        // TODO: déclencher remboursement automatique
      }
      // ────────────────────────────────────────────────────────────────────

      // Enrichir profil client (ne jamais écraser des données existantes)
      await this.enrichClientProfile(order.clientId, payload);
    }
  });

  // 6. Réponse 200 immédiate au provider — PDF/notifications en asynchrone
  await this.pdfQueue.add(
    'generate-ticket',
    { orderId: order.id },
    { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
  );

  await this.auditService.log('payment.webhook.success', 'Order', orderId, { provider, transactionId });
}
```

### 8.4 Worker BullMQ — génération PDF + notifications

```typescript
// pdf-queue/pdf.processor.ts
@Processor('pdf-generation')
export class PdfProcessor {
  @Process('generate-ticket')
  async handleGenerateTicket(job: Job<{ orderId: string }>): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: job.data.orderId },
      include: { items: { include: { ticket: true } }, client: true, event: true },
    });
    if (!order) throw new Error(`Ordre ${job.data.orderId} introuvable`);

    for (const item of order.items) {
      // QR token avec exp = event.endDate + 24h
      const qrToken = this.ticketDesignService.generateQrToken(
        item.id, order.eventId, item.ticketId, order.event.endDate,
      );

      const qrCodeUrl = await this.ticketDesignService.generateTicketPdf({
        qrToken, ticket: item.ticket, event: order.event,
        order, orderItem: item, client: order.client,
      });

      await this.prisma.orderItem.update({
        where: { id: item.id },
        data: { qrCode: qrToken, qrCodeUrl },
      });
    }

    // Email (obligatoire)
    await this.emailService.sendTicketConfirmation(order);

    // WhatsApp (si téléphone valide — non bloquant)
    await this.whatsappService.sendTicketConfirmation({
      phone:      order.client.phone,
      clientName: order.client.name ?? 'Client',
      eventName:  order.event.title,
      ticketRef:  order.orderNumber,
      eventUrl:   `${process.env.FRONTEND_URL}/e/${order.event.slug}`,
      orderId:    order.id,
    });
  }
}
```

### 8.5 Implémentation Kkiapay

```typescript
@Injectable()
export class KkiapayProvider implements IPaymentProvider {
  private readonly apiUrl = 'https://api.kkiapay.me/api';

  async initPayment(params: InitPaymentParams): Promise<PaymentInitResult> {
    const response = await fetch(`${this.apiUrl}/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PRIVATE-API-KEY': this.config.privateKey,
      },
      body: JSON.stringify({
        amount:      params.amount,
        currency:    params.currency,
        reason:      params.description,
        callback:    params.callbackUrl,
        successUrl:  params.returnUrl,
        failedUrl:   params.cancelUrl,
      }),
    });
    if (!response.ok) throw new Error(`Kkiapay error: ${response.status}`);
    const data = await response.json();
    return { checkoutUrl: data.url, transactionId: data.transactionId };
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    const expected    = createHmac('sha256', this.config.webhookSecret)
                          .update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(signature);
    if (expectedBuf.length !== receivedBuf.length) return false;
    return timingSafeEqual(expectedBuf, receivedBuf);
  }

  async getTransactionStatus(transactionId: string): Promise<TransactionStatus> {
    const res  = await fetch(`${this.apiUrl}/v1/payments/${transactionId}`, {
      headers: { 'X-PRIVATE-API-KEY': this.config.privateKey },
    });
    const data = await res.json();
    return data.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED';
  }
}
```

---

## 9. GÉNÉRATION & VALIDATION QR CODE

### 9.1 Structure du token QR

```typescript
interface QrTokenPayload {
  oid: string;  // orderItemId
  eid: string;  // eventId
  tid: string;  // ticketId
  iat: number;  // timestamp génération (Unix)
  exp: number;  // expiration = event.endDate + 24h (Unix)
}
// Signé HS256 avec QR_SECRET (secret distinct de JWT_SECRET)
```

### 9.2 Génération QR avec expiration événementielle

```typescript
// ticket-design/ticket-design.service.ts
generateQrToken(
  orderItemId: string,
  eventId:     string,
  ticketId:    string,
  eventEndDate: Date,
): string {
  const graceSeconds = 24 * 3600;
  const expTimestamp = Math.floor(eventEndDate.getTime() / 1000) + graceSeconds;
  const now          = Math.floor(Date.now() / 1000);
  const expiresIn    = Math.max(expTimestamp - now, 3600); // min 1h

  const payload: QrTokenPayload = {
    oid: orderItemId, eid: eventId, tid: ticketId,
    iat: now, exp: now + expiresIn,
  };
  return sign(payload, process.env.QR_SECRET!, { algorithm: 'HS256' });
}
```

### 9.3 Génération PDF — Puppeteer avec sanitisation XSS

```typescript
async generateTicketPdf(params: TicketRenderParams): Promise<string> {
  const qrBase64 = await QRCode.toDataURL(params.qrToken, {
    width: 320, margin: 1, errorCorrectionLevel: 'H',
  });

  const html = this.buildHtml({
    designImageUrl: this.sanitizeImageUrl(params.ticket.designImageUrl ?? ''),
    designBgColor:  this.sanitizeBgColor(params.ticket.designBgColor  ?? '#d4ac0d'),
    eventName:      params.event.title,
    ticketType:     params.ticket.name,
    qrCodeBase64:   qrBase64,
    orderNumber:    params.order.orderNumber,
    clientName:     params.client.name  ?? 'Inconnu',
    clientPhone:    params.client.phone ?? 'Non renseigné',
  });

  const browser = await puppeteer.launch({
    args: chromium.args, executablePath: await chromium.executablePath(), headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 25000 });
    await page.setViewport({ width: 700, height: 400 });
    const pdfBuffer = await page.pdf({ width: '700px', height: '400px', printBackground: true });

    const storagePath = `tickets/${params.event.id}/${params.orderItem.id}.pdf`;
    const { error } = await supabase.storage
      .from('tickets')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });
    if (error) throw new Error(`Upload PDF échoué : ${error.message}`);

    return supabase.storage.from('tickets').getPublicUrl(storagePath).data.publicUrl;
  } finally {
    await browser.close(); // Toujours fermer, même en cas d'erreur
  }
}

// ─── SANITISATION DES ENTRÉES TEMPLATE ───────────────────────────────────────

// Valide que la couleur est un HEX 6 chiffres — bloque toute injection CSS
private sanitizeBgColor(color: string): string {
  return /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#d4ac0d';
}

// Valide que l'URL appartient au bucket Supabase autorisé — bloque les URLs externes
private sanitizeImageUrl(url: string): string {
  if (!url) return '';
  try {
    const parsed      = new URL(url);
    const allowedBase = `${new URL(process.env.SUPABASE_URL!).origin}/storage/v1/object/public/ticket-designs/`;
    return parsed.href.startsWith(allowedBase) ? parsed.href : '';
  } catch { return ''; }
}

private escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
```

### 9.4 Template HTML billet (référence)

```html
<!-- Variables de template — toutes sanitisées avant injection -->
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; width: 700px; }
    .billet {
      width: 700px; height: 400px;
      display: flex; border: 1px solid #ccc;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden;
    }
    .image-section {
      width: 400px; height: 100%; flex-shrink: 0;
      background-color: {{DESIGN_BG_COLOR}};           /* HEX validé regex */
      background-image: url('{{DESIGN_IMAGE_URL}}');   /* URL whitélistée Supabase */
      background-size: cover; background-position: center;
    }
    .info-section {
      flex: 1; padding: 20px;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      background: white; text-align: center;
    }
    .event-name  { font-size: 0.85em; font-weight: 700; color: #111; text-transform: uppercase; }
    .ticket-type { font-size: 0.75em; color: #666; margin: 4px 0 8px; }
    .qr-area     { width: 160px; height: 160px; margin: 8px 0; }
    .qr-area img { width: 100%; height: 100%; }
    .text-data   { font-size: 0.78em; line-height: 1.6; color: #333; margin-top: 8px; }
    .text-data strong { color: #111; }
  </style>
</head>
<body>
  <div class="billet">
    <div class="image-section"></div>
    <div class="info-section">
      <div class="event-name">{{EVENT_NAME}}</div>
      <div class="ticket-type">{{TICKET_TYPE}}</div>
      <div class="qr-area"><img src="{{QR_CODE_BASE64}}" alt="QR Code" /></div>
      <div class="text-data">
        <strong>Référence :</strong> {{ORDER_NUMBER}}<br>
        <strong>Nom :</strong> {{CLIENT_NAME}}<br>
        <strong>Tél :</strong> {{CLIENT_PHONE}}
      </div>
    </div>
  </div>
</body>
</html>
```

| Variable | Source | Sanitisation |
|---|---|---|
| `{{DESIGN_IMAGE_URL}}` | `Ticket.designImageUrl` | Whitelist URL Supabase bucket `ticket-designs/` |
| `{{DESIGN_BG_COLOR}}` | `Ticket.designBgColor` | Regex `/^#[0-9A-Fa-f]{6}$/` stricte |
| `{{EVENT_NAME}}` | `Event.title` | `escapeHtml()` |
| `{{TICKET_TYPE}}` | `Ticket.name` | `escapeHtml()` |
| `{{QR_CODE_BASE64}}` | Généré en interne | Data URL — non user-fourni |
| `{{ORDER_NUMBER}}` | `Order.orderNumber` | `escapeHtml()` |
| `{{CLIENT_NAME}}` | `User.name` | `escapeHtml()` |
| `{{CLIENT_PHONE}}` | `User.phone` | `escapeHtml()` |

### 9.5 Validation QR — atomic lock scanner

```typescript
// scanner/scanner.service.ts
async validateQr(qrToken: string, scannerId: string): Promise<ScanValidationResult> {

  // 1. Vérifier + décoder JWT (exp vérifié automatiquement par jsonwebtoken)
  let payload: QrTokenPayload;
  try {
    payload = verify(qrToken, process.env.QR_SECRET!) as QrTokenPayload;
  } catch (e) {
    const result = e.name === 'TokenExpiredError' ? ScanResult.EXPIRED : ScanResult.INVALID;
    return this.logAndReturn(scannerId, null, result);
  }

  // 2. Vérifier scanner actif
  const scanner = await this.prisma.scanner.findUnique({
    where: { id: scannerId }, include: { event: true },
  });
  if (!scanner || !scanner.isActive)
    return this.logAndReturn(scannerId, payload.oid, ScanResult.INVALID);

  // 3. Vérifier correspondance événement
  if (payload.eid !== scanner.eventId)
    return this.logAndReturn(scannerId, payload.oid, ScanResult.EVENT_MISMATCH);

  // 4. Vérifier événement actif
  if (scanner.event.status !== 'PUBLISHED')
    return this.logAndReturn(scannerId, payload.oid, ScanResult.EXPIRED);

  // 5. Lock atomique — prévention absolue du double scan
  const orderItem = await this.prisma.$transaction(async (tx) => {
    const item = await tx.orderItem.findUnique({
      where: { id: payload.oid },
      include: {
        order: { include: { client: { select: { name: true } } } }, // email/phone EXCLUS
        ticket: { select: { name: true } },
      },
    });
    if (!item) return null;
    if (item.isScanned) return { ...item, alreadyScanned: true };
    if (item.order.status !== 'PAID') return { ...item, notPaid: true };

    return tx.orderItem.update({
      where: { id: payload.oid },
      data: { isScanned: true, scannedAt: new Date(), scannedById: scannerId },
      include: {
        order: { include: { client: { select: { name: true } } } },
        ticket: { select: { name: true } },
      },
    });
  });

  if (!orderItem) return this.logAndReturn(scannerId, payload.oid, ScanResult.INVALID);
  if ((orderItem as any).alreadyScanned) return this.logAndReturn(scannerId, payload.oid, ScanResult.ALREADY_USED);
  if ((orderItem as any).notPaid)        return this.logAndReturn(scannerId, payload.oid, ScanResult.INVALID);

  await this.logScan(scannerId, payload.oid, ScanResult.VALID);

  return {
    result: ScanResult.VALID,
    attendee: {
      // ⚠️ Données minimales : email et téléphone JAMAIS retournés au scanner
      name:       orderItem.order.client.name ?? 'Inconnu',
      ticketName: orderItem.ticket.name,
      scannedAt:  new Date(),
    },
  };
}
```

---

## 10. PWA SCANNER MOBILE

### 10.1 Manifest PWA

```json
{
  "name": "EventScan — Contrôle d'accès",
  "short_name": "EventScan",
  "start_url": "/scanner",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0f172a",
  "theme_color": "#6366f1",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

### 10.2 Next.js Config PWA

```typescript
// next.config.ts
const pwaConfig = withPWA({
  dest: 'public', register: true, skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    { urlPattern: /^\/api\/scan\/validate/, handler: 'NetworkOnly' }, // Scan toujours en ligne
  ],
});
```

### 10.3 Composant Scanner — useRef anti double-scan

```tsx
// components/scanner/QrScannerCamera.tsx
'use client';
import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useScannerStore } from '@/store/scannerStore';

export function QrScannerCamera() {
  const scannerRef    = useRef<Html5Qrcode | null>(null);
  // ⚠️ useRef (pas useState) : pas de re-render → guard atomiquement fiable
  const isScanningRef = useRef(false);
  const { validateQr, lastScanResult } = useScannerStore();

  useEffect(() => {
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      async (decodedText) => {
        if (isScanningRef.current) return; // Guard ref — JS single-threaded
        isScanningRef.current = true;
        try {
          await validateQr(decodedText);
        } finally {
          setTimeout(() => { isScanningRef.current = false; }, 2000);
        }
      },
      () => {},
    );

    return () => { scanner.stop().catch(() => {}); };
  }, []); // Pas de dépendances — caméra ne redémarre pas

  return (
    <div className="relative w-full max-w-sm mx-auto">
      <div id="qr-reader" className="w-full rounded-2xl overflow-hidden" />
      {lastScanResult && <ScanFeedback result={lastScanResult} />}
    </div>
  );
}

function ScanFeedback({ result }: { result: ScanValidationResult }) {
  const isValid = result.result === 'VALID';
  return (
    <div className={`absolute inset-0 flex items-center justify-center rounded-2xl
      ${isValid ? 'bg-green-500/80' : 'bg-red-500/80'}`}>
      <div className="text-white text-center p-4">
        <div className="text-4xl mb-2">{isValid ? '✅' : '❌'}</div>
        {isValid ? (
          <>
            <p className="font-bold text-lg">{result.attendee?.name}</p>
            <p className="text-sm opacity-90">{result.attendee?.ticketName}</p>
          </>
        ) : (
          <p className="font-bold text-lg">{getScanErrorMessage(result.result)}</p>
        )}
      </div>
    </div>
  );
}
```

---

## 11. EVENT BUILDER NO-CODE

### 11.1 Types de blocs

```typescript
export type BlockType =
  | 'hero' | 'text' | 'image' | 'video' | 'gallery'
  | 'countdown' | 'tickets' | 'faq' | 'schedule'
  | 'testimonials' | 'sponsors';

export interface Block {
  id:     string;
  type:   BlockType;
  order:  number;
  props:  BlockProps[BlockType];
  styles?: {
    backgroundColor?: string; // HEX uniquement — validé Zod côté backend
    paddingY?:         'sm' | 'md' | 'lg' | 'xl';
    textAlign?:        'left' | 'center' | 'right';
  };
}
```

### 11.2 Validation Zod (backend obligatoire)

```typescript
// builder/schemas/blocks.schema.ts
import { z } from 'zod';

const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur HEX invalide');

const BlockStylesSchema = z.object({
  backgroundColor: HexColor.optional(),
  paddingY:        z.enum(['sm', 'md', 'lg', 'xl']).optional(),
  textAlign:       z.enum(['left', 'center', 'right']).optional(),
}).optional();

const BlockSchema = z.object({
  id:     z.string().uuid(),
  type:   z.enum(['hero','text','image','video','gallery','countdown',
                  'tickets','faq','schedule','testimonials','sponsors']),
  order:  z.number().int().min(0),
  props:  z.record(z.unknown()),
  styles: BlockStylesSchema,
});

export const BlocksArraySchema = z.array(BlockSchema).max(50);

export const SaveBlocksDto = z.object({
  blocks:             BlocksArraySchema,
  lastKnownUpdatedAt: z.string().datetime(), // Contrôle de concurrence optimiste
});
```

### 11.3 Contrôle de concurrence optimiste

```typescript
// builder/builder.service.ts
async saveBlocks(eventId: string, dto: SaveBlocksDto, managerId: string): Promise<EventPage> {
  const event = await this.prisma.event.findUnique({ where: { id: eventId } });
  if (!event || event.managerId !== managerId) throw new ForbiddenException();

  const page = await this.prisma.eventPage.findUnique({ where: { eventId } });
  if (!page) throw new NotFoundException('Page builder introuvable');

  // 409 si un autre onglet/utilisateur a sauvegardé entre-temps
  if (page.updatedAt > new Date(dto.lastKnownUpdatedAt)) {
    throw new ConflictException(
      'La page a été modifiée par une autre session. Rechargez avant de sauvegarder.'
    );
  }

  return this.prisma.eventPage.update({
    where: { eventId },
    data:  { blocks: dto.blocks as any, updatedAt: new Date() },
  });
}
```

### 11.4 Store Zustand avec lastSavedAt

```typescript
// store/builderStore.ts
interface BuilderStore {
  blocks:          Block[];
  selectedBlockId: string | null;
  isDirty:         boolean;
  lastSavedAt:     string | null; // ISO string → envoyé comme lastKnownUpdatedAt
  // ...actions
  saveBlocks: (eventId: string) => Promise<void>;
}

export const useBuilderStore = create<BuilderStore>()(immer((set, get) => ({
  // ...

  saveBlocks: async (eventId) => {
    const { blocks, lastSavedAt } = get();
    const res = await fetch(`/api/builder/${eventId}/blocks`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks, lastKnownUpdatedAt: lastSavedAt }),
    });
    if (res.status === 409) throw new Error('Conflit : rechargez la page avant de sauvegarder.');
    if (!res.ok) throw new Error('Erreur sauvegarde');
    const data = await res.json();
    set((state) => {
      state.isDirty    = false;
      state.lastSavedAt = data.data.updatedAt;
    });
  },
})));
```

---

## 12. NOTIFICATIONS WHATSAPP

### 12.1 Provider : Meta Cloud API (WhatsApp Business)

```typescript
// notifications/whatsapp.service.ts
import { parsePhoneNumber } from 'libphonenumber-js';

@Injectable()
export class WhatsappService {
  async sendTicketConfirmation(params: WhatsappTicketParams): Promise<void> {
    if (!params.phone) {
      this.logger.warn(`WhatsApp skipped: no phone for order ${params.orderId}`);
      return;
    }

    const normalizedPhone = this.normalizePhone(params.phone);
    if (!normalizedPhone) {
      this.logger.warn(`WhatsApp skipped: invalid phone for order ${params.orderId}`);
      return;
    }

    const payload = {
      messaging_product: 'whatsapp',
      to:   normalizedPhone,
      type: 'template',
      template: {
        name:     'ticket_confirmation',
        language: { code: 'fr' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: params.clientName },
            { type: 'text', text: params.eventName  },
            { type: 'text', text: params.ticketRef  },
            { type: 'text', text: params.eventUrl   },
          ],
        }],
      },
    };

    try {
      const response = await fetch(
        `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(5000), // Timeout 5s — non bloquant
        }
      );
      if (!response.ok) {
        const err = await response.json();
        this.logger.error(`WhatsApp error order ${params.orderId}`, err);
        await this.auditService.log('whatsapp.failed', 'Order', params.orderId);
      } else {
        await this.auditService.log('whatsapp.sent', 'Order', params.orderId);
      }
    } catch (e) {
      this.logger.error(`WhatsApp timeout/network order ${params.orderId}`, e);
      // Le BullMQ retry gérera les tentatives suivantes
    }
  }

  // libphonenumber-js — validation stricte E.164
  private normalizePhone(raw: string): string | null {
    try {
      const parsed = parsePhoneNumber(raw);
      if (!parsed.isValid()) return null;
      return parsed.format('E.164').replace('+', ''); // Meta : chiffres sans +
    } catch { return null; }
  }
}
```

### 12.2 Template à enregistrer sur Meta Business Manager

**Nom** : `ticket_confirmation` | **Langue** : Français | **Catégorie** : UTILITY

```
Bonjour {{1}} 🎉

Votre paiement a été confirmé !

🎟️ Événement : {{2}}
🔑 Référence : {{3}}

Rejoignez la page de l'événement et retrouvez votre billet :
👉 {{4}}

À très bientôt !
```

**⚠️ Action requise** : Soumettre le template avant le lancement (délai d'approbation Meta : 24-48h).

### 12.3 Résilience

- `phone` null → WhatsApp silencieusement ignoré, email seul envoyé
- Numéro non E.164 → ignoré + log warning
- Timeout API → 5s max, erreur loggée, flux non interrompu
- Retry BullMQ : 3 tentatives avec backoff exponentiel (5s → 25s → 125s)

---

## 13. DESIGN PERSONNALISÉ DES BILLETS

Voir section §9.4 pour le template HTML complet et §9.3 pour la sanitisation.

### 13.1 Interface Manager

```
┌─────────────────────────────────────────────────────────────────┐
│  MANAGER > Tickets > [Nom du billet] > Design                   │
├─────────────────────────────────────────────────────────────────┤
│  [ Upload image ]  ← dropzone, max 5MB, jpeg/png/webp          │
│  (ou couleur de fond si pas d'image)                             │
│                                                                  │
│  Couleur de fond : [████] #d4ac0d    (color picker → HEX only) │
│                                                                  │
│  ── PRÉVISUALISATION (iframe HTML temps réel) ──                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  [IMAGE OU COULEUR]    │  NOM ÉVÉNEMENT                 │   │
│  │                        │  Type billet                   │   │
│  │                        │  [███ QR ███]                  │   │
│  │                        │  Ref: XXXX                     │   │
│  │                        │  Nom: Jean Dupont              │   │
│  │                        │  Tél: +228 XX XX XX XX         │   │
│  └──────────────────────────────────────────────────────────┘   │
│  [Annuler]                              [Sauvegarder le design] │
└─────────────────────────────────────────────────────────────────┘
```

### 13.2 Contraintes techniques

- Upload : max **5 MB**, formats : `image/jpeg`, `image/png`, `image/webp`
- Storage : bucket `ticket-designs/` Supabase (accès public)
- URL systématiquement whitélistée backend avant rendu
- Génération PDF **asynchrone** (BullMQ) — pas dans le webhook
- Puppeteer timeout : 25s + `browser.close()` en `finally`
- Retry BullMQ x3 en cas d'échec Puppeteer
- Prévisualisation Manager : HTML direct dans `<iframe>` (pas de Puppeteer)

---

## 14. DASHBOARDS PAR RÔLE

### 14.1 Routes Next.js

```
app/
├── (dashboard)/
│   ├── layout.tsx              # Sidebar + auth redirect (middleware)
│   ├── admin/
│   │   ├── page.tsx            # Overview plateforme
│   │   ├── events/page.tsx     # Tous événements
│   │   ├── events/new/page.tsx # Créer événement
│   │   ├── providers/page.tsx  # Config paiements
│   │   └── logs/page.tsx       # Logs système
│   ├── manager/
│   │   ├── page.tsx            # Dashboard principal
│   │   ├── builder/page.tsx    # Event Builder
│   │   ├── tickets/page.tsx    # Billets + design
│   │   ├── participants/page.tsx
│   │   ├── scanners/page.tsx
│   │   ├── payments/page.tsx
│   │   └── analytics/page.tsx
│   └── client/
│       ├── page.tsx            # Mes billets
│       ├── tickets/page.tsx
│       └── profile/page.tsx
└── scanner/
    ├── page.tsx                # Login scanner
    └── scan/page.tsx           # Caméra PWA
```

### 14.2 KPIs Super Admin

```typescript
interface AdminOverview {
  platform: {
    totalEvents: number; activeEvents: number;
    totalRevenue: Decimal; totalTicketsSold: number;
    totalScans: number; totalManagers: number;
  };
  revenueChart: { date: string; amount: number }[];  // 30 jours
  topEvents:    { eventName: string; revenue: number; tickets: number }[];
  systemLogs:   AuditLog[];  // 10 derniers
}
```

### 14.3 KPIs Manager Dashboard

```typescript
interface ManagerDashboard {
  event: EventDetail;
  stats: {
    totalRevenue: Decimal; ticketsSold: number; ticketsAvailable: number;
    conversionRate: number; checkinRate: number; liveScanCount: number;
  };
  revenueByTicketType: { name: string; revenue: number; count: number }[];
  salesTimeline:       { date: string; count: number; revenue: number }[];
  scannerActivity:     { scannerName: string; scansToday: number; lastScan: Date }[];
  recentParticipants:  Participant[];
}
```

---

## 15. SÉCURITÉ & AUDIT

### 15.1 Principes (récapitulatif)

1. **NestJS = seul garant de la sécurité**. `JwtAuthGuard + RolesGuard` systématiques.
2. **Supabase SERVICE_ROLE_KEY** = bypass RLS volontaire. RLS non activé.
3. **Middleware Next.js = UX seulement** (redirections visuelles).
4. **Ownership vérifié dans chaque service** (Manager → son event, Client → ses commandes).
5. **Webhooks** : signature HMAC `timingSafeEqual` sur `rawBody` (pas JSON parsé).
6. **Idempotence** : table `WebhookEvent @unique([provider, transactionId])`.
7. **Stock** : `updateMany` atomique avec condition `stockSold <= stock - quantity`.
8. **XSS billet** : whitelist URL + regex HEX + `escapeHtml()` sur toutes les variables.
9. **Scanner** : `useRef` (pas `useState`) pour le verrou anti double-scan.
10. **Données minimales** : email/phone du client jamais retournés au scanner.

### 15.2 Chiffrement clés API paiement (AES-256-GCM)

```typescript
// common/crypto.service.ts
@Injectable()
export class CryptoService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32 bytes hex

  encrypt(plaintext: string): string {
    const iv        = randomBytes(16);
    const cipher    = createCipheriv(this.algorithm, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag       = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(ciphertext: string): string {
    const [ivHex, tagHex, encHex] = ciphertext.split(':');
    const decipher = createDecipheriv(this.algorithm, this.key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
  }
}
```

### 15.3 Rate Limiting

```typescript
ThrottlerModule.forRoot({
  throttlers: [
    { name: 'short',  ttl: 1000,  limit: 10  }, // 10 req/sec
    { name: 'medium', ttl: 60000, limit: 100 }, // 100 req/min
  ],
}),

// Scanner : 20 scans/sec max
@Throttle({ default: { limit: 20, ttl: 1000 } })
@Post('validate') async validateQr() { ... }

// Auth login scanner : anti-bruteforce
@Throttle({ default: { limit: 5, ttl: 60000 } })
@Post('scanner/login') async scannerLogin() { ... }
```

### 15.4 Codes d'erreur standardisés

```typescript
export const ErrorCodes = {
  // Auth
  UNAUTHORIZED:              'UNAUTHORIZED',
  FORBIDDEN:                 'FORBIDDEN',
  TOKEN_EXPIRED:             'TOKEN_EXPIRED',
  AUTH_REQUIRED_TO_PURCHASE: 'AUTH_REQUIRED_TO_PURCHASE',
  // Events
  EVENT_NOT_FOUND:           'EVENT_NOT_FOUND',
  EVENT_NOT_ACTIVE:          'EVENT_NOT_ACTIVE',
  EVENT_EXPIRED:             'EVENT_EXPIRED',
  // Tickets
  TICKET_NOT_FOUND:          'TICKET_NOT_FOUND',
  TICKET_SOLD_OUT:           'TICKET_SOLD_OUT',
  TICKET_SALE_NOT_STARTED:   'TICKET_SALE_NOT_STARTED',
  TICKET_SALE_ENDED:         'TICKET_SALE_ENDED',
  // Paiements
  PAYMENT_INIT_FAILED:       'PAYMENT_INIT_FAILED',
  WEBHOOK_SIGNATURE_INVALID: 'WEBHOOK_SIGNATURE_INVALID',
  WEBHOOK_ALREADY_PROCESSED: 'WEBHOOK_ALREADY_PROCESSED',
  PROVIDER_NOT_ACTIVE:       'PROVIDER_NOT_ACTIVE',
  STOCK_RACE_CONDITION:      'STOCK_RACE_CONDITION',
  // Scan
  QR_INVALID:                'QR_INVALID',
  QR_EXPIRED:                'QR_EXPIRED',
  QR_ALREADY_SCANNED:        'QR_ALREADY_SCANNED',
  QR_EVENT_MISMATCH:         'QR_EVENT_MISMATCH',
  // Scanner
  SCANNER_QUOTA_EXCEEDED:    'SCANNER_QUOTA_EXCEEDED',
  SCANNER_NOT_ACTIVE:        'SCANNER_NOT_ACTIVE',
  // Builder
  BUILDER_CONFLICT:          'BUILDER_CONFLICT',
  BUILDER_SCHEMA_INVALID:    'BUILDER_SCHEMA_INVALID',
  // Design
  DESIGN_IMAGE_TOO_LARGE:    'DESIGN_IMAGE_TOO_LARGE',
  DESIGN_IMAGE_FORMAT_INVALID: 'DESIGN_IMAGE_FORMAT_INVALID',
  DESIGN_IMAGE_URL_INVALID:  'DESIGN_IMAGE_URL_INVALID',
  // WhatsApp
  WHATSAPP_NO_PHONE:         'WHATSAPP_NO_PHONE',
  WHATSAPP_PHONE_INVALID:    'WHATSAPP_PHONE_INVALID',
  WHATSAPP_SEND_FAILED:      'WHATSAPP_SEND_FAILED',
} as const;
```

### 15.5 Audit Log — actions tracquées

```typescript
const AUDIT_ACTIONS = {
  'auth.google.login':         'Connexion Google OAuth',
  'auth.scanner.login':        'Connexion scanner',
  'auth.logout':               'Déconnexion',
  'event.created':             'Événement créé',
  'event.updated':             'Événement modifié',
  'event.status.changed':      'Statut changé',
  'event.deleted':             'Événement supprimé',
  'payment.init':              'Paiement initialisé',
  'payment.webhook.success':   'Webhook succès',
  'payment.webhook.failed':    'Webhook échoué',
  'payment.webhook.duplicate': 'Webhook en double ignoré',
  'payment.stock.race':        'Race condition stock détectée',
  'scan.valid':                'QR valide',
  'scan.already_used':         'QR déjà utilisé',
  'scan.invalid':              'QR invalide',
  'scan.expired':              'QR expiré',
  'email.sent':                'Email envoyé',
  'email.failed':              'Email échoué',
  'whatsapp.sent':             'WhatsApp envoyé',
  'whatsapp.failed':           'WhatsApp échoué',
  'admin.provider.updated':    'Provider paiement modifié',
  'admin.manager.status':      'Statut manager changé',
};
```

---

## 16. VARIABLES D'ENVIRONNEMENT

> **Règle absolue** : aucune clé secrète dans le code ou les Dockerfiles.
> Copier `.env.example` → `.env` (gitignored), remplir les valeurs.

### 16.1 `.env.example` — fichier source unique versionné

```bash
# ═══════════════════════════════════════════════════════════════
# SAAS ÉVÉNEMENTIEL — Variables d'environnement
# Copier ce fichier en .env et remplir les valeurs
# ═══════════════════════════════════════════════════════════════

# ─── APPLICATION ─────────────────────────────────────────────
NODE_ENV=development                          # development | production
PORT=4000                                     # Port backend NestJS
FRONTEND_URL=http://localhost:3000            # prod: https://yourdomain.com
API_URL=http://localhost:4000                 # prod: https://api.yourdomain.com

# ─── BASE DE DONNÉES ─────────────────────────────────────────
# DEV  : PostgreSQL Docker local
DATABASE_URL=postgresql://saas_user:saas_password@postgres:5432/saas_events

# PROD : remplacer par l'URL Supabase — rien d'autre ne change
# DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# ─── JWT (secrets distincts obligatoires) ────────────────────
JWT_SECRET=change-me-minimum-32-chars-secret
JWT_EXPIRES_IN=7d                             # Fallback sans événement (voir §7.2)
JWT_REFRESH_SECRET=change-me-another-32-chars-secret
# NB : durée réelle = event.endDate + 24h (calculé dynamiquement)

# ─── QR CODE (secret distinct du JWT_SECRET) ─────────────────
QR_SECRET=change-me-qr-secret-32-chars-min

# ─── CHIFFREMENT clés API paiement (AES-256-GCM) ─────────────
ENCRYPTION_KEY=change-me-64-hex-chars         # 32 bytes = 64 chars hex

# ─── REDIS / BULLMQ ──────────────────────────────────────────
# DEV  : Redis Docker local (nom service Docker Compose)
REDIS_HOST=redis
REDIS_PORT=6379
# PROD : Redis managé (Upstash, Railway…)
# REDIS_URL=redis://default:password@host:port

# ─── EMAIL ───────────────────────────────────────────────────
# DEV  : Mailpit (intercepteur local, UI sur http://localhost:8025)
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=                                    # Pas d'auth sur Mailpit
SMTP_PASS=
EMAIL_FROM=noreply@saas-events.local

# PROD : Resend ou autre provider SMTP réel
# SMTP_HOST=smtp.resend.com
# SMTP_PORT=465
# SMTP_SECURE=true
# SMTP_USER=resend
# SMTP_PASS=re_xxxxxxxxxxxxx
# EMAIL_FROM=noreply@yourdomain.com

# ─── STOCKAGE FICHIERS (AWS SDK S3 — même code dev et prod) ────
# DEV  : RustFS en Docker local (compatible S3, Apache 2.0)
STORAGE_ENDPOINT=http://rustfs:9000          # Nom du service Docker Compose
STORAGE_REGION=us-east-1                     # Valeur requise mais bidon pour RustFS
STORAGE_ACCESS_KEY=rustfsadmin
STORAGE_SECRET_KEY=rustfsadmin123
STORAGE_BUCKET=saas-events
STORAGE_FORCE_PATH_STYLE=true               # Obligatoire pour stockages locaux S3
STORAGE_PUBLIC_URL=http://localhost:9000    # URL depuis le navigateur (hors Docker)

# PROD : Supabase Storage (S3-compatible, managé) — seules ces lignes changent
# STORAGE_ENDPOINT=https://[ref].supabase.co/storage/v1/s3
# STORAGE_REGION=eu-west-1
# STORAGE_ACCESS_KEY=[Supabase dashboard → Storage → S3 credentials]
# STORAGE_SECRET_KEY=[idem]
# STORAGE_BUCKET=saas-events
# STORAGE_FORCE_PATH_STYLE=false
# STORAGE_PUBLIC_URL=https://[ref].supabase.co/storage/v1/object/public

# ─── SUPABASE (Auth PostgreSQL prod + RLS bypass) ────────────────
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # Backend uniquement (bypass RLS)

# ─── GOOGLE OAUTH ────────────────────────────────────────────
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-secret
GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback
# prod: https://api.yourdomain.com/api/auth/google/callback

# ─── WHATSAPP BUSINESS (Meta Cloud API) ──────────────────────
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxxxxxxx
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your-random-verify-token

# ─── PAIEMENTS (stockés chiffrés en DB — valeurs initiales admin) ──
KKIAPAY_PUBLIC_KEY=
KKIAPAY_PRIVATE_KEY=
KKIAPAY_WEBHOOK_SECRET=

CINETPAY_API_KEY=
CINETPAY_SITE_ID=
CINETPAY_NOTIFY_URL=http://localhost:4000/api/payments/webhook/cinetpay
# prod: https://api.yourdomain.com/api/payments/webhook/cinetpay

FEDAPAY_API_KEY=
FEDAPAY_WEBHOOK_SECRET=

# ─── DOCKER POSTGRES (utilisé par docker-compose.yml uniquement) ──
POSTGRES_USER=saas_user
POSTGRES_PASSWORD=saas_password
POSTGRES_DB=saas_events
```

### 16.2 Variables frontend — Next.js (`.env.local`)

```bash
# Préfixe NEXT_PUBLIC_ = exposé au navigateur — ne jamais y mettre de secret
NEXT_PUBLIC_API_URL=http://localhost:4000       # prod: https://api.yourdomain.com
NEXT_PUBLIC_APP_URL=http://localhost:3000       # prod: https://yourdomain.com
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key   # Lecture storage publique uniquement
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
```

### 16.3 Différences clés dev / prod

| Variable | Développement | Production |
|---|---|---|
| `DATABASE_URL` | `postgres://...@postgres:5432/...` (Docker) | URL Supabase PostgreSQL |
| `SMTP_HOST` | `mailpit` (container Docker) | `smtp.resend.com` ou équivalent |
| `REDIS_HOST` | `redis` (container Docker) | Redis managé ou `REDIS_URL` |
| `FRONTEND_URL` | `http://localhost:3000` | `https://yourdomain.com` |
| `GOOGLE_CALLBACK_URL` | `http://localhost:4000/api/auth/...` | `https://api.yourdomain.com/api/auth/...` |
| `NODE_ENV` | `development` | `production` |
| `STORAGE_ENDPOINT` | `http://rustfs:9000` (Docker local) | `https://[ref].supabase.co/storage/v1/s3` |
| `STORAGE_FORCE_PATH_STYLE` | `true` (RustFS) | `false` (Supabase S3) |
| `STORAGE_PUBLIC_URL` | `http://localhost:9000` | `https://[ref].supabase.co/storage/v1/object/public` |

---

## 17. FLUX MÉTIER COMPLETS

### 17.1 Flux Achat → QR → Scan (corrigé v3.0.0)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 1. DÉCOUVERTE                                                                │
│    Client → https://yourdomain.com/e/concert-2026 (SSR Next.js)            │
│    → Blocs EventPage depuis Supabase → CTA "Acheter"                        │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 2. AUTH OBLIGATOIRE (si non connecté)                                        │
│    → saveIntent(slug, ticketId) → sessionStorage {ticketId, timestamp}      │
│    → Redirect /api/auth/google?eventSlug=slug&intent=buy                    │
│    → Google OAuth → callback → upsert User                                  │
│    → calcul durée JWT = event.endDate + 24h (si event PUBLISHED)            │
│    → access_token + refresh_token (même durée) → cookies httpOnly           │
│    → Redirect /e/slug?resume=1                                               │
│    → consumeIntent(slug) → timestamp < 30min → reprend checkout             │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 3. CHECKOUT                                                                  │
│    → POST /api/payments/init (JwtAuthGuard + Roles(CLIENT))                 │
│    → Guard stock préventif → Création Order PENDING (clientId = jwt.sub)    │
│    → Response { checkoutUrl, orderId }                                       │
│    → Redirect page paiement provider (saisie téléphone + pays par client)  │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 4. PAIEMENT PROVIDER                                                         │
│    → POST /api/payments/webhook/[provider]                                  │
│    → Vérif signature HMAC timingSafeEqual (rawBody)                          │
│    → WebhookEvent.create @unique → si P2002 → skip (idempotence)            │
│    → getTransactionStatus() → si FAILED → Order FAILED → return             │
│    → $transaction atomique courte :                                          │
│       · Order.status = PAID                                                  │
│       · Ticket.stockSold updateMany guard → si count=0 → throw + rollback   │
│       · User.phone + country enrichis (si absents uniquement)               │
│    → Réponse 200 immédiate au provider                                      │
│    → BullMQ job "generate-ticket" ajouté (attempts: 3, backoff: exp)       │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 5. GÉNÉRATION ASYNCHRONE (Worker BullMQ)                                     │
│    → QR token JWT : exp = event.endDate + 24h                                │
│    → sanitizeImageUrl() + sanitizeBgColor() → buildHtml() → Puppeteer → PDF │
│    → StorageService.uploadFile() → RustFS (dev) / Supabase Storage (prod)    │
│    → OrderItem.qrCode + qrCodeUrl mis à jour                                 │
│    → Email Resend : PDF attaché                                               │
│    → WhatsApp : normalizePhone() E.164 → template Meta (si phone valide)    │
│    → Retry auto x3 backoff exponentiel (5s → 25s → 125s)                   │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 6. CONTRÔLE D'ACCÈS (Jour J)                                                 │
│    → Scanner PWA /scanner/scan → JWT valide (event.endDate + 1h)            │
│    → Caméra → isScanningRef.current guard → décode QR                       │
│    → POST /api/scan/validate (JwtAuthGuard + Roles(SCANNER))                │
│    → verify(qrToken) → exp vérifié automatiquement                           │
│    → Vérif eventId + event.status + $transaction isScanned atomique          │
│    → Response { result, attendee: { name, ticketName } }   ← pas email/phone│
│    → Feedback vert ✅ / rouge ❌ (2s avant prochain scan)                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 17.2 Flux création événement (Super Admin)

```
Super Admin → POST /api/admin/events
  Body: { title, slug, startDate, endDate, managerId, maxScanners,
          allowManagerChooseProvider, expiresAt }
→ Création Event + EventPage vide + EventAnalytics
→ Email au Manager : "Votre événement est prêt à configurer"
→ Manager → /manager/builder → personnalise → publie

⚠️ V1 : managerId doit être @unique — 1 Manager = 1 Event.
   Pour un 2ème événement : créer un 2ème compte Manager.
```

### 17.3 Cycle de vie session client

```
Événement : endDate = 2026-12-31T23:59:59Z

[Avant l'événement — phase de vente]
Client s'authentifie → JWT exp = 2027-01-01T23:59:59Z
→ Reste connecté sans interruption pendant toute la phase de vente

[Pendant l'événement — jour J]
Client consulte billets → toujours connecté
Scanner valide → JWT scanner valide jusqu'à endDate + 1h

[Après l'événement — J+1]
JWT client expire 24h après endDate
→ Client reconnecter pour historique (fallback JWT_EXPIRES_IN=7d)

[Refresh Token]
Même durée que l'access_token → renouvellement transparent (React Query interceptor)
```
---

## 18. INFRASTRUCTURE DOCKER

### 18.1 Principes d'architecture Docker (règles non négociables)

- **1 conteneur = 1 responsabilité** (pas de DB dans le container `api`)
- **Pas de stockage fichier dans les conteneurs** → Supabase Storage exclusivement
- **Réseaux Docker internes** → services communiquent par nom (`redis`, `postgres`, `mailpit`)
- **Healthchecks** sur tous les services critiques → dépendances garanties au démarrage
- **Volumes nommés persistants** → données PostgreSQL et Redis survivent aux redémarrages
- **Aucun secret dans les Dockerfiles** → uniquement via `.env` et `environment:` Compose
- **Multi-stage builds** → images de dev (hot reload) et prod (optimisées) depuis le même Dockerfile

---

### 18.2 `docker-compose.yml` — Environnement de développement complet

```yaml
# docker-compose.yml
# Usage : docker compose up
# Démarre : web (:3000), api (:4000), postgres (:5432), redis (:6379), mailpit (:8025)

name: saas-events

services:

  # ─── FRONTEND — Next.js 15 ───────────────────────────────────────────────
  web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
      target: development              # Stage dev : hot reload
    container_name: saas-web
    ports:
      - "3000:3000"
    volumes:
      - ./apps/web:/app               # Hot reload : bind mount du code source
      - /app/node_modules             # Exclure node_modules du bind mount
      - /app/.next                    # Exclure .next du bind mount
    environment:
      - NODE_ENV=development
      - NEXT_PUBLIC_API_URL=http://localhost:4000
      - NEXT_PUBLIC_APP_URL=http://localhost:3000
      - NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
      - NEXT_PUBLIC_GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
    depends_on:
      api:
        condition: service_healthy
    networks:
      - saas-network
    restart: unless-stopped

  # ─── BACKEND — NestJS ────────────────────────────────────────────────────
  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
      target: development              # Stage dev : watch mode + ts-node
    container_name: saas-api
    ports:
      - "4000:4000"
    volumes:
      - ./apps/api:/app               # Hot reload
      - /app/node_modules
    env_file:
      - .env                          # Toutes les variables backend depuis .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      rustfs:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - saas-network
    restart: unless-stopped

  # ─── POSTGRESQL ──────────────────────────────────────────────────────────
  postgres:
    image: postgres:16-alpine
    container_name: saas-postgres
    ports:
      - "5432:5432"                   # Exposé pour Prisma Studio et outils locaux
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data    # Volume persistant
      - ./docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 10s
    networks:
      - saas-network
    restart: unless-stopped

  # ─── REDIS ───────────────────────────────────────────────────────────────
  redis:
    image: redis:7-alpine
    container_name: saas-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data                          # Persistance RDB/AOF
      - ./docker/redis/redis.conf:/etc/redis/redis.conf
    command: redis-server /etc/redis/redis.conf
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    networks:
      - saas-network
    restart: unless-stopped

  # ─── MAILPIT (dev only) ──────────────────────────────────────────────────
  mailpit:
    image: axllent/mailpit:latest
    container_name: saas-mailpit
    ports:
      - "8025:8025"                   # Interface web Mailpit
      - "1025:1025"                   # Port SMTP (reçoit les emails NestJS)
    environment:
      MP_MAX_MESSAGES: 500            # Garder max 500 messages en mémoire
      MP_SMTP_AUTH_ACCEPT_ANY: true   # Accepter n'importe quel user/pass
      MP_SMTP_AUTH_ALLOW_INSECURE: true
    networks:
      - saas-network
    restart: unless-stopped

  # ─── RUSTFS — Stockage S3-compatible (remplace MinIO, Apache 2.0) ──────────
  rustfs:
    image: rustfs/rustfs:latest
    container_name: saas-rustfs
    ports:
      - "9000:9000"     # API S3 — utilisée par le backend NestJS (StorageService)
      - "9001:9001"     # Console web → http://localhost:9001 (admin, buckets, fichiers)
    environment:
      RUSTFS_ACCESS_KEY: ${STORAGE_ACCESS_KEY}
      RUSTFS_SECRET_KEY: ${STORAGE_SECRET_KEY}
    volumes:
      - rustfs_data:/data              # Persistance des fichiers uploadés
    command: /data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/rustfs/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - saas-network
    restart: unless-stopped

# ─── VOLUMES PERSISTANTS ─────────────────────────────────────────────────────
volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
  rustfs_data:
    driver: local                      # Survit aux docker compose down (pas down -v)

# ─── RÉSEAU INTERNE ──────────────────────────────────────────────────────────
networks:
  saas-network:
    driver: bridge
```

---

### 18.3 `docker-compose.prod.yml` — Environnement de production

```yaml
# docker-compose.prod.yml
# Usage : docker compose -f docker-compose.prod.yml up -d
# PostgreSQL : Supabase (externe) — pas de container postgres
# Email      : Resend via SMTP réel — pas de Mailpit
# Redis      : Redis managé ou container selon hébergeur

name: saas-events-prod

services:

  web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
      target: production               # Build Next.js optimisé (standalone)
    container_name: saas-web
    expose:
      - "3000"                         # Exposé uniquement à Nginx (pas au host)
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=${API_URL}
      - NEXT_PUBLIC_APP_URL=${FRONTEND_URL}
      - NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
      - NEXT_PUBLIC_GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
    networks:
      - saas-network
    restart: always

  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
      target: production               # NestJS compilé, node dist/main.js
    container_name: saas-api
    expose:
      - "4000"
    env_file:
      - .env
    depends_on:
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - saas-network
    restart: always
    # DATABASE_URL dans .env pointe vers Supabase PostgreSQL — aucun container postgres

  redis:
    image: redis:7-alpine
    container_name: saas-redis
    volumes:
      - redis_data:/data
      - ./docker/redis/redis.conf:/etc/redis/redis.conf
    command: redis-server /etc/redis/redis.conf --requirepass ${REDIS_PASSWORD}
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - saas-network
    restart: always

  nginx:
    build:
      context: ./docker/nginx
      dockerfile: Dockerfile
    container_name: saas-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./docker/nginx/certs:/etc/nginx/certs:ro    # Certificats SSL (Let's Encrypt)
    depends_on:
      - web
      - api
    networks:
      - saas-network
    restart: always

volumes:
  redis_data:
    driver: local

networks:
  saas-network:
    driver: bridge
```

---

### 18.4 Dockerfile — Frontend Next.js (multi-stage)

```dockerfile
# apps/web/Dockerfile

# ─── Stage 1 : dépendances ───────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# ─── Stage 2 : développement (hot reload) ────────────────────────────────────
FROM node:20-alpine AS development
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["pnpm", "dev"]

# ─── Stage 3 : build production ──────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Variables buildtime nécessaires pour Next.js standalone
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
RUN pnpm build

# ─── Stage 4 : production (image minimale) ───────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Next.js standalone output (activer dans next.config.ts : output: 'standalone')
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

---

### 18.5 Dockerfile — Backend NestJS (multi-stage)

```dockerfile
# apps/api/Dockerfile

# ─── Stage 1 : dépendances ───────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# ─── Stage 2 : développement (watch + ts-node) ───────────────────────────────
FROM node:20-alpine AS development
RUN apk add --no-cache openssl curl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 4000
# Prisma : génération client au démarrage + migration dev + lancement
CMD sh -c "npx prisma generate && npx prisma migrate deploy && pnpm start:dev"

# ─── Stage 3 : build TypeScript ──────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN pnpm build                        # tsc → dist/

# ─── Stage 4 : production (image minimale) ───────────────────────────────────
FROM node:20-alpine AS production
RUN apk add --no-cache openssl curl
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# Uniquement le nécessaire pour l'exécution
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./

USER nestjs
EXPOSE 4000
# Migration + démarrage
CMD sh -c "npx prisma migrate deploy && node dist/main.js"
```

---

### 18.6 Configuration Redis (`docker/redis/redis.conf`)

```conf
# docker/redis/redis.conf

# Persistance des données (survie aux redémarrages)
save 900 1          # Sauvegarde si 1 clé modifiée en 900s
save 300 10         # Sauvegarde si 10 clés modifiées en 300s
save 60 10000       # Sauvegarde si 10000 clés modifiées en 60s

# Limite mémoire (adapter selon ressources serveur)
maxmemory 256mb
maxmemory-policy allkeys-lru    # Éviction LRU des clés les moins utilisées

# Logs
loglevel notice
logfile ""          # stdout (récupéré par Docker logs)

# Sécurité réseau — écoute sur toutes interfaces (réseau Docker interne)
bind 0.0.0.0
protected-mode no   # Désactivé car réseau Docker isolé
```

---

### 18.7 Configuration Nginx (`docker/nginx/nginx.conf`)

```nginx
# docker/nginx/nginx.conf — Reverse proxy production

upstream web {
    server web:3000;
}

upstream api {
    server api:4000;
}

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    # Redirection HTTP → HTTPS en production
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Headers de sécurité
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;

    # Taille max upload (images événements, billets)
    client_max_body_size 10M;

    # ─── Frontend Next.js ─────────────────────────────────────────────────
    location / {
        proxy_pass         http://web;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # ─── Backend NestJS ───────────────────────────────────────────────────
    location /api/ {
        proxy_pass         http://api;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # Timeout pour les webhooks paiement (peuvent être lents)
        proxy_connect_timeout 60s;
        proxy_send_timeout    60s;
        proxy_read_timeout    60s;
    }
}
```

---

### 18.8 Intégration email — NestJS vers Mailpit (dev) / SMTP réel (prod)

```typescript
// notifications/email.service.ts
// La configuration change uniquement via les variables d'environnement.
// Le code NestJS est identique dev et prod.

import { createTransport } from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter = createTransport({
    host: process.env.SMTP_HOST,       // 'mailpit' en dev, 'smtp.resend.com' en prod
    port: parseInt(process.env.SMTP_PORT ?? '1025'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,                     // Pas d'auth sur Mailpit
  });

  async sendTicketConfirmation(order: OrderWithDetails): Promise<void> {
    // En dev : l'email est intercepté par Mailpit → http://localhost:8025
    // En prod : l'email est envoyé via Resend/SMTP réel
    await this.transporter.sendMail({
      from:    process.env.EMAIL_FROM,
      to:      order.client.email,
      subject: `Votre billet — ${order.event.title}`,
      html:    this.buildTicketEmailHtml(order),
      attachments: order.items.map(item => ({
        filename: `billet-${item.id}.pdf`,
        path:      item.qrCodeUrl,       // URL Supabase Storage
      })),
    });
    await this.auditService.log('email.sent', 'Order', order.id);
  }
}
```

---

### 18.9 Endpoint de santé NestJS (requis pour Docker healthcheck)

```typescript
// app.controller.ts
@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('api/health')
  async health() {
    // Vérifie la connexion DB → si la DB est down, le healthcheck échoue
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
    };
  }
}
```

---

### 18.10 Commandes Docker essentielles

```bash
# ─── DÉVELOPPEMENT ────────────────────────────────────────────────────────────
# Premier lancement
cp .env.example .env                   # Configurer les variables
docker compose up --build              # Construire et démarrer tout

# Lancement habituel
docker compose up -d                   # En arrière-plan
docker compose logs -f api             # Suivre les logs du backend
docker compose logs -f                 # Tous les logs

# Gestion des conteneurs
docker compose ps                      # État de tous les services
docker compose restart api             # Redémarrer le backend uniquement
docker compose stop                    # Arrêter sans supprimer
docker compose down                    # Arrêter + supprimer conteneurs
docker compose down -v                 # Arrêter + supprimer volumes (⚠️ données perdues)

# Prisma (à exécuter dans le conteneur api)
docker compose exec api npx prisma migrate dev --name init
docker compose exec api npx prisma studio       # Interface DB sur :5555
docker compose exec api npx prisma db seed      # Données de test

# Accès aux services
# Frontend :   http://localhost:3000
# Backend :    http://localhost:4000
# PostgreSQL : localhost:5432 (user: saas_user, db: saas_events)
# Redis :      localhost:6379
# Mailpit UI : http://localhost:8025

# ─── PRODUCTION ───────────────────────────────────────────────────────────────
# Build et démarrage production
docker compose -f docker-compose.prod.yml up -d --build

# Mise à jour (zero-downtime si plusieurs instances)
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# Migration DB en production
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# Logs production
docker compose -f docker-compose.prod.yml logs -f api
```

---

### 18.11 `.gitignore` — fichiers Docker à exclure

```gitignore
# Environnement
.env
.env.local
.env.*.local

# Docker volumes (si montés localement)
docker/postgres/data/
docker/redis/data/
docker/rustfs/data/

# Certificats SSL
docker/nginx/certs/

# Next.js
.next/
out/

# NestJS
dist/

# Node
node_modules/
```


---

## 19. PLAN D'IMPLÉMENTATION

### Phase 0 — Infrastructure Docker (Semaine 0 — AVANT TOUT CODE)

```
□ Créer .env.example complet (§16.1)
□ Écrire docker-compose.yml (postgres + redis + mailpit + rustfs + web + api)
□ Écrire Dockerfile apps/web (multi-stage dev + prod)
□ Écrire Dockerfile apps/api (multi-stage dev + prod)
□ Écrire docker/redis/redis.conf
□ Écrire docker/postgres/init.sql
□ Écrire docker/nginx/nginx.conf (prod)
□ Vérifier : docker compose up → 6 services verts + healthchecks OK
□ Vérifier accès : :3000, :4000, :5432, :6379, :8025 (Mailpit), :9000/:9001 (RustFS)
□ Écrire docker-compose.prod.yml
□ Ajouter .gitignore complet
□ Créer structure docs/ (cahier-des-charges.md, architecture.md, api.md, database.md)
```

### Phase 1 — Foundation (Semaines 1-2)

```
□ Setup monorepo (pnpm workspaces + Turborepo)
□ Init NestJS (Prisma + DATABASE_URL Docker local)
□ Init Next.js 15 (App Router + Tailwind + shadcn/ui)
□ Schéma Prisma complet + migrations (inclus WebhookEvent)
□ Endpoint GET /api/health (requis pour Docker healthcheck)
□ Auth JWT avec generateClientToken() dynamique (session événementielle)
□ Google OAuth flow complet (saveIntent / consumeIntent horodaté)
□ RBAC : JwtAuthGuard + RolesGuard + ownership guards
□ Middleware Next.js (UX only, commenté comme tel)
□ Redis + BullMQ setup (connecté au container redis)
□ StorageService (AWS SDK S3) — configurer vers RustFS local, tester upload/download
□ Email via Mailpit local (valider réception sur http://localhost:8025)
```

### Phase 2 — Events & Tickets (Semaines 3-4)

```
□ CRUD Events (Super Admin + Manager ownership)
□ CRUD Tickets (Manager ownership)
□ Dashboards Super Admin + Manager (overview)
□ Pages publiques événements (SSR Next.js)
□ Participants : liste + export CSV
□ Scanners : création dans quota + activation
```

### Phase 3 — Paiements (Semaines 5-6)

```
□ Interface IPaymentProvider
□ Kkiapay + CinetPay + FedaPay
□ Webhooks + idempotence WebhookEvent + stock atomique updateMany
□ Guard stock préventif dans initPayment
□ Enrichissement profil (phone + country, logique explicite no-overwrite)
□ BullMQ queue "pdf-generation"
□ Génération QR JWT (exp = event.endDate + 24h)
□ Puppeteer PDF dans worker (sanitizeBgColor + sanitizeImageUrl)
□ StorageService.uploadFile() → RustFS local (console sur :9001 pour vérifier)
□ Email Resend (PDF attaché)
□ WhatsApp Meta Cloud API (libphonenumber-js E.164)
□ Dashboard client (mes billets + PDF téléchargement)
```

### Phase 4 — Scanner PWA (Semaine 7)

```
□ Route /scanner isolée (PWA)
□ Manifest + Service Worker
□ Login scanner (JWT exp = endDate + 1h)
□ Caméra html5-qrcode avec isScanningRef (useRef)
□ Validation QR : $transaction atomic lock
□ Réponse minimale scanner (name + ticketName uniquement)
□ Feedback temps réel (vert/rouge, 2s cooldown)
□ Historique scans + stats
□ Rate limiting validation (20/sec)
□ Tests scan en conditions réelles
```

### Phase 5 — Event Builder (Semaines 8-9)

```
□ Store Zustand avec lastSavedAt (contrôle concurrence)
□ Zod BlocksArraySchema côté backend (validation obligatoire)
□ saveBlocks avec lastKnownUpdatedAt → 409 si conflit
□ Drag & drop (dnd-kit)
□ Blocs : Hero, Text, Image, Countdown, Tickets, FAQ, Schedule, Gallery, Sponsors
□ Panneau settings droite
□ Preview Desktop / Mobile / Tablet
□ Save / Publish
□ Templates de base (3-5)
□ Upload images blocs
□ Design billet : upload (whitelist), color picker (HEX strict), iframe preview
```

### Phase 6 — Analytics, Design & Polish (Semaine 10)

```
□ Analytics Manager (Recharts : ventes, revenus, scans)
□ Analytics Admin globaux
□ Logs système admin (filtrable)
□ Config providers paiement (admin UI + chiffrement AES-256-GCM)
□ Audit logs complets (toutes les actions listées §15.5)
□ Rate limiting complet (auth + scan)
□ Tests E2E flux critiques (achat → scan)
□ Enregistrement template WhatsApp Meta (⚠️ 24-48h délai approbation)
□ Documentation API (docs/api.md)
```

### Phase 7 — Déploiement Production (Semaine 11)

```
□ Provisionner VPS ou cloud (Hetzner, DigitalOcean, Railway…)
□ Configurer DATABASE_URL → Supabase PostgreSQL (changer .env seul)
□ Configurer STORAGE_* → Supabase Storage S3 (5 variables — zéro modification de code)
□ Créer buckets Supabase Storage : tickets/ et ticket-designs/
□ Configurer Redis managé (Upstash ou container sur VPS)
□ Configurer SMTP production (Resend)
□ Obtenir certificat SSL (Certbot / Let's Encrypt → docker/nginx/certs/)
□ Adapter docker/nginx/nginx.conf (nom de domaine réel)
□ docker compose -f docker-compose.prod.yml up -d --build
□ docker compose exec api npx prisma migrate deploy
□ Vérifier healthchecks : docker compose ps → tous "healthy"
□ Test end-to-end sur le domaine de production
□ Mise en place monitoring (logs, uptime, alertes)
```
---

## 20. COUCHE DE STOCKAGE S3-COMPATIBLE

### 20.1 Contexte et décision d'architecture

**Problème :** MinIO Community Edition est mort en pratique en 2026. En octobre 2025, MinIO a arrêté de publier des images Docker et des binaires précompilés. Le dépôt a été archivé en avril 2026. Il ne reçoit plus ni nouvelles fonctionnalités, ni mises à jour de compatibilité, ni correctifs de sécurité garantis.

**Solution retenue :** Abstraire entièrement la couche de stockage derrière le SDK AWS S3, qui est le standard de facto et que tous les stockages sérieux supportent. Le code applicatif NestJS est identique en dev et en prod — seules les variables d'environnement changent.

```
DEV  : RustFS (Docker local, Apache 2.0, image officielle, API S3)
PROD : Supabase Storage (managé, S3-compatible, s'intègre au projet Supabase)
```

### 20.2 Pourquoi RustFS plutôt que MinIO

| Critère | MinIO (2026) | RustFS |
|---|---|---|
| Images Docker officielles | ❌ Source only depuis oct. 2025 | ✅ `rustfs/rustfs:latest` |
| Dépôt GitHub | Archivé (avril 2026) | ✅ Actif |
| Licence | AGPL v3 (contraignant) | Apache 2.0 ✅ |
| API S3 | ✅ | ✅ Compatible |
| Console web | ✅ | ✅ Port :9001 |
| Migration depuis MinIO | — | ✅ Supportée |
| Recommandé en dev | ⚠️ Éviter | ✅ Oui |

> Supabase lui-même le reconnaît dans sa documentation : *"MinIO ne publie plus d'images Docker open source. Pour les nouveaux déploiements, considérer RustFS à la place."*

### 20.3 `StorageService` — le service NestJS abstrait

```typescript
// apps/api/src/storage/storage.service.ts
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(private readonly config: ConfigService) {
    this.s3 = new S3Client({
      endpoint:    config.getOrThrow('STORAGE_ENDPOINT'),
      region:      config.get('STORAGE_REGION') ?? 'us-east-1',
      credentials: {
        accessKeyId:     config.getOrThrow('STORAGE_ACCESS_KEY'),
        secretAccessKey: config.getOrThrow('STORAGE_SECRET_KEY'),
      },
      // true pour RustFS/MinIO (path-style), false pour AWS S3 / Supabase S3
      forcePathStyle: config.get('STORAGE_FORCE_PATH_STYLE') === 'true',
    });
    this.bucket    = config.getOrThrow('STORAGE_BUCKET');
    this.publicUrl = config.getOrThrow('STORAGE_PUBLIC_URL');
  }

  // ─── Le code ci-dessous est IDENTIQUE dev et prod ─────────────────────────

  async uploadFile(
    key:         string,
    buffer:      Buffer,
    contentType: string,
    isPublic     = true,
  ): Promise<string> {
    await this.s3.send(new PutObjectCommand({
      Bucket:      this.bucket,
      Key:         key,
      Body:        buffer,
      ContentType: contentType,
      ACL:         isPublic ? 'public-read' : 'private',
    }));
    return this.getPublicUrl(key);
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }

  async deleteFile(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key:    key,
    }));
  }

  getPublicUrl(key: string): string {
    // DEV  : http://localhost:9000/saas-events/tickets/xxx.pdf
    // PROD : https://[ref].supabase.co/storage/v1/object/public/saas-events/tickets/xxx.pdf
    return `${this.publicUrl}/${this.bucket}/${key}`;
  }

  // Clés de stockage standardisées (même structure dev et prod)
  static keys = {
    ticketPdf:    (eventId: string, itemId: string) => `tickets/${eventId}/${itemId}.pdf`,
    ticketDesign: (ticketId: string, filename: string) => `ticket-designs/${ticketId}/${filename}`,
    eventImage:   (eventId: string, filename: string) => `events/${eventId}/${filename}`,
  };
}
```

### 20.4 Utilisation dans les services existants

```typescript
// Exemple dans ticket-design.service.ts
// AVANT (couplé à Supabase) :
// const { error } = await supabase.storage.from('tickets').upload(path, buffer);

// APRÈS (abstrait, identique dev/prod) :
const url = await this.storageService.uploadFile(
  StorageService.keys.ticketPdf(event.id, orderItem.id),
  pdfBuffer,
  'application/pdf',
);
await this.prisma.orderItem.update({
  where: { id: orderItem.id },
  data:  { qrCodeUrl: url },
});

// Idem pour l'upload des images de design billet
const imageUrl = await this.storageService.uploadFile(
  StorageService.keys.ticketDesign(ticketId, file.originalname),
  file.buffer,
  file.mimetype,
);
```

### 20.5 Variables d'environnement — bascule dev → prod

```bash
# ─── DÉVELOPPEMENT (RustFS Docker local) ─────────────────────────────────────
STORAGE_ENDPOINT=http://rustfs:9000     # Nom du container dans le réseau Docker
STORAGE_REGION=us-east-1               # Requis par AWS SDK, valeur bidon pour RustFS
STORAGE_ACCESS_KEY=rustfsadmin
STORAGE_SECRET_KEY=rustfsadmin123
STORAGE_BUCKET=saas-events
STORAGE_FORCE_PATH_STYLE=true          # Obligatoire pour les serveurs S3 non-AWS
STORAGE_PUBLIC_URL=http://localhost:9000  # URL depuis le navigateur (hors réseau Docker)

# ─── PRODUCTION (Supabase Storage) ───────────────────────────────────────────
# Changer uniquement ces 6 variables — le code NestJS ne change PAS
STORAGE_ENDPOINT=https://[project-ref].supabase.co/storage/v1/s3
STORAGE_REGION=eu-west-1               # Région Supabase de ton projet
STORAGE_ACCESS_KEY=[Supabase dashboard → Storage → S3 credentials → Access Key]
STORAGE_SECRET_KEY=[Supabase dashboard → Storage → S3 credentials → Secret Key]
STORAGE_BUCKET=saas-events
STORAGE_FORCE_PATH_STYLE=false         # Supabase S3 utilise virtual-hosted style
STORAGE_PUBLIC_URL=https://[project-ref].supabase.co/storage/v1/object/public
```

**Comment récupérer les credentials S3 Supabase en production :**
Supabase Dashboard → Storage → S3 Connection → Enable S3 Access → copier `Access Key ID` et `Secret Access Key`.

### 20.6 RustFS dans docker-compose.yml (récapitulatif)

```yaml
  rustfs:
    image: rustfs/rustfs:latest
    container_name: saas-rustfs
    ports:
      - "9000:9000"     # API S3 — backend NestJS (StorageService)
      - "9001:9001"     # Console web → http://localhost:9001
    environment:
      RUSTFS_ACCESS_KEY: ${STORAGE_ACCESS_KEY}   # rustfsadmin
      RUSTFS_SECRET_KEY: ${STORAGE_SECRET_KEY}   # rustfsadmin123
    volumes:
      - rustfs_data:/data
    command: /data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/rustfs/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - saas-network
```

### 20.7 Création des buckets au démarrage

RustFS ne crée pas les buckets automatiquement. Ajouter un service d'initialisation :

```yaml
  rustfs-init:
    image: amazon/aws-cli:latest
    container_name: saas-rustfs-init
    depends_on:
      rustfs:
        condition: service_healthy
    environment:
      AWS_ACCESS_KEY_ID:     ${STORAGE_ACCESS_KEY}
      AWS_SECRET_ACCESS_KEY: ${STORAGE_SECRET_KEY}
      AWS_DEFAULT_REGION:    us-east-1
    command: >
      sh -c "
        aws --endpoint-url http://rustfs:9000 s3 mb s3://saas-events --no-verify-ssl 2>/dev/null || true &&
        aws --endpoint-url http://rustfs:9000 s3api put-bucket-acl
          --bucket saas-events --acl public-read --no-verify-ssl 2>/dev/null || true &&
        echo 'Buckets RustFS initialisés'
      "
    networks:
      - saas-network
    restart: on-failure
```

En production, créer les buckets manuellement dans le dashboard Supabase → Storage → New bucket : `saas-events` (public) — ou via la CLI Supabase.

### 20.8 Chemins de fichiers standardisés

Quelle que soit l'implémentation (RustFS ou Supabase Storage), les clés S3 suivent la même convention :

```
tickets/{eventId}/{orderItemId}.pdf       → PDF billet généré par Puppeteer
ticket-designs/{ticketId}/{filename}      → Image de fond personnalisée du billet
events/{eventId}/{filename}               → Image de couverture de l'événement
```

### 20.9 Sanitisation des URLs (XSS — inchangée)

La validation de l'URL dans `sanitizeImageUrl()` doit accepter les deux origines :

```typescript
private sanitizeImageUrl(url: string): string {
  if (!url) return '';
  try {
    const parsed   = new URL(url);
    const devBase  = `http://localhost:9000/${process.env.STORAGE_BUCKET}/ticket-designs/`;
    const prodBase = `${new URL(process.env.SUPABASE_URL!).origin}/storage/v1/object/public/${process.env.STORAGE_BUCKET}/ticket-designs/`;
    const allowed  = [devBase, prodBase];
    if (allowed.some(base => parsed.href.startsWith(base))) return parsed.href;
    return '';
  } catch { return ''; }
}
```

### 20.10 Tableau de décision stockage

| Situation | Solution |
|---|---|
| Dev local Docker | RustFS container — `http://rustfs:9000` |
| Dev sans Docker | RustFS binaire local ou Supabase Storage directement |
| Staging / préprod | Supabase Storage (bucket staging séparé) |
| Production | Supabase Storage (bucket prod) |
| Migration future vers AWS | Remplacer les 6 variables STORAGE_* — zéro code |


---

## ANNEXES

### A. Dépendances clés

```json
// apps/api/package.json
{
  "dependencies": {
    "@nestjs/common":        "^10",
    "@nestjs/jwt":           "^10",
    "@nestjs/passport":      "^10",
    "@nestjs/throttler":     "^6",
    "@nestjs/bull":          "^10",
    "@prisma/client":        "^5",
    "bull":                  "^4",
    "ioredis":               "^5",
    "passport-google-oauth20": "^2",
    "passport-jwt":          "^4",
    "qrcode":                "^1.5",
    "puppeteer-core":        "^22",
    "@sparticuz/chromium":   "^123",
    "@aws-sdk/client-s3":    "^3",
    "@aws-sdk/s3-request-presigner": "^3",
    "@supabase/supabase-js": "^2",  // Conservé pour auth Supabase PostgreSQL
    "resend":                "^3",
    "libphonenumber-js":     "^1.11",
    "zod":                   "^3",
    "class-validator":       "^0.14",
    "class-transformer":     "^0.5"
  }
}

// apps/web/package.json
{
  "dependencies": {
    "next":                  "15",
    "react":                 "^19",
    "@tanstack/react-query": "^5",
    "zustand":               "^4",
    "immer":                 "^10",
    "@dnd-kit/core":         "^6",
    "@dnd-kit/sortable":     "^8",
    "html5-qrcode":          "^2",
    "next-pwa":              "^5",
    "recharts":              "^2",
    "@supabase/supabase-js": "^2",
    "sonner":                "^1",
    "react-hook-form":       "^7",
    "zod":                   "^3"
  }
}
```

### B. Commandes Docker (référence rapide)

```bash
# ─── Démarrage développement ──────────────────────────────────────────────────
cp .env.example .env && nano .env           # Configurer variables
docker compose up --build                   # Premier lancement
docker compose up -d                        # Lancements suivants

# ─── Logs ─────────────────────────────────────────────────────────────────────
docker compose logs -f                      # Tous les services
docker compose logs -f api                  # Backend uniquement

# ─── Prisma (dans le container) ───────────────────────────────────────────────
docker compose exec api npx prisma migrate dev --name ma-migration
docker compose exec api npx prisma generate
docker compose exec api npx prisma studio   # UI DB sur :5555
docker compose exec api npx prisma db seed  # Données de test

# ─── Accès directs ────────────────────────────────────────────────────────────
# Frontend :      http://localhost:3000
# Backend :       http://localhost:4000/api/health
# Mailpit :       http://localhost:8025
# RustFS API S3 : http://localhost:9000
# RustFS Console: http://localhost:9001  (admin/rustfsadmin123)
# Postgres :      localhost:5432 (user: saas_user, db: saas_events)

# ─── Maintenance ──────────────────────────────────────────────────────────────
docker compose ps                           # État des services
docker compose restart api                  # Redémarrer un service
docker compose down                         # Arrêter
docker compose down -v                      # ⚠️ Arrêter + supprimer volumes

# ─── Production ───────────────────────────────────────────────────────────────
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

### C. Commandes pnpm (développement sans Docker)

```bash
# Dev (sans Docker — requiert postgres + redis locaux)
pnpm dev                      # Tous les apps en parallèle
pnpm dev --filter=api
pnpm dev --filter=web

# Build
pnpm build
pnpm build --filter=web

# Tests
pnpm test
pnpm test:e2e
```

---

*CDC v4.0.0 — Couche de stockage S3-compatible (RustFS dev / Supabase Storage prod) + Architecture Docker + 17 corrections d'audit.
Chaque section est autonome et directement utilisable avec Claude Code pour une implémentation production-ready.*
