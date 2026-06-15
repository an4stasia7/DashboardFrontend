$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$distConfig = Join-Path $repoRoot "js\config.dist.js"
$activeConfig = Join-Path $repoRoot "js\config.js"
$devBackup = Join-Path $repoRoot "js\config.js.dev.bak"

if (-not (Test-Path -LiteralPath $distConfig)) {
  Write-Error "Missing js/config.dist.js (set production API_BASE_URL for release build)."
}

if (Test-Path -LiteralPath $activeConfig) {
  Copy-Item -LiteralPath $activeConfig -Destination $devBackup -Force
  Write-Host "Backed up local config to js/config.js.dev.bak"
}

Copy-Item -LiteralPath $distConfig -Destination $activeConfig -Force
Write-Host "Release build uses js/config.dist.js as js/config.js"
exit 0
