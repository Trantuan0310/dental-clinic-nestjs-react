param(
  [int]$SlowMo = 250,
  [switch]$Headless,
  [switch]$FullJourney
)

$ErrorActionPreference = 'Stop'
$frontendRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $frontendRoot

$env:E2E_SLOW_MO = $SlowMo.ToString()
$env:E2E_RECORD_VIDEO = '1'
$env:E2E_DEMO_SCHEDULE = if ($FullJourney) { '1' } else { '0' }
$env:E2E_RUN_ID = "$( [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() )-$PID"
$logPath = Join-Path $frontendRoot 'playwright-visual-output.log'

Write-Host "Playwright visual test is starting (slowMo=${SlowMo}ms)..." -ForegroundColor Cyan
[string[]]$playwrightArgs = @(
  'playwright', 'test',
  'e2e/patient-create.spec.ts',
  'e2e/shell.spec.ts',
  'e2e/a11y.spec.ts',
  'e2e/ui-demo-regressions.spec.ts',
  '--project=chromium', '--workers=1'
)
if ($FullJourney) { $playwrightArgs += 'e2e/flow-patient-to-payment.spec.ts' }
if (-not $Headless) { $playwrightArgs += '--headed' }
& npx @playwrightArgs 2>&1 | Tee-Object -FilePath $logPath

$exitCode = $LASTEXITCODE
if ($exitCode -eq 0) {
  Write-Host 'Visual test completed successfully.' -ForegroundColor Green
} else {
  Write-Host "Visual test failed with exit code $exitCode." -ForegroundColor Red
}

Write-Host "Log: $logPath"
Write-Host "Videos: $(Join-Path $frontendRoot 'artifacts\demo-videos')"
exit $exitCode
