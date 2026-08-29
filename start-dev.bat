@echo off
REM ============================================================
REM  Dental Clinic - Dev Launcher (Windows)
REM  Khởi động: Postgres (Docker) + Backend (NestJS) + Frontend (Vite)
REM  Mở browser tới Login + Swagger khi sẵn sàng.
REM ============================================================
chcp 65001 >nul
setlocal EnableDelayedExpansion

title Dental Clinic - Dev Launcher

REM ---- Config ----
set "ROOT=%~dp0"
REM Strip trailing backslash if present (handles "C:\Foo\" case)
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "LOG_DIR=%ROOT%\.runtime-logs"
set "DB_CONTAINER=dental-clinic-db"
set "DB_HEALTH_HOST=127.0.0.1"
set "DB_HEALTH_PORT=15432"
set "DB_USER=postgres"
set "DB_PASS=postgres"
set "DB_NAME=dental_clinic"
set "BACKEND_PORT=3000"
set "FRONTEND_PORT=5173"
set "BACKEND_HEALTH_URL=http://localhost:%BACKEND_PORT%/health"
set "FRONTEND_URL=http://localhost:%FRONTEND_PORT%"
set "SWAGGER_URL=http://localhost:%BACKEND_PORT%/api/docs"
set "WAIT_DB_SECONDS=45"
set "WAIT_BACKEND_SECONDS=60"
set "WAIT_FRONTEND_SECONDS=30"

REM ---- Colors (via PowerShell) ----
REM Using simple text markers; ANSI in CMD is unreliable on older Windows.

REM ---- Prepare log dir ----
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
del /q "%LOG_DIR%\*.log" 2>nul

cls
echo.
echo ============================================================
echo   Dental Clinic - Dev Launcher (Windows)
echo ============================================================
echo   Working dir: %ROOT%
echo   Log dir:     %LOG_DIR%
echo.
echo   Targets:
echo     - Postgres    : %DB_HEALTH_HOST%:%DB_HEALTH_PORT%  (container %DB_CONTAINER%)
echo     - Backend     : http://localhost:%BACKEND_PORT%
echo     - Frontend    : %FRONTEND_URL%
echo     - Swagger UI  : %SWAGGER_URL%
echo ============================================================
echo.

REM ============================================================
REM STEP 0 - Quick environment check
REM ============================================================
echo [0/5] Checking prerequisites...

where docker >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   X Docker not found in PATH. Open Docker Desktop first.
    pause
    exit /b 1
)
echo   + Docker CLI available.

docker info >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   X Docker daemon not running. Start Docker Desktop and try again.
    pause
    exit /b 1
)
echo   + Docker daemon running.

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   X Node.js not found. Install Node 20+ from https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo   + Node.js %%v

where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   X npm not found.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('npm -v') do echo   + npm %%v

REM ============================================================
REM STEP 1 - Docker / Postgres
REM ============================================================
echo.
echo [1/5] Starting PostgreSQL via Docker Compose...
cd /d "%ROOT%"

REM Bring up ONLY the postgres service (backend service ignored - we run BE locally)
docker compose up -d postgres 1>"%LOG_DIR%\docker.log" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   ! 'docker compose' failed - falling back to 'docker-compose'...
    docker-compose up -d postgres 1>>"%LOG_DIR%\docker.log" 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo   X Cannot start postgres container. See %LOG_DIR%\docker.log
        type "%LOG_DIR%\docker.log"
        pause
        exit /b 1
    )
)
echo   - Container %DB_CONTAINER% starting...

REM ---- Wait for DB ready ----
echo   - Waiting for DB to accept connections (up to %WAIT_DB_SECONDS%s)...
set /a db_tries=0
:WAIT_DB
set /a db_tries+=1
docker exec %DB_CONTAINER% pg_isready -U %DB_USER% >nul 2>&1
if %ERRORLEVEL% EQU 0 goto DB_READY
if !db_tries! GEQ %WAIT_DB_SECONDS% (
    echo   X DB not ready after %WAIT_DB_SECONDS%s.
    echo     Hint: docker logs %DB_CONTAINER%
    pause
    exit /b 1
)
timeout /t 1 /nobreak >nul
goto WAIT_DB
:DB_READY
echo   + PostgreSQL is ready.

REM ============================================================
REM STEP 2 - Prisma migrate + seed (idempotent)
REM ============================================================
echo.
echo [2/5] Applying Prisma migrations + seed (idempotent)...
cd /d "%ROOT%\backend"

if not exist "node_modules" (
    echo   - Installing backend dependencies ^(npm install^)...
    call npm install 1>"%LOG_DIR%\backend-install.log" 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo   X npm install failed. See %LOG_DIR%\backend-install.log
        pause
        exit /b 1
    )
    echo   + Backend deps installed.
) else (
    echo   + Backend deps already installed.
)

echo   - prisma generate...
call npx prisma generate 1>"%LOG_DIR%\prisma-generate.log" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   X prisma generate failed.
    type "%LOG_DIR%\prisma-generate.log"
    pause
    exit /b 1
)

echo   - prisma migrate deploy...
call npx prisma migrate deploy 1>"%LOG_DIR%\prisma-migrate.log" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   X prisma migrate deploy failed.
    type "%LOG_DIR%\prisma-migrate.log"
    pause
    exit /b 1
)
echo   + Migrations applied.

