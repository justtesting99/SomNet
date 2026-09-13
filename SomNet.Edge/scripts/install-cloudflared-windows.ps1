# Download cloudflared for Windows into D:\SomNet.Edge\bin (or SOMNET_EDGE_HOME)
# Usage: .\install-cloudflared-windows.ps1

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\edge-home.ps1"

$paths = Get-SomNetEdgePaths
$bin = $paths.Bin
$exe = Join-Path $bin 'cloudflared.exe'

if (-not (Test-Path 'D:\') -and -not $env:SOMNET_EDGE_HOME) {
    Write-Warning 'Drive D: not found — set SOMNET_EDGE_HOME to your preferred path and re-run.'
}

New-Item -ItemType Directory -Force -Path $bin, $paths.Logs | Out-Null

$release = Invoke-RestMethod -Uri 'https://api.github.com/repos/cloudflare/cloudflared/releases/latest' `
    -Headers @{ 'User-Agent' = 'SomNet-Setup' }
$asset = $release.assets | Where-Object { $_.name -eq 'cloudflared-windows-amd64.exe' } | Select-Object -First 1
if (-not $asset) { throw "No Windows cloudflared asset found in $($release.tag_name)" }

Write-Host "Installing $($release.tag_name) to $exe ..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $exe -UseBasicParsing

Write-Host "Installed: $exe"
Write-Host "Edge home: $($paths.Base)"
Write-Host 'Next: start go2rtc, edge agent, and API — then .\SomNet.Edge\scripts\start-cloudflare-tunnel.ps1'
