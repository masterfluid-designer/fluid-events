# ARCHITECTURE.md — Fluid Events

> Synthèse technique consolidée à partir de `architecture.md` et `cahier-des-charges.md`. En cas de conflit entre ce fichier et le code, **le code fait foi** — merci de mettre à jour ce document en cas de dérive constatée.

---

## 1. Vue d'ensemble

```
┌─────────────────────────────────────────┐
│              Clients                     │
│  Browser │ PWA Scanner │ Mobile App     │
└──────────┬──────────────────────────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
  Frontend     Backend
  (Next.js)    (NestJS)
   :3000        :3001/api  ⚠️ voir note port ci-dessous
     │            │
     └────────────┘
          │
      ┌───┴────────────────┬────────────┬──────────────┐
      ▼                    ▼            ▼              ▼
  PostgreSQL           Redis         Storage         Email
  (Prisma)            (BullMQ)      (S3 API)         (SMTP)
```

⚠️ **Note port backend** : `architecture.md` mentionne `:4000`, mais la structure de dossiers et le `.env` de `cahier-des-charges.md` indiquent `PORT=3001`. À vérifier dans le code de démarrage (`main.ts`) et à harmoniser dans la documentation.

## 2. Stack & responsabilités

| Composant | Techno | Port (dev) | Rôle |
|---|---|---|---|
| Frontend | Next.js 15 (App Router) | 3000 | UI, SSR pages publiques, dashboards |
| Backend | NestJS | 3001 (à confirmer, voir note) | API, sécurité, logique métier |
| Base de données | PostgreSQL via Prisma | 5432 | Données transactionnelles |
| Queue | Redis + BullMQ | 6379 | Jobs async (PDF, email, WhatsApp) |
| Storage | RustFS (dev) / Supabase Storage (prod) | 9000/9001 | Images events, billets |
| Email | Mailpit (dev) / Resend SMTP (prod) | 1025/8025 | Confirmations, factures |
| Reverse proxy (prod) | Nginx | 80/443 | TLS, routage |

## 3. Structure des dossiers

