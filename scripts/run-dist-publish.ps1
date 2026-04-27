$ErrorActionPreference = "Stop"

function Resolve-GhToken {
  $direct = [string]$env:GH_TOKEN
  if ($direct -and $direct.Trim()) {
    return $direct.Trim()
  }

  foreach ($scope in @("Process", "User", "Machine")) {
    try {
      $v = [Environment]::GetEnvironmentVariable("GH_TOKEN", $scope)
      if ($v -and [string]$v.Trim()) {
        return [string]$v.Trim()
      }
    } catch {
      # ignore
    }
  }

  $tokenFile = Join-Path $env:LOCALAPPDATA "DashboardDesktop\gh_token.txt"
  if (Test-Path -LiteralPath $tokenFile) {
    $fromFile = Get-Content -LiteralPath $tokenFile -Raw
    if ($fromFile -and [string]$fromFile.Trim()) {
      return [string]$fromFile.Trim()
    }
  }

  return ""
}

$token = Resolve-GhToken
if (-not $token) {
  Write-Error @"
GH_TOKEN не найден.

Сделай один раз любой из вариантов:
1) Постоянно для пользователя Windows:
   setx GH_TOKEN "твой_токен"
   затем открой новый терминал и снова запусти npm run dist:publish

2) Файл (удобно для Cursor, если setx не подхватывается сразу):
   mkdir "$env:LOCALAPPDATA\DashboardDesktop" -Force | Out-Null
   Set-Content -LiteralPath "$env:LOCALAPPDATA\DashboardDesktop\gh_token.txt" -Value "твой_токен" -Encoding utf8

3) Только на текущую сессию:
   `$env:GH_TOKEN="твой_токен"
"@
}

$env:GH_TOKEN = $token

$repoRoot = Split-Path -Parent $PSScriptRoot
$builder = Join-Path $repoRoot "node_modules\.bin\electron-builder.cmd"
if (-not (Test-Path -LiteralPath $builder)) {
  Write-Error "Не найден electron-builder: $builder. Сначала выполни npm install."
}

& $builder @("--win", "--publish", "always")
exit $LASTEXITCODE
