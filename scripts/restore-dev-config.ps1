$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$activeConfig = Join-Path $repoRoot "js\config.js"
$devBackup = Join-Path $repoRoot "js\config.js.dev.bak"

if (-not (Test-Path -LiteralPath $devBackup)) {
  Write-Host "js/config.js.dev.bak не найден — локальный config не восстанавливался."
  exit 0
}

Copy-Item -LiteralPath $devBackup -Destination $activeConfig -Force
Remove-Item -LiteralPath $devBackup -Force
Write-Host "Восстановлен локальный js/config.js из .dev.bak"
