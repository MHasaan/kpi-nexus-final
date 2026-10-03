#requires -Version 5.1
<#
  start.ps1 - One-shot launcher for KPI Nexus Final.

  Does, in order:
    1. Starts Docker Desktop (if not already running) and waits until the engine is ready.
    2. Installs JS dependencies (pnpm install).
    3. Brings up local infra (Postgres/TimescaleDB, Redis, MinIO, Mailhog, Jaeger).
    4. Provisions the database (prisma push + extensions).
    5. Starts the Python ML sidecar (:8000) in its own window.
    6. Boots web (:3000) + api (:4000) + worker via `pnpm dev` (stays in foreground).

  Run:  right-click -> Run with PowerShell, or double-click start.cmd
#>

$ErrorActionPreference = 'Stop'

# --- Resolve the project root (one level up from this script) --------------
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  $msg" -ForegroundColor Green }

# --- 1. Docker Desktop -----------------------------------------------------
Write-Step "Checking Docker"
$dockerExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"

function Test-DockerReady {
    # NOTE: do NOT let stderr from `docker info` become a terminating error.
    # With $ErrorActionPreference='Stop', redirecting a native exe's stderr
    # wraps each line as an ErrorRecord and throws - and `docker info` prints
    # warnings to stderr even when the engine is healthy. Suppress locally.
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    try {
        & docker info 2>&1 | Out-Null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    } finally {
        $ErrorActionPreference = $prev
    }
}

if (Test-DockerReady) {
    Write-Ok "Docker engine already running."
} else {
    if (Test-Path $dockerExe) {
        Write-Host "  Starting Docker Desktop..." -ForegroundColor Yellow
        Start-Process $dockerExe | Out-Null
    } else {
        Write-Host "  Docker Desktop not found at '$dockerExe'. Start it manually." -ForegroundColor Red
    }

    Write-Host "  Waiting for the Docker engine to come up..." -ForegroundColor Yellow
    $deadline = (Get-Date).AddMinutes(2)
    while (-not (Test-DockerReady)) {
        if ((Get-Date) -gt $deadline) {
            throw "Docker engine did not become ready in time. Open Docker Desktop and re-run."
        }
        Start-Sleep -Seconds 2
        Write-Host "." -NoNewline
    }
    Write-Host ""
    Write-Ok "Docker engine is ready."
}

# --- 2. Dependencies -------------------------------------------------------
Write-Step "Installing JS dependencies (pnpm install)"
pnpm install
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed." }
Write-Ok "Dependencies installed."

# --- 3. Local infra --------------------------------------------------------
Write-Step "Starting local infra (pnpm docker:up)"
pnpm docker:up
if ($LASTEXITCODE -ne 0) { throw "docker:up failed." }
Write-Ok "Infra containers up."

# --- 4. Database -----------------------------------------------------------
Write-Step "Provisioning database (pnpm db:setup)"
pnpm db:setup
if ($LASTEXITCODE -ne 0) { throw "db:setup failed." }
Write-Ok "Database ready."

# --- 5. ML sidecar (Python FastAPI, :8000) ---------------------------------
Write-Step "Starting ML sidecar (:8000) in a new window"
# The sidecar runs from its own venv at apps\ml\.venv (gitignored). A plain
# PATH `python` is unreliable here: on machines with MSYS2 it resolves to the
# MinGW build, which has no wheels for numpy/prophet. `uv` fetches a standard
# CPython 3.12 (pyproject.toml pins >=3.12,<3.13) when the venv is missing.
$MlDir     = Join-Path $ProjectRoot "apps\ml"
$VenvDir   = Join-Path $MlDir ".venv"
$PythonExe = Join-Path $VenvDir "Scripts\python.exe"
$MlReqs    = Join-Path $MlDir "requirements.txt"
$HasUv     = [bool](Get-Command uv -ErrorAction SilentlyContinue)

if (-not (Test-Path $PythonExe)) {
    Write-Host "  Creating ML venv at $VenvDir ..." -ForegroundColor Yellow
    if ($HasUv) {
        uv venv $VenvDir --python 3.12 --python-preference only-managed
    } else {
        python -m venv $VenvDir
    }
    if (-not (Test-Path $PythonExe)) { throw "Could not create the ML venv. Install uv (https://docs.astral.sh/uv/) or CPython 3.12 and re-run." }
}

Write-Host "  Syncing ML deps (requirements.txt)..." -ForegroundColor Yellow
if ($HasUv) {
    uv pip install --python $PythonExe -r $MlReqs
} else {
    & $PythonExe -m pip install -r $MlReqs
}
if ($LASTEXITCODE -ne 0) { Write-Host "  WARNING: ML dep install failed - sidecar may not start." -ForegroundColor Red }

# Launch uvicorn in its own window so it runs alongside `pnpm dev`.
$mlCmd = "Set-Location '$MlDir'; & '$PythonExe' -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --env-file .env"
Start-Process powershell -ArgumentList @('-NoExit','-NoProfile','-Command', $mlCmd) | Out-Null
Write-Ok "ML sidecar launching in a separate window -> http://127.0.0.1:8000/health"

# --- 6. Boot the app -------------------------------------------------------
Write-Step "Booting the stack (pnpm dev)"
Write-Host "  Web -> http://localhost:3000" -ForegroundColor Green
Write-Host "  API -> http://localhost:4000/health" -ForegroundColor Green
Write-Host "  ML  -> http://localhost:8000/health (separate window)" -ForegroundColor Green
Write-Host "  Press Ctrl+C to stop the web/api/worker stack.`n" -ForegroundColor DarkGray
pnpm dev
