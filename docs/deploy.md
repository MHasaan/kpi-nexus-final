# Deploying KPI Nexus for free

Production runs at $0 with nothing that expires ([ADR-001](adrs/ADR-001-free-tier-hosting.md)):

| Piece | Where |
|---|---|
| Web app | Vercel Hobby |
| API, worker, ML, Postgres, Redis, Caddy | One Oracle Cloud Always Free ARM VM, Docker Compose in `/srv/kpi-nexus` (`infra/prod/`) |
| HTTPS name for the API | DuckDNS (`<name>.duckdns.org`), certificate from Caddy |
| Uploaded files and database backups | Oracle Object Storage |
| Email | Brevo |
| Container images | GitHub Container Registry |

After the one-time setup below, every merge to `main` deploys itself: CI and Security pass → arm64 images are built → `deploy.sh` runs on the VM → `/health` must report the new commit, or the previous one is started again.

## Never charged: the rules

This is a student project, so nothing may be able to bill you.

- **Oracle stays on the Free Tier. Never click "Upgrade" / "Upgrade to Pay As You Go".** Oracle: "Your credit card will not be charged unless you upgrade your account." The card is only for identity verification.
- **Ignore the $300 trial credit.** Anything created with it that is over the Always Free limits is disabled and deleted when the 30-day trial ends.
- **Create only resources labelled "Always Free-eligible", all in your home region** (picked at sign-up, can't be changed; Always Free only applies there):
  - one `VM.Standard.A1.Flex` instance, **2 OCPU and 12 GB** in total;
  - boot plus block volumes **200 GB** in total (this setup uses one boot volume of 100 GB or less);
  - Object Storage **20 GB** in total (backups are pruned after 14 days and are a few MB each);
  - one VCN, the instance's public IP; **no** load balancer, NAT gateway or database service.
- **Vercel, DuckDNS, Brevo and Sentry:** sign up without adding a card. At their limits they stop or throttle, they don't bill.
- **GitHub:** the repository is public, so Actions and public packages are free.

The deploy never creates cloud resources; only you do, in the Oracle console.

**The one accepted risk:** Oracle "may reclaim" an Always Free VM that is idle for 7 days (CPU, network and memory all under 20%). Upgrading would prevent that but would allow charges, so instead you recover from the nightly backup (see *If the VM is lost*).

## One-time setup

You need: a computer with `ssh` and `openssl`, this repository, and about an hour. Steps 1–4 are in web consoles; the rest is commands.

### 1. Oracle account and network

1. Sign up at oracle.com/cloud/free. Choose a **home region** close to your users; if the ARM shape is often unavailable there you'll see it in step 2, but the region can't be changed later.
2. **Networking → Virtual Cloud Networks → Start VCN Wizard → "Create VCN with Internet Connectivity"** (defaults are fine).
3. In the new VCN: **Security Lists → Default Security List → Add Ingress Rules**, source `0.0.0.0/0`, TCP:
   - port **80** (Let's Encrypt and the redirect to HTTPS);
   - port **443** (the API);
   - port **22** is already there. Narrow its source to your own IP if you can, but GitHub Actions also needs it for deploys, so leaving `0.0.0.0/0` is the simple option (passwords are off; only keys work).

### 2. The VM

**Compute → Instances → Create instance:**
- **Image:** Canonical Ubuntu 24.04 (the aarch64 build is chosen automatically for Ampere).
- **Shape:** Ampere → `VM.Standard.A1.Flex`, **2 OCPUs, 12 GB memory**. Check for the **Always Free-eligible** label.
- **Networking:** the VCN from step 1, public subnet, **assign a public IPv4 address**.
- **SSH keys:** upload your own public key (for you, user `ubuntu`).
- **Boot volume:** default size (or up to 100 GB). Leave "use in-transit encryption" as is.

"Out of host capacity" means no free ARM machines right now: try another availability domain, or try again later. It only affects creation.

### 3. DuckDNS name

Sign in at duckdns.org (GitHub login works), add a sub domain such as `kpinexus-api`, and copy your **token**. The bootstrap keeps the name pointed at the VM.

### 4. Brevo (email)

Sign up at brevo.com (free plan, no card), add and verify the sender address you'll use, then **SMTP & API → SMTP → Generate a new SMTP key**. Note the SMTP login and key.

### 5. Deploy key (on your computer)

```bash
ssh-keygen -t ed25519 -N "" -C kpi-nexus-deploy -f ~/.ssh/kpi-nexus-deploy
```

The private half goes to GitHub (step 9), the public half to the VM (step 6).

### 6. Bootstrap the VM

```bash
scp infra/prod/bootstrap.sh ubuntu@<vm-public-ip>:
ssh ubuntu@<vm-public-ip>
sudo DEPLOY_PUBKEY="$(cat <<'EOF'
<paste ~/.ssh/kpi-nexus-deploy.pub here>
EOF
)" DUCKDNS_DOMAIN=kpinexus-api DUCKDNS_TOKEN=<token> bash ./bootstrap.sh
```

It installs Docker, creates the `deploy` user (deploy key only), turns off SSH passwords, sets up the DuckDNS updater, schedules the 03:30 backup and enables automatic security updates. It is safe to run again.

Check the name resolves to the VM: `getent hosts kpinexus-api.duckdns.org`.

### 7. Object Storage

1. **Storage → Buckets → Create bucket** twice, both Standard tier, private:
   - `kpi-nexus-files` (reports and uploads);
   - `kpi-nexus-backups` (database dumps).
2. **Profile → Customer secret keys → Generate secret key** (the S3-compatible key; Oracle shows the secret once).
3. Your **namespace** is on the bucket page. The S3 endpoint is
   `https://<namespace>.compat.objectstorage.<region>.oraclecloud.com`, and the region is your home region identifier (e.g. `eu-frankfurt-1`).

### 8. Settings on the VM

As the `deploy` user, create the two settings files from the templates in `infra/prod/` and fill them in:

```bash
sudo -iu deploy
cd /srv/kpi-nexus
nano .env       # contents of infra/prod/.env.example
nano app.env    # contents of infra/prod/app.env.example
chmod 600 .env app.env
```

- Generate every secret with `openssl rand -hex 32` (the templates have a loop for each file). Hex only: the values go into connection URLs.
- `.env`: `API_DOMAIN=kpinexus-api.duckdns.org`; the `BACKUP_S3_*` lines use the endpoint, region and key from step 7 with `BACKUP_S3_BUCKET=kpi-nexus-backups`. Leave `IMAGE_TAG` and `DB_IMAGE_TAG` empty; the deploy sets them.
- `app.env`: `S3_*` the same, with `S3_BUCKET=kpi-nexus-files`; the Brevo login and key as `SMTP_USER` / `SMTP_PASS`; `SMTP_FROM` with the verified sender; `WEB_APP_URL` and `CORS_ALLOWED_ORIGINS` set to your Vercel URL (step 11; `https://<project>.vercel.app`). Optional: `GEMINI_API_KEYS`, `SENTRY_DSN`.
- **Copy `BACKUP_PASSPHRASE` into your password manager.** Without it, the backups can't be decrypted.

### 9. GitHub secrets

**Repository → Settings → Secrets and variables → Actions → New repository secret:**

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | `kpinexus-api.duckdns.org` |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | the whole of `~/.ssh/kpi-nexus-deploy` (the private key) |
| `DEPLOY_KNOWN_HOSTS` | the output of `ssh-keyscan -t ed25519 kpinexus-api.duckdns.org` |

Check `DEPLOY_KNOWN_HOSTS` really is your VM: on the VM, `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` must print the same fingerprint as `ssh-keyscan -t ed25519 kpinexus-api.duckdns.org | ssh-keygen -lf -` on your computer.

Until all four exist, the Deploy workflow only builds images and pushes nothing.

### 10. First deploy

1. **Actions → Deploy → Run workflow** with the latest commit SHA of `main` (`git rev-parse origin/main`).
2. The images are pushed to GHCR, but new packages start **private**, so this first run fails at the pull on the VM. Open your GitHub profile → **Packages**, and for each of `kpi-nexus-api`, `kpi-nexus-ml` and `kpi-nexus-db`: **Package settings → Change visibility → Public**. (Public packages are free; the code is public anyway.)
3. Run the workflow again with the same SHA. It reuses the pushed images, releases the database, starts everything and checks `https://kpinexus-api.duckdns.org/health`.

From now on, every merge to `main` deploys itself.

### 11. Web app on Vercel

1. vercel.com → sign up with GitHub (Hobby, no card) → **Add New → Project →** import this repository.
2. **Root Directory:** `apps/web`. `apps/web/vercel.json` supplies the framework, install and build commands.
3. **Environment variable:** `NEXT_PUBLIC_API_URL=https://kpinexus-api.duckdns.org` (Production). It is fixed at build time; redeploy after changing it.
4. Deploy. If the final URL differs from what you put in `app.env` (step 8), fix `WEB_APP_URL` and `CORS_ALLOWED_ORIGINS` there and run `docker compose up -d` in `/srv/kpi-nexus`.

Vercel then deploys `main` on every push and builds a preview for each pull request. It doesn't wait for the API deploy, so an API change must keep working with the previous web build (and the reverse) for one deploy.

### 12. Check it

- `curl https://kpinexus-api.duckdns.org/health` returns `{"db":"ok","redis":"ok","version":"<the deployed SHA>"}`.
- On the Vercel URL: register an organisation, record a KPI value, invite a user and check the email arrives.
- On the VM as `deploy`, in `/srv/kpi-nexus`:
  - `./backup.sh`, then `./restore.sh drill` — the drill restores the newest backup into a throwaway container and prints row counts;
  - `docker compose ps` shows every service running (`healthy` where it has a check).

## Day to day

| Task | How |
|---|---|
| Deploy | Merge to `main`. |
| Roll back | **Actions → Deploy → Run workflow** with an earlier SHA from `main`. A failed health check also rolls back by itself. |
| Logs | `ssh deploy@<host>`, `cd /srv/kpi-nexus`, `docker compose logs -f api` (or `worker`, `caddy`, …). |
| Change a setting | Edit `.env` / `app.env`, then `docker compose up -d`. |
| Backups | Nightly at 03:30 UTC, 14 days kept; log in `/var/log/kpi-nexus-backup.log`. Run a `./restore.sh drill` now and then. |
| Disk | `df -h /` and `docker system df`. Each deploy prunes images unused for a week. |

## If the VM is lost

If Oracle reclaims the VM, or it breaks, rebuild it from the backups (nothing else on it is unique):

1. Steps 2, 6 and 8 again (new VM, bootstrap, the same `.env` and `app.env` values; keep `BACKUP_PASSPHRASE` and the database passwords the same).
2. Update `DEPLOY_KNOWN_HOSTS` (the new VM has a new host key; step 9).
3. Start only the database, with the image tag the last deploy used (the Deploy run's log shows it; `IMAGE_TAG` can be that SHA):
   ```bash
   cd /srv/kpi-nexus
   IMAGE_TAG=<sha> DB_IMAGE_TAG=<db tag> docker compose up -d postgres
   ```
   Copy `docker-compose.yml`, `Caddyfile` and the `*.sh` files from `infra/prod/` first if the deploy hasn't put them there yet.
4. Restore the newest backup into it:
   ```bash
   ./restore.sh fetch latest /tmp/kpi.dump
   docker compose cp /tmp/kpi.dump postgres:/tmp/kpi.dump
   docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d kpi_nexus -c 'SELECT timescaledb_pre_restore();'
   docker compose exec -T postgres sh -c "pg_restore -l /tmp/kpi.dump | grep -v ' EXTENSION ' > /tmp/kpi.list"
   docker compose exec -T postgres pg_restore -U postgres -d kpi_nexus --exit-on-error -L /tmp/kpi.list /tmp/kpi.dump
   docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d kpi_nexus -c 'SELECT timescaledb_post_restore();'
   rm /tmp/kpi.dump
   ```
   These are the same steps `./restore.sh drill` rehearses.
5. **Actions → Deploy → Run workflow** with the last good SHA.

## Local rehearsal

`infra/prod/rehearsal.override.yml` runs this exact stack on your machine with stand-ins (SeaweedFS for Object Storage, MailHog for Brevo, Caddy's own certificate authority). The steps are at the top of that file, including running `deploy.sh`, `backup.sh` and `restore.sh drill` against it.
