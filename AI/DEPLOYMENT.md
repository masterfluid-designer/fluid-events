# DEPLOYMENT.md — Guide de déploiement production

> Cible retenue (voir `AI/ARCHITECTURE.md` et `.env.example`) : **Docker Compose** sur un VPS, avec trois services externes managés — **Supabase** (PostgreSQL + Storage S3-compatible), **Upstash** (Redis) et **Resend** (email). Pas de Vercel/Railway/Fly.io. Ce document décrit les étapes de bout en bout, de la création des comptes de services jusqu'au premier déploiement réel.
>
> Toutes les étapes de création de compte / achat ci-dessous sont à faire **vous-même** — un agent IA ne peut pas créer de compte tiers, saisir une carte bancaire ou gérer vos identifiants à votre place. Ce guide vous indique quoi faire et quelles valeurs récupérer.

---

## 0. Ce que vous avez déjà

- Un nom de domaine chez Hostinger.
- Un VPS Hostinger à provisionner (pas encore acheté au moment de la rédaction de ce guide).

## 1. Créer les comptes de services managés

### 1.1 Supabase (PostgreSQL + Storage)

1. Créez un compte sur [supabase.com](https://supabase.com) et un nouveau projet (région la plus proche de vos utilisateurs, ex. `eu-west` ou une région africaine si disponible).
2. **Base de données** — `Project Settings → Database → Connection string` (mode **Session** ou **Transaction pooling**, pas `Direct connection` qui n'est pas conçu pour une charge applicative soutenue). Copiez la chaîne, remplacez `[YOUR-PASSWORD]` par le mot de passe défini à la création du projet → c'est votre `DATABASE_URL`.
3. **Storage** — `Project Settings → Storage` (ou `Storage → Settings`) : notez l'URL S3-compatible du projet (`https://<project-ref>.supabase.co/storage/v1/s3`) → `STORAGE_ENDPOINT`. Créez une paire de clés d'accès S3 (`Storage → S3 access keys → New access key`) → `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY`. Créez un bucket **public** nommé `fluid-events` (`Storage → New bucket`, cocher "Public bucket") → `STORAGE_BUCKET=fluid-events`. `STORAGE_REGION` = la région du projet (visible dans l'URL, ex. `eu-west-1`).
4. Une fois le premier déploiement fait (étape 6), appliquez les migrations Prisma contre cette base — voir §6.4.

### 1.2 Upstash (Redis managé)

1. Créez un compte sur [upstash.com](https://upstash.com), créez une base Redis (région proche du VPS Hostinger).
2. `Database → Details` : copiez l'URL **avec TLS** (commence par `rediss://`, pas `redis://`) → `REDIS_URL`. Le code (`ioredis`/BullMQ) accepte les deux, mais Upstash exige TLS sur son port public — utilisez bien la chaîne `rediss://` fournie par leur tableau de bord.

### 1.3 Resend (email transactionnel)

1. Créez un compte sur [resend.com](https://resend.com).
2. **Domaine** — `Domains → Add Domain`, renseignez votre domaine Hostinger, ajoutez les enregistrements DNS demandés (SPF/DKIM, généralement 3 enregistrements `TXT`/`CNAME`) dans le panneau DNS Hostinger (`hPanel → Domaines → DNS / Nameservers`). Attendez la vérification (peut prendre jusqu'à 24h, généralement quelques minutes).
3. **Clé API** — `API Keys → Create API Key` → `RESEND_API_KEY`. Avec cette clé configurée, `EmailService` utilise l'API HTTP Resend en priorité (voir `AI/ROADMAP.md` Phase 5) ; laissez `SMTP_*` vides si vous utilisez ce mode.
4. `SMTP_FROM` doit être une adresse `@votredomaine.com` du domaine vérifié à l'étape précédente (ex. `noreply@votredomaine.com`) — Resend rejette l'envoi depuis un domaine non vérifié.

### 1.4 (Optionnel V1) WhatsApp Business / Twilio SMS

Ces deux canaux sont **complémentaires** à l'email (voir `AI/ROADMAP.md` Phase 5) — le déploiement fonctionne sans eux, ils dégradent silencieusement (skip) si absents.

- **WhatsApp** (Meta Cloud API) : nécessite un compte Meta Business + un numéro WhatsApp Business + un template de message **approuvé manuellement** (catégorie UTILITY) avant tout envoi réel — voir `apps/api/.env.example` pour les 6 variables `WHATSAPP_*` et le détail dans `ROADMAP.md`. Non automatisable depuis ce guide.
- **SMS** (Twilio) : compte Twilio, `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_SMS_FROM` (numéro Twilio acheté).

## 2. Domaine Hostinger — pointer vers le VPS

Une fois le VPS provisionné (§3) et son adresse IP publique connue :

1. `hPanel → Domaines → [votredomaine.com] → DNS / Nameservers`.
2. Ajoutez/éditez deux enregistrements **A** :
   - `@` (racine) → IP du VPS
   - `www` → IP du VPS (ou un `CNAME` vers `@`)
3. Si l'API tourne sur un sous-domaine dédié (recommandé, ex. `api.votredomaine.com`) ajoutez un troisième enregistrement **A** `api` → même IP du VPS (Nginx route par `server_name`, voir §5.2).
4. Propagation DNS : généralement quelques minutes à quelques heures.

## 3. Provisionner le VPS Hostinger

1. Achetez un plan VPS Hostinger (Ubuntu 22.04 LTS recommandé — image standard proposée à la commande).
2. Connectez-vous en SSH avec l'IP fournie par Hostinger :
   ```bash
   ssh root@<IP_DU_VPS>
   ```
3. Installez Docker + Docker Compose plugin (script officiel) :
   ```bash
   curl -fsSL https://get.docker.com | sh
   apt-get install -y docker-compose-plugin
   ```
4. Créez un utilisateur non-root pour l'exploitation courante (bonne pratique, pas strictement bloquant) :
   ```bash
   adduser deploy && usermod -aG docker deploy
   ```

## 4. Cloner le repo et préparer la configuration

```bash
git clone https://github.com/<votre-org>/fluid-events.git
cd fluid-events
```

Créez le `.env` **à la racine du repo** (gitignored — jamais commité, voir `RULES.md`) avec toutes les valeurs récupérées aux étapes précédentes :

```bash
# Base de données / cache (services managés, §1.1 / §1.2)
DATABASE_URL="postgresql://postgres:<password>@<project-ref>.pooler.supabase.com:6543/postgres"
REDIS_URL="rediss://default:<password>@<endpoint>.upstash.io:6379"

# Storage (§1.1)
STORAGE_ENDPOINT="https://<project-ref>.supabase.co/storage/v1/s3"
STORAGE_ACCESS_KEY="..."
STORAGE_SECRET_KEY="..."
STORAGE_BUCKET="fluid-events"
STORAGE_REGION="eu-west-1"

# Email (§1.3)
RESEND_API_KEY="re_..."
SMTP_HOST=""
SMTP_PORT=""
SMTP_USER=""
SMTP_PASSWORD=""
SMTP_FROM="noreply@votredomaine.com"

# URLs publiques — DOIVENT être en https:// (voir §5 pour le TLS)
APP_URL="https://votredomaine.com"
API_URL="https://api.votredomaine.com"

# Secrets applicatifs — générez des valeurs aléatoires dédiées, JAMAIS les
# mêmes que celles utilisées en dev (apps/api/.env) :
#   openssl rand -hex 32   →  JWT_SECRET / JWT_REFRESH_SECRET / QR_SECRET
#   openssl rand -hex 32   →  ENCRYPTION_KEY (32 bytes hex = 64 caractères)
JWT_SECRET="..."
JWT_REFRESH_SECRET="..."
QR_SECRET="..."
ENCRYPTION_KEY="..."

# Google OAuth — voir §5.3 pour ajouter l'URI de callback production
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# Optionnel (§1.4) — laissez vide si non utilisé, dégrade silencieusement
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
TWILIO_SMS_FROM=""
WHATSAPP_ACCESS_TOKEN=""
WHATSAPP_PHONE_NUMBER_ID=""

# Requis par le service postgres local du compose (non utilisé pour les
# données applicatives en prod — DATABASE_URL pointe vers Supabase — mais la
# variable reste substituée par docker-compose.yml, voir §5.1)
POSTGRES_USER="fluid_user"
POSTGRES_PASSWORD="<mot de passe local, sans rapport avec Supabase>"
POSTGRES_DB="fluid_events"
```

⚠️ **Jamais de secret en clair dans un fichier tracké par git.** `docker-compose.yml`/`docker-compose.prod.yml` lisent tout via `${VAR}` depuis ce `.env` racine (gitignored) — ne recréez jamais le piège documenté dans `AI/ROADMAP.md` Phase 5 (une première version de ce projet avait commité des secrets en clair dans `docker-compose.yml`, bloqué avant push par le classificateur de sécurité de l'outil de dev, jamais reproduit depuis).

## 5. TLS et Nginx

`docker/nginx/nginx.conf` route déjà `/api/*` vers le service `api` et le reste vers `web`, avec redirection HTTP→HTTPS automatique — mais deux choses doivent être adaptées à votre domaine avant le premier démarrage.

### 5.1 Adapter `server_name`

Éditez `docker/nginx/nginx.conf`, ligne du bloc `server { listen 443 ssl http2; ... }` :

```nginx
server_name fluid-events.com www.fluid-events.com;
```

→ remplacez par votre vrai domaine.

### 5.2 Obtenir un certificat TLS (Let's Encrypt / certbot)

Le plus simple : générer le certificat **avant** de démarrer la stack Docker (le port 80 doit être libre), avec `certbot` en mode standalone sur l'hôte :

```bash
apt-get install -y certbot
certbot certonly --standalone -d votredomaine.com -d www.votredomaine.com -d api.votredomaine.com
```

Copiez les certificats générés à l'emplacement attendu par `nginx.conf` (`ssl_certificate`/`ssl_certificate_key`) :

```bash
mkdir -p docker/nginx/ssl
cp /etc/letsencrypt/live/votredomaine.com/fullchain.pem docker/nginx/ssl/cert.pem
cp /etc/letsencrypt/live/votredomaine.com/privkey.pem docker/nginx/ssl/key.pem
```

Renouvellement (certificats Let's Encrypt valides 90 jours) — ajoutez un cron qui renouvelle puis recopie les fichiers et recharge Nginx :

```cron
0 3 * * * certbot renew --quiet --deploy-hook "cp /etc/letsencrypt/live/votredomaine.com/fullchain.pem /path/to/fluid-events/docker/nginx/ssl/cert.pem && cp /etc/letsencrypt/live/votredomaine.com/privkey.pem /path/to/fluid-events/docker/nginx/ssl/key.pem && docker compose -f /path/to/fluid-events/docker-compose.yml -f /path/to/fluid-events/docker-compose.prod.yml restart nginx"
```

### 5.3 Mettre à jour le callback OAuth Google

`docker-compose.prod.yml` calcule automatiquement `GOOGLE_CALLBACK_URL=${API_URL}/api/auth/google/callback` — mais Google refuse toute redirection vers une URI non déclarée. Dans la [Google Cloud Console](https://console.cloud.google.com) → `APIs & Services → Credentials` → votre OAuth Client ID → **Authorized redirect URIs**, ajoutez :

```
https://api.votredomaine.com/api/auth/google/callback
```

(en plus de l'URI de dev existante, à conserver si vous continuez à développer en local).

## 6. Déployer

### 6.1 Build et démarrage

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

`docker-compose.prod.yml` désactive `mailpit`/`rustfs` (profil `dev` uniquement), construit `api`/`web` avec `target: production` des `Dockerfile` multi-stage existants, et retire les volumes/ports de dev. Les services `postgres`/`redis` locaux du compose de base restent définis (utilisés par défaut par `docker compose config` pour la validation) mais **ne sont pas la source de vérité applicative** en prod : `DATABASE_URL`/`REDIS_URL` pointent vers Supabase/Upstash, ces conteneurs locaux tournent en parallèle sans être réellement utilisés — vous pouvez les retirer complètement du fichier de base si vous préférez un compose de prod strictement minimal, non fait ici pour rester cohérent avec le mode hybride déjà utilisé tout au long du développement (voir `ROADMAP.md` Phase 5, §"Docker compose dev complet").

### 6.2 Vérifier que tout a démarré

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api
```

Cherchez la ligne `Nest application successfully started` côté `api`, et l'absence d'erreur `EADDRINUSE`/`ECONNREFUSED`.

### 6.3 Health check

```bash
curl -I https://votredomaine.com/health   # doit répondre 200 "healthy" (bloc Nginx dédié)
curl -I https://api.votredomaine.com/api/admin/overview   # doit répondre 401 (route protégée, mais joignable)
```

### 6.4 Appliquer les migrations Prisma sur Supabase

Depuis le conteneur `api` déjà démarré (il contient déjà le client Prisma généré au build) :

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

`migrate deploy` (contrairement à `migrate dev`) est non-interactif et n'applique que les migrations déjà commitées dans `apps/api/prisma/migrations/` — c'est la commande sûre à utiliser en production, jamais `migrate dev` ni `db push`.

### 6.5 Créer le premier compte Admin

Aucune UI ne crée un `SUPER_ADMIN` (cohérent avec le reste du projet — un compte Admin ne s'auto-crée jamais). Deux options :

- Adapter `apps/api/prisma/seed.ts` pour ne créer qu'un compte `SUPER_ADMIN` réel (pas les comptes de test `@fluid-events.test`) et l'exécuter une fois : `docker compose ... exec api npx prisma db seed` — **à faire avec un seed dédié à la prod**, ne réutilisez jamais le seed de dev tel quel (il crée aussi des comptes de test avec des mots de passe connus).
- Ou insérer directement une ligne dans `users` via `psql`/le SQL Editor Supabase, avec `passwordHash` généré par `bcrypt.hash(password, 10)` (voir `apps/api/src/auth/auth-orchestrator.service.ts` pour la convention exacte) — puis se connecter via `POST /api/auth/login` et inviter les autres Managers depuis l'UI Admin (`/admin/managers`, voir `ROADMAP.md` Phase 5).

## 7. Après le premier déploiement

- **Paiements** — Kkiapay/CinetPay/FedaPay se configurent désormais **par événement**, depuis le tableau de bord Admin (`/admin` → panneau paiement par manager, ou directement `PUT /api/admin/events/:eventId/payment-config`), pas via des variables d'environnement (voir `ROADMAP.md` Phase 2 §"Config paiement par événement"). Rien à faire ici au niveau infra.
- **Webhooks providers** — configurez dans chaque dashboard provider (Kkiapay/CinetPay/FedaPay) l'URL `https://api.votredomaine.com/api/payments/webhook/<provider>`.
- **Surveillance** — `docker compose ... logs -f api web nginx` pour un suivi manuel ; aucune solution de monitoring/alerting n'est mise en place par ce projet à ce stade (hors périmètre actuel, voir `ROADMAP.md` §5).
- **Sauvegardes** — gérées par Supabase (PITR selon le plan souscrit) pour la base de données ; le bucket Storage suit la politique de rétention Supabase par défaut.
- **Mise à jour** — `git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` puis rejouer §6.4 si de nouvelles migrations existent.

## 8. Limitations connues de ce guide

- Non testé en conditions réelles (aucun VPS/compte Supabase/Upstash/Resend réel disponible au moment de la rédaction) — contrairement au reste de ce projet où chaque fonctionnalité a été vérifiée en conditions Docker réelles. Le fichier `docker-compose.prod.yml` référencé a été validé syntaxiquement (`docker compose config`, aucune erreur, cycle de dépendance `api ↔ nginx` détecté et corrigé au passage) mais pas exécuté contre de vrais services managés.
- Le service `redis` local du compose de base reste défini même en prod (non utilisé si `REDIS_URL` pointe vers Upstash) — nettoyage possible mais non fait, voir §6.1.
