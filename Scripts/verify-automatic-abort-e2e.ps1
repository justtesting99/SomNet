# Phase F E2E — Automatic abort (device + history verification)
# UI steps: Automatic tab, Slv66, Periodic, No AutoEnd, Start → 2–3 strokes → Abort
param(
    [string]$BaseUrl = 'http://localhost:5031',
    [string]$SubTarget = 'Slv66',
    [string]$DomTarget = 'demo',
    [int]$WatchSeconds = 180,
    [switch]$WatchOnly
)

$ErrorActionPreference = 'Stop'

function Get-AuthHeaders {
    $login = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method POST -ContentType 'application/json' -Body '{"username":"demo","password":"demo"}'
    $token = $login.token.accessToken
    return @{ Authorization = "Bearer $token" }
}

function Get-LatestAutomaticSession {
    param($Headers)
    $sessions = Invoke-RestMethod -Uri "$BaseUrl/api/history/sessions?domTarget=$DomTarget&subTarget=$SubTarget" -Headers $Headers
    return $sessions | Where-Object { $_.mode -eq 'Automatic' -or $_.mode -eq 'automatic' } | Select-Object -First 1
}

$headers = Get-AuthHeaders

Write-Host '=== Phase F — Automatic abort E2E ===' -ForegroundColor Cyan
Write-Host "API: $BaseUrl | Sub: $SubTarget | Device check..."

$device = Invoke-RestMethod -Uri "$BaseUrl/api/devices/status?subTarget=$SubTarget" -Headers $headers
if (-not $device.isConnected) {
    Write-Host "FAIL: Device not connected (paired=$($device.isPaired), id=$($device.deviceId))" -ForegroundColor Red
    exit 1
}

Write-Host "Device connected: $($device.deviceId)" -ForegroundColor Green

$before = Get-LatestAutomaticSession -Headers $headers
if ($before) {
    Write-Host "Latest automatic session before test: $($before.id) — $($before.summary)"
} else {
    Write-Host 'No prior automatic sessions in history.'
}

if (-not $WatchOnly) {
    Write-Host ''
    Write-Host 'Perform these steps in the browser NOW:' -ForegroundColor Yellow
    Write-Host '  1. Hard refresh (Ctrl+Shift+R) — Automatic tab, Sub Slv66'
    Write-Host '  2. Periodic, End Session = No AutoEnd, gap ~12 sec'
    Write-Host '  3. Start → wait for 2–3 strokes → Abort'
    Write-Host '  4. Confirm: running banner gone, Abort hidden, Stop disabled'
    Write-Host ''
}

Write-Host "Watching history for up to $WatchSeconds s..." -ForegroundColor Cyan

$deadline = (Get-Date).AddSeconds($WatchSeconds)
$found = $false

while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    $latest = Get-LatestAutomaticSession -Headers $headers
    if (-not $latest) { continue }

    $isNew = -not $before -or $latest.id -ne $before.id -or $latest.summary -ne $before.summary
    if ($isNew -and $latest.summary -match 'aborted') {
        Write-Host ''
        Write-Host 'PASS — aborted automatic session in history:' -ForegroundColor Green
        Write-Host "  id:      $($latest.id)"
        Write-Host "  started: $($latest.startedAt)"
        Write-Host "  summary: $($latest.summary)"
        $found = $true
        break
    }

    if ($isNew -and $latest.summary -match 'In progress') {
        Write-Host "  ... session $($latest.id) in progress"
    }
}

if (-not $found) {
    Write-Host ''
    Write-Host 'TIMEOUT — no (aborted) session detected. Check UI and device serial AUTO logs.' -ForegroundColor Red
    $after = Get-LatestAutomaticSession -Headers $headers
    if ($after) {
        Write-Host "Latest session: $($after.id) — $($after.summary)"
    }
    exit 1
}

exit 0
