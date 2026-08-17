# DEPLOYMENT.md — Déploiement production

> **Ce document décrit le déploiement réellement en service**, pas une cible théorique. Il a été rédigé après la mise en production du 13 août 2026 sur `fluidevent.online`, et chaque commande qu'il contient a été exécutée.
>
> Architecture retenue : **tout auto-hébergé** sur un VPS unique — PostgreSQL, Redis et MinIO tournent en conteneurs à côté de l'application, derrière Nginx. Aucun service managé, à l'exception de **Resend** pour l'email transactionnel.
>
> Les créations de compte et modifications DNS sont à faire **vous-même** : un agent ne peut ni créer de compte tiers, ni saisir vos identifiants.

---

## 1. Architecture en service

```
Internet
   │
   ├── :80  ──► Nginx ──► redirection 301 vers HTTPS
   └── :443 ──► Nginx ──┬── fluidevent.online       ──► web   (Next.js, :3000)
                        ├── api.fluidevent.online   ──► api   (NestJS,  :4000)
                        └── storage.fluidevent.online ──► minio (S3,    :9000)

Réseau Docker interne (aucun port publié) :
   postgres:5432   redis:6379   minio:9000
```

**Seuls les ports 80 et 443 sont publiés.** La base, le cache et le stockage ne sont joignables que depuis le réseau Docker.

## 2. Prérequis

| Élément | Valeur en service |
|---|---|
| VPS | Hostinger, Ubuntu 24.04 LTS, 1 vCPU / 4 Go |
| Domaine | `fluidevent.online` |
| Enregistrements DNS | `@`, `api`, `storage` en `A` vers l'IP du VPS (`www` = CNAME vers `@`) |
| Email | compte Resend avec le domaine vérifié |
| Google OAuth | client avec l'URI de callback production déclarée |

> ⚠️ **`www` :** un CNAME `www → @` existe généralement déjà chez le registrar. Un nom ne peut pas porter à la fois un CNAME et un A — n'essayez pas d'ajouter un A sur `www`, le CNAME suffit et suit automatiquement `@`.

## 3. Préparation du serveur

```bash
# Accès par clé uniquement — le mot de passe SSH ne doit jamais transiter.
ssh-keygen -t ed25519 -f ~/.ssh/fluid_vps -N ""
# puis ajouter ~/.ssh/fluid_vps.pub dans hPanel → VPS → Clés SSH

ssh -i ~/.ssh/fluid_vps root@<IP>
```

Sur le serveur :

```bash
# Swap — indispensable sur 1 vCPU : le build Next.js se fait tuer par l'OOM
# killer sans lui.
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Docker est préinstallé sur l'image Hostinger ; sinon :
curl -fsSL https://get.docker.com | sh

apt-get update && apt-get install -y certbot
```

## 4. Certificat TLS

À faire **avant** de démarrer la stack : l'émission initiale utilise le mode `standalone`, qui exige le port 80 libre.

```bash
certbot certonly --standalone --non-interactive --agree-tos \
  --register-unsafely-without-email \
  -d fluidevent.online -d www.fluidevent.online \
  -d api.fluidevent.online -d storage.fluidevent.online
```

> ⚠️ **Piège corrigé, à ne pas réintroduire.** Certbot enregistre `authenticator = standalone` dans sa configuration de renouvellement. Une fois Nginx démarré, le port 80 est occupé et **le renouvellement échoue silencieusement** — le site tombe en HTTPS au bout de 90 jours. Il faut basculer en `webroot` :
>
> ```bash
> C=/etc/letsencrypt/renewal/fluidevent.online.conf
> sed -i 's|^authenticator = standalone|authenticator = webroot|' $C
> sed -i '/^authenticator = webroot/a webroot_path = /var/www/certbot,' $C
> ```
>
> et ajouter un `renew_hook` qui recopie les certificats là où Nginx les lit puis le recharge. Vérifier avec `certbot renew --dry-run` — la sortie doit indiquer *« all simulated renewals succeeded »*.

## 5. Code et configuration

```bash
git clone --branch main https://github.com/<org>/fluid-events.git /opt/fluid-events
cd /opt/fluid-events

mkdir -p docker/nginx/ssl /var/www/certbot
cp /etc/letsencrypt/live/<domaine>/fullchain.pem docker/nginx/ssl/cert.pem
cp /etc/letsencrypt/live/<domaine>/privkey.pem  docker/nginx/ssl/key.pem
chmod 600 docker/nginx/ssl/key.pem
```

Le `.env` racine (gitignored, `chmod 600`). **Générez les secrets sur le serveur** plutôt que de les transporter :

```bash
JWT_SECRET=$(openssl rand -hex 32)   # idem JWT_REFRESH_SECRET, QR_SECRET,
                                     # ENCRYPTION_KEY, POSTGRES_PASSWORD,
                                     # STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY
```

