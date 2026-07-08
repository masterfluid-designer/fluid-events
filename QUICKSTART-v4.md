# 🚀 Fluid Events v4.0.0 - Démarrage Rapide

SaaS Événementiel & Billetterie pour organisateurs africains — Plateforme tout-en-un avec **couche de stockage S3-compatible** (RustFS en dev, Supabase Storage en prod).

## 📋 Prérequis

- **Docker & Docker Compose** (v20+)
- **Node.js** 20+ et **pnpm** 9.15.9
- **Git**

## 🏃 Démarrage Local (Dev)

### 1. Cloner et prépa

```bash
git clone https://github.com/masterfluid-designer/fluid-events.git
cd fluid-events
pnpm install
```

### 2. Configurer les variables d'environnement

```bash
cp .env.example .env.local
# Éditer .env.local avec vos clés (Google OAuth, Payment providers, etc.)
```

### 3. Lancer l'infrastructure Docker

```bash
docker compose up --build
```

Cela lance automatiquement:
- **PostgreSQL** :5432 (données)
- **Redis** :6379 (cache + BullMQ jobs)
- **RustFS** :9000 (S3-compatible, console :9001)
- **Mailpit** :1025 SMTP, :8025 UI (emails dev)
- **NestJS API** :4000
- **Next.js Web** :3000

### 4. Initialiser la base de données

```bash
# Dans un nouveau terminal
pnpm db:migrate
pnpm db:generate
```

### 5. Accéder à l'app

- **Frontend** → http://localhost:3000
- **API** → http://localhost:4000
- **Mailpit** (emails) → http://localhost:8025
- **RustFS Console** → http://localhost:9001

## 📦 Architecture v4.0.0

### Nouvelles fonctionnalités

✅ **Couche de stockage S3-compatible**
- RustFS en dev (localhost:9000)
- Supabase Storage en prod
- AWS SDK S3 abstraite — zero modification de code

✅ **Infrastructure Docker complète**
- PostgreSQL + Redis + Mailpit + RustFS
- Nginx reverse proxy en prod
- Multi-stage builds optimisés

✅ **Corrections de sécurité**
- QR code signé HS256 (anti-tampering)
- Idempotence webhook (`WebhookEvent @unique`)
- Stock atomique avec guard capacité
- Session JWT dynamique
- Données scanner minimisées

✅ **Jobs asynchrones**
- BullMQ pour PDF generation
- Notifications Email + WhatsApp
- Retry automatique avec backoff

## 🔄 Dev Workflow

### Build & Test

```bash
# Build tous les packages
pnpm build

# Lint
pnpm lint

# Tests
pnpm test

# Type-checking
pnpm typecheck
```

### Logs

```bash
# Tous les services
docker compose logs -f

# Service spécifique
docker compose logs -f api
docker compose logs -f web
docker compose logs -f postgres
```

### Arrêter l'infrastructure

```bash
docker compose down
# Avec suppression des données
docker compose down -v
```

## 🌍 Production Deployment

### Prépa env vars

```bash
# Créer .env.production avec:
DATABASE_URL=postgresql://...@supabase...  # Supabase PostgreSQL
REDIS_URL=redis://...@upstash...          # Redis managé
STORAGE_ENDPOINT=https://...supabase.co   # Supabase Storage
JWT_SECRET=<super-secret-key-32-chars>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
# etc.
```

### Lancer prod

```bash
# Build et run production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d

# Logs
docker compose logs -f

# Arrêter
docker compose down
```

### Services gérés

- **PostgreSQL** → Supabase
- **Redis** → Upstash ou autre provider managé
- **Storage** → Supabase Storage (S3-compatible)
- **Email** → Resend SMTP
- **WhatsApp** → Twilio
- **Reverse Proxy** → Nginx container (port 80/443)

## 📚 Documentation

- [Cahier des Charges Complet](docs/cahier-des-charges.md) — Architecture détaillée, endpoints, schémas
- [SETUP.md](SETUP.md) — Installation avancée
- [QUICKSTART.md](QUICKSTART.md) — Démarrage rapide

