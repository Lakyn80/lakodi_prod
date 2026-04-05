$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

function Import-EnvFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path $Path)) {
    return
  }

  foreach ($line in Get-Content -Path $Path) {
    $trimmed = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
      continue
    }

    $parts = $trimmed -split "=", 2
    if ($parts.Count -ne 2) {
      continue
    }

    $key = $parts[0].Trim()
    $value = $parts[1].Trim()
    [Environment]::SetEnvironmentVariable($key, $value, "Process")
  }
}

Import-EnvFile ".env"
Import-EnvFile ".env.dev"

if (-not $env:DATABASE_URL) { $env:DATABASE_URL = "sqlite:///./data/app.db" }
if (-not $env:UPLOAD_DIR) { $env:UPLOAD_DIR = "./data/uploads" }
if (-not $env:NEXT_PUBLIC_API_URL) { $env:NEXT_PUBLIC_API_URL = "http://localhost:8016" }
if (-not $env:CORS_ORIGINS) { $env:CORS_ORIGINS = "http://localhost:8090,http://127.0.0.1:8090,http://localhost:3000,http://127.0.0.1:3000" }
if (-not $env:ADMIN_EMAIL) { $env:ADMIN_EMAIL = "lakodi@seznam.cz" }
if (-not $env:ADMIN_PASSWORD) { $env:ADMIN_PASSWORD = "admin123" }
if (-not $env:REDIS_URL) { $env:REDIS_URL = "redis://lakodi-redis:6379/0" }
if (-not $env:ARES_PROVIDER) { $env:ARES_PROVIDER = "mock" }

New-Item -ItemType Directory -Force -Path "data" | Out-Null
New-Item -ItemType Directory -Force -Path "data/uploads" | Out-Null
New-Item -ItemType Directory -Force -Path "data/redis" | Out-Null

Write-Host ">> startuji kompletní Docker dev stack (backend + frontend + redis)"
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build --remove-orphans
if ($LASTEXITCODE -ne 0) {
  throw "Spuštění Docker dev služeb selhalo."
}
