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
- [Database Schema](./docs/database.md)

## 🔐 Sécurité

- ✅ JWT HS256 avec expiration dynamique (event.endDate + 24h)
- ✅ Transactions atomiques pour le stock des tickets
- ✅ Anti double-scan QR avec locks atomiques
- ✅ Idempotence webhook (contrainte unique `@unique(paymentId, externalId)`)
- ✅ XSS mitigation (whitelist Supabase + regex validation)
- ✅ Logs d'audit complets
- ✅ Rate limiting (100 req/s général, 50 req/s API)

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
pnpm db:seed        # Seeder (données de test)
pnpm db:reset       # Reset complet
```

## 🧪 Tests

```bash
pnpm test           # Exécuter les tests
pnpm test:watch     # Mode watch
pnpm test:cov       # Coverage
```

## 📦 Déploiement

Voir [`docs/deployment.md`](./docs/deployment.md) pour :
- GitHub Actions CI/CD
- Déploiement Docker Swarm
- Configuration Supabase
- Upstash Redis
- Resend Email

## 📝 Licence

MIT — Voir `LICENSE` pour les détails

## 👥 Contribution

Les contributions sont bienvenues ! Voir `CONTRIBUTING.md` pour les guidelines.