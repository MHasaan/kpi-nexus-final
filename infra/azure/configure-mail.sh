#!/usr/bin/env bash
# Send real mail from the Azure VM. The app keeps sending to Mailpit, which
# stores every message (…/mail) and forwards each one to its recipients through
# the server given here — except addresses that cannot receive mail: the demo
# organisation's (@helios.io) and reserved test domains, which would only
# bounce. Run on the VM:
#
#   bash /srv/kpi-nexus/src/infra/azure/configure-mail.sh <mail.env> [--no-restart]
#
# mail.env (mode 600, never in git; provision.sh deletes it once read) has one
# KEY=value a line, values unquoted:
#   MAIL_RELAY_HOST=smtp.gmail.com
#   MAIL_RELAY_PORT=587                         # STARTTLS; the only mode this script sets up
#   MAIL_RELAY_USER=you@example.com
#   MAIL_RELAY_PASSWORD=xxxx xxxx xxxx xxxx     # Gmail: an app password (spaces are dropped)
#   SMTP_FROM=KPI Nexus <you@example.com>       # Gmail sends only as the signed-in account
set -euo pipefail
FILE=${1:?path to mail.env}
RESTART=1; [ "${2:-}" = "--no-restart" ] && RESTART=0
cd /srv/kpi-nexus
# Read, not sourced: a password or a sender with spaces must stay one value.
MAIL_RELAY_HOST=; MAIL_RELAY_PORT=; MAIL_RELAY_USER=; MAIL_RELAY_PASSWORD=; SMTP_FROM=
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in ''|'#'*) continue ;; esac
  key=${line%%=*}; value=${line#*=}
  case "$key" in MAIL_RELAY_HOST|MAIL_RELAY_PORT|MAIL_RELAY_USER|MAIL_RELAY_PASSWORD|SMTP_FROM) printf -v "$key" '%s' "$value" ;; esac
done < "$FILE"
: "${MAIL_RELAY_HOST:?MAIL_RELAY_HOST}" "${MAIL_RELAY_USER:?MAIL_RELAY_USER}" "${MAIL_RELAY_PASSWORD:?MAIL_RELAY_PASSWORD}" "${SMTP_FROM:?SMTP_FROM}"
PORT=${MAIL_RELAY_PORT:-587}
PASS=${MAIL_RELAY_PASSWORD// /}
yq() { printf "'%s'" "${1//\'/\'\'}"; } # a single-quoted YAML string

umask 077
cat > mailpit-relay.yml <<EOF
# Written by infra/azure/configure-mail.sh: Mailpit forwards every message it receives through this server.
host: $(yq "$MAIL_RELAY_HOST")
port: $PORT
starttls: true
auth: plain
username: $(yq "$MAIL_RELAY_USER")
password: $(yq "$PASS")
return-path: $(yq "$MAIL_RELAY_USER")
# Addresses that cannot receive mail: the demo organisation's and reserved test domains.
blocked-recipients: '@helios\.io$|\.(local|test|invalid|localhost|example)$|@example\.(com|org|net)$'
EOF
umask 022

setvar() { # file key value: replace the line or add it
  local v=${3//\\/\\\\}; v=${v//&/\\&}; v=${v//|/\\|}
  if grep -q "^$2=" "$1"; then sed -i "s|^$2=.*|$2=$v|" "$1"; else printf '%s=%s\n' "$2" "$3" >> "$1"; fi
}
setvar .env MAIL_RELAY_CONFIG /etc/mailpit/relay.yml
setvar .env MAIL_RELAY_ALL true
setvar app.env SMTP_FROM "$SMTP_FROM"

echo "mail: forwarding through $MAIL_RELAY_HOST:$PORT as $MAIL_RELAY_USER; the app sends as \"$SMTP_FROM\""
if [ "$RESTART" = 1 ]; then
  if docker info >/dev/null 2>&1; then D=docker; else D="sudo docker"; fi
  $D compose up -d mailpit
  $D compose restart api worker
  echo "mail: Mailpit, the API and the worker restarted"
fi
