# ============================================================
#  Dental Clinic - Dev Launcher (PowerShell)
#  Khởi động: Postgres (Docker) + Backend (NestJS) + Frontend (Vite)
#  PowerShell-native, không bị CMD quirks.
# ============================================================
# Requires: PowerShell 5.1+ (Windows default)
# Usage:    .\start-dev.ps1
# ============================================================

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ProgressPreference = 'Continue'

$ROOT       = (Resolve-Path "$PSScriptRoot\").Path
$LOG_DIR    = Join-Path $ROOT '.runtime-logs'

$DB_CONTAINER = 'dental-clinic-db'
$DB_PORT      = 15432
$DB_USER      = 'postgres'
$DB_PASS      = 'postgres'

$BACKEND_PORT  = 3000
$FRONTEND_PORT = 5173
$BACKEND_URL   = "http://localhost:$BACKEND_PORT"
$FRONTEND_URL  = "http://localhost:$FRONTEND_PORT"
$SWAGGER_URL   = "$BACKEND_URL/api/docs"

$WAIT_DB_SECONDS      = 45
$WAIT_BACKEND_SECONDS = 60
$WAIT_FRONTEND_SECONDS = 30

# ============================================================
#  Helpers
# ============================================================
function Write-Step($n, $msg) {
    Write-Host ""
    Write-Host "[$n] $msg" -ForegroundColor Cyan
}
function Write-OK($msg)  { Write-Host "  + $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "  X $msg" -ForegroundColor Red }
function Write-Info($msg) { Write-Host "  - $msg" -ForegroundColor Gray }

# ============================================================
#  Banner
# ============================================================
Clear-Host
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "  Dental Clinic - Dev Launcher (PowerShell)" -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "  Working dir: $ROOT"
Write-Host "  Log dir:     $LOG_DIR"
Write-Host ""
Write-Host "  Targets:"
Write-Host "    - Postgres    : localhost:$DB_PORT  (container $DB_CONTAINER)"
Write-Host "    - Backend     : $BACKEND_URL"
Write-Host "    - Frontend    : $FRONTEND_URL"
Write-Host "    - Swagger UI  : $SWAGGER_URL"
Write-Host "============================================================"

if (-not (Test-Path $LOG_DIR)) {
    New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null
}
Get-ChildItem $LOG_DIR -Filter '*.log' -ErrorAction SilentlyContinue | Remove-Item -Force

# ============================================================
#  STEP 0 - Prerequisites
# ============================================================
Write-Step "0/5" "Checking prerequisites..."

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Fail "Docker not found in PATH. Open Docker Desktop first."
    Read-Host "Press ENTER to exit"
    exit 1
}
Write-OK "Docker CLI available."

$dockerInfo = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Docker daemon not running. Start Docker Desktop and try again."
    Read-Host "Press ENTER to exit"
    exit 1
}
Write-OK "Docker daemon running."

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Fail "Node.js not found. Install Node 20+ from https://nodejs.org"
    Read-Host "Press ENTER to exit"
    exit 1
}
Write-OK "Node.js $(node -v)"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Fail "npm not found."
    Read-Host "Press ENTER to exit"
    exit 1
}
Write-OK "npm $(npm -v)"

# ============================================================
#  STEP 1 - Postgres
# ============================================================
Write-Step "1/5" "Starting PostgreSQL via Docker Compose..."
$BACKEND_DIR = Join-Path $ROOT 'backend'

# docker-compose.yml lives in backend/, so cd there
Push-Location -Path $BACKEND_DIR -ErrorAction SilentlyContinue | Out-Null

docker compose up -d postgres 2>&1 | Out-File "$LOG_DIR\docker.log" -Encoding utf8
if ($LASTEXITCODE -ne 0) {
    Write-Warn "'docker compose' failed - trying 'docker-compose'..."
    docker-compose up -d postgres 2>&1 | Out-File "$LOG_DIR\docker.log" -Encoding utf8 -Append
    if ($LASTEXITCODE -ne 0) {
        Pop-Location -ErrorAction SilentlyContinue | Out-Null
        Write-Fail "Cannot start postgres container. See $LOG_DIR\docker.log"
        Get-Content "$LOG_DIR\docker.log"
        Read-Host "Press ENTER to exit"
        exit 1
    }
}
Write-Info "Container $DB_CONTAINER starting..."

