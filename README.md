# Fluid Events — SaaS Événementiel & Billetterie

## 📦 Stack Technique

- **Frontend**: Next.js 15 + React 19 + Tailwind CSS
- **Backend**: NestJS + Prisma ORM
- **Database**: PostgreSQL (Docker dev, Supabase prod)
- **Cache/Queue**: Redis + BullMQ
- **Storage**: RustFS (dev) / Supabase Storage S3 (prod)
- **Email**: Mailpit (dev) / Resend (prod)
- **Payments**: Kkiapay, CinetPay, FedaPay
- **Infrastructure**: Docker Compose + Nginx

## 🚀 Quick Start

### Prérequis
- Node.js 20+
- Docker & Docker Compose
- pnpm (ou npm)

### Installation

```bash
# 1. Cloner le repo
git clone https://github.com/masterfluid-designer/fluid-events.git
cd fluid-events

# 2. Installer les dépendances
pnpm install

# 3. Configurer l'environnement
cp .env.example .env

# 4. Démarrer Docker Compose
docker compose up -d

# 5. Générer le client Prisma
pnpm db:generate

# 6. Appliquer les migrations
pnpm db:migrate

# 7. Démarrer les serveurs (dev)
pnpm dev
```

L'application est accessible :
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:4000
- **Mailpit UI**: http://localhost:8025
- **RustFS Console**: http://localhost:9001

## 📁 Structure du Projet

```
fluid-events/
├── apps/
│   ├── web/          # Next.js 15 Frontend
│   └── api/          # NestJS Backend
├── packages/
│   ├── types/        # Types TS partagés
│   └── utils/        # Utilitaires partagés
├── docker/           # Configurations Docker par service
├── docs/             # Documentation
├── docker-compose.yml      # Dev
├── docker-compose.prod.yml # Production
├── package.json            # Monorepo root
└── .env.example            # Variables d'environnement
```

## 📚 Documentation

- [Cahier des Charges Complet](./docs/cahier-des-charges.md)
- [Architecture](./docs/architecture.md)
- [API Endpoints](./docs/api.md)

## 🔐 Sécurité

Implémenté et branché à une route HTTP :
- ✅ JWT HS256 (auth Google OAuth + login scanner, `AuthController`)
- ✅ Logs d'audit sur les flux d'auth (`AuditService` via `AuthModule`)

Logique écrite et testée, mais **pas encore reliée à un endpoint** (services
présents en `providers` bruts dans `AppModule`, sans controller) :
- 🚧 Transactions atomiques pour le stock des tickets (`payments/stock.service.ts`)
- 🚧 Anti double-scan QR (`scanner/scan-decision.ts`)
- 🚧 Idempotence webhook (`payments/webhook-idempotency.service.ts`)

Pas encore implémenté :
- ❌ Rate limiting — `@nestjs/throttler` est une dépendance mais aucun `ThrottlerModule`
  n'est importé dans `app.module.ts` actuellement
- ❌ XSS mitigation / whitelist Supabase — aucun code trouvé dans `apps/api/src`

## 🐳 Docker

### Développement

```bash
docker compose up -d           # Démarrer tous les services
docker compose logs -f         # Voir les logs
docker compose down            # Arrêter
```

### Production

```bash
# Avec variables d'env production
docker compose -f docker-compose.prod.yml up -d
```

## 💾 Base de Données

### Migrations

```bash
pnpm db:migrate     # Créer une migration
pnpm db:generate    # Générer le client Prisma
pnpm db:studio      # Ouvrir Prisma Studio
```

⚠️ `db:seed` et `db:reset` ne sont **pas encore** définis comme scripts pnpm.
Un script de seed existe (`apps/api/prisma/seed.ts`) mais n'est pas encore relié
à `package.json` — pour l'exécuter manuellement en attendant :
```bash
pnpm --filter @saas-events/api exec ts-node prisma/seed.ts
```

## 🧪 Tests

```bash
pnpm test           # Exécuter les tests
pnpm test:watch     # Mode watch
pnpm test:cov       # Coverage
```

## 📦 Déploiement

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

Services externes en prod : Supabase (PostgreSQL + Storage), Upstash (Redis), Resend (SMTP).

## 📝 Licence

UNLICENSED — projet privé (voir `package.json`).