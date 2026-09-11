# Test an RTSP URL before adding it to go2rtc.yaml (Phase 1b).
# Usage:
#   .\test-rtsp.ps1 -Url 'rtsp://USER:PASS@192.168.1.50:554/live/ch1'
#   .\test-rtsp.ps1 -Url 'rtsp://USER:PASS@192.168.1.50:554/live/ch0' -Seconds 8

param(
    [Parameter(Mandatory = $true)]
    [string]$Url,

    [int]$Seconds = 5
)

$ErrorActionPreference = 'Stop'

$ffmpegCmd = Get-Command ffmpeg -ErrorAction SilentlyContinue
$ffmpeg = if ($ffmpegCmd) { $ffmpegCmd.Source } else { $null }
if (-not $ffmpeg) {
    Write-Host 'ffmpeg not on PATH.'
    Write-Host 'Install: winget install Gyan.FFmpeg  (then reopen PowerShell)'
    exit 1
}

Write-Host "Testing RTSP ($Seconds s): $Url"
Write-Host ''

$args = @(
    '-hide_banner',
    '-loglevel', 'warning',
    '-rtsp_transport', 'tcp',
    '-i', $Url,
    '-an',
    '-f', 'null',
    '-t', "$Seconds",
    '-'
)

& $ffmpeg @args 2>&1 | ForEach-Object { $_.ToString() }

if ($LASTEXITCODE -eq 0) {
    Write-Host ''
    Write-Host 'OK — RTSP stream readable. Add this URL to go2rtc.yaml under streams.rear'
    exit 0
}

Write-Host ''
Write-Host "FAILED (exit $LASTEXITCODE). Check IP, credentials, RTSP enabled in Wansview Cloud app, and path (/live/ch0 or /live/ch1)."
exit $LASTEXITCODE
