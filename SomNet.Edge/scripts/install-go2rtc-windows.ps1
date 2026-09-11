# Download go2rtc for Windows into D:\SomNet.Edge\bin (or SOMNET_EDGE_HOME)
# Usage: .\install-go2rtc-windows.ps1

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\edge-home.ps1"

$paths = Get-SomNetEdgePaths
$bin = $paths.Bin
$base = $paths.Base

if (-not (Test-Path 'D:\') -and -not $env:SOMNET_EDGE_HOME) {
    Write-Warning 'Drive D: not found — set SOMNET_EDGE_HOME to your preferred path and re-run.'
}

New-Item -ItemType Directory -Force -Path $bin, $paths.Logs | Out-Null

$release = Invoke-RestMethod -Uri 'https://api.github.com/repos/AlexxIT/go2rtc/releases/latest' `
    -Headers @{ 'User-Agent' = 'SomNet-Setup' }
$asset = $release.assets | Where-Object { $_.name -like 'go2rtc_win*.zip' } | Select-Object -First 1
if (-not $asset) { throw "No Windows go2rtc asset found in $($release.tag_name)" }

$zip = Join-Path $env:TEMP $asset.name
Write-Host "Installing $($release.tag_name) to $bin ..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip -UseBasicParsing
Expand-Archive -Path $zip -DestinationPath $bin -Force
Remove-Item $zip -Force

$example = Join-Path $PSScriptRoot '..\config\go2rtc.yaml.example'
$config = $paths.Config
if (-not (Test-Path $config)) {
    Copy-Item $example $config
    Write-Host "Created config: $config"
} else {
    Write-Host "Config already exists: $config (not overwritten)"
}

Write-Host "Installed: $(Join-Path $bin 'go2rtc.exe')"
Write-Host "Edge home: $base"
Write-Host "Next: .\SomNet.Edge\scripts\list-camera-devices.ps1  then  start-go2rtc-windows.ps1"
