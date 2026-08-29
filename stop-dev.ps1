# ============================================================
#  Dental Clinic - Stop Backend + Frontend (PowerShell)
#  Keeps Postgres (Docker) running for fast restart.
# ============================================================

$ROOT = (Resolve-Path "$PSScriptRoot\").Path
$BACKEND_PORT  = 3000
$FRONTEND_PORT = 5173

Clear-Host
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "  Dental Clinic - Stop Backend + Frontend" -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta

Write-Host ""
Write-Host "[1/3] Closing Backend window..." -ForegroundColor Cyan
Get-Process -Name cmd -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq 'Backend - NestJS' } | ForEach-Object {
    Write-Host "  + Closing window PID $($_.Id)" -ForegroundColor Green
    $_ | Stop-Process -Force
}

Write-Host ""
Write-Host "[2/3] Closing Frontend window..." -ForegroundColor Cyan
Get-Process -Name cmd -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq 'Frontend - Vite' } | ForEach-Object {
    Write-Host "  + Closing window PID $($_.Id)" -ForegroundColor Green
    $_ | Stop-Process -Force
}

Write-Host ""
Write-Host "[3/3] Force-killing any leftover Node processes on dev ports..." -ForegroundColor Cyan

$killedBE = 0
Get-NetTCPConnection -LocalPort $BACKEND_PORT -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  - Killing PID $($_.OwningProcess) on port $BACKEND_PORT"
    try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction Stop; $killedBE++ } catch {}
}
if ($killedBE -gt 0) { Write-Host "  + Killed $killedBE backend process(es)." -ForegroundColor Green } else { Write-Host "  - No leftover backend process." }

$killedFE = 0
Get-NetTCPConnection -LocalPort $FRONTEND_PORT -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  - Killing PID $($_.OwningProcess) on port $FRONTEND_PORT"
    try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction Stop; $killedFE++ } catch {}
}
if ($killedFE -gt 0) { Write-Host "  + Killed $killedFE frontend process(es)." -ForegroundColor Green } else { Write-Host "  - No leftover frontend process." }

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Backend & Frontend stopped." -ForegroundColor Green
Write-Host "  Postgres container still running."
Write-Host ""
Write-Host "  Restart:     start-dev.ps1  (or start-dev.bat)"
Write-Host "  Stop DB too: docker compose down"
Write-Host "============================================================"
Write-Host ""

Start-Sleep -Seconds 5
exit 0