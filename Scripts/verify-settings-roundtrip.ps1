$ErrorActionPreference = 'Stop'
$base = 'http://localhost:5031'

Write-Host '=== §6.3.3 API round-trip ==='

$login = Invoke-RestMethod -Uri "$base/api/auth/login" -Method POST -ContentType 'application/json' -Body '{"username":"demo","password":"demo"}'
$token = $login.token.accessToken
$headers = @{ Authorization = "Bearer $token" }

$get1 = Invoke-RestMethod -Uri "$base/api/settings?subTarget=Slv66" -Headers $headers
Write-Host "GET before: automaticMode=$($get1.automatic.automaticMode)"

$automatic = [ordered]@{
  running = $false
  automaticMode = 'powerWave'
  minimumStrokeMs = $get1.automatic.minimumStrokeMs
  maximumStrokeMs = $get1.automatic.maximumStrokeMs
  minimumPower = 15
  maximumPower = 80
  strokeMinSeconds = 3
  strokeMaxSeconds = 25
  delayBeforeStartSeconds = $get1.automatic.delayBeforeStartSeconds
  endSessionValue = 42
  endSessionMode = 'minutes'
  burstsOn = $false
  burstPercent = $get1.automatic.burstPercent
  burstStyle = $get1.automatic.burstStyle
  burstStrokePowerMin = $get1.automatic.burstStrokePowerMin
  burstStrokePowerMax = $get1.automatic.burstStrokePowerMax
  burstDelayMin = $get1.automatic.burstDelayMin
  burstDelayMax = $get1.automatic.burstDelayMax
  burstStrokesMin = $get1.automatic.burstStrokesMin
  burstStrokesMax = $get1.automatic.burstStrokesMax
}

$payload = @{
  appOptions = $get1.appOptions
  manual = $get1.manual
  automatic = $automatic
} | ConvertTo-Json -Depth 12

$put = Invoke-RestMethod -Uri "$base/api/settings?subTarget=Slv66" -Method PUT -Headers $headers -ContentType 'application/json' -Body $payload
Write-Host "PUT response: automaticMode=$($put.automatic.automaticMode) minimumPower=$($put.automatic.minimumPower) endSessionValue=$($put.automatic.endSessionValue)"

$get2 = Invoke-RestMethod -Uri "$base/api/settings?subTarget=Slv66" -Headers $headers
Write-Host "GET after: automaticMode=$($get2.automatic.automaticMode) minimumPower=$($get2.automatic.minimumPower) endSessionValue=$($get2.automatic.endSessionValue)"

$ok = ($get2.automatic.automaticMode -eq 'powerWave') -and ($get2.automatic.minimumPower -eq 15) -and ($get2.automatic.endSessionValue -eq 42)
if (-not $ok) {
  Write-Error 'Round-trip verification failed'
}

Write-Host 'PASS: settings round-trip'

# Restore original mode to avoid leaving test data
$automatic.automaticMode = $get1.automatic.automaticMode
$automatic.minimumPower = $get1.automatic.minimumPower
$automatic.maximumPower = $get1.automatic.maximumPower
$automatic.strokeMinSeconds = $get1.automatic.strokeMinSeconds
$automatic.strokeMaxSeconds = $get1.automatic.strokeMaxSeconds
$automatic.endSessionValue = $get1.automatic.endSessionValue
$automatic.endSessionMode = $get1.automatic.endSessionMode
$restorePayload = @{
  appOptions = $get1.appOptions
  manual = $get1.manual
  automatic = $automatic
} | ConvertTo-Json -Depth 12
Invoke-RestMethod -Uri "$base/api/settings?subTarget=Slv66" -Method PUT -Headers $headers -ContentType 'application/json' -Body $restorePayload | Out-Null
Write-Host "Restored automaticMode=$($get1.automatic.automaticMode)"