```
apps/
├── web/                          # Next.js 15
│   ├── app/
│   │   ├── page.tsx              # Landing page ✅
│   │   ├── layout.tsx            # Root layout + Providers ✅
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx        # Sidebar selon rôle ✅
│   │   │   ├── admin/page.tsx    # Dashboard Super Admin ✅
│   │   │   ├── manager/page.tsx  # Dashboard Manager ✅
│   │   │   └── client/page.tsx   # Dashboard Client ✅
│   │   ├── auth/login/page.tsx   # Login (Google + scanner) ✅
│   │   ├── scanner/
│   │   │   ├── page.tsx          # Landing scanner ✅
│   │   │   └── scan/page.tsx     # Caméra QR PWA ✅
│   │   └── (public)/e/           # Pages événement publiques 🟡
│   ├── components/
│   │   ├── ui/                   # shadcn/ui ✅
│   │   ├── providers.tsx         # React Query + ThemeProvider ✅
│   │   └── dashboard/sidebar.tsx ✅
│   ├── lib/
│   │   ├── api.ts                # Client fetch + ApiError ✅
│   │   ├── auth.ts               # saveIntent / consumeIntent ✅
│   │   └── utils.ts              # cn() ✅
│   └── store/
│       └── scannerStore.ts       # Zustand scanner ✅
│
└── api/                           # NestJS Backend
    ├── src/
    │   ├── main.ts                # Bootstrap + CORS + ValidationPipe ✅
    │   ├── app.module.ts          # Assemble tous les modules ✅
    │   ├── prisma/                ✅
    │   ├── auth/                  ✅ (Google OAuth, scanner login, refresh, logout)
    │   ├── events/                ✅ (CRUD basique)
    │   ├── tickets/
    │   │   ├── tickets.module.ts        ✅
    │   │   ├── tickets.controller.ts    ✅ (CRUD, ownership Manager)
    │   │   └── tickets.service.ts       ✅
    │   ├── payments/
    │   │   ├── payments.module.ts              ✅
    │   │   ├── payments.controller.ts          ✅ (`POST /init`, `POST /webhook/kkiapay`)
    │   │   ├── payments.service.ts             ✅ (réservation stock, webhook anti-fraude)
    │   │   ├── kkiapay.service.ts               ✅ (wrapper `@kkiapay-org/nodejs-sdk`)
    │   │   ├── stock.service.ts                ✅ (décrément + relâche atomiques)
    │   │   ├── webhook-idempotency.service.ts  ✅
    │   │   └── client-profile.service.ts       ✅
    │   ├── scanner/
    │   │   ├── scanner.module.ts       ✅
    │   │   ├── scanner.controller.ts   ✅ (`POST /api/scan/validate`)
    │   │   ├── scanner.service.ts      ✅ (verrou atomique anti-double-scan)
    │   │   └── scan-decision.ts        ✅ (fonction pure)
    │   ├── builder/
    │   │   ├── builder.module.ts       🟡 Module vide
    │   │   ├── blocks.schema.ts        ✅ (Zod)
    │   │   └── builder.concurrency.ts  ✅
    │   ├── ticket-design/
    │   │   ├── ticket-design.module.ts 🟡 Module vide
    │   │   └── ticket-design.service.ts ✅
    │   ├── notifications/
    │   │   ├── notifications.module.ts 🟡 Module vide
    │   │   └── phone.service.ts        ✅
    │   ├── pdf-queue/
    │   │   ├── pdf-queue.module.ts      ✅
    │   │   ├── pdf-queue.service.ts     ✅ (enqueue, hors chemin critique webhook)
    │   │   └── pdf.processor.ts         ✅ (worker BullMQ : Puppeteer → upload S3)
    │   ├── storage/
    │   │   ├── storage.module.ts   ✅
    │   │   └── storage.service.ts  ✅ (S3-compatible : RustFS/MinIO dev, Supabase prod)
    │   ├── admin/
    │   │   ├── admin.module.ts      ✅
    │   │   ├── admin.controller.ts  ✅ (`GET /api/admin/overview`)
    │   │   └── admin.service.ts     ✅ (agrégats plateforme à la volée)
    │   └── common/
    │       ├── audit.service.ts             ✅
    │       ├── crypto.service.ts            ✅ (AES-256-GCM)
    │       ├── constants.ts                 ✅
    │       ├── filters/http-exception-filter.ts   ✅
    │       ├── interceptors/response.interceptor.ts ✅
    │       └── decorators/                  ✅
    └── prisma/
        └── schema.prisma           ✅ (modèle complet)
```

## 4. Flux de données critiques

### 4.1 Achat de ticket

```
Client → POST /api/payments/init
  ├─ JwtAuthGuard (authentification)
  ├─ Ownership check (client = user)
  ├─ Intent verification (timestamp + secret)
  └─ Stock guard ($transaction atomique)
    ├─ Décrémente capacité
    ├─ Incrémente soldCount
    └─ Crée Order + Payment
  ├─ Redirect provider paiement
  └─ Webhook idempotence
    ├─ $transaction atomique
    ├─ Crée Tickets + QRCodes
    ├─ BullMQ job (PDF + Email + WhatsApp)
    └─ Dashboard client update
```

### 4.2 Scan d'entrée

```
Scanner PWA → POST /api/scan/validate
  ├─ QRCode validation (HS256 signature)
  ├─ Expiration check (event.endDate + 24h)
  └─ Anti double-scan
    ├─ $transaction atomic lock (isScanned)
    ├─ Ticket.status = SCANNED
    └─ Log audit
  └─ Response { name, ticketName } UNIQUEMENT
    (pas email/phone/données sensibles)
```

### 4.3 Event Builder

