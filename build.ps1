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

$dockerHubFrontendRepo = Require-EnvValue -Map $envMap -Key "DOCKERHUB_FE_REPO"
$dockerHubBackendRepo = Require-EnvValue -Map $envMap -Key "DOCKERHUB_BE_REPO"
$deployServerUser = Require-EnvValue -Map $envMap -Key "DEPLOY_SERVER_USER"
$deployServerHost = Require-EnvValue -Map $envMap -Key "DEPLOY_SERVER_HOST"
$deployServerPath = Require-EnvValue -Map $envMap -Key "DEPLOY_SERVER_PATH"
$publicApiUrl = Require-EnvValue -Map $envMap -Key "NEXT_PUBLIC_API_URL"
$sshKeyPath = $envMap["DEPLOY_SSH_KEY_PATH"]

$tag = Get-Date -Format "yyyyMMdd-HHmmss"
$backendTag = "{0}:{1}" -f $dockerHubBackendRepo, $tag
$frontendTag = "{0}:{1}" -f $dockerHubFrontendRepo, $tag
$backendLatest = "{0}:latest" -f $dockerHubBackendRepo
$frontendLatest = "{0}:latest" -f $dockerHubFrontendRepo

Write-Host ("Tag: {0}" -f $tag)
Write-Host ("Backend image: {0}" -f $backendTag)
Write-Host ("Frontend image: {0}" -f $frontendTag)

Invoke-Cmd -FilePath "docker" -Arguments @(
  "build",
  "-f", "backend/Dockerfile.prod",
  "-t", $backendTag,
  "-t", $backendLatest,
  "."
)

Invoke-Cmd -FilePath "docker" -Arguments @(
  "build",
  "-f", "frontend/Dockerfile.prod",
  "--build-arg", ("NEXT_PUBLIC_API_URL={0}" -f $publicApiUrl),
  "-t", $frontendTag,
  "-t", $frontendLatest,
  "frontend"
)

Invoke-Cmd -FilePath "docker" -Arguments @("push", $backendTag)
Invoke-Cmd -FilePath "docker" -Arguments @("push", $backendLatest)
Invoke-Cmd -FilePath "docker" -Arguments @("push", $frontendTag)
Invoke-Cmd -FilePath "docker" -Arguments @("push", $frontendLatest)

$tmpDir = Join-Path $env:TEMP ("lakodi-deploy-" + $tag)
if (Test-Path $tmpDir) {
  Remove-Item -Recurse -Force $tmpDir
}
New-Item -ItemType Directory -Path $tmpDir | Out-Null

$tmpCompose = Join-Path $tmpDir "docker-compose.yml"
$tmpEnv = Join-Path $tmpDir ".env"

Copy-Item -Path "docker-compose.server.yml" -Destination $tmpCompose -Force
Copy-Item -Path ".env" -Destination $tmpEnv -Force

$envLines = Get-Content -Path $tmpEnv
$updated = $false
for ($i = 0; $i -lt $envLines.Count; $i++) {
  if ($envLines[$i] -match "^DEPLOY_TAG=") {
    $envLines[$i] = ("DEPLOY_TAG={0}" -f $tag)
    $updated = $true
  }
}
if (-not $updated) {
  $envLines += ("DEPLOY_TAG={0}" -f $tag)
}
Set-Content -Path $tmpEnv -Value $envLines -Encoding UTF8

$sshTarget = "{0}@{1}" -f $deployServerUser, $deployServerHost
$sshArgs = @()
if (-not [string]::IsNullOrWhiteSpace($sshKeyPath)) {
  $sshArgs += @("-i", $sshKeyPath)
}

Invoke-Cmd -FilePath "ssh" -Arguments ($sshArgs + @(
  $sshTarget,
  ("mkdir -p {0} {0}/data {0}/data/redis" -f $deployServerPath)
))

Invoke-Cmd -FilePath "scp" -Arguments ($sshArgs + @(
  $tmpCompose,
  $tmpEnv,
  ("{0}:{1}/" -f $sshTarget, $deployServerPath)
))

$remoteDeploy = @"
set -e
cd $deployServerPath
docker compose pull
docker compose up -d --remove-orphans
docker image prune -f
"@

Invoke-Cmd -FilePath "ssh" -Arguments ($sshArgs + @(
  $sshTarget,
  $remoteDeploy
))

Write-Host ""
Write-Host "HOTOVO"
Write-Host ("Nasazeny tag: {0}" -f $tag)
Write-Host ("Backend: {0}" -f $backendTag)
Write-Host ("Frontend: {0}" -f $frontendTag)
