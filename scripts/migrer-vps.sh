#!/bin/bash
#
# Migration d'un VPS vers un autre — export d'un côté, import de l'autre.
#
# Écrit le 2026-09-10, quand l'abonnement du premier VPS a expiré et que tout
# — base, images, secrets — s'est retrouvé enfermé sur une machine éteinte.
#
# Trois principes, tous nés de ce que cette migration-là peut casser :
#
#  - **Les images comptent autant que la base.** Le volume MinIO porte les
#    affiches, les logos et les visuels de billets. La base garde des URLs qui
#    pointent dedans : restaurer l'une sans l'autre donne un site complet dont
#    toutes les images sont mortes. Les deux voyagent ensemble ou pas du tout.
#
#  - **Le `.env` se recopie, il ne se régénère pas.** `QR_SECRET` signe les QR
#    codes déjà distribués : le changer invalide tous les billets émis, à la
#    porte, le soir de l'événement. `ENCRYPTION_KEY` déchiffre les clés de
#    paiement des organisateurs : le changer les oblige tous à les ressaisir.
#    Ce sont les deux valeurs qu'une installation « propre » détruit sans
#    prévenir.
#
#  - **L'import refuse d'écraser une base qui contient déjà quelque chose.**
#    Se tromper de sens sur ce script coûterait la production ; il faut le
#    dire explicitement avec `--ecraser`.
#
# Usage, dans cet ordre :
#
#   # 1) sur l'ANCIEN VPS
#   ./scripts/migrer-vps.sh exporter
#   #    → /root/migration-fluid-AAAAMMJJ-HHMMSS/
#
#   # 2) depuis votre machine (relais — les deux VPS n'ont pas à se connaître)
#   scp -i ~/.ssh/ancienne_cle -r root@ANCIENNE_IP:/root/migration-fluid-* .
#   scp -i ~/.ssh/nouvelle_cle -r ./migration-fluid-* root@NOUVELLE_IP:/root/
#
#   # 3) sur le NOUVEAU VPS, après avoir cloné le dépôt et posé le .env
#   ./scripts/migrer-vps.sh importer /root/migration-fluid-AAAAMMJJ-HHMMSS
#
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/fluid-events}"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

# Le nom du volume est préfixé par le nom du projet Compose, lui-même dérivé du
# nom du dossier. `/opt/fluid-events` donne donc `fluid-events_minio_data`.
PROJET="${PROJET:-$(basename "$REPO_DIR")}"
VOLUME_MINIO="${VOLUME_MINIO:-${PROJET}_minio_data}"

