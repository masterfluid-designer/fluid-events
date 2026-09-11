#!/bin/bash
#
# Sauvegarde HORS-SITE, chiffrée, vers un stockage objet compatible S3.
#
# Écrit le 2026-09-11, au lendemain de la perte du premier VPS. Les
# sauvegardes vivaient sur la machine qu'elles étaient censées protéger :
# quand l'abonnement a expiré, la base, les images ET leurs sauvegardes ont
# disparu ensemble. Rien n'était en panne — c'est le genre de perte qu'on ne
# découvre qu'au moment où il est trop tard pour agir.
#
# Quatre décisions tiennent ce script :
#
#  - **`restic`, pas un `cp`.** Il chiffre AVANT l'envoi : le dump contient les
#    noms, emails et téléphones des inscrits, et le `.env` les clés de paiement
#    des organisateurs. Ce que l'hébergeur du stockage reçoit doit lui être
#    illisible. Il déduplique aussi : les 22 Mo d'images ne changent presque
#    jamais, les sauvegardes suivantes ne coûtent que quelques kilo-octets.
#
#  - **Le volume MinIO est lu sur le disque de l'hôte**, pas réempaqueté en
#    archive. Une archive change entièrement à chaque octet modifié et ruine la
#    déduplication ; fichier par fichier, restic ne réenvoie que le nouveau.
#
#  - **Le `.env` est sauvegardé avec le reste.** Sans `ENCRYPTION_KEY`, une base
#    restaurée rend les clés de paiement des organisateurs indéchiffrables : ils
#    devraient toutes les ressaisir. Sans `QR_SECRET`, les billets déjà émis
#    seraient refusés à l'entrée. Une sauvegarde sans eux n'est pas une
#    sauvegarde complète.
#
#  - **Il pose une date de dernier succès**, que `healthcheck.sh` surveille. Une
#    sauvegarde qui échoue en silence est pire que pas de sauvegarde : on croit
#    être couvert. C'est le seul contrôle qui distingue les deux.
#
# ⚠️ **Le mot de passe restic doit vivre AILLEURS que sur ce serveur.** S'il
# disparaît avec la machine, les sauvegardes chiffrées ne sont plus que du
# bruit — on aurait reproduit exactement la panne qu'on cherche à éviter. Dans
# un gestionnaire de mots de passe, aujourd'hui.
#
# Configuration, à ajouter au `.env` (voir AI/DEPLOYMENT.md §14) :
#   RESTIC_REPOSITORY=s3:https://<compte>.r2.cloudflarestorage.com/<bucket>
#   RESTIC_PASSWORD=<phrase longue, copiée dans votre gestionnaire>
#   AWS_ACCESS_KEY_ID=<jeton R2>
#   AWS_SECRET_ACCESS_KEY=<secret R2>
#
# Restauration :
#   restic snapshots                          # lister
#   restic restore latest --target /tmp/restauration
#
set -uo pipefail

REPO_DIR="${REPO_DIR:-/opt/fluid-events}"
LOCAL_BACKUP_DIR="${LOCAL_BACKUP_DIR:-/var/backups/fluid-events}"
ETAT_DIR="${ETAT_DIR:-/var/lib/fluid-events}"
MARQUEUR="$ETAT_DIR/dernier-backup-externe"

cd "$REPO_DIR" || exit 1
mkdir -p "$ETAT_DIR"

journal() { echo "[$(date -Is)] $*"; }