```
Manager → PUT /api/builder/:eventId/blocks
  ├─ JwtAuthGuard + RolesGuard (MANAGER)
  ├─ Ownership check (event.managerId = user)
  ├─ Zod schema validation (content)
  ├─ Concurrency check (lastKnownUpdatedAt)
    └─ 409 Conflict si modifié ailleurs
  └─ Update BuilderBlock
    └─ Rendu SSR page publique
```

## 5. Sécurité applicative

**Principe** : sécurité centralisée dans les Guards NestJS, **pas** dans Supabase RLS.

- RLS Supabase : **désactivé** (bypass volontaire via `service_role_key`).
- Sécurité effective : Guards NestJS + contrôles d'ownership explicites dans les services.
- Audit : tous les événements sensibles loggés dans `AuditLog`.

→ Détail des règles précises : `RULES.md`.

## 6. Infrastructure Docker

### Dev — `docker-compose.yml`

| Service | Image | Port |
|---|---|---|
| postgres | postgres:16 | 5432 |
| redis | redis:7 | 6379 |
| mailpit | mailpit:latest | 1025/8025 |
| rustfs | rustfs:latest | 9000/9001 |
| api | build local (watch mode) | 3001 (à confirmer) |
| web | build local (hot reload) | 3000 |

### Prod — `docker-compose.prod.yml`

| Service | Rôle |
|---|---|
| nginx | Reverse proxy (80/443) |
| api | Build optimisé |
| web | Build SSR |

Services externes managés en prod :
- PostgreSQL via Supabase
- Redis via Upstash
- Storage via Supabase Storage (S3-compatible)
- Email via Resend SMTP

## 7. Décisions d'architecture (ADR résumées)

| # | Décision | Justification |
|---|---|---|
| 1 | Monorepo Turborepo + pnpm workspaces | Code partagé (types/utils), build optimisé, dev synchronisé |
| 2 | Prisma ORM + PostgreSQL | Requêtes type-safe, migrations versionnées, relations complexes simplifiées |
| 3 | BullMQ pour jobs asynchrones | PDF Puppeteer hors chemin critique webhook, emails, WhatsApp, retry auto |
| 4 | 1 Manager = 1 Event (V1) | Simplification volontaire : pas de multi-tenancy complexe, isolation quasi-DB, scalable par duplication (N managers = N events) |
| 5 | Storage S3-compatible (RustFS ↔ Supabase) | Code identique dev/prod, bascule via env vars, pas de dépendance à MinIO (déprécié) |

## 8. Performance

### Cibles

| Métrique | Cible |
|---|---|
| Scan QR validation | < 500ms (temps de réponse API) |
| Event page SSR | < 2s (First Contentful Paint) |
| Dashboard rendering | < 1s (hydratation React) |
| Lighthouse | 90+ |

### Optimisations prévues

- Indexes Prisma sur les filtres courants
- Cache Redis (événements, validation QR)
- CDN pour images Supabase Storage

## 9. Scalabilité

- Backend stateless (NestJS) → compatible loadbalancer.
- Nginx en reverse proxy prêt pour scale horizontal.
- Connection pooling DB via Supabase Supavisor.
- Redis managé (Upstash, auto-scaling).

## 10. Variables d'environnement (référence dev)

Fichier `.env` dans `apps/api/` — valeurs ci-dessous sont des **placeholders de développement uniquement**, jamais réutilisées en production :

```bash
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3000
API_URL=http://localhost:3001

DATABASE_URL=postgresql://fluid_user:fluid_password_dev@localhost:5432/fluid_events?schema=public

JWT_SECRET=<32+ caractères>
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=<32+ caractères>

QR_SECRET=<32+ caractères>
ENCRYPTION_KEY=<clé AES-256-GCM>

SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback

RESEND_API_KEY=...
EMAIL_FROM=noreply@localhost.com

WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...

REDIS_URL=redis://localhost:6379
```