rouge() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
vert() { printf '\033[32m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }

lire_env() {
  local cle="$1"
  grep -E "^${cle}=" "$REPO_DIR/.env" | head -1 | cut -d= -f2- || true
}

# ─────────────────────────────────────────────────────────────────────────────
# EXPORT — sur l'ancienne machine
# ─────────────────────────────────────────────────────────────────────────────
exporter() {
  cd "$REPO_DIR"

  local user db sortie
  user=$(lire_env POSTGRES_USER); user="${user:-fluid_user}"
  db=$(lire_env POSTGRES_DB); db="${db:-fluid_events}"
  sortie="/root/migration-fluid-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$sortie"

  vert "Export vers $sortie"

  # 1. La base. Écrite en `.partial` puis renommée : un dump interrompu ne doit
  #    jamais passer pour une sauvegarde valide au moment de la restaurer.
  info "base PostgreSQL…"
  set -o pipefail
  if ! $COMPOSE exec -T postgres pg_dump -U "$user" -d "$db" | gzip > "$sortie/base.sql.gz.partial"; then
    rm -f "$sortie/base.sql.gz.partial"
    rouge "ECHEC pg_dump — la base n'a pas été exportée, on s'arrête ici."
    exit 1
  fi
  mv "$sortie/base.sql.gz.partial" "$sortie/base.sql.gz"

  # 2. Les images. Lues depuis un conteneur jetable monté sur le volume : pas
  #    besoin que MinIO tourne, ni de connaître son chemin sur l'hôte.
  info "volume des images ($VOLUME_MINIO)…"
  if ! docker volume inspect "$VOLUME_MINIO" >/dev/null 2>&1; then
    rouge "Volume $VOLUME_MINIO introuvable. Volumes présents :"
    docker volume ls --format '    {{.Name}}' >&2
    rouge "Relancez avec VOLUME_MINIO=<le bon nom> ./scripts/migrer-vps.sh exporter"
    exit 1
  fi
  docker run --rm \
    -v "$VOLUME_MINIO":/donnees:ro \
    -v "$sortie":/sortie \
    alpine tar czf /sortie/images.tar.gz -C /donnees .

  # 3. Les secrets. C'est le fichier le plus sensible du lot : il ne sort qu'en
  #    600, et il ne doit transiter que par des canaux chiffrés.
  info "secrets (.env)…"
  cp "$REPO_DIR/.env" "$sortie/env"
  chmod 600 "$sortie/env"

  # 4. Les tâches planifiées, pour ne pas repartir sans sauvegarde ni
  #    supervision sur la nouvelle machine.
  info "tâches cron…"
  crontab -l > "$sortie/crontab.txt" 2>/dev/null || echo "(aucune)" > "$sortie/crontab.txt"

  # 5. Les dumps déjà sur place : c'est le filet si le dump du jour se révélait
  #    fautif une fois de l'autre côté.
  if [ -d /var/backups/fluid-events ]; then
    info "sauvegardes antérieures…"
    tar czf "$sortie/sauvegardes-anterieures.tar.gz" -C /var/backups fluid-events 2>/dev/null || true
  fi

  # Un dump valide fait forcément plus que quelques centaines d'octets ; un
  # `.gz` vide en fait environ 20 et se restaure sans broncher, en silence.
  local taille_base taille_images
  taille_base=$(stat -c%s "$sortie/base.sql.gz")
  taille_images=$(stat -c%s "$sortie/images.tar.gz")
  if [ "$taille_base" -lt 1000 ]; then
    rouge "Le dump fait $taille_base octets — c'est une base vide, pas une sauvegarde."
    exit 1
  fi

  echo
  vert "Export terminé."
  info "base    : $(numfmt --to=iec "$taille_base" 2>/dev/null || echo "$taille_base o")"
  info "images  : $(numfmt --to=iec "$taille_images" 2>/dev/null || echo "$taille_images o")"
  echo
  info "Récupérez le dossier depuis VOTRE machine (les deux VPS n'ont pas à se connaître) :"
  info "  scp -i ~/.ssh/<ancienne_cle> -r root@<ANCIENNE_IP>:$sortie ."
  echo
  rouge "Ce dossier contient tous les secrets de production. Ne le laissez pas traîner."
}

# ─────────────────────────────────────────────────────────────────────────────
# IMPORT — sur la nouvelle machine
# ─────────────────────────────────────────────────────────────────────────────
importer() {
  local source="${1:?Usage : migrer-vps.sh importer <dossier-de-migration> [--ecraser]}"
  local ecraser="${2:-}"

  [ -f "$source/base.sql.gz" ] || { rouge "$source/base.sql.gz introuvable."; exit 1; }
  [ -f "$source/images.tar.gz" ] || { rouge "$source/images.tar.gz introuvable."; exit 1; }
  [ -f "$REPO_DIR/.env" ] || { rouge "$REPO_DIR/.env manquant — recopiez $source/env AVANT d'importer."; exit 1; }

  cd "$REPO_DIR"

  local user db
  user=$(lire_env POSTGRES_USER); user="${user:-fluid_user}"
  db=$(lire_env POSTGRES_DB); db="${db:-fluid_events}"

  # Les deux secrets qui ne pardonnent pas. Un .env fraîchement généré sur la
  # nouvelle machine passerait tous les contrôles de démarrage et casserait
  # silencieusement les billets déjà émis.
  local avert=0
  for cle in QR_SECRET ENCRYPTION_KEY; do
    local ici la_bas
    ici=$(lire_env "$cle")
    la_bas=$(grep -E "^${cle}=" "$source/env" | head -1 | cut -d= -f2- || true)
    if [ -n "$la_bas" ] && [ "$ici" != "$la_bas" ]; then
      rouge "⚠  $cle DIFFÈRE de celui de l'ancienne machine."
      avert=1
    fi
  done
  if [ "$avert" = 1 ]; then
    rouge "   QR_SECRET différent  → tous les billets déjà émis seront refusés à l'entrée."
    rouge "   ENCRYPTION_KEY différent → les clés de paiement en base deviendront illisibles."
    rouge "   Recopiez $source/env vers $REPO_DIR/.env, puis relancez."
    exit 1
  fi

  vert "Démarrage de la base et du stockage seuls…"
  $COMPOSE up -d postgres minio
  # Postgres accepte les connexions quelques secondes après le conteneur.
  for _ in $(seq 1 60); do
    if $COMPOSE exec -T postgres pg_isready -U "$user" -d "$db" >/dev/null 2>&1; then break; fi
    sleep 1
  done

  # Garde-fou de sens : restaurer par-dessus une base vivante effacerait la
  # production au lieu de la sauver.
  local lignes
  lignes=$($COMPOSE exec -T postgres psql -U "$user" -d "$db" -tAc \
    "select count(*) from information_schema.tables where table_schema='public'" 2>/dev/null || echo 0)
  if [ "${lignes//[^0-9]/}" -gt 0 ] && [ "$ecraser" != "--ecraser" ]; then
    rouge "La base contient déjà $lignes table(s)."
    rouge "Si c'est bien la cible et que vous voulez l'écraser : ajoutez --ecraser."
    exit 1
  fi

  vert "Restauration de la base…"
  gunzip -c "$source/base.sql.gz" | $COMPOSE exec -T postgres psql -U "$user" -d "$db" -q

  vert "Restauration des images…"
  docker run --rm \
    -v "$VOLUME_MINIO":/donnees \
    -v "$source":/entree:ro \
    alpine sh -c "tar xzf /entree/images.tar.gz -C /donnees"

  vert "Démarrage de la stack complète…"
  $COMPOSE up -d --build

  vert "Application des migrations manquantes…"
  # Le dump porte déjà `_prisma_migrations` : seules les migrations postérieures
  # à l'export s'appliquent, les autres sont ignorées.
  $COMPOSE exec -T api sh -c "cd /app/apps/api && npx prisma migrate deploy"

  echo
  vert "Import terminé. À vérifier maintenant :"
  info "  - les tâches cron : cat $source/crontab.txt puis crontab -e"
  info "  - une page publique d'événement, IMAGES COMPRISES"
  info "  - une connexion organisateur, et son tableau de bord"
  info "  - un billet déjà émis, scanné : il valide le report de QR_SECRET"
}

case "${1:-}" in
  exporter) exporter ;;
  importer) shift; importer "$@" ;;
  *)
    echo "Usage :"
    echo "  $0 exporter                              # sur l'ANCIEN VPS"
    echo "  $0 importer <dossier> [--ecraser]        # sur le NOUVEAU VPS"
    exit 1
    ;;
esac
