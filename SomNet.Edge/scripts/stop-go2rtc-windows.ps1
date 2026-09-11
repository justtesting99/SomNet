# Stop all go2rtc processes (free ports 1984 / 8554 before restart).
# Usage: .\stop-go2rtc-windows.ps1

$procs = Get-Process go2rtc -ErrorAction SilentlyContinue
if (-not $procs) {
    Write-Host 'No go2rtc process running.'
    exit 0
}

foreach ($p in $procs) {
    Write-Host "Stopping go2rtc PID $($p.Id) ..."
    try {
        Stop-Process -Id $p.Id -Force -ErrorAction Stop
    } catch {
        Write-Warning "Could not stop PID $($p.Id): $($_.Exception.Message)"
        Write-Host 'Close the other PowerShell window running go2rtc, or run Task Manager -> End go2rtc.exe'
    }
}

Start-Sleep 1
$left = Get-Process go2rtc -ErrorAction SilentlyContinue
if ($left) {
    Write-Host 'Still running:' ($left.Id -join ', ')
    exit 1
}

Write-Host 'go2rtc stopped.'