REM Restore clinic_admin permissions (per backend audit mục #6)
if exist "scripts\restore-clinic-admin-permissions.ts" (
    echo   - Restore clinic_admin permissions ^(hotfix^)...
    call npx ts-node scripts\restore-clinic-admin-permissions.ts 1>"%LOG_DIR%\restore-perms.log" 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo   ! restore-clinic-admin-permissions failed ^(non-fatal^). See %LOG_DIR%\restore-perms.log
    ) else (
        echo   + clinic_admin permissions restored.
    )
)

REM Seed: idempotent (uses upsert). Safe to re-run.
echo   - prisma db seed ^(idempotent^)...
call npx ts-node prisma/seed.ts 1>"%LOG_DIR%\prisma-seed.log" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   ! Direct seed failed - trying 'prisma db seed' fallback...
    call npx prisma db seed 1>"%LOG_DIR%\prisma-seed.log" 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo   X Seed failed. See %LOG_DIR%\prisma-seed.log
        type "%LOG_DIR%\prisma-seed.log"
        pause
        exit /b 1
    )
)
echo   + Seed complete.

REM ============================================================
REM STEP 3 - Start Backend
REM ============================================================
echo.
echo [3/5] Starting Backend ^(NestJS on :%BACKEND_PORT%^)...
cd /d "%ROOT%\backend"

REM Check port
netstat -ano | findstr ":%BACKEND_PORT% " | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   ! Port %BACKEND_PORT% already in use. Killing previous Node on this port...
    for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%BACKEND_PORT% " ^| findstr LISTENING') do (
        taskkill /PID %%P /F >nul 2>&1
    )
    timeout /t 2 /nobreak >nul
)

start "Backend - NestJS" cmd /k "cd /d %ROOT%\backend && npm run start:dev > %LOG_DIR%\backend.log 2>&1"

echo   - Waiting for backend health endpoint...
set /a be_tries=0
:WAIT_BE
set /a be_tries+=1
curl -sf "%BACKEND_HEALTH_URL%" >nul 2>&1
if %ERRORLEVEL% EQU 0 goto BE_READY
if !be_tries! GEQ %WAIT_BACKEND_SECONDS% (
    echo   X Backend not ready after %WAIT_BACKEND_SECONDS%s.
    echo     Tail of %LOG_DIR%\backend.log:
    powershell -NoProfile -Command "Get-Content '%LOG_DIR%\backend.log' -Tail 30" 2>nul
    pause
    exit /b 1
)
timeout /t 1 /nobreak >nul
goto WAIT_BE
:BE_READY
echo   + Backend ready at %BACKEND_HEALTH_URL%

REM ============================================================
REM STEP 4 - Start Frontend
REM ============================================================
echo.
echo [4/5] Starting Frontend ^(Vite on :%FRONTEND_PORT%^)...
cd /d "%ROOT%\frontend"

if not exist "node_modules" (
    echo   - Installing frontend dependencies ^(npm install^)...
    call npm install 1>"%LOG_DIR%\frontend-install.log" 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo   X npm install failed. See %LOG_DIR%\frontend-install.log
        pause
        exit /b 1
    )
    echo   + Frontend deps installed.
) else (
    echo   + Frontend deps already installed.
)

REM Check port
netstat -ano | findstr ":%FRONTEND_PORT% " | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   ! Port %FRONTEND_PORT% already in use. Killing previous Node on this port...
    for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%FRONTEND_PORT% " ^| findstr LISTENING') do (
        taskkill /PID %%P /F >nul 2>&1
    )
    timeout /t 2 /nobreak >nul
)

start "Frontend - Vite" cmd /k "cd /d %ROOT%\frontend && npm run dev > %LOG_DIR%\frontend.log 2>&1"

echo   - Waiting for Vite to serve...
set /a fe_tries=0
:WAIT_FE
set /a fe_tries+=1
curl -sf "%FRONTEND_URL%" >nul 2>&1
if %ERRORLEVEL% EQU 0 goto FE_READY
if !fe_tries! GEQ %WAIT_FRONTEND_SECONDS% (
    echo   ! Frontend slow to start. Will open browser anyway.
    goto FE_READY
)
timeout /t 1 /nobreak >nul
goto WAIT_FE
:FE_READY
echo   + Frontend ready at %FRONTEND_URL%

REM ============================================================
REM STEP 5 - Open browser
REM ============================================================
echo.
echo [5/5] Opening browser tabs...

start "" "%FRONTEND_URL%"
timeout /t 3 /nobreak >nul
start "" "%SWAGGER_URL%"

echo.
echo ============================================================
echo   ALL SYSTEMS UP
echo ============================================================
echo.
echo   Frontend  : %FRONTEND_URL%
echo   Backend   : http://localhost:%BACKEND_PORT%
echo   Swagger   : %SWAGGER_URL%
echo   Database  : %DB_HEALTH_HOST%:%DB_HEALTH_PORT%  (user %DB_USER% / db %DB_NAME%)
echo.
echo   Default admin login:
echo     Email    : admin@clinic.local
echo     Password : Admin123!    ^(must change on first login^)
echo.
echo   Logs     : %LOG_DIR%
echo   Stop     : Run stop-dev.bat  (or close Backend ^& Frontend windows)
echo ============================================================
echo.

REM Keep launcher window open briefly, then close
timeout /t 8 /nobreak >nul
exit /b 0