# List DirectShow cameras for go2rtc on Windows.
# Usage: .\list-camera-devices.ps1

. "$PSScriptRoot\edge-home.ps1"

$paths = Get-SomNetEdgePaths
$go2rtc = Join-Path $paths.Bin 'go2rtc.exe'

Write-Host "SomNet Edge home: $($paths.Base)"
Write-Host ''

$ffmpegCmd = Get-Command ffmpeg -ErrorAction SilentlyContinue
$ffmpeg = if ($ffmpegCmd) { $ffmpegCmd.Source } else { $null }
if (-not $ffmpeg) {
    Write-Host 'ffmpeg not on PATH.'
    Write-Host 'Install: winget install Gyan.FFmpeg  (then reopen PowerShell)'
    Write-Host 'Or use go2rtc web UI: http://localhost:1984 → Add stream → Device'
    if (Test-Path $go2rtc) {
        Write-Host "go2rtc: $go2rtc"
    }
    exit 0
}

Write-Host "Using: $ffmpeg"
Write-Host ''

# ffmpeg prints the device list on stderr — not a failure
$raw = & $ffmpeg -hide_banner -list_devices true -f dshow -i dummy 2>&1 |
    ForEach-Object { $_.ToString() }

$videoNames = [System.Collections.Generic.List[string]]::new()
$audioNames = [System.Collections.Generic.List[string]]::new()

foreach ($line in $raw) {
    if ($line -match '"([^"]+)"\s+\((video|audio)\)') {
        if ($Matches[2] -eq 'video') {
            [void]$videoNames.Add($Matches[1])
        } else {
            [void]$audioNames.Add($Matches[1])
        }
    }
}

if ($videoNames.Count -eq 0) {
    Write-Host 'No DirectShow video devices found.'
    Write-Host 'Plug in a webcam and close apps that may lock the camera (Teams, Zoom).'
    Write-Host ''
    Write-Host '--- raw ffmpeg output ---'
    $raw | ForEach-Object { Write-Host $_ }
    exit 1
}

Write-Host 'DirectShow video devices (for go2rtc.yaml front stream):'
Write-Host ''
for ($i = 0; $i -lt $videoNames.Count; $i++) {
    Write-Host "  [$i] $($videoNames[$i])"
}

$recommended = 0
Write-Host ''
Write-Host 'Suggested go2rtc.yaml front entry (index 0 = first camera above):'
Write-Host "  front:"
Write-Host "    - ffmpeg:device?video=$recommended#video=h264"
Write-Host '  (Add video_size/framerate only if ffmpeg test confirms the camera supports them.)'
Write-Host ''
Write-Host "Your camera appears to be: $($videoNames[$recommended])"
Write-Host 'Edit: D:\SomNet.Edge\go2rtc.yaml  then restart start-go2rtc-windows.ps1'

if ($audioNames.Count -gt 0) {
    Write-Host ''
    Write-Host 'Audio devices (optional - front stream uses video only):'
    for ($i = 0; $i -lt $audioNames.Count; $i++) {
        Write-Host "  [$i] $($audioNames[$i])"
    }
}

exit 0
