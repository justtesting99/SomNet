# Quick LAN scan for devices listening on RTSP (port 554). Hints only — confirm IP in Wansview Cloud app.
# Usage: .\find-lan-rtsp.ps1
#        .\find-lan-rtsp.ps1 -Subnet 192.168.1

param(
    [string]$Subnet = ''
)

$ErrorActionPreference = 'SilentlyContinue'

if (-not $Subnet) {
    $local = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
        Select-Object -First 1
    if (-not $local) {
        Write-Host 'No LAN IPv4 address found.'
        exit 1
    }
    $Subnet = ($local.IPAddress -split '\.')[0..2] -join '.'
}

Write-Host "Scanning $Subnet.0/24 for TCP port 554 (RTSP)..."
Write-Host 'This may take a minute.'
Write-Host ''

$hits = [System.Collections.Generic.List[string]]::new()

1..254 | ForEach-Object {
    $ip = "$Subnet.$_"
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async = $client.BeginConnect($ip, 554, $null, $null)
        if ($async.AsyncWaitHandle.WaitOne(200) -and $client.Connected) {
            [void]$hits.Add($ip)
            Write-Host "  [554 open] $ip"
            $client.Close()
        } else {
            $client.Close()
        }
    } catch {}
}

Write-Host ''
if ($hits.Count -eq 0) {
    Write-Host "No RTSP listeners found."
    Write-Host "Ensure the camera is powered, on Wi-Fi, and RTSP is enabled in Wansview Cloud (Settings - Local application)."
} else {
    Write-Host "Found $($hits.Count) candidate(s). Match against the camera IP shown in the Wansview Cloud app."
    Write-Host "Then run test-rtsp.ps1 with your RTSP URL (see Documents/14-Video-Phase-1b-Galayou-G2-Setup.md)."
}

exit 0
