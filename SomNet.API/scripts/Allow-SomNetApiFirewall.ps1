#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Allow inbound TCP 5031 (SomNet.API) on Private networks.

.DESCRIPTION
  Run once on the PC hosting SomNet.API when ESP32 devices cannot connect until
  you browse to the device page. Also verify router "AP/client isolation" is off.

  Example:
    .\Allow-SomNetApiFirewall.ps1
#>
param(
    [int] $Port = 5031,
    [string] $RuleName = "SomNet API (TCP 5031)"
)

$existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Firewall rule already exists: $RuleName"
    $existing | Format-Table DisplayName, Enabled, Direction, Action
    exit 0
}

New-NetFirewallRule `
    -DisplayName $RuleName `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort $Port `
    -Action Allow `
    -Profile Private `
    -Description "SomNet.API Kestrel — ESP32 hardware hub and REST."

Write-Host "Created inbound allow rule for TCP $Port on Private profile."
Write-Host "Test from another machine: Test-NetConnection -ComputerName <this-pc-ip> -Port $Port"
