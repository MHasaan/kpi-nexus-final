# KPI Nexus on an Azure VM

Where the app runs today ([ADR-004](../../docs/adrs/ADR-004-azure-interim-hosting.md)): one Azure for Students virtual machine carries everything — the web app, the API, the worker, the ML sidecar, Postgres, Redis, an S3 store (SeaweedFS), a mail catcher that forwards real mail (Mailpit), and Caddy for HTTPS. The free-forever plan in [docs/deploy.md](../../docs/deploy.md) (one Oracle Always Free VM plus Vercel) stands; it waits for Oracle to have A1 capacity.

| | |
|---|---|
| App | https://kpinexus-demo.austriaeast.cloudapp.azure.com |
| API | https://kpinexus-demo.austriaeast.cloudapp.azure.com/api — the `/api` prefix is stripped; `/api/health` names the commit that runs |
| Mail inbox | https://kpinexus-demo.austriaeast.cloudapp.azure.com/mail — user `admin`, password in `/srv/kpi-nexus/mail-password.txt` on the VM |
| S3 store | https://s3.68-210-149-147.sslip.io (presigned report links point here) |
| VM | `kpi-nexus-demo` in resource group `kpi-nexus-austria-rg`, Austria East; `Standard_B2as_v2` (2 vCPU, 8 GB), Ubuntu 24.04, 64 GB disk, static IP 68.210.149.147, ports 22/80/443 open, auto-shutdown off |
| Sign in | `ssh -i ~/.ssh/kpi-nexus-oracle ubuntu@68.210.149.147` — the key is in the owner's private handoff folder, never in git |

Demo data: the Helios organisation from `packages/db/prisma/seed.ts` (sign in as `admin@helios.io`; the demo password is in the seed).

## What is on the VM

```
/srv/kpi-nexus/
├── src/                          the repository, detached at the deployed commit
├── docker-compose.yml            copy of src/infra/prod/docker-compose.yml
├── docker-compose.override.yml   copy of infra/azure/docker-compose.override.yml (Compose loads it by itself)
├── Caddyfile                     copy of infra/azure/Caddyfile
├── web.Dockerfile                copy of infra/azure/web.Dockerfile
├── .env                          compose variables and secrets (shape: env.example), mode 600
├── app.env                       API and worker settings: app secrets, S3, SMTP, AI keys (shape: ../prod/app.env.example), mode 600
├── mailpit-relay.yml             the real mail server Mailpit forwards through (configure-mail.sh), mode 600
├── seaweedfs-s3.json             the S3 store's credentials
├── mail-password.txt             the /mail password
├── ci-deploy.sh                  copy of infra/azure/ci-deploy.sh: what GitHub's deploy key may run
├── update.log                    the last update's log
└── current-sha                   the commit the site runs
```

`update.sh` refreshes the copies on every update, so the repository stays the source of truth and the VM holds only its own secrets. Those exist on the VM and in the owner's private handoff folder, nowhere in git.

## Every day

```bash
cd /srv/kpi-nexus
sudo docker compose ps                     # the nine services
sudo docker compose logs -f api            # api | worker | web | ml | caddy | postgres | redis | s3 | mailpit
sudo docker compose restart api worker
sudo docker compose exec postgres psql -U postgres -d kpi_nexus
```

(`sudo` is needed until you log out and in once after provisioning, when the `docker` group applies.)

**Stop and start the VM** in the Azure portal: Virtual machines → `kpi-nexus-demo` → Stop (deallocates it; compute stops costing) or Start. One or two minutes after a start everything is back by itself; the IP and the name stay the same. Running all the time costs about $63 a month against the $100 Azure for Students credit; stopped, about $9 a month for the disk and the IP. The account has no card, so nothing can charge beyond the credit: when it is used up, the VM stops.

## Updates

**Every merge to `main` deploys itself.** Once CI and Security pass on the merge commit, the Deploy workflow (`.github/workflows/deploy.yml`, job `azure`) runs one SSH command on the VM, `ci-deploy.sh <commit>`, and then checks that `/api/health` answers with that commit. `ci-deploy.sh` accepts a full commit SHA that is on `main` and nothing else, fetches it and runs its `update.sh`, which:

1. copies the compose files, Caddyfile, web Dockerfile and `ci-deploy.sh` from the checkout;
2. rebuilds the images on the VM (about 15 minutes; the ML and database images only when their sources changed);
3. runs the database release — Prisma migrations, which only add, then the SQL files;
4. starts the new containers (the site is unavailable for the last minute or so) and waits until `/api/health` answers with the new commit.

**Nothing in this touches the data.** Postgres, Redis, the S3 store and Caddy's certificates live in named Docker volumes (`kpi-nexus_pgdata`, `_redisdata`, `_s3data`, `_caddy_data`, `_caddy_config`); an update replaces containers and images, never volumes. The secrets stay in `/srv/kpi-nexus/*.env`, which the repository never holds.

