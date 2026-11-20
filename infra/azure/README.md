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

## Update to new code

```bash
bash /srv/kpi-nexus/src/infra/azure/update.sh            # origin/main
bash /srv/kpi-nexus/src/infra/azure/update.sh v1.1.0     # a tag, or a commit
```

It fetches the commit, rebuilds the images on the VM (about 15 minutes; the ML and database images only when their sources changed), runs the database release, starts the new containers and waits until `/api/health` answers with the new commit. The site is unavailable for the last minute or so. Over a connection that may drop, run it in the background: `nohup bash … > update.log 2>&1 &`. Nothing deploys to this VM from GitHub; every update is this command.

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
