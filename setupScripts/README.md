# setupScripts

Convenience scripts for running KPI Nexus Final on Windows.

| Script | What it does |
|---|---|
| **start.cmd** / `start.ps1` | Creates any missing `.env` from its `.env.example` (never overwrites), starts Docker Desktop (waits until ready), `pnpm install`, brings up infra (`docker:up`), provisions the DB (`db:setup`), starts the Python ML sidecar (:8000) in its own window, then runs `pnpm dev` (web :3000 + api :4000 + worker). |
| **update.cmd** / `update.ps1` | Re-applies your local edits: `pnpm install`, `db:generate`, `db:setup` (non-destructive `prisma db push`), and rebuilds shared packages. Run after changing deps, the Prisma schema, or contracts. |

## How to run

- **Double-click** `start.cmd` or `update.cmd` in Explorer, **or**
- Right-click the `.ps1` → *Run with PowerShell*, **or**
- From a terminal in this folder: `.\start.ps1` / `.\update.ps1`

## Notes

- `start.cmd` keeps running in the foreground (that's the web/api/worker dev server). Press **Ctrl+C** to stop it.
- The ML sidecar (:8000) now starts automatically in a **separate window**. It runs from the project venv at `apps\ml\.venv` (gitignored); if that is missing, `start` creates it with `uv` (downloads CPython 3.14) or falls back to `python -m venv`. Close that window to stop it.
- All local endpoints in the `.env` files use `127.0.0.1`, not `localhost`. Docker Desktop on this machine publishes container ports on IPv4 only, and Prisma resolves `localhost` to IPv6 `::1` without falling back, so `localhost` makes `db:setup` / the API fail with `P1001: Can't reach database server`.
- `update` needs the Docker infra up - run `start` first if the DB isn't running.
- Schema sync uses `prisma db push` (via `db:setup`), **not** `prisma migrate dev`. This project is provisioned with `db push`; `migrate dev` falsely reports drift and tries to reset/wipe the DB - never run it here.
- If PowerShell blocks the `.ps1`, the `.cmd` wrappers already bypass execution policy for you.
