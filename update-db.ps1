param(
  [string]$DbFilePath = ""
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

function Invoke-Cmd {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  Write-Host (">> {0} {1}" -f $FilePath, ($Arguments -join " "))
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw ("Command failed ({0}): {1}" -f $LASTEXITCODE, $FilePath)
  }
}

function Read-EnvFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  $map = @{}
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
    $map[$key] = $value
  }
  return $map
}

function Require-EnvValue {
  param(
    [Parameter(Mandatory = $true)][hashtable]$Map,
    [Parameter(Mandatory = $true)][string]$Key
  )

  if (-not $Map.ContainsKey($Key) -or [string]::IsNullOrWhiteSpace($Map[$Key])) {
    throw ("Missing required value in .env: {0}" -f $Key)
  }
  return $Map[$Key]
}

if (-not (Test-Path ".env")) {
  throw "Missing .env in project root."
}

$envMap = Read-EnvFile -Path ".env"
$deployServerUser = Require-EnvValue -Map $envMap -Key "DEPLOY_SERVER_USER"
$deployServerHost = Require-EnvValue -Map $envMap -Key "DEPLOY_SERVER_HOST"
$deployServerPath = Require-EnvValue -Map $envMap -Key "DEPLOY_SERVER_PATH"
$sshKeyPath = $envMap["DEPLOY_SSH_KEY_PATH"]

if ([string]::IsNullOrWhiteSpace($DbFilePath)) {
  if ($envMap.ContainsKey("DEPLOY_DB_LOCAL_PATH") -and -not [string]::IsNullOrWhiteSpace($envMap["DEPLOY_DB_LOCAL_PATH"])) {
    $DbFilePath = $envMap["DEPLOY_DB_LOCAL_PATH"]
  } else {
    $DbFilePath = ".\data\app.db"
  }
}

$resolvedDbPath = Resolve-Path -Path $DbFilePath -ErrorAction SilentlyContinue
if ($null -eq $resolvedDbPath) {
  throw ("DB file not found: {0}" -f $DbFilePath)
}
$localDbPath = $resolvedDbPath.Path

$sshTarget = "{0}@{1}" -f $deployServerUser, $deployServerHost
$sshArgs = @()
if (-not [string]::IsNullOrWhiteSpace($sshKeyPath)) {
  $sshArgs += @("-i", $sshKeyPath)
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$remoteTmp = "/tmp/lakodi-appdb-$timestamp.db"

Write-Host ("DB source: {0}" -f $localDbPath)
Write-Host ("Server: {0}" -f $sshTarget)
Write-Host ("Target path: {0}/data/app.db" -f $deployServerPath)

Invoke-Cmd -FilePath "ssh" -Arguments ($sshArgs + @(
  $sshTarget,
  ("mkdir -p {0} {0}/data" -f $deployServerPath)
))

Invoke-Cmd -FilePath "scp" -Arguments ($sshArgs + @(
  $localDbPath,
  ("{0}:{1}" -f $sshTarget, $remoteTmp)
))

$remoteUpdate = @"
set -e
cd $deployServerPath
if [ -f data/app.db ]; then cp data/app.db data/app.db.bak-$timestamp; fi
docker compose stop lakodi-backend || true
mv $remoteTmp data/app.db
docker compose up -d lakodi-backend
docker compose logs --tail=60 lakodi-backend || true
"@

Invoke-Cmd -FilePath "ssh" -Arguments ($sshArgs + @(
  $sshTarget,
  $remoteUpdate
))

Write-Host ""
Write-Host "HOTOVO"
Write-Host ("Nahrana DB: {0}" -f $localDbPath)
Write-Host ("Zaloha na serveru: {0}/data/app.db.bak-{1}" -f $deployServerPath, $timestamp)
