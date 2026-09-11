#!/bin/bash
#
# Surveillance de la production — conçu pour tourner en cron toutes les 5 min.
#
# Vérifie ce qui rend le service réellement vendable : les conteneurs tournent,
# le site et l'API répondent à travers Nginx et TLS, le disque n'est pas plein,
# et le certificat n'est pas sur le point d'expirer.
#
# ⚠️ Les requêtes passent par la pile publique mais NE SORTENT PAS de la
# machine (`--resolve` vers 127.0.0.1). Ce n'est pas un raccourci : sur un VPS
# dont le routeur ne fait pas de hairpin NAT — celui de septembre 2026, par
# exemple — une requête vers sa propre IP publique n'aboutit jamais. Le script
# annonçait alors « Site injoignable » toutes les dix minutes sur un site
# parfaitement en ligne, et une alerte qui se déclenche à tort est pire que
# pas d'alerte du tout.
#
# Contrepartie assumée : ce contrôle prouve que l'application sert
# correctement, pas qu'elle est joignable depuis Internet. Une panne DNS ou un
# blocage de pare-feu en amont lui échapperait — c'est le rôle d'une sonde
# externe, qui reste à mettre en place.
#
# Anti-spam : une alerte n'est envoyée qu'au CHANGEMENT d'état (OK → panne, et
# retour à la normale), plus un rappel quotidien tant que la panne dure. Sans
# cela, une panne nocturne enverrait 288 emails avant le réveil — et un flux
# d'alertes qu'on apprend à ignorer ne vaut pas mieux que pas d'alerte.
#
set -uo pipefail

REPO_DIR="${REPO_DIR:-/opt/fluid-events}"
STATE_FILE="${STATE_FILE:-/var/lib/fluid-events/health.state}"
RAPPEL_SECONDES="${RAPPEL_SECONDES:-86400}"   # rappel quotidien si panne persistante
SEUIL_DISQUE="${SEUIL_DISQUE:-90}"            # %
SEUIL_CERT_JOURS="${SEUIL_CERT_JOURS:-14}"

cd "$REPO_DIR" || exit 1
mkdir -p "$(dirname "$STATE_FILE")"

RESEND_API_KEY=$(grep -E '^RESEND_API_KEY=' .env | cut -d= -f2-)
SMTP_FROM=$(grep -E '^SMTP_FROM=' .env | cut -d= -f2-)
APP_URL=$(grep -E '^APP_URL=' .env | cut -d= -f2-)
API_URL=$(grep -E '^API_URL=' .env | cut -d= -f2-)
ALERT_EMAIL=$(grep -E '^ALERT_EMAIL=' .env | cut -d= -f2-)

PROBLEMES=()

# ── Conteneurs ────────────────────────────────────────────────────────────
for svc in postgres redis minio api web nginx; do
  etat=$(docker inspect -f '{{.State.Status}}' "fluid-events-$svc" 2>/dev/null || echo absent)
  [ "$etat" = "running" ] || PROBLEMES+=("Conteneur $svc : $etat")
done

# ── Le service répond-il, à travers Nginx et TLS ? ────────────────────────
# On garde le nom d'hôte public — donc le bon SNI et le bon en-tête Host, donc
# le bon bloc serveur Nginx — mais on force la connexion sur la boucle locale.
# Voir l'avertissement en tête de fichier.
APP_HOTE="${APP_URL#https://}"; APP_HOTE="${APP_HOTE%%/*}"
API_HOTE="${API_URL#https://}"; API_HOTE="${API_HOTE%%/*}"

# --max-time : sans borne, un serveur qui accepte la connexion sans jamais
# répondre bloquerait le cron indéfiniment et empilerait les exécutions.
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
        --resolve "${APP_HOTE}:443:127.0.0.1" "$APP_URL/health" 2>/dev/null)
[ "$code" = "200" ] || PROBLEMES+=("Site injoignable (HTTP ${code:-timeout})")

# 401 attendu : la route est protégée. Tout autre code (000, 502, 500) signale
# une API réellement en panne, pas une simple protection.
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
        --resolve "${API_HOTE}:443:127.0.0.1" "$API_URL/api/admin/overview" 2>/dev/null)
[ "$code" = "401" ] || PROBLEMES+=("API injoignable (HTTP ${code:-timeout})")