## 🛠️ Structure du projet

```
fluid-events/
├── apps/
│   ├── api/              # NestJS Backend
│   │   └── src/
│   │       ├── auth/     # JWT + Google OAuth
│   │       ├── events/   # Gestion événements
│   │       ├── payments/ # Multi-provider (Kkiapay, CinetPay, FedaPay)
│   │       ├── scan/     # PWA Scanner validation
│   │       ├── builder/  # Event Builder no-code
│   │       └── storage/  # StorageService S3-compatible
│   │
│   └── web/              # Next.js 15 Frontend
│       └── app/
│           ├── (public)/ # Pages publiques
│           ├── (auth)/   # Login/OAuth
│           ├── (dashboard)/ # Admin/Manager/Client
│           └── scanner/  # PWA Scanner
│
├── packages/
│   ├── types/            # Shared TypeScript types
│   └── utils/            # Shared utilities
│
├── docker/
│   ├── postgres/         # Init SQL
│   ├── redis/            # Redis config
│   └── nginx/            # Production reverse proxy
│
└── docs/
    └── cahier-des-charges.md
```

## 🔐 Variables d'environnement essentielles

| Variable | Dev | Prod | Description |
|---|---|---|---|
| `DATABASE_URL` | Docker postgres | Supabase | PostgreSQL connection |
| `REDIS_URL` | Docker redis | Upstash | Redis connection |
| `STORAGE_ENDPOINT` | http://rustfs:9000 | https://xxx.supabase.co | S3-compatible endpoint |
| `JWT_SECRET` | dev-secret | ⚠️ CHANGE ME | Token signing key (min 32 chars) |
| `GOOGLE_CLIENT_ID` | - | - | Google OAuth |
| `TWILIO_ACCOUNT_SID` | - | - | WhatsApp notifications |
| `KKIAPAY_API_KEY` | - | - | Payment provider |

## 🎯 Commandes utiles

```bash
# Migrations Prisma
pnpm db:migrate          # Créer migration interactive
pnpm db:generate         # Régénérer Prisma client
pnpm db:studio           # UI Prisma Studio

# Docker
docker compose up -d     # Lancer en background
docker compose ps        # Status des containers
docker compose logs -f   # Voir les logs

# Tests & Quality
pnpm test                # Unit tests
pnpm test:cov            # Coverage report
pnpm lint                # Linter
pnpm typecheck           # TypeScript check
```

## ⚠️ Notes importantes

1. **RustFS** remplace MinIO (déprécié en avril 2026) — image officielle Apache 2.0
2. **Données scanner minimisées** — email/phone exclus de la réponse
3. **Stock atomique** — guard capacité contre race conditions
4. **Idempotence webhook** — contrainte `WebhookEvent @unique`
5. **1 Manager = 1 Événement** — contrainte intentionnelle V1

## 🆘 Troubleshooting

### Docker ne démarre pas?

```bash
# Vérifier les images
docker images | grep -E "rustfs|postgres|redis|nginx"

# Réinitialiser volumes
docker compose down -v
docker compose up --build
```

### Erreur base de données?

```bash
# Réinitialiser Prisma
rm -rf ./apps/api/node_modules/.prisma
pnpm db:generate
pnpm db:migrate
```

### Port déjà utilisé?

```bash
# Lister les ports
lsof -i :3000  # Next.js
lsof -i :4000  # NestJS
docker compose down  # Arrêter tous les services
```

## 📞 Support

Pour les problèmes:
1. Consulter [cahier-des-charges.md](docs/cahier-des-charges.md) § 15 (Sécurité & Audit)
2. Vérifier [SETUP.md](SETUP.md) pour config avancée
3. Créer une issue GitHub

---

**Version** v4.0.0 | **Stack** Next.js 15 / NestJS 10 / PostgreSQL 16 / Redis 7 / RustFS  
**Dernière mise à jour** Juillet 2026
