param(
    [ValidateSet("quick", "full", "release")]
    [string]$Mode = "quick"
)

$baseUrl = if ($env:TEST_BASE_URL) { $env:TEST_BASE_URL } else { "http://127.0.0.1:5000" }
$reportDir = "tests/reports"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$logFile = Join-Path $reportDir "${Mode}_${timestamp}.log"

New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

Write-Host "[INFO] Mode: $Mode"
Write-Host "[INFO] Base URL: $baseUrl"

switch ($Mode) {
    "quick" { $markExpr = "quick" }
    "full" { $markExpr = "quick or full" }
    "release" { $markExpr = "quick or full or heavy" }
}

Write-Host "[INFO] Running pytest marker expression: $markExpr"
python -m pytest -m $markExpr -q --base-url $baseUrl 2>&1 | Tee-Object -FilePath $logFile

Write-Host "[INFO] Completed. Log: $logFile"