Write-Info "Waiting for DB to accept connections (up to $WAIT_DB_SECONDS s)..."
$dbReady = $false
for ($i = 0; $i -lt $WAIT_DB_SECONDS; $i++) {
    $pgout = docker exec $DB_CONTAINER pg_isready -U $DB_USER 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-OK "PostgreSQL is ready after $i seconds."
        $dbReady = $true
        break
    }
    Start-Sleep -Seconds 1
}
if (-not $dbReady) {
    Pop-Location -ErrorAction SilentlyContinue | Out-Null
    Write-Fail "DB not ready after $WAIT_DB_SECONDS s."
    Write-Info "Hint: docker logs $DB_CONTAINER"
    Read-Host "Press ENTER to exit"
    exit 1
}

# ============================================================
#  STEP 2 - Prisma migrate + seed
# ============================================================
Write-Step "2/5" "Applying Prisma migrations + seed (idempotent)..."
$BACKEND_DIR = Join-Path $ROOT 'backend'
Set-Location $BACKEND_DIR

if (-not (Test-Path 'node_modules')) {
    Write-Info "Installing backend dependencies (npm install)..."
    npm install 2>&1 | Out-File "$LOG_DIR\backend-install.log" -Encoding utf8
    if ($LASTEXITCODE -ne 0) {
        Pop-Location -ErrorAction SilentlyContinue | Out-Null
        Write-Fail "npm install failed. See $LOG_DIR\backend-install.log"
        Read-Host "Press ENTER to exit"
        exit 1
    }
    Write-OK "Backend deps installed."
} else {
    Write-OK "Backend deps already installed."
}

Write-Info "prisma generate..."
npx prisma generate 2>&1 | Out-File "$LOG_DIR\prisma-generate.log" -Encoding utf8
if ($LASTEXITCODE -ne 0) {
    Pop-Location -ErrorAction SilentlyContinue | Out-Null
    Write-Fail "prisma generate failed."
    Get-Content "$LOG_DIR\prisma-generate.log"
    Read-Host "Press ENTER to exit"
    exit 1
}

Write-Info "prisma migrate deploy..."
npx prisma migrate deploy 2>&1 | Out-File "$LOG_DIR\prisma-migrate.log" -Encoding utf8
if ($LASTEXITCODE -ne 0) {
    Pop-Location -ErrorAction SilentlyContinue | Out-Null
    Write-Fail "prisma migrate deploy failed."
    Get-Content "$LOG_DIR\prisma-migrate.log"
    Read-Host "Press ENTER to exit"
    exit 1
}
Write-OK "Migrations applied."

$restoreScript = Join-Path $BACKEND_DIR 'scripts/restore-clinic-admin-permissions.ts'
if (Test-Path $restoreScript) {
    Write-Info "Restore clinic_admin permissions (hotfix)..."
    npx ts-node $restoreScript 2>&1 | Out-File "$LOG_DIR\restore-perms.log" -Encoding utf8
    if ($LASTEXITCODE -eq 0) {
        Write-OK "clinic_admin permissions restored."
    } else {
        Write-Warn "restore-clinic-admin-permissions failed (non-fatal). See $LOG_DIR\restore-perms.log"
    }
}

Write-Info "prisma db seed (idempotent)..."
# Use direct ts-node call (more reliable than 'prisma db seed' which requires package.json prisma.seed config)
$seedExit = $null
npx ts-node prisma/seed.ts 2>&1 | Out-File "$LOG_DIR\prisma-seed.log" -Encoding utf8
$seedExit = $LASTEXITCODE
if ($seedExit -ne 0) {
    Write-Warn "Direct seed failed (exit $seedExit) - trying 'prisma db seed' fallback..."
    npx prisma db seed 2>&1 | Out-File "$LOG_DIR\prisma-seed.log" -Encoding utf8 -Append
    $seedExit = $LASTEXITCODE
}
if ($seedExit -ne 0) {
    Pop-Location -ErrorAction SilentlyContinue | Out-Null
    Write-Fail "Seed failed. See $LOG_DIR\prisma-seed.log"
    Get-Content "$LOG_DIR\prisma-seed.log"
    Read-Host "Press ENTER to exit"
    exit 1
}
Write-OK "Seed complete."

# ============================================================
#  STEP 3 - Backend
# ============================================================
Write-Step "3/5" "Starting Backend (NestJS on :$BACKEND_PORT)..."