# ── Sauvegarde hors-site ──────────────────────────────────────────────────
# Une sauvegarde qui échoue en silence est pire que pas de sauvegarde : on se
# croit couvert. C'est la seule chose qui distingue les deux, et c'est
# exactement ce qui manquait quand le premier VPS a emporté sa base et ses
# sauvegardes ensemble le 2026-09-10.
#
# Le contrôle ne s'applique QUE si la sauvegarde hors-site est configurée :
# réclamer une sauvegarde que personne n'a demandée transformerait l'alerte en
# bruit de fond.
RESTIC_REPOSITORY=$(grep -E '^RESTIC_REPOSITORY=' .env 2>/dev/null | cut -d= -f2-)
if [ -n "${RESTIC_REPOSITORY:-}" ]; then
  MARQUEUR=/var/lib/fluid-events/dernier-backup-externe
  if [ ! -f "$MARQUEUR" ]; then
    PROBLEMES+=("Sauvegarde hors-site : jamais réussie")
  else
    age=$(( ( $(date +%s) - $(date -r "$MARQUEUR" +%s) ) / 3600 ))
    # 48 h et non 24 : un passage manqué arrive (redémarrage, réseau). Deux,
    # c'est une panne.
    [ "$age" -lt 48 ] || PROBLEMES+=("Sauvegarde hors-site : ${age} h sans succès")
  fi
fi

# ── Disque ────────────────────────────────────────────────────────────────
use=$(df / | awk 'NR==2{gsub("%","",$5); print $5}')
[ "${use:-0}" -lt "$SEUIL_DISQUE" ] || PROBLEMES+=("Disque à ${use}%")

# ── Certificat TLS ────────────────────────────────────────────────────────
# Même raison : on présente le bon SNI à Nginx, en local.
fin=$(echo | timeout 15 openssl s_client -connect "127.0.0.1:443" \
        -servername "$APP_HOTE" 2>/dev/null \
      | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$fin" ]; then
  jours=$(( ( $(date -d "$fin" +%s) - $(date +%s) ) / 86400 ))
  [ "$jours" -gt "$SEUIL_CERT_JOURS" ] || PROBLEMES+=("Certificat expire dans $jours jour(s)")
fi

# ── Sauvegarde récente ────────────────────────────────────────────────────
recente=$(find /var/backups/fluid-events -name '*.sql.gz' -mtime -2 2>/dev/null | wc -l)
[ "$recente" -gt 0 ] || PROBLEMES+=("Aucune sauvegarde depuis plus de 48h")

# ── Décision d'alerte ─────────────────────────────────────────────────────
maintenant=$(date +%s)
etat_precedent=$(cut -d' ' -f1 "$STATE_FILE" 2>/dev/null || echo OK)
derniere_alerte=$(cut -d' ' -f2 "$STATE_FILE" 2>/dev/null || echo 0)

if [ ${#PROBLEMES[@]} -eq 0 ]; then
  etat=OK
  if [ "$etat_precedent" != "OK" ]; then
    sujet="[Fluid Events] Retour à la normale"
    corps="Tous les contrôles repassent au vert."
  fi
else
  etat=PANNE
  if [ "$etat_precedent" = "OK" ] || [ $((maintenant - derniere_alerte)) -ge "$RAPPEL_SECONDES" ]; then
    sujet="[Fluid Events] ${#PROBLEMES[@]} problème(s) détecté(s)"
    corps=$(printf '%s\n' "${PROBLEMES[@]}")
  fi
fi

if [ -n "${sujet:-}" ] && [ -n "$RESEND_API_KEY" ] && [ -n "$ALERT_EMAIL" ]; then
  # `--data` avec jq pour échapper correctement : un message contenant un
  # guillemet casserait un JSON assemblé à la main.
  payload=$(jq -n --arg from "$SMTP_FROM" --arg to "$ALERT_EMAIL" \
                  --arg subject "$sujet" --arg text "$corps" \
                  '{from:$from, to:[$to], subject:$subject, text:$text}')
  curl -s -o /dev/null --max-time 20 -X POST https://api.resend.com/emails \
    -H "Authorization: Bearer $RESEND_API_KEY" \
    -H "Content-Type: application/json" \
    --data "$payload"
  echo "$etat $maintenant" > "$STATE_FILE"
else
  # Conserver l'horodatage de la dernière alerte pour ne pas réinitialiser
  # le compteur de rappel à chaque passage silencieux.
  echo "$etat $derniere_alerte" > "$STATE_FILE"
fi

if [ ${#PROBLEMES[@]} -eq 0 ]; then
  echo "[$(date -Is)] OK"
else
  printf '[%s] PANNE : %s\n' "$(date -Is)" "$(IFS='; '; echo "${PROBLEMES[*]}")"
fi