Variables non générables, à renseigner à la main : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`.

> L'API **refuse volontairement de démarrer** sans `GOOGLE_CLIENT_ID` — ce n'est pas une panne, c'est une garde.

URLs à fixer :

```bash
APP_URL=https://fluidevent.online
API_URL=https://api.fluidevent.online
STORAGE_PUBLIC_ENDPOINT=https://storage.fluidevent.online
SMTP_FROM=noreply@fluidevent.online   # doit être sur le domaine vérifié Resend
COOKIE_DOMAIN=.fluidevent.online      # le point initial n’est pas décoratif
```

> `COOKIE_DOMAIN` fait partager les cookies d’authentification entre le front
> (`fluidevent.online`) et l’API (`api.fluidevent.online`). Omis, le cookie
> reste cantonné au sous-domaine de l’API : le middleware Next.js ne le voit
> jamais et renvoie en boucle vers la connexion, même après une
> authentification réussie — tableau de bord inatteignable. En local on le
> laisse **vide** (tout tient sur `localhost`).

> `STORAGE_ENDPOINT` (interne, `http://minio:9000`) et `STORAGE_PUBLIC_ENDPOINT` (public) sont **distincts à dessein** : le premier sert aux dépôts via le réseau Docker, le second est ce que voient les navigateurs. Les confondre stocke en base des URLs pointant vers un hôte injoignable depuis l'extérieur.

## 6. Google OAuth

Google Cloud Console → *APIs & Services* → *Credentials* → votre client :

- **Authorized redirect URIs** : `https://api.fluidevent.online/api/auth/google/callback`
- **Authorized JavaScript origins** : `https://fluidevent.online`

## 7. Démarrage

```bash
cd /opt/fluid-events
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Le build prend une quinzaine de minutes sur 1 vCPU.

Migrations — noter le répertoire de travail, le schéma n'est pas à la racine de l'image :

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec -T -w /app/apps/api api npx prisma migrate deploy
```

### Premier compte administrateur

Aucune UI ne crée un `SUPER_ADMIN`. L'authentification étant Google, on ne peut pas préparer le compte à l'avance (le `googleId` n'est pas connu). La marche à suivre :

1. Se connecter une fois via `https://api.fluidevent.online/api/auth/google?redirect=https://fluidevent.online` — cela crée un compte `CLIENT`.
2. Le promouvoir :

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres \
  psql -U fluid_user -d fluid_events \
  -c "update users set role='SUPER_ADMIN' where email='<votre-email>';"
```

## 8. Vérifications

```bash
curl -I https://fluidevent.online/health                    # 200
curl -I https://api.fluidevent.online/api/admin/overview    # 401 = protégé et joignable
curl -I https://storage.fluidevent.online/<bucket>/<objet>  # 200 sur un objet public
```

> Un `403` sur `https://storage.<domaine>/` seul est **normal** : lister les buckets exige une authentification. Ce qui compte est la lecture d'un objet.

## 9. Sauvegardes

`scripts/backup-db.sh`, en cron quotidien :

```cron
0 3 * * * cd /opt/fluid-events && ./scripts/backup-db.sh >> /var/log/fluid-backup.log 2>&1
```

Écrit dans un `.partial` renommé seulement en cas de succès, refuse les dumps anormalement petits, rotation à 14 jours.

**Restauration :**

```bash
gunzip -c /var/backups/fluid-events/<archive>.sql.gz | \
  docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec -T postgres psql -U fluid_user -d fluid_events
```

> ⚠️ Les sauvegardes sont **sur le même VPS** que la base. Cela protège d'une erreur logicielle, pas de la perte du serveur. Une copie externe reste à mettre en place.

## 10. Mise à jour

```bash
cd /opt/fluid-events && git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
# puis §7 (migrations) si de nouvelles migrations existent
```

## 11. Pièges rencontrés en conditions réelles

Tous ont été corrigés dans le dépôt ; ils sont listés pour éviter leur réintroduction.

| Symptôme | Cause |
|---|---|
| Nginx ne démarre pas | `image: nginx:latest-alpine` — ce tag n'existe pas, c'est `nginx:alpine` |
| Base exposée sur Internet | `ports: []` **ne vide pas** une liste : Compose concatène les séquences. Il faut `ports: !reset []` |
| MinIO tourne en prod malgré le profil `dev` | Le profil visait un service `rustfs` inexistant — il s'appelle `minio` |
| Le navigateur appelle `localhost` en prod | Next.js fige les `NEXT_PUBLIC_*` **au build** : ils doivent passer par `build.args`, pas seulement `environment` |
| HTTPS tombe après 90 jours | Renouvellement resté en `standalone` alors que Nginx occupe le port 80 (voir §4) |
| Une modification de `nginx.conf` n’a aucun effet après `git pull` | Le montage porte sur **un fichier**, pas un dossier. `git pull` remplace le fichier (nouvel inode) et le conteneur reste accroché à l’ancien : `nginx -t` et `nginx -s reload` valident et rechargent l’**ancien** contenu, sans erreur. Il faut `up -d --force-recreate nginx` |
| L’aperçu du Builder affiche « Ce contenu est bloqué » | CSP : `frame-src` listait la seule origine Kkiapay, sans `'self'` — l’iframe de la page publique, pourtant de même origine, était refusée. `frame-ancestors` ne joue aucun rôle ici (il règle qui nous embarque, pas ce que nous embarquons) |

## 12. Points ouverts

- **Pare-feu** — non installé. La surface réelle est déjà limitée à 22/80/443, et Docker manipule directement iptables (UFW ne contrôlerait pas les ports publiés). L'authentification SSH par mot de passe est en revanche à désactiver.
- **Sauvegardes hors-site** — voir §9.
- **Supervision** — aucune. Suivi manuel par `docker compose logs`.
