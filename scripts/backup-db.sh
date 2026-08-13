#!/bin/bash
#
# Sauvegarde de la base PostgreSQL de production.
#
# Conçu pour tourner en cron sur le VPS. Deux principes :
#  - la sauvegarde est écrite dans un fichier TEMPORAIRE puis renommée une fois
#    complète : un cron interrompu (ou un disque plein) ne laisse jamais une
#    archive tronquée qui passerait pour valide au moment de la restaurer ;
#  - `pg_dump` échoue bruyamment (`set -o pipefail`) plutôt que de produire un
#    fichier vide compressé, qui serait le pire des cas — une sauvegarde qu'on
#    croit avoir.
#
# Restauration :
#   gunzip -c fluid-events-AAAAMMJJ-HHMMSS.sql.gz | \
#     docker compose ... exec -T postgres psql -U fluid_user -d fluid_events
#
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/fluid-events}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/fluid-events}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

cd "$REPO_DIR"

# Identifiants lus depuis le .env de production — jamais codés en dur ici.
POSTGRES_USER=$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2-)
POSTGRES_DB=$(grep -E '^POSTGRES_DB=' .env | cut -d= -f2-)
: "${POSTGRES_USER:?POSTGRES_USER introuvable dans .env}"
: "${POSTGRES_DB:?POSTGRES_DB introuvable dans .env}"

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
FINAL="$BACKUP_DIR/fluid-events-$STAMP.sql.gz"
TMP="$FINAL.partial"

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

set -o pipefail
if ! $COMPOSE exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" 2>/tmp/pgdump.err | gzip > "$TMP"; then
  rm -f "$TMP"
  echo "[$(date -Is)] ECHEC pg_dump : $(head -3 /tmp/pgdump.err | tr '\n' ' ')" >&2
  exit 1
fi

# Garde-fou : un dump valide fait forcément plus que quelques octets. En
# dessous, c'est une erreur silencieuse (base vide, mauvais identifiants).
SIZE=$(stat -c '%s' "$TMP")
if [ "$SIZE" -lt 1024 ]; then
  rm -f "$TMP"
  echo "[$(date -Is)] ECHEC : dump suspect ($SIZE octets)" >&2
  exit 1
fi

mv "$TMP" "$FINAL"
echo "[$(date -Is)] OK $FINAL ($(numfmt --to=iec "$SIZE"))"

# Rotation
find "$BACKUP_DIR" -name 'fluid-events-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
echo "[$(date -Is)] $(find "$BACKUP_DIR" -name 'fluid-events-*.sql.gz' | wc -l) sauvegarde(s) conservee(s)"