The run's log is in the GitHub Actions run and in `/srv/kpi-nexus/update.log`. To deploy an older commit (a rollback): Actions → Deploy → Run workflow, with the full SHA. The same by hand, on the VM:

```bash
bash /srv/kpi-nexus/src/infra/azure/update.sh            # origin/main
bash /srv/kpi-nexus/src/infra/azure/update.sh v1.1.0     # a tag, or a commit
```

Over a connection that may drop, run it in the background: `nohup bash … > update.log 2>&1 &`.

### Setting the automatic deploy up (once per VM)

The workflow needs a key that can only run `ci-deploy.sh`, and four repository secrets. The private key exists in GitHub's secret store and the owner's private handoff folder, nowhere else.

```bash
ssh-keygen -t ed25519 -N '' -C kpi-nexus-azure-deploy -f ~/.ssh/kpi-nexus-azure-deploy
# On the VM, as ubuntu: the key may run one command and nothing else (no shell, no forwarding, no pty).
scp -i ~/.ssh/kpi-nexus-oracle src/infra/azure/ci-deploy.sh ubuntu@68.210.149.147:/srv/kpi-nexus/ci-deploy.sh   # the first copy; update.sh refreshes it
ssh -i ~/.ssh/kpi-nexus-oracle ubuntu@68.210.149.147 \
  "chmod 755 /srv/kpi-nexus/ci-deploy.sh && echo 'command=\"/srv/kpi-nexus/ci-deploy.sh\",restrict $(cat ~/.ssh/kpi-nexus-azure-deploy.pub)' >> ~/.ssh/authorized_keys"
```

Repository → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `AZURE_DEPLOY_HOST` | `kpinexus-demo.austriaeast.cloudapp.azure.com` (also where `/api/health` is checked) |
| `AZURE_DEPLOY_USER` | `ubuntu` |
| `AZURE_DEPLOY_SSH_KEY` | the whole of `~/.ssh/kpi-nexus-azure-deploy` (the private key) |
| `AZURE_DEPLOY_KNOWN_HOSTS` | the output of `ssh-keyscan -t ed25519 kpinexus-demo.austriaeast.cloudapp.azure.com` |

Check `AZURE_DEPLOY_KNOWN_HOSTS` really is the VM: on the VM, `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` prints the same fingerprint as `ssh-keyscan -t ed25519 kpinexus-demo.austriaeast.cloudapp.azure.com | ssh-keygen -lf -` on your computer. Until all four secrets exist, the workflow deploys nothing to this VM and says so in its log. To stop deploys to the VM (for instance when it is decommissioned), delete the secrets and the key's line in `~/.ssh/authorized_keys`.

## Outgoing mail

The app sends every message to Mailpit (`SMTP_HOST=mailpit` in `app.env`), which keeps a copy you can read at `/mail`. Mailpit forwards each message to its recipients through a real SMTP server (`mailpit-relay.yml`) — except addresses that cannot receive mail, the demo organisation's `@helios.io` people and reserved test domains, so the demo's scheduled reports and digests never bounce off a real mail service. Set it up or change it with a `mail.env` and `configure-mail.sh` (its header lists the lines). Today: a Gmail account on port 587 with an app password; the app sends as that account, since Gmail allows no other sender.

## AI

`app.env` holds `GEMINI_API_KEYS` (several free keys, used in turn), `AI_PROVIDER_ORDER` and the daily and monthly budgets. Google does not serve Gemini from Hong Kong (Azure's East Asia); Austria East works.

## A new VM from nothing

1. In the Azure portal create an Ubuntu Server 24.04 VM: `Standard_B2as_v2` (or any 2 vCPU / 8 GB size the subscription allows), security type *Standard*, user `ubuntu` with the SSH public key, ports 22/80/443, a static public IP with a DNS label. Switch auto-shutdown off if the VM must stay up.
2. On the VM: `mkdir -p ~/setup`, copy `provision.sh` there, plus `ai.env` (the AI lines for `app.env`) and `mail.env` (see `configure-mail.sh`) if you have them.
3. `cd ~/setup && nohup bash provision.sh <dns-name> <public-ip> > provision.log 2>&1 &`
4. About 25 minutes later `provision.log` ends with `PROVISION DONE`. The secrets it made are in `/srv/kpi-nexus/.env` and `app.env`; copy them somewhere private.

## If something is wrong

- `sudo docker compose ps` shows what is down; `sudo docker compose logs --since 10m <service>` says why.
- Disk: `df -h /` and `sudo docker system df`; `sudo docker builder prune -af` frees the build cache (the next update then takes longer).
- Memory: `free -h`; the VM has 8 GB and a 4 GB swap file.
- Certificates: Caddy fetches and renews them; ports 80 and 443 must stay open, and the DNS label must point at the VM.