# Kill any leftover process on this port
$existingBE = Get-NetTCPConnection -LocalPort $BACKEND_PORT -State Listen -ErrorAction SilentlyContinue
foreach ($conn in $existingBE) {
    Write-Info "Killing leftover process on port $BACKEND_PORT (PID $($conn.OwningProcess))"
    try { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
}
Start-Sleep -Seconds 2

# Start backend in new window
$backendCmd = "cd /d `"$BACKEND_DIR`" && npm run start:dev > `"$LOG_DIR\backend.log`" 2>&1"
Start-Process -FilePath cmd.exe -ArgumentList '/k', "`"$backendCmd`"" -WindowStyle Normal -WorkingDirectory $BACKEND_DIR | Out-Null

Write-Info "Waiting for backend /health endpoint..."
$beReady = $false
for ($i = 0; $i -lt $WAIT_BACKEND_SECONDS; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri "$BACKEND_URL/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            Write-OK "Backend ready at $BACKEND_URL/health after $i seconds."
            $beReady = $true
            break
        }
    } catch {
        # Not ready yet
    }
    Start-Sleep -Seconds 1
}
if (-not $beReady) {
    Write-Fail "Backend not ready after $WAIT_BACKEND_SECONDS s."
    Write-Info "Tail of $LOG_DIR\backend.log:"
    if (Test-Path "$LOG_DIR\backend.log") {
        Get-Content "$LOG_DIR\backend.log" -Tail 30
    }
    Read-Host "Press ENTER to exit"
    exit 1
}

# ============================================================
#  STEP 4 - Frontend
# ============================================================
Write-Step "4/5" "Starting Frontend (Vite on :$FRONTEND_PORT)..."
$FRONTEND_DIR = Join-Path $ROOT 'frontend'
Set-Location $FRONTEND_DIR

if (-not (Test-Path 'node_modules')) {
    Write-Info "Installing frontend dependencies..."
    npm install 2>&1 | Out-File "$LOG_DIR\frontend-install.log" -Encoding utf8
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm install failed. See $LOG_DIR\frontend-install.log"
        Read-Host "Press ENTER to exit"
        exit 1
    }
    Write-OK "Frontend deps installed."
} else {
    Write-OK "Frontend deps already installed."
}

# Kill any leftover on FE port
$existingFE = Get-NetTCPConnection -LocalPort $FRONTEND_PORT -State Listen -ErrorAction SilentlyContinue
foreach ($conn in $existingFE) {
    Write-Info "Killing leftover process on port $FRONTEND_PORT (PID $($conn.OwningProcess))"
    try { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
}
Start-Sleep -Seconds 2

# Start frontend in new window
$frontendCmd = "cd /d `"$FRONTEND_DIR`" && npm run dev > `"$LOG_DIR\frontend.log`" 2>&1"
Start-Process -FilePath cmd.exe -ArgumentList '/k', "`"$frontendCmd`"" -WindowStyle Normal -WorkingDirectory $FRONTEND_DIR | Out-Null

Write-Info "Waiting for Vite to serve..."
$feReady = $false
for ($i = 0; $i -lt $WAIT_FRONTEND_SECONDS; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri $FRONTEND_URL -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            Write-OK "Frontend ready at $FRONTEND_URL after $i seconds."
            $feReady = $true
            break
        }
    } catch {
        # Not ready yet
    }
    Start-Sleep -Seconds 1
}
if (-not $feReady) {
    Write-Warn "Frontend slow to start after $WAIT_FRONTEND_SECONDS s. Will open browser anyway."
}

# ============================================================
#  STEP 5 - Open browser
# ============================================================
Write-Step "5/5" "Opening browser tabs..."
Start-Process $FRONTEND_URL | Out-Null
Start-Sleep -Seconds 3
Start-Process $SWAGGER_URL | Out-Null

Pop-Location -ErrorAction SilentlyContinue | Out-Null

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  ALL SYSTEMS UP" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend  : $FRONTEND_URL"
Write-Host "  Backend   : $BACKEND_URL"
Write-Host "  Swagger   : $SWAGGER_URL"
Write-Host "  Database  : localhost:$DB_PORT  (user $DB_USER / db dental_clinic)"
Write-Host ""
Write-Host "  Default admin login:"
Write-Host "    Email    : admin@clinic.local"
Write-Host "    Password : Admin123!    (must change on first login)"
Write-Host ""
Write-Host "  Logs     : $LOG_DIR"
Write-Host "  Stop     : Run stop-dev.ps1 (or close Backend & Frontend windows)"
Write-Host "============================================================"
Write-Host ""

Start-Sleep -Seconds 6
exit 0