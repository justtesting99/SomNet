# Start go2rtc for SomNet Phase 1 bench (Windows).
# Docs: Documents/14-Video-Phase-1-Edge-Bench-Checklist.md

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\edge-home.ps1"

$paths = Get-SomNetEdgePaths
$exe = Join-Path $paths.Bin 'go2rtc.exe'
$config = $paths.Config
$example = Join-Path $PSScriptRoot '..\config\go2rtc.yaml.example'

if (-not (Test-Path $exe)) {
    Write-Host "go2rtc not found at $exe"
    Write-Host 'Run: .\SomNet.Edge\scripts\install-go2rtc-windows.ps1'
    exit 1
}

if (-not (Test-Path $config)) {
    New-Item -ItemType Directory -Force -Path $paths.Base | Out-Null
    Copy-Item $example $config
    Write-Host "Created $config from example - edit camera device before use."
}

Write-Host "Edge home: $($paths.Base)"
Write-Host "Config:    $config"
Write-Host 'Web UI:    http://localhost:1984'
Write-Host 'Front:     http://localhost:1984/stream.html?src=front'
Write-Host 'Rear:      http://localhost:1984/stream.html?src=rear'
Write-Host ''
Write-Host 'Tip: run list-camera-devices.ps1 if front shows errors (Windows needs device index or name).'

Set-Location $paths.Bin
& $exe -config $config
