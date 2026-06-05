$ErrorActionPreference = "SilentlyContinue"
$deadline = (Get-Date).AddSeconds(60)

do {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000" -TimeoutSec 2
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      exit 0
    }
  } catch {
    Start-Sleep -Seconds 1
  }
} while ((Get-Date) -lt $deadline)

exit 1
