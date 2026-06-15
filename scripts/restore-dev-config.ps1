$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$activeConfig = Join-Path $repoRoot "js\config.js"
$devBackup = Join-Path $repoRoot "js\config.js.dev.bak"

if (-not (Test-Path -LiteralPath $devBackup)) {
  Write-Host "No js/config.js.dev.bak - local config was not restored."
  exit 0
}

Copy-Item -LiteralPath $devBackup -Destination $activeConfig -Force
Remove-Item -LiteralPath $devBackup -Force
Write-Host "Restored local js/config.js from .dev.bak"
exit 0
