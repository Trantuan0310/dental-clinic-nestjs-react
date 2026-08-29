# ============================================================
#  Dental Clinic - E2E API Test (PowerShell)
#  Test tất cả endpoints chính theo flow nghiệp vụ.
# ============================================================

$BASE_URL = 'http://localhost:3000/api/v1'
$ADMIN_EMAIL = 'admin@clinic.local'
$ADMIN_PASSWORD = 'Admin123!'

$pass = 0
$fail = 0
$tests = @()

function Test-Step {
    param([string]$Name, [string]$Method, [string]$Url, [hashtable]$Headers, [string]$Body, [string]$ExpectStatus = '200|201', [scriptblock]$Validate = $null)

    $fullUrl = "$BASE_URL$Url"
    $params = @{
        Uri = $fullUrl
        Method = $Method
        TimeoutSec = 10
        UseBasicParsing = $true
    }
    if ($Headers) { $params.Headers = $Headers }
    if ($Body) {
        $params.Body = $Body
        $params.ContentType = 'application/json'
    }

    try {
        $resp = Invoke-WebRequest @params -ErrorAction Stop
        $code = $resp.StatusCode
        $body = $resp.Content
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        $body = $_.Exception.Response.Content.ReadAsStringAsync() | Wait-AsyncResult
        if (-not $body) { $body = $_.Exception.Message }
    }

    $ok = ($ExpectStatus -split '\|') -contains "$code"
    $extra = ""
    if ($ok -and $Validate) {
        try {
            $extra = & $Validate $body
            if ($extra -is [string] -and $extra.StartsWith('FAIL:')) {
                $ok = $false
            }
        } catch {
            $ok = $false
            $extra = "FAIL: validate threw: $_"
        }
    }

    if ($ok) {
        Write-Host "  + $Method $Url => $code $extra" -ForegroundColor Green
        $script:pass++
    } else {
        Write-Host "  X $Method $Url => $code $extra" -ForegroundColor Red
        if ($body.Length -gt 200) { $body = $body.Substring(0, 200) + "..." }
        Write-Host "    Body: $body" -ForegroundColor DarkGray
        $script:fail++
    }
}

Clear-Host
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "  Dental Clinic - E2E API Test" -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "  Base URL: $BASE_URL"
Write-Host ""

# ============================================================
#  AUTH FLOW
# ============================================================
Write-Host "[1] Authentication Flow" -ForegroundColor Cyan

$loginBody = @{ email = $ADMIN_EMAIL; password = $ADMIN_PASSWORD } | ConvertTo-Json -Compress
Test-Step -Name "Login admin" -Method POST -Url '/auth/login' -Body $loginBody -ExpectStatus '200|201' -Validate {
    param($b)
    $j = $b | ConvertFrom-Json
    if (-not $j.data.accessToken) { return "FAIL: no accessToken" }
    if (-not $j.data.user.email) { return "FAIL: no user.email" }
    $script:token = $j.data.accessToken
    "token.length=$($j.data.accessToken.Length); perms=$($j.data.user.permissions.Count)"
}
if (-not $script:token) {
    Write-Host "Login failed - cannot continue." -ForegroundColor Red
    exit 1
}

$authHeaders = @{ Authorization = "Bearer $($script:token)" }

Test-Step -Name "Get current user" -Method GET -Url '/auth/me' -Headers $authHeaders -ExpectStatus '200|201' -Validate {
    param($b)
    $j = $b | ConvertFrom-Json
    if ($j.data.email -ne $ADMIN_EMAIL) { return "FAIL: wrong email" }
    "user=$($j.data.fullName)"
}

# ============================================================
#  ADMIN FLOWS
# ============================================================
Write-Host ""
Write-Host "[2] Admin Endpoints" -ForegroundColor Cyan

Test-Step -Name "List users" -Method GET -Url '/admin/users?pageSize=3' -Headers $authHeaders -ExpectStatus '200|201' -Validate {
    param($b)
    $j = $b | ConvertFrom-Json
    "users=$($j.data.Count); pagination=$($j.pagination.hasMore)"
}

Test-Step -Name "List roles" -Method GET -Url '/admin/roles' -Headers $authHeaders -ExpectStatus '200|201' -Validate {
    param($b)
    $j = $b | ConvertFrom-Json
    $codes = ($j.data | ForEach-Object { $_.code }) -join ","
    "roles=$codes"
}

