param(
    [string]$LakodiRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$AiRoot = (Join-Path (Split-Path -Parent $LakodiRoot) "AI_Agent_Accounting")
)

$ErrorActionPreference = "Stop"

$lakodiBackend = "lakodi-lakodi-backend-dev-1"
$aiApi = "ai_agent_accounting-api-1"

Write-Host "Syncing AI_AUTH_* from Lakodi runtime into AI .env and recreating AI api/worker..." -ForegroundColor Cyan

$key = (docker exec $lakodiBackend printenv AI_AUTH_KEY_ID).Trim()
$secret = (docker exec $lakodiBackend printenv AI_AUTH_SIGNING_SECRET).Trim()
$issuer = (docker exec $lakodiBackend printenv AI_AUTH_TOKEN_ISSUER).Trim()
$audience = (docker exec $lakodiBackend printenv AI_AUTH_TOKEN_AUDIENCE).Trim()
$connector = "http://lakodi-backend-dev:8016"

if (-not $key -or -not $secret) {
    throw "Lakodi backend missing AI_AUTH_KEY_ID / AI_AUTH_SIGNING_SECRET"
}

$aiEnv = Join-Path $AiRoot ".env"
if (-not (Test-Path -LiteralPath $aiEnv)) {
    throw "AI .env not found: $aiEnv"
}

$map = [ordered]@{
    AI_AUTH_KEY_ID                 = $key
    AI_AUTH_SIGNING_SECRET         = $secret
    AI_AUTH_TOKEN_ISSUER           = $issuer
    AI_AUTH_TOKEN_AUDIENCE         = $audience
    ACCOUNTING_CONNECTOR_BASE_URL  = $connector
}

$lines = Get-Content -LiteralPath $aiEnv -Encoding UTF8
$seen = @{}
$out = foreach ($line in $lines) {
    $hit = $false
    foreach ($k in $map.Keys) {
        if ($line -match "^$([regex]::Escape($k))=") {
            $seen[$k] = $true
            $hit = $true
            "$k=$($map[$k])"
            break
        }
    }
    if (-not $hit) { $line }
}
foreach ($k in $map.Keys) {
    if (-not $seen.ContainsKey($k)) { $out += "$k=$($map[$k])" }
}
Set-Content -LiteralPath $aiEnv -Value $out -Encoding UTF8
Write-Host "[OK] AI .env updated KEY=$key SECRET_LEN=$($secret.Length)" -ForegroundColor Green

# Force compose substitution from this process (overrides stale host env)
$env:AI_AUTH_KEY_ID = $key
$env:AI_AUTH_SIGNING_SECRET = $secret
$env:AI_AUTH_TOKEN_ISSUER = $issuer
$env:AI_AUTH_TOKEN_AUDIENCE = $audience
$env:ACCOUNTING_CONNECTOR_BASE_URL = $connector

Set-Location $AiRoot
docker compose -f docker-compose.yml -f docker-compose.lakodi-bridge.yml up -d --force-recreate api celery-worker
if ($LASTEXITCODE -ne 0) { throw "AI recreate failed" }

for ($i = 1; $i -le 20; $i++) {
    $code = & curl.exe -s -o NUL -w "%{http_code}" --max-time 3 "http://127.0.0.1:8001/health"
    if ($code -eq "200") { break }
    Start-Sleep -Seconds 2
}

$runtimeKey = (docker exec $aiApi printenv AI_AUTH_KEY_ID).Trim()
$runtimeSecret = docker exec $aiApi printenv AI_AUTH_SIGNING_SECRET
Write-Host "runtime KEY=$runtimeKey SECRET_LEN=$($runtimeSecret.Length) match_secret=$($runtimeSecret -eq $secret)" -ForegroundColor Cyan
if ($runtimeKey -ne $key -or $runtimeSecret -ne $secret) {
    throw "AI runtime AI_AUTH still mismatched after recreate"
}

Write-Host "[OK] AI auth aligned with Lakodi. Retry AI asistent in admin." -ForegroundColor Green
