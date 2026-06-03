$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$distConfig = Join-Path $repoRoot "js\config.dist.js"
$activeConfig = Join-Path $repoRoot "js\config.js"
$devBackup = Join-Path $repoRoot "js\config.js.dev.bak"

if (-not (Test-Path -LiteralPath $distConfig)) {
  Write-Error "Не найден js/config.dist.js — задайте production API_BASE_URL для сборки."
}

if (Test-Path -LiteralPath $activeConfig) {
  Copy-Item -LiteralPath $activeConfig -Destination $devBackup -Force
  Write-Host "Сохранён локальный config: js/config.js.dev.bak"
}

Copy-Item -LiteralPath $distConfig -Destination $activeConfig -Force
Write-Host "Для сборки подставлен js/config.dist.js -> js/config.js"