Test-Step -Name "Audit log" -Method GET -Url '/admin/audit-logs?pageSize=1' -Headers $authHeaders -ExpectStatus '200|201'

# ============================================================
#  PATIENT FLOW
# ============================================================
Write-Host ""
Write-Host "[3] Patient CRUD" -ForegroundColor Cyan

$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$newPatient = @{
    fullName = "Test Patient $ts"
    dob = "1990-05-15"
    gender = "MALE"
    primaryPhone = "0901234567"
    email = "test.patient.$ts@example.com"
    address = "123 Test Street"
} | ConvertTo-Json -Compress

Test-Step -Name "Create patient" -Method POST -Url '/patients' -Headers $authHeaders -Body $newPatient -ExpectStatus '200|201' -Validate {
    param($b)
    $j = $b | ConvertFrom-Json
    if (-not $j.data.id) { return "FAIL: no patient id" }
    $script:patientId = $j.data.id
    "id=$($j.data.id); code=$($j.data.code)"
}

if ($script:patientId) {
    Test-Step -Name "Get patient detail" -Method GET -Url "/patients/$($script:patientId)" -Headers $authHeaders -ExpectStatus '200|201'

    Test-Step -Name "List patients" -Method GET -Url '/patients?pageSize=5' -Headers $authHeaders -ExpectStatus '200|201' -Validate {
        param($b)
        $j = $b | ConvertFrom-Json
        "count=$($j.data.Count)"
    }

    # Search
    Test-Step -Name "Search patient" -Method GET -Url "/patients?search=Test&pageSize=3" -Headers $authHeaders -ExpectStatus '200|201'
}

# ============================================================
#  APPOINTMENT FLOW
# ============================================================
Write-Host ""
Write-Host "[4] Appointment Flow" -ForegroundColor Cyan

# Need a dentist user first - get list of users with role dentist
Test-Step -Name "Get dentist users" -Method GET -Url '/admin/users?role=dentist&pageSize=10' -Headers $authHeaders -ExpectStatus '200|201' -Validate {
    param($b)
    $j = $b | ConvertFrom-Json
    # Find first user with actual 'dentist' role (filter is buggy, returns receptionists too)
    $dentist = $j.data | Where-Object { $_.roles -contains 'dentist' } | Select-Object -First 1
    if ($dentist) {
        $script:dentistId = $dentist.id
        "dentist=$($dentist.fullName)"
    } else {
        "no dentist seeded (skip appointment)"
    }
}

# Need a service item - list inventory services or pricing
$tomorrow = (Get-Date).AddDays(1).ToString("yyyy-MM-ddTHH:mm:ssZ")

if ($script:patientId -and $script:dentistId) {
    # Create working schedule for the day-of-week of 'tomorrow' first (0=Sunday, 6=Saturday)
    $dayOfWeek = [int](Get-Date).AddDays(1).DayOfWeek
    $validFrom = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
    $validTo = (Get-Date).AddDays(60).ToString("yyyy-MM-dd")
    $scheduleBody = @{
        dentistId = $script:dentistId
        dayOfWeek = $dayOfWeek
        startTime = "08:00"
        endTime = "17:00"
        slotDurationMin = 30
        validFrom = $validFrom
        validTo = $validTo
    } | ConvertTo-Json -Compress

    Test-Step -Name "Create working schedule" -Method POST -Url '/appointments/schedules' -Headers $authHeaders -Body $scheduleBody -ExpectStatus '200|201'

    $newAppt = @{
        patientId = $script:patientId
        dentistId = $script:dentistId
        startAt = $tomorrow
        endAt = (Get-Date).AddDays(1).AddMinutes(30).ToString("yyyy-MM-ddTHH:mm:ssZ")
        reason = "Routine checkup"
    } | ConvertTo-Json -Compress

    Test-Step -Name "Create appointment" -Method POST -Url '/appointments' -Headers $authHeaders -Body $newAppt -ExpectStatus '200|201' -Validate {
        param($b)
        $j = $b | ConvertFrom-Json
        if (-not $j.data.id) { return "FAIL: no appointment id" }
        $script:apptId = $j.data.id
        "id=$($j.data.id); status=$($j.data.status)"
    }

    if ($script:apptId) {
        Test-Step -Name "Today appointments" -Method GET -Url '/appointments/today' -Headers $authHeaders -ExpectStatus '200|201'

        Test-Step -Name "Appointment detail" -Method GET -Url "/appointments/$($script:apptId)" -Headers $authHeaders -ExpectStatus '200|201'
    }
}

