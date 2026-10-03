#requires -Version 5.1
<#
  update.ps1 - Re-apply local changes so the running app picks them up.

  Use this AFTER you edit code, the Prisma schema, or contracts - it rebuilds
  everything that isn't hot-reloaded. Does, in order:
    1. pnpm install            - pick up any new/changed dependencies.
    2. pnpm db:generate        - regenerate the Prisma client.
    3. pnpm db:setup           - sync schema via `prisma db push` (NON-destructive)
                                 + re-apply extensions/RLS/hypertables/CAGGs.
    4. rebuild shared packages - regenerate contracts/ui/formula/etc.

  NOTE: This project syncs schema with `prisma db push` (see scripts/setup-db.mjs),
  NOT `prisma migrate dev`. `migrate dev` reports false "drift" against the
  push-provisioned DB and tries to RESET (wipe all data) - so we never use it here.

  Assumes Docker infra is already up (run start.cmd first if not).
  Run:  right-click -> Run with PowerShell, or double-click update.cmd
#>

$ErrorActionPreference = 'Stop'

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  $msg" -ForegroundColor Green }

# --- 1. Dependencies -------------------------------------------------------
Write-Step "Syncing dependencies (pnpm install)"
pnpm install
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed." }
Write-Ok "Dependencies in sync."

# --- 2. Prisma client ------------------------------------------------------
Write-Step "Regenerating Prisma client (pnpm db:generate)"
pnpm db:generate
if ($LASTEXITCODE -ne 0) { throw "db:generate failed." }
Write-Ok "Prisma client regenerated."

# --- 3. Schema sync (db push, NOT migrate dev) -----------------------------
Write-Step "Syncing database schema (pnpm db:setup)"
Write-Host "  (needs Docker infra running; run start.cmd first if this fails)" -ForegroundColor DarkGray
pnpm db:setup
if ($LASTEXITCODE -ne 0) { throw "db:setup failed - is the database up?" }
Write-Ok "Schema synced (non-destructive db push + extensions/RLS/hypertables)."

# --- 4. Shared packages ----------------------------------------------------
Write-Step "Rebuilding shared packages (contracts, ui, formula, ...)"
pnpm turbo build --filter=./packages/*
if ($LASTEXITCODE -ne 0) { throw "package build failed." }
Write-Ok "Shared packages rebuilt."

Write-Host "`nAll changes applied. Restart 'pnpm dev' (or start.cmd) to run the updated app." -ForegroundColor Green
