# Start Cloudflare Quick Tunnel (Phase 6) - exposes SomNet API :5031 to the internet.
# Docs: Documents/19-Video-Phase-6-Tunnel-Checklist.md

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\edge-home.ps1"

$paths = Get-SomNetEdgePaths
$localExe = Join-Path $paths.Bin 'cloudflared.exe'
$apiUrl = 'http://localhost:5031'

function Get-CloudflaredCommand {
    if (Test-Path $localExe) { return $localExe }
    $onPath = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }
    return $null
}

$cloudflared = Get-CloudflaredCommand
if (-not $cloudflared) {
    Write-Host "cloudflared not found at $localExe or on PATH."
    Write-Host 'Run: .\SomNet.Edge\scripts\install-cloudflared-windows.ps1'
    Write-Host 'Or install from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/'
    exit 1
}

try {
    $null = Invoke-WebRequest -Uri $apiUrl -UseBasicParsing -TimeoutSec 3
}
catch {
    Write-Warning "SomNet API is not responding at $apiUrl - start go2rtc, edge agent, and API first."
    Write-Host '  .\SomNet.Edge\scripts\start-go2rtc-windows.ps1'
    Write-Host '  .\SomNet.Edge\scripts\start-edge-agent.ps1'
    Write-Host '  dotnet run --project SomNet.API'
}

Write-Host ''
Write-Host 'Cloudflare Quick Tunnel (Phase 6)'
Write-Host "  Edge home:   $($paths.Base)"
Write-Host "  cloudflared: $cloudflared"
Write-Host "  Target:      $apiUrl (SomNet API + UI + /go2rtc proxy)"
Write-Host ''
Write-Host 'Copy the https://*.trycloudflare.com URL printed below for remote smoke tests.'
Write-Host 'The URL changes each run - acceptable for dev; named tunnel + custom domain in Phase 7/8.'
Write-Host 'Do not expose go2rtc :1984 or edge agent :5190 - tunnel API only.'
Write-Host ''

& $cloudflared tunnel --url $apiUrl
