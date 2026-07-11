# 🚀 Quick Start - Environnement de Développement

## Prérequis

- **Node.js** 20+ ([installer](https://nodejs.org))
- **Docker Desktop** ([installer](https://docker.com/products/docker-desktop))
- **pnpm** (will be installed automatiquement ou `npm install -g pnpm`)

## Installation Rapide (3 étapes)

### 1️⃣ Installation Automatique (Recommandé)

```bash
cd fluid-events
node setup-dev.js
```

Le script fait automatiquement:
- ✅ Installe toutes les dépendances
- ✅ Configure `.env` pour le dev
- ✅ Démarre Docker services
- ✅ Initialise la base de données
- ✅ Vérifie que tout fonctionne

**⏱️ Durée: ~5-10 minutes**

⚠️ Le script affichera une ligne `❌ Seeding database with test data - FAILED` — c'est
normal et sans conséquence : le script `db:seed` n'est pas encore câblé dans
`package.json` (voir plus bas). Tout le reste de l'installation fonctionne.

---

### 2️⃣ Installation Manuelle (Alternative)

Si vous préférez faire étape par étape:

```bash
# 1. Copier les variables d'environnement
cp .env.example .env

# 2. Installer les dépendances (pnpm est plus rapide que npm)
npm install -g pnpm  # Si pas encore installé
pnpm install

# 3. Générer le client Prisma
pnpm db:generate

# 4. Démarrer les services Docker
docker compose up -d

# 5. Attendre que les services soient prêts (30s)
# Attendez que postgres, redis, mailpit et rustfs soient en ligne

# 6. Créer les tables
pnpm db:migrate

# 7. (Optionnel) Seeder des données de test — script pas encore relié à pnpm,
# à lancer manuellement :
pnpm --filter @saas-events/api exec ts-node prisma/seed.ts
```

---

## 3️⃣ Démarrer le Développement

```bash
pnpm dev
```

Cela démarre:
- 🌐 **Frontend** (Next.js): http://localhost:3000
- 🔌 **Backend** (NestJS): http://localhost:4000

Ouvrez http://localhost:3000 dans votre navigateur!

---

## 📊 Vérifier que Tout Fonctionne

### Vérifier Docker

```bash
docker compose ps

# OUTPUT:
# NAME                  STATUS        PORTS
# fluid-events-postgres   Up (healthy)  5432
# fluid-events-redis      Up (healthy)  6379
# fluid-events-mailpit    Up (healthy)  1025, 8025
# fluid-events-rustfs     Up (healthy)  9000, 9001
# fluid-events-api        Up            4000
# fluid-events-web        Up            3000
```

### Accès aux Services

| Service | URL | Port |
|---------|-----|------|
| Frontend | http://localhost:3000 | 3000 |
| Backend API | http://localhost:4000 | 4000 |
| Mailpit (Emails) | http://localhost:8025 | 8025 |
| RustFS Console | http://localhost:9001 | 9001 |
| PostgreSQL | localhost | 5432 |
| Redis | localhost | 6379 |

---

## 🛑 Arrêter l'Environnement

```bash
# Arrêter les serveurs de développement
# (Ctrl+C dans les terminaux)

# Arrêter les services Docker
docker compose down

# Arrêter et supprimer les volumes (réinitialiser complètement)
docker compose down -v
```

---

## ❌ Troubleshooting

### Port déjà utilisé

```bash
# Vérifier quel processus utilise le port
netstat -ano | findstr :3000

# Tuer le processus (Windows)
taskkill /PID <PID> /F
```

### Erreur de connexion PostgreSQL

```bash
# Redémarrer PostgreSQL
docker compose restart postgres

# Vérifier les logs
docker compose logs postgres
```

### Prisma Client Error

```bash
# Régénérer le client Prisma
pnpm db:generate

# Ou complètement
rm -rf node_modules/.prisma
pnpm install
```

### Services n'apparaissent pas comme "healthy"

```bash
# Attendre un peu plus
sleep 30

# Vérifier les logs
docker compose logs

# Redémarrer tous les services
docker compose down
docker compose up -d
```

---

## 📝 Fichiers Importants

- **`.env`** - Variables d'environnement (créé depuis `.env.example`)
- **`docker-compose.yml`** - Services de développement
- **`apps/api/` - Backend NestJS
- **`apps/web/`** - Frontend Next.js
- **`SETUP.md`** - Setup détaillé
- **`docs/`** - Documentation

---

## 🎯 Prochaines Étapes

1. Lire le [README.md](README.md)
2. Consulter [docs/architecture.md](docs/architecture.md)
3. Voir les [API endpoints](docs/api.md)
4. Commencer à développer! 💻

---

## ⚡ Tips & Tricks

```bash
# Voir les logs en temps réel
docker compose logs -f

# Logs d'un service spécifique
docker compose logs -f postgres

# Exécuter une commande dans un container
docker compose exec api npm run build

# Voir l'état du projet
pnpm build
pnpm lint    # ne lint actuellement que apps/web (apps/api n'a pas de script lint)
pnpm test    # ne teste actuellement que apps/api (apps/web n'a pas de script test)
```

---

**💡 C'est tout!** Vous êtes prêt à développer. 🚀
