@echo off
REM ============================================================
REM  Dental Clinic - Database Reset
REM  WARNING: Drops Postgres volume, re-applies all migrations + seed.
REM  All data will be lost.
REM ============================================================
chcp 65001 >nul
setlocal EnableDelayedExpansion

title Dental Clinic - DB Reset

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "LOG_DIR=%ROOT%\.runtime-logs"

cls
echo.
echo ============================================================
echo   Dental Clinic - Database Reset
echo ============================================================
echo.
echo   This will:
echo     1. Stop and remove the postgres container
echo     2. DELETE the postgres_data volume  ^(ALL DATA LOST^)
echo     3. Recreate container + run init scripts
echo     4. Apply Prisma migrations
echo     5. Re-seed admin user + roles + permissions
echo.
echo   Targets only the DATABASE. Backend ^& Frontend keep running.
echo ============================================================
echo.

set /p "CONFIRM=Type YES to continue (anything else cancels): "
if /I not "%CONFIRM%"=="YES" (
    echo.
    echo   Cancelled. No changes made.
    timeout /t 3 /nobreak >nul
    exit /b 0
)

echo.
echo [1/5] Stopping postgres container...
cd /d "%ROOT%\backend"
docker compose down postgres 2>nul
docker-compose down postgres 2>nul
echo   + Container stopped.

echo.
echo [2/5] Removing postgres_data volume...
docker volume rm dental-clinic_postgres_data 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo   ! Could not remove via 'dental-clinic_postgres_data' - trying alt names...
    docker volume ls | findstr /I postgres | findstr /I dental
    echo.
    echo   Listing matching volumes above. To force-remove manually:
    echo     docker volume rm ^<name^>
)
echo   + Volume removed.

echo.
echo [3/5] Starting fresh postgres container...
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
docker compose up -d postgres 1>"%LOG_DIR%\docker-reset.log" 2>&1
if %ERRORLEVEL% NEQ 0 (
    docker-compose up -d postgres 1>>"%LOG_DIR%\docker-reset.log" 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo   X Failed to recreate container. See %LOG_DIR%\docker-reset.log
        type "%LOG_DIR%\docker-reset.log"
        pause
        exit /b 1
    )
)
echo   + Container started.

echo   - Waiting for DB...
set /a db_tries=0
:WAIT_DB_RESET
set /a db_tries+=1
docker exec dental-clinic-db pg_isready -U postgres >nul 2>&1
if %ERRORLEVEL% EQU 0 goto DB_READY_RESET
if !db_tries! GEQ 45 (
    echo   X DB not ready. See %LOG_DIR%\docker-reset.log
    pause
    exit /b 1
)
timeout /t 1 /nobreak >nul
goto WAIT_DB_RESET
:DB_READY_RESET
echo   + DB ready.

echo.
echo [4/5] Applying migrations + seed...
cd /d "%ROOT%\backend"
call npx prisma migrate deploy 1>"%LOG_DIR%\migrate-reset.log" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   X migrate deploy failed. See %LOG_DIR%\migrate-reset.log
    type "%LOG_DIR%\migrate-reset.log"
    pause
    exit /b 1
)
echo   + Migrations applied.

call npx prisma db seed 1>"%LOG_DIR%\seed-reset.log" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo   X seed failed. See %LOG_DIR%\seed-reset.log
    type "%LOG_DIR%\seed-reset.log"
    pause
    exit /b 1
)
echo   + Seed complete.

if exist "scripts\restore-clinic-admin-permissions.ts" (
    call npx ts-node scripts\restore-clinic-admin-permissions.ts 1>"%LOG_DIR%\restore-perms-reset.log" 2>&1
    if %ERRORLEVEL% EQU 0 (echo   + clinic_admin permissions restored.) else (echo   ! restore failed - see %LOG_DIR%\restore-perms-reset.log)
)

echo.
echo [5/5] Done.
echo.
echo ============================================================
echo   Database reset SUCCESS.
echo.
echo   Admin login:
echo     admin@clinic.local / Admin123!
echo ============================================================
echo.
echo   IMPORTANT: If Backend is running, restart it to refresh
echo   Prisma client cache. Use stop-dev.bat + start-dev.bat.
echo.
timeout /t 5 /nobreak >nul
exit /b 0