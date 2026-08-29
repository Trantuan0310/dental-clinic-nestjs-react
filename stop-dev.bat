@echo off
REM ============================================================
REM  Dental Clinic - Stop Backend + Frontend
REM  Keeps Postgres (Docker) running for fast restart.
REM ============================================================
chcp 65001 >nul
setlocal EnableDelayedExpansion

title Dental Clinic - Stop Dev

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "BACKEND_PORT=3000"
set "FRONTEND_PORT=5173"

cls
echo.
echo ============================================================
echo   Dental Clinic - Stop Backend + Frontend
echo ============================================================
echo.

REM ---- Kill by window title (preferred) ----
echo [1/3] Closing Backend window...
taskkill /FI "WINDOWTITLE eq Backend - NestJS*" /T /F 2>nul
if %ERRORLEVEL% EQU 0 (echo   + Backend window closed.) else (echo   - No backend window found.)

echo.
echo [2/3] Closing Frontend window...
taskkill /FI "WINDOWTITLE eq Frontend - Vite*" /T /F 2>nul
if %ERRORLEVEL% EQU 0 (echo   + Frontend window closed.) else (echo   - No frontend window found.)

REM ---- Force-kill by port (fallback) ----
echo.
echo [3/3] Force-killing any leftover Node processes on dev ports...

set /a killed_be=0
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%BACKEND_PORT% " ^| findstr LISTENING') do (
    taskkill /PID %%P /F >nul 2>&1
    set /a killed_be+=1
)
if !killed_be! GTR 0 (echo   + Killed !killed_be! leftover backend process^(es^).) else (echo   - No leftover backend process.)

set /a killed_fe=0
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%FRONTEND_PORT% " ^| findstr LISTENING') do (
    taskkill /PID %%P /F >nul 2>&1
    set /a killed_fe+=1
)
if !killed_fe! GTR 0 (echo   + Killed !killed_fe! leftover frontend process^(es^).) else (echo   - No leftover frontend process.)

echo.
echo ============================================================
echo   Backend ^& Frontend stopped.
echo   Postgres container still running.
echo.
echo   Restart:     start-dev.bat
echo   Stop DB too: docker compose down
echo ============================================================
echo.
timeout /t 5 /nobreak >nul
exit /b 0