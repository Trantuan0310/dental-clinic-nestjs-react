@echo off
REM ============================================================
REM  Dental Clinic - Environment Check
REM  Verifies Docker, Node, npm, ports, env files.
REM  Does NOT modify anything - safe to run anytime.
REM ============================================================
chcp 65001 >nul
setlocal EnableDelayedExpansion

title Dental Clinic - Env Check

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

cls
echo.
echo ============================================================
echo   Dental Clinic - Environment Check
echo ============================================================
echo.
set /a "pass=0"
set /a "fail=0"

REM ---- Docker ----
echo [Docker]
where docker >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   X docker not found in PATH.
    set /a fail+=1
) else (
    echo   + docker CLI installed.
    set /a pass+=1
)

docker info >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   X Docker daemon not running. Open Docker Desktop.
    set /a fail+=1
) else (
    echo   + Docker daemon running.
    set /a pass+=1
)

docker compose version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   + docker compose plugin available.
    set /a pass+=1
) else (
    docker-compose --version >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo   + docker-compose (legacy) available.
        set /a pass+=1
    ) else (
        echo   X Neither 'docker compose' nor 'docker-compose' available.
        set /a fail+=1
    )
)

REM ---- Node / npm ----
echo.
echo [Node.js]
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   X node not found. Install Node 20+ from https://nodejs.org
    set /a fail+=1
) else (
    for /f "tokens=*" %%v in ('node -v') do (
        echo   + Node.js %%v
        REM check major version
        for /f "tokens=1 delims=." %%m in ('echo %%v') do (
            set "ver=%%m"
        )
    )
    set /a pass+=1
)

where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   X npm not found.
    set /a fail+=1
) else (
    for /f "tokens=*" %%v in ('npm -v') do echo   + npm %%v
    set /a pass+=1
)

REM ---- Ports ----
echo.
echo [Ports]
netstat -ano | findstr ":3000 " | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   ! Port 3000 is in use. Backend may already be running.
    for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING') do echo       PID: %%P
) else (
    echo   + Port 3000 free.
)

netstat -ano | findstr ":5173 " | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   ! Port 5173 is in use. Frontend may already be running.
    for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5173 " ^| findstr LISTENING') do echo       PID: %%P
) else (
    echo   + Port 5173 free.
)

netstat -ano | findstr ":15432 " | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   + Port 15432 listening ^(Postgres likely up^).
) else (
    echo   - Port 15432 free ^(Postgres will start with docker compose^).
)

REM ---- Project files ----
echo.
echo [Project Files]
if exist "%ROOT%\backend" (echo   + backend/   found.) else (echo   X backend/   missing. & set /a fail+=1)
if exist "%ROOT%\backend\package.json" (echo   + backend/package.json found.) else (echo   X backend/package.json missing. & set /a fail+=1)
if exist "%ROOT%\backend\prisma" (echo   + backend/prisma/ found.) else (echo   X backend/prisma/ missing. & set /a fail+=1)
if exist "%ROOT%\backend\.env" (echo   + backend/.env found.) else (echo   ! backend/.env missing - will be created from .env.example on first run.)
if exist "%ROOT%\backend\docker-compose.yml" (echo   + backend/docker-compose.yml found.) else (echo   X backend/docker-compose.yml missing. & set /a fail+=1)
if exist "%ROOT%\backend\node_modules" (echo   + backend/node_modules installed.) else (echo   - backend/node_modules missing - will be installed.)
if exist "%ROOT%\frontend" (echo   + frontend/   found.) else (echo   X frontend/   missing. & set /a fail+=1)
if exist "%ROOT%\frontend\package.json" (echo   + frontend/package.json found.) else (echo   X frontend/package.json missing. & set /a fail+=1)
if exist "%ROOT%\frontend\node_modules" (echo   + frontend/node_modules installed.) else (echo   - frontend/node_modules missing - will be installed.)

REM ---- Docker containers ----
echo.
echo [Docker Containers]
docker ps -a --filter "name=dental-clinic" 2>nul | findstr /I dental-clinic >nul
if %ERRORLEVEL% EQU 0 (
    echo   Running dental-clinic containers:
    docker ps -a --filter "name=dental-clinic" --format "   - {{.Names}}\t{{.Status}}\t{{.Ports}}"
) else (
    echo   - No dental-clinic containers yet.
)

REM ---- Summary ----
echo.
echo ============================================================
echo   Summary: !pass! OK, !fail! errors
echo ============================================================
echo.

if !fail! GTR 0 (
    echo   Some prerequisites are missing. Fix the items marked ^! or X.
) else (
    echo   All prerequisites OK. Run start-dev.bat to launch.
)

echo.
pause
exit /b 0