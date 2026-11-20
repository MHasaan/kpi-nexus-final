#!/usr/bin/env bash
# One-shot setup of a fresh KPI Nexus Azure VM (Ubuntu 24.04): swap, Docker,
# the repository, fresh random secrets, every image, the database release, the
# whole stack and the Helios demo organisation. About 25 minutes. On the VM:
#
#   mkdir -p ~/setup && cd ~/setup       # put provision.sh here, and optionally:
#   #  ai.env    lines for app.env: GEMINI_API_KEYS=…, AI_PROVIDER_ORDER=…,
#   #            AI_DAILY_BUDGET_USD=…, AI_MONTHLY_BUDGET_USD=…
#   #  mail.env  real outgoing mail; see configure-mail.sh for its lines
#   nohup bash provision.sh <app-domain> <public-ip> [ref] > provision.log 2>&1 &
#
# ai.env and mail.env are deleted once read. Running the script again keeps the
# secrets, the data and the demo organisation, and only brings the code to ref.
set -euo pipefail
DOMAIN=${1:?app domain, e.g. kpinexus-demo.austriaeast.cloudapp.azure.com}
IP=${2:?the public IP of the VM}
REF=${3:-origin/main}
S3_DOMAIN="s3.${IP//./-}.sslip.io"
HERE=$(cd "$(dirname "$0")" && pwd)
log() { echo "[$(date +%T)] $*"; }

log "swap and packages"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null
fi
sudo apt-get update -q >/dev/null
sudo apt-get install -y -q ca-certificates curl gnupg git openssl >/dev/null
if ! command -v docker >/dev/null; then
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc && sudo chmod 644 /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release; echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -q >/dev/null
  sudo apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-buildx-plugin >/dev/null
  sudo systemctl enable --now docker
fi
sudo usermod -aG docker "$USER" # applies at the next login; until then, sudo docker

log "repository"
sudo mkdir -p /srv/kpi-nexus && sudo chown "$USER:$USER" /srv/kpi-nexus
cd /srv/kpi-nexus
[ -d src ] || git clone -q https://github.com/MHasaan/kpi-nexus-final.git src
git -C src fetch -q --tags origin
git -C src checkout -q --detach "$REF"

FIRST=0
if [ ! -e .env ]; then
  FIRST=1
  log "secrets"
  r() { openssl rand -hex 32; }
  S3_KEY=$(openssl rand -hex 12); S3_SECRET=$(r); MAIL_PASS=$(openssl rand -hex 10)
  MAIL_HASH=$(sudo docker run --rm caddy:2.11.9-alpine caddy hash-password --plaintext "$MAIL_PASS")
  umask 077
  cat > .env <<EOF
REGISTRY=local
IMAGE_TAG=demo
DB_IMAGE_TAG=demo
API_DOMAIN=$DOMAIN
S3_DOMAIN=$S3_DOMAIN
POSTGRES_PASSWORD=$(r)
KPI_OWNER_DB_PASSWORD=$(r)
KPI_APP_DB_PASSWORD=$(r)
KPI_SYSTEM_DB_PASSWORD=$(r)
REDIS_PASSWORD=$(r)
ML_SIDECAR_HMAC_SECRET=$(r)
MAIL_USER=admin
MAIL_HASH='$MAIL_HASH'
MAIL_RELAY_CONFIG=
MAIL_RELAY_ALL=false
EOF
  cat > app.env <<EOF
JWT_SECRET=$(r)
ONBOARDING_DRAFT_SECRET=$(r)
NOTIFICATION_ENCRYPTION_KEY=$(r)
EMBED_TOKEN_SECRET=$(r)
BYO_ENCRYPTION_KEY=$(r)
INTEGRATION_CRYPTO_KEY=$(r)
WEB_APP_URL=https://$DOMAIN
CORS_ALLOWED_ORIGINS=https://$DOMAIN
S3_ENDPOINT=https://$S3_DOMAIN
S3_REGION=us-east-1
S3_BUCKET=kpi-nexus-files
S3_ACCESS_KEY=$S3_KEY
S3_SECRET_KEY=$S3_SECRET
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_FROM=KPI Nexus <noreply@$DOMAIN>
EOF
  cp src/infra/azure/mailpit-relay.example.yml mailpit-relay.yml
  echo "{\"identities\":[{\"name\":\"kpi-nexus\",\"credentials\":[{\"accessKey\":\"$S3_KEY\",\"secretKey\":\"$S3_SECRET\"}],\"actions\":[\"Admin\",\"Read\",\"Write\",\"List\",\"Tagging\"]}]}" > seaweedfs-s3.json
  chmod 644 seaweedfs-s3.json
  echo "$MAIL_PASS" > mail-password.txt
  umask 022
fi
if [ -s "$HERE/ai.env" ]; then
  if ! grep -q '^GEMINI_API_KEYS=' app.env; then printf '\n# AI\n' >> app.env; cat "$HERE/ai.env" >> app.env; fi
  rm -f "$HERE/ai.env"
fi
if [ -s "$HERE/mail.env" ]; then
  bash src/infra/azure/configure-mail.sh "$HERE/mail.env" --no-restart
  rm -f "$HERE/mail.env"
fi

log "images, database release, stack"
bash src/infra/azure/update.sh "$REF"

if [ "$FIRST" = 1 ]; then
  log "Helios demo organisation (as kpi_system: FORCE row-level security blocks the owner role)"
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
  sudo docker compose --profile tools run --rm \
    -e DATABASE_URL="postgresql://kpi_system:${KPI_SYSTEM_DB_PASSWORD}@postgres:5432/kpi_nexus" \
    -w /repo/packages/db tools node_modules/.bin/tsx prisma/seed.ts | tail -8
fi
log "PROVISION DONE: https://$DOMAIN — mail inbox https://$DOMAIN/mail (user admin, password in /srv/kpi-nexus/mail-password.txt)"