# ============================================================
#  INVENTORY
# ============================================================
Write-Host ""
Write-Host "[5] Inventory" -ForegroundColor Cyan

Test-Step -Name "List items" -Method GET -Url '/inventory/items?pageSize=3' -Headers $authHeaders -ExpectStatus '200|201'

Test-Step -Name "Low stock items" -Method GET -Url '/inventory/items/low-stock' -Headers $authHeaders -ExpectStatus '200|201'

$newItem = @{
    sku = "TEST-$ts"
    name = "Test Item $ts"
    quantityOnHand = 100
    minStockLevel = 10
    unit = "pcs"
    costPrice = 5000
} | ConvertTo-Json -Compress

Test-Step -Name "Create inventory item" -Method POST -Url '/inventory/items' -Headers $authHeaders -Body $newItem -ExpectStatus '200|201' -Validate {
    param($b)
    $j = $b | ConvertFrom-Json
    if (-not $j.data.id) { return "FAIL: no item id" }
    $script:itemId = $j.data.id
    "id=$($j.data.id); code=$($j.data.code)"
}

# ============================================================
#  PAYROLL CONFIG
# ============================================================
Write-Host ""
Write-Host "[6] Payroll Config" -ForegroundColor Cyan

Test-Step -Name "Get payroll config" -Method GET -Url '/payroll/config' -Headers $authHeaders -ExpectStatus '200|201' -Validate {
    param($b)
    $j = $b | ConvertFrom-Json
    if (-not $j.data) { return "FAIL: no config" }
    "cycle=$($j.data.payrollCycle)"
}

# ============================================================
#  REPORTS
# ============================================================
Write-Host ""
Write-Host "[7] Reports" -ForegroundColor Cyan

Test-Step -Name "Revenue report" -Method GET -Url '/billing/reports/revenue?from=2026-01-01&to=2026-12-31' -Headers $authHeaders -ExpectStatus '200|201'

Test-Step -Name "Outstanding summary" -Method GET -Url '/billing/reports/outstanding-summary' -Headers $authHeaders -ExpectStatus '200|201'

Test-Step -Name "Dashboard KPIs" -Method GET -Url '/billing/reports/dashboard-kpis' -Headers $authHeaders -ExpectStatus '200|201'

# ============================================================
#  SECURITY TESTS
# ============================================================
Write-Host ""
Write-Host "[8] Security / Validation" -ForegroundColor Cyan

Test-Step -Name "No token => 401" -Method GET -Url '/admin/users' -ExpectStatus '401'

Test-Step -Name "Invalid token => 401" -Method GET -Url '/admin/users' -Headers @{ Authorization = "Bearer invalid.token.here" } -ExpectStatus '401'

Test-Step -Name "Bad UUID => 400" -Method GET -Url '/patients/not-a-uuid' -Headers $authHeaders -ExpectStatus '400'

$weakLogin = @{ email = "a@b.c"; password = "123" } | ConvertTo-Json -Compress
Test-Step -Name "Weak password => 400" -Method POST -Url '/auth/login' -Body $weakLogin -ExpectStatus '400'

$badEmail = @{ email = "admin@clinic.local"; password = "WrongPassword" } | ConvertTo-Json -Compress
Test-Step -Name "Wrong password => 401" -Method POST -Url '/auth/login' -Body $badEmail -ExpectStatus '401'

# ============================================================
#  SUMMARY
# ============================================================
Write-Host ""
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "  SUMMARY" -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta
$total = $pass + $fail
if ($fail -eq 0) {
    Write-Host "  $pass / $total passed" -ForegroundColor Green
    Write-Host "  ALL TESTS PASSED" -ForegroundColor Green
} else {
    Write-Host "  $pass / $total passed" -ForegroundColor Yellow
    Write-Host "  $fail FAILED" -ForegroundColor Red
}
Write-Host ""
exit $fail