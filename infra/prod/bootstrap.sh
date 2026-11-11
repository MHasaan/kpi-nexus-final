#!/usr/bin/env bash
# One-time setup of the Oracle Cloud Always Free VM (ADR-001). Safe to run
# again. Run as root on Ubuntu 24.04 (Ampere A1), from a copy of this file:
#
#   sudo DEPLOY_PUBKEY="ssh-ed25519 AAAA... kpi-nexus-deploy" \
#        DUCKDNS_DOMAIN=kpinexus-api DUCKDNS_TOKEN=<token> ./bootstrap.sh
#
# It installs Docker, creates the `deploy` user that GitHub Actions logs in as,
# turns off SSH passwords, keeps the DuckDNS name pointed at this VM, and
# schedules the nightly backup. docs/deploy.md has the steps around it.
#
# Firewall: Oracle's Ubuntu images ship iptables rules that Oracle says must
# stay (they carry the boot volume and metadata traffic), so this script
# doesn't add ufw. Caddy's 80/443 are published by Docker, whose own rules
# accept them; the VCN security list (docs/deploy.md) is the firewall that
# decides what reaches the VM.
set -euo pipefail

STACK_DIR=/srv/kpi-nexus
DEPLOY_USER=deploy

log() { printf '\n==> %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }
: "${DEPLOY_PUBKEY:?set DEPLOY_PUBKEY to the public half of the deploy key}"
: "${DUCKDNS_DOMAIN:?set DUCKDNS_DOMAIN (the name before .duckdns.org)}"
: "${DUCKDNS_TOKEN:?set DUCKDNS_TOKEN}"
case "$DEPLOY_PUBKEY" in
  ssh-ed25519\ * | ssh-rsa\ * | ecdsa-sha2-*) ;;
  *) echo "DEPLOY_PUBKEY does not look like an SSH public key" >&2; exit 1 ;;
esac
if [ "$(uname -m)" != aarch64 ]; then
  echo "warning: expected an Ampere A1 (aarch64) VM, this is $(uname -m)" >&2
fi

export DEBIAN_FRONTEND=noninteractive

log "Packages"
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg cron openssl unattended-upgrades

log "Docker (from Docker's apt repository)"
install -d -m 755 /etc/apt/keyrings
if [ ! -s /etc/apt/keyrings/docker.asc ]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod 644 /etc/apt/keyrings/docker.asc
fi
# shellcheck disable=SC1091
codename="$(. /etc/os-release && echo "$VERSION_CODENAME")"
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $codename stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -q
apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker

log "Automatic security updates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

log "User '$DEPLOY_USER' (GitHub Actions logs in as this user)"
id "$DEPLOY_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$DEPLOY_USER"
# Membership of the docker group is root-equivalent on this VM; the only way
# in is the deploy key, which lives in GitHub's secrets.
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
# `restrict`: no port, agent or X11 forwarding and no pty; commands and scp still work.
printf 'restrict %s\n' "$DEPLOY_PUBKEY" > "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"

log "SSH: keys only"
cat > /etc/ssh/sshd_config.d/90-kpi-nexus.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sshd -t
systemctl reload ssh

log "Stack directory $STACK_DIR"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$STACK_DIR"
for f in .env app.env; do
  if [ -f "$STACK_DIR/$f" ]; then
    chown "$DEPLOY_USER:$DEPLOY_USER" "$STACK_DIR/$f"
    chmod 600 "$STACK_DIR/$f"
  fi
done

log "DuckDNS: keep $DUCKDNS_DOMAIN.duckdns.org pointed at this VM"
install -d -m 700 /etc/kpi-nexus
# A curl config file keeps the token out of the process list and cron.
umask 077
printf 'url = "https://www.duckdns.org/update?domains=%s&token=%s&ip="\n' "$DUCKDNS_DOMAIN" "$DUCKDNS_TOKEN" \
  > /etc/kpi-nexus/duckdns.curl
umask 022
cat > /usr/local/bin/kpi-nexus-duckdns <<'EOF'
#!/bin/sh
# Called by cron every 5 minutes; DuckDNS answers OK or KO.
curl -fsS --max-time 20 -K /etc/kpi-nexus/duckdns.curl
EOF
chmod 755 /usr/local/bin/kpi-nexus-duckdns

log "Scheduled jobs"
touch /var/log/kpi-nexus-backup.log /var/log/kpi-nexus-duckdns.log
chown "$DEPLOY_USER:$DEPLOY_USER" /var/log/kpi-nexus-backup.log
cat > /etc/cron.d/kpi-nexus <<EOF
# KPI Nexus (infra/prod/bootstrap.sh)
*/5 * * * * root /usr/local/bin/kpi-nexus-duckdns >> /var/log/kpi-nexus-duckdns.log 2>&1
30 3 * * * $DEPLOY_USER cd $STACK_DIR && [ -x ./backup.sh ] && ./backup.sh >> /var/log/kpi-nexus-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/kpi-nexus
cat > /etc/logrotate.d/kpi-nexus <<'EOF'
/var/log/kpi-nexus-*.log {
	weekly
	rotate 8
	compress
	missingok
	notifempty
	copytruncate
}
EOF
/usr/local/bin/kpi-nexus-duckdns >> /var/log/kpi-nexus-duckdns.log 2>&1 || echo "warning: DuckDNS update failed; check the token" >&2

log "Done"
cat <<EOF
Next (docs/deploy.md):
  1. As $DEPLOY_USER, create $STACK_DIR/.env and $STACK_DIR/app.env from the
     templates in infra/prod/ and fill them in (chmod 600).
  2. Add the GitHub secrets, including DEPLOY_KNOWN_HOSTS from:
       ssh-keyscan -t ed25519 $DUCKDNS_DOMAIN.duckdns.org
  3. Run the Deploy workflow, or merge to main.
EOF
