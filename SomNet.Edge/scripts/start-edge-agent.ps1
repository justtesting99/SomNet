# Start SomNet edge agent (Phase 5+) — session lifecycle hooks for go2rtc.
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$project = Join-Path $repoRoot "SomNet.Edge.Agent\SomNet.Edge.Agent.csproj"

Write-Host "Starting SomNet edge agent on http://localhost:5190 ..."
dotnet run --project $project
