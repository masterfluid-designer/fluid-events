# Architecture Globale

> ⚠️ Ce document décrit l'architecture **cible**. Au moment de la rédaction,
> seuls les modules `auth` et `events` sont implémentés côté API (voir
> [api.md](./api.md)) — les flux Tickets/Paiements/Scanner/Builder ci-dessous
> sont le design prévu, pas l'état actuel du code.

## Vue d'ensemble

```
┌─────────────────────────────────────────┐
│         Clients                         │
│  Browser │ PWA Scanner │ Mobile App     │
└──────────┬──────────────────────────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
  Frontend    Backend
  (Next.js)   (NestJS)
   :3000      :4000
     │            │
     └────────────┘
          │
      ┌───┴────────────────┬────────────┬──────────────┐
      ▼                    ▼            ▼              ▼
  PostgreSQL          Redis         Storage         Email
  (Prisma)           (BullMQ)      (S3 API)        (SMTP)
```

## Flux de Données Critiques

### 1. Achat de Ticket

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
  └─ Webhook idempotence (@unique paymentId + externalId)
    ├─ $transaction atomique
    ├─ Crée Tickets + QRCodes
    ├─ BullMQ job (PDF + Email + WhatsApp)
    └─ Dashboard client update
```

### 2. Scan d'Entrée

```
Scanner PWA → POST /api/scan/validate
  ├─ QRCode validation (HS256 signature)
  ├─ Expiration check (event.endDate + 24h)
  └─ Anti double-scan
    ├─ $transaction atomic lock (isScanned)
    ├─ Ticket.status = SCANNED
    └─ Log audit
  └─ Response { name, ticketName } UNIQUEMENT
    (pas email/phone/sensitive data)
```

### 3. Event Builder

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

## Sécurité Applicative

**Principe**: Sécurité centralisée dans NestJS Guards, PAS dans Supabase RLS.

- RLS Supabase: **DÉSACTIVÉ** (service_role_key bypass volontaire)
- Sécurité: Guards NestJS + ownership checks
- Audit: Tous les logs dans AuditLog table

## Infrastructure Docker

### Dev: `docker-compose.yml`

- **postgres:16** (5432) — PostgreSQL Docker
- **redis:7** (6379) — Redis Docker  
- **mailpit:latest** (1025/8025) — Email interceptor
- **rustfs:latest** (9000/9001) — S3 storage Docker
- **api** (4000) — NestJS watch mode
- **web** (3000) — Next.js hot reload

### Prod: `docker-compose.prod.yml`

- **nginx** (80/443) — Reverse proxy
- **api** (4000) — Build optimisé
- **web** (3000) — Build SSR

Base externe:
- PostgreSQL via Supabase
- Redis via Upstash
- Storage via Supabase Storage S3
- Email via Resend SMTP

## Décisions d'Architecture

### 1. Monorepo Turbo + Workspaces

Permet:
- Code partagé (types, utils)
- Build optimisé
- Développement synchronisé

### 2. Prisma ORM + PostgreSQL

Avantages:
- Type-safe queries
- Migrations versionnées
- Relations complexes simples

### 3. BullMQ pour jobs asynchrones

- PDF Puppeteer (hors webhook)
- Emails massifs
- Notifications WhatsApp
- Retry automatique

### 4. 1 Manager = 1 Event (V1)

Contrainte volontaire pour simplifier:
- Pas de multi-tenancy complexe
- Isolation événement = isolation DB (virtuellement)
- Scalable: N managers = N événements

### 5. S3-Compatible Storage (RustFS ↔ Supabase)

Avantages:
- Code identique dev/prod
- Changement via env vars uniquement
- Pas de dépendance MinIO (déprécié)
- Compatible avec Supabase Storage

## Performance

### Cibles

- Scan QR validation: **< 500ms** (API response time)
- Event page SSR: **< 2s** (First Contentful Paint)
- Dashboard rendering: **< 1s** (React hydration)

### Optimisations

- Indexes Prisma sur filtres courants
- Redis caching (événements, QR validation)
- CDN pour images Supabase Storage
- Lighthouse 90+

## Scalabilité

- Stateless backend (NestJS)
- Loadbalancer-ready (Nginx reverse proxy)
- DB connection pooling (via Supabase Supavisor)
- Redis managé (Upstash auto-scaling)
