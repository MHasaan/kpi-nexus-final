# ADR-001: Free-tier production hosting

- **Status:** Accepted (2026-11-11), signed off by the project owner.
- **Supersedes:** spec Appendix A #4 (CLAUDE.md locked decision #7), §10.2 and the `release.yml` line in §10.3.
- **Related:** OT-011 (deploy config, #52 and #53).

## Context

The locked target was Vercel for the web app, Fly.io for the API, worker, ML sidecar and Postgres, and Upstash for Redis. Building and rehearsing that config (OT-011) showed it cannot run for free:

- **Fly.io has no free tier.** Its free allowance was removed for new organisations; every machine and volume is billed.
- **Upstash's free tier cannot carry the queue.** With the API and worker idle (no users, no jobs), Redis served 9,118 commands in 10 minutes in the production rehearsal: about 1.3 million a day. Nearly all of it is the 10 BullMQ workers polling. The free tier allows 10,000 a day.

The project must run in production at $0, with no credits that expire, and deploy itself on every merge to `main`. It is a student FYP: **no service may be able to charge anything, ever.** Each one is either free without a card, or (Oracle) holds a card only for identity checks on an account that is never upgraded.

## Decision

| Piece | Host |
|---|---|
| Web (`apps/web`) | **Vercel Hobby.** Git integration deploys `main` and builds a preview for every PR. |
| API, worker, ML sidecar, Postgres (TimescaleDB + pgvector), Redis, Caddy | **One Oracle Cloud Always Free ARM VM** (Ampere A1, 2 OCPU / 12 GB, the whole Always Free A1 allowance; Ubuntu 24.04), run with Docker Compose from `infra/prod/` |
| API hostname and HTTPS | A free **DuckDNS** subdomain; **Caddy** gets and renews the certificate |
| Files and database backups | **Oracle Object Storage** through its S3-compatible API (the existing `S3_*` settings) |
| Email | **Brevo** free SMTP (300 emails a day, no card) |
| Container images | **GitHub Container Registry**, public packages |
| Errors | **Sentry** Developer plan (no card) |
| AI | Gemini free tier, unchanged |

**What stays the same:**
- One image for the API and the worker, with `RUN_QUEUE_WORKERS=false` on the API (OT-003).
- The production database release (`release-db.mjs`: `prisma migrate deploy`, then the SQL files).
- The non-superuser schema owner, so RLS applies to it.
- RLS enforced, with requests as `kpi_app` and system work as `kpi_system`.
- Redis on the VM has no command limit, so BullMQ's polling costs nothing.

**Deploying:** a `deploy.yml` workflow replaces `release.yml`.
1. It runs after CI and Security pass on `main`.
2. It builds arm64 images on GitHub's native ARM runners and pushes them to GHCR, tagged with the commit SHA.
3. It runs the database release on the VM over SSH, then starts the new images.
4. It checks that `/health` reports the new SHA, and rolls back to the previous tag if it does not.

A manual run with an older tag is the rollback.

**Fly.io is removed:** the Fly config (`infra/fly/*.toml`, `release.yml`) is deleted once the new path works. The Postgres wrapper image moves to `infra/prod/postgres/`.

## Never charged: the rules

| Service | Why it can't charge |
|---|---|
| Oracle Cloud | The account stays on the **Free Tier and is never upgraded** to Pay-As-You-Go. Oracle's Free Tier page: "Your credit card will not be charged unless you upgrade your account." |
| Vercel Hobby, Brevo, DuckDNS, Sentry Developer | No card on file; at a limit they stop or throttle, they don't bill. |
| GitHub Actions, GHCR | Free for a public repository and public packages. |

Within Oracle, only Always Free-eligible resources are created, all in the **home region** (chosen at sign-up; Always Free only applies there):
- **Compute:** one `VM.Standard.A1.Flex` instance with at most 2 OCPU and 12 GB in total. The sign-up trial's $300 of credits would allow bigger shapes, but anything over the Always Free limit is disabled and deleted when the trial ends, so it is never used.
- **Block storage:** at most 200 GB of boot plus block volumes in total.
- **Object Storage:** at most 20 GB in total; backups are pruned well below that. A bucket over the limit when the trial ends loses its objects.
- **Networking:** one VCN, an ephemeral public IP, no load balancer.

`docs/deploy.md` lists these limits as a checklist, and the deploy never creates cloud resources itself.

## Alternatives considered

- **Keep Fly.io and pay for Upstash.** It works and was rehearsed, but it has a monthly cost, which is what this decision rules out.
- **Render, Railway, Koyeb and similar free tiers.** Their free services sleep when idle, expire, or don't offer a persistent Postgres with TimescaleDB. A sleeping worker misses scheduled jobs.
- **Managed Postgres free tiers (Neon, Supabase).** They don't offer TimescaleDB hypertables and continuous aggregates as the schema uses them.
- **Fewer Redis commands (a higher BullMQ `drainDelay`) on Upstash.** It cuts the idle cost but not enough for 10,000 a day, and it delays the first job after a quiet spell.

## Consequences and risks

| Risk | Mitigation |
|---|---|
| **Idle reclamation.** Oracle "may reclaim" an Always Free VM that is idle for 7 days (95th-percentile CPU, network and memory all under 20%), and doesn't say whether that means stopped or deleted. Upgrading would avoid it but would allow charges, so it is ruled out. | Accepted. Recovery is rehearsed instead: a new VM, `bootstrap.sh`, the latest backup restored, and a deploy of the last tag. Backups live in Object Storage, off the VM. |
| **ARM capacity.** The ARM shape is sometimes "out of capacity" when creating the VM. | Retry, or try another availability domain. It only affects creation. |
| **One machine.** There is no replica or failover. | Nightly encrypted `pg_dump` to Object Storage (14 days kept), with a restore drill before going live. Recovery means a new VM, the bootstrap script and a restore. |
| **Vercel Hobby terms.** Hobby is for non-commercial use. | Fine for the FYP. If that changes, serve the web app from the VM behind Caddy, or move to Vercel Pro. |
| **Deploy order.** Vercel deploys the web app on its own, possibly before the API deploy finishes. | API changes stay backward-compatible for one deploy, as the migrations already must (§10.3). |
| **Small VM.** 2 OCPU / 12 GB is shared by all services. | Measured in the rehearsal: API about 157 MiB, worker about 126 MiB. Each service gets a memory limit; the budget is checked before going live. |
| **arm64 images.** Every image must run on arm64. | All pinned base images publish arm64 builds; CI builds every image on an ARM runner. |
| **Free-tier terms change.** Any provider can change its free tier. | Everything runs from images and Compose, so moving to another VM or a paid host is a DNS and env change. |

The project owner does the sign-ups (Oracle needs a card for identity verification only; the account is never upgraded), creates the VM and keys, and adds the GitHub secrets. Nothing in the repository needs an account to build or rehearse.
