# ADR-004: Interim hosting on an Azure for Students VM

- **Status:** Accepted (2026-11-21) on the owner's instruction: the Oracle Always Free VM could not be created, so the owner set the project up on Azure.
- **Relation to ADR-001:** does not replace it. The free-forever plan (Vercel plus one Oracle Always Free VM) stays the production target; this is where the app runs until that VM exists.
- **Files:** `infra/azure/` (compose overlay, Caddyfile, web Dockerfile, scripts, README).

## Context

On 2026-11-20 the Oracle Always Free `VM.Standard.A1.Flex` could not be created in the account's home region (Abu Dhabi): "Out of host capacity", at 2 OCPU / 12 GB and at 1 OCPU / 6 GB alike. A retry job has been asking since. The project needed a live, reachable install now, for testing with real people and for the demonstration.

The owner has an **Azure for Students** subscription: about $100 of credit for a year, renewable while a student, with no card on the account. Its policy allows five regions. UAE North offered no VM size to the subscription. East Asia (Hong Kong) worked, but Google does not serve the Gemini API there (nor do OpenAI or Anthropic), so every AI feature failed. **Austria East** works for everything; it offers students no ARM sizes, so the VM is x64.

## Decision

One VM carries the whole product: the production compose file from `infra/prod/`, plus an overlay in `infra/azure/` for what Vercel, Oracle Object Storage and Brevo would otherwise provide.

| Piece | On the VM |
|---|---|
| Web app | Built on the VM into an image (`web.Dockerfile`) and served by Caddy at the root of the one HTTPS name; the API answers under `/api` |
| API, worker, ML sidecar, Postgres, Redis, Caddy | As in `infra/prod/docker-compose.yml`, with Postgres limited to 2 GB on the 8 GB VM |
| Files (report downloads) | SeaweedFS, S3-compatible, on a second HTTPS name made from the IP by sslip.io |
| Email | Mailpit catches every message (readable at `/mail`) and forwards each one through a real SMTP server, today a Gmail account, except to addresses that cannot receive mail: the demo organisation's and reserved test domains |
| Images | Built on the VM (`local/*:demo`). GHCR holds nothing yet |
| Updates | Every merge to `main`: the Deploy workflow runs `ci-deploy.sh <commit>` on the VM over SSH, which runs `update.sh` (fetch, rebuild, database release, start, check `/api/health`); the same script by hand for a rollback or a branch |

VM: `Standard_B2as_v2` (2 vCPU, 8 GB), Ubuntu 24.04, a 64 GB Standard SSD, a static IP with the DNS label `kpinexus-demo`, ports 22/80/443 open, auto-shutdown off, resource group `kpi-nexus-austria-rg`.

### Why Mailpit stays in front of the real mail server

The seeded demo organisation has 41 people at `@helios.io`, with scheduled reports, alerts and daily digests addressed to them. Sent straight to Gmail, those would bounce several times a day and land on a real domain's mail server. Mailpit's forwarding has a blocked-recipients rule, so real people (whoever signs up or is invited) get real mail while the demo's mail stays in the catcher, where it can be shown.

## Consequences

- **Cost.** About $63 a month running all the time, about $9 a month stopped (disk and static IP). The credit lasts roughly six weeks of continuous running, or far longer with the VM stopped between demos. There is no card, so nothing can be charged beyond the credit; at zero the VM stops. **The owner never adds a card or upgrades the subscription.**
- **Not free forever.** When the credit or the student status ends, the host goes. The data lives on the VM alone: a database dump and the S3 bucket must move to the Oracle VM before then.
- **Automatic deploy, decided 2026-11-21.** `deploy.yml` has an `azure` job beside the Oracle one, each gated on its own secrets (`AZURE_DEPLOY_*`). The VM holds a deploy key whose forced command is `ci-deploy.sh`: it accepts a full commit SHA that is on `main` and nothing else, so a leaked key can deploy only what passed review, CI and Security. The data volumes are never part of an update.
- **x64 images built on the VM**, so no CI image is needed for it; the arm64 CI image builds stay for Oracle.
- **Mail goes out as the Gmail account**, with "KPI Nexus" as the display name, since Gmail allows no other sender; Gmail also caps the account at a few hundred messages a day.
- **Rules for the Azure account:** one VM with its disk, IP and network, and nothing else that bills (no databases, load balancers or extra disks); only the five allowed regions; the VM stopped when not needed.

## When the Oracle VM can be created

Follow `docs/deploy.md`, move the data, point people at the new name, delete resource group `kpi-nexus-austria-rg`, and mark this ADR superseded.