lire_env() { grep -E "^$1=" "$REPO_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2-; }

export RESTIC_REPOSITORY="$(lire_env RESTIC_REPOSITORY)"
export RESTIC_PASSWORD="$(lire_env RESTIC_PASSWORD)"
export AWS_ACCESS_KEY_ID="$(lire_env AWS_ACCESS_KEY_ID)"
export AWS_SECRET_ACCESS_KEY="$(lire_env AWS_SECRET_ACCESS_KEY)"

# Non configuré : on sort en silence plutôt que d'alimenter le cron en erreurs.
# Un cron qui échoue tous les jours devient un bruit qu'on filtre, et le jour
# où l'échec est réel, personne ne le voit.
if [ -z "$RESTIC_REPOSITORY" ] || [ -z "$RESTIC_PASSWORD" ]; then
  journal "sauvegarde hors-site non configurée (RESTIC_REPOSITORY/RESTIC_PASSWORD absents du .env) — ignorée"
  exit 0
fi

command -v restic >/dev/null || { journal "ECHEC restic n'est pas installé"; exit 1; }

# Le dépôt s'initialise tout seul au premier passage.
if ! restic cat config >/dev/null 2>&1; then
  journal "initialisation du dépôt distant…"
  restic init || { journal "ECHEC init du dépôt"; exit 1; }
fi

# ── Un dump frais, indépendant de la sauvegarde locale ────────────────────
# Ne pas dépendre de `backup-db.sh` : si celle-ci a échoué cette nuit, la
# sauvegarde hors-site enverrait joyeusement le dump de la veille en se
# croyant à jour.
POSTGRES_USER=$(lire_env POSTGRES_USER); POSTGRES_USER="${POSTGRES_USER:-fluid_user}"
POSTGRES_DB=$(lire_env POSTGRES_DB); POSTGRES_DB="${POSTGRES_DB:-fluid_events}"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

set -o pipefail
if ! $COMPOSE exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$TMP/base.sql.gz"; then
  journal "ECHEC pg_dump — rien n'est envoyé"
  exit 1
fi

# Un `.gz` vide fait une vingtaine d'octets et se restaure sans broncher : le
# pire des cas, une sauvegarde qu'on croit avoir.
taille=$(stat -c%s "$TMP/base.sql.gz")
if [ "$taille" -lt 1000 ]; then
  journal "ECHEC dump de $taille octets — base vide, rien n'est envoyé"
  exit 1
fi

# ── Le volume MinIO, lu directement sur le disque de l'hôte ───────────────
PROJET="${PROJET:-$(basename "$REPO_DIR")}"
VOLUME_MINIO="${VOLUME_MINIO:-${PROJET}_minio_data}"
CHEMIN_MINIO=$(docker volume inspect "$VOLUME_MINIO" --format '{{.Mountpoint}}' 2>/dev/null)

CIBLES=("$TMP/base.sql.gz" "$REPO_DIR/.env")
if [ -n "$CHEMIN_MINIO" ] && [ -d "$CHEMIN_MINIO" ]; then
  CIBLES+=("$CHEMIN_MINIO")
else
  journal "AVERTISSEMENT volume $VOLUME_MINIO introuvable — les images ne seront pas sauvegardées"
fi
[ -d "$LOCAL_BACKUP_DIR" ] && CIBLES+=("$LOCAL_BACKUP_DIR")

journal "envoi vers $RESTIC_REPOSITORY…"
if ! restic backup --tag fluid-events --host fluid-prod "${CIBLES[@]}" 2>&1 | tail -5; then
  journal "ECHEC restic backup"
  exit 1
fi

# ── Rétention ────────────────────────────────────────────────────────────
# Sept jours pour rattraper une bêtise récente, quatre semaines et six mois
# pour rattraper une corruption qu'on n'a pas vue passer.
restic forget --tag fluid-events \
  --keep-daily 7 --keep-weekly 4 --keep-monthly 6 \
  --prune 2>&1 | tail -3

# ── Intégrité, une fois par semaine ──────────────────────────────────────
# Un dépôt qu'on n'a jamais vérifié n'est qu'une hypothèse. Le dimanche, pour
# ne pas allonger chaque passage.
if [ "$(date +%u)" = "7" ]; then
  journal "vérification hebdomadaire du dépôt…"
  restic check --read-data-subset=5% 2>&1 | tail -3
fi

date -Is > "$MARQUEUR"
journal "OK sauvegarde hors-site terminée"
