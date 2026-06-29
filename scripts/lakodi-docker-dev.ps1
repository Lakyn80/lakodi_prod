param(
    [ValidateSet("start", "stop", "restart", "rebuild", "status", "logs", "smoke")]
    [string]$Command = "status"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ComposeFiles = @("docker-compose.yml", "docker-compose.dev.yml")
$ComposeArgs = @("-f", $ComposeFiles[0], "-f", $ComposeFiles[1])
$Services = @("lakodi-redis", "lakodi-backend-dev", "lakodi-frontend-dev")
$BuildServices = @("lakodi-frontend-dev", "lakodi-backend-dev")
$LogServices = @("lakodi-backend-dev", "lakodi-frontend-dev")
$SmokeRetryCount = 10
$SmokeRetryDelaySeconds = 3
$SmokeChecks = @(
    @{ Name = "backend health"; Url = "http://localhost:8016/api/health"; ExpectedStatus = 200 },
    @{ Name = "accounting list route"; Url = "http://localhost:8090/admin/ucetnictvi-new"; ExpectedStatus = 200 },
    @{ Name = "accounting detail route"; Url = "http://localhost:8090/admin/ucetnictvi-new/doklady/1"; ExpectedStatus = 200 },
    @{ Name = "legacy invoices route"; Url = "http://localhost:8090/admin/invoices"; ExpectedStatus = 200 },
    @{ Name = "legacy invoices admin API (unauthenticated)"; Url = "http://localhost:8090/api/admin/invoices"; ExpectedStatus = 401 }
)

function Write-Section {
    param([string]$Message)
    Write-Host ""
    Write-Host "== $Message ==" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-WarningLine {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Test-CommandAvailable {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name is not available on PATH."
    }
}

function Test-ComposeFiles {
    foreach ($file in $ComposeFiles) {
        $path = Join-Path $RepoRoot $file
        if (-not (Test-Path -LiteralPath $path)) {
            throw "Required compose file not found: $path"
        }
    }
}

function Test-DockerRunning {
    Test-CommandAvailable -Name "docker"
    Test-CommandAvailable -Name "curl.exe"

    & docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Desktop is not running or the Docker daemon is unavailable."
    }
}

function Get-ComposeServices {
    $output = & docker compose @ComposeArgs config --services 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to resolve docker compose services with the required dev files.`n$output"
    }

    return @($output | Where-Object { $_ -and $_.Trim() })
}

function Assert-ExpectedServices {
    $available = Get-ComposeServices
    $missing = @($Services | Where-Object { $_ -notin $available })

    if ($missing.Count -gt 0) {
        throw "Compose services are missing from docker-compose.yml + docker-compose.dev.yml: $($missing -join ', ')"
    }
}

function Invoke-DockerCompose {
    param(
        [string[]]$Arguments,
        [string]$FailureMessage
    )

    $commandText = "docker compose " + (($ComposeArgs + $Arguments) -join " ")
    Write-Host $commandText -ForegroundColor DarkGray

    & docker compose @ComposeArgs @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }
}

function Show-Urls {
    Write-Host ""
    Write-Host "Local URLs:" -ForegroundColor Cyan
    Write-Host "  http://localhost:8016/api/health"
    Write-Host "  http://localhost:8090/admin/ucetnictvi-new"
    Write-Host "  http://localhost:8090/admin/invoices"
}

function Start-Stack {
    Write-Section "Starting local Lakodi dev stack"
    Invoke-DockerCompose -Arguments (@("up", "-d") + $Services) -FailureMessage "Failed to start the local Lakodi dev stack."
    Show-Urls
}

function Stop-Stack {
    Write-Section "Stopping local Lakodi dev services"
    Invoke-DockerCompose -Arguments (@("stop") + $Services) -FailureMessage "Failed to stop the local Lakodi dev services."
}

function Restart-Stack {
    Stop-Stack
    Start-Stack
}

function Rebuild-Stack {
    Write-Section "Rebuilding frontend and backend dev images"
    Invoke-DockerCompose -Arguments (@("build", "--no-cache") + $BuildServices) -FailureMessage "Failed to rebuild Lakodi dev images."
}

function Show-Status {
    Write-Section "Compose status"
    Write-Host "Compose files: $($ComposeFiles -join ', ')"
    Write-Host "Services: $($Services -join ', ')"
    Invoke-DockerCompose -Arguments (@("ps", "-a") + $Services) -FailureMessage "Failed to read Lakodi dev service status."
}

function Show-Logs {
    Write-Section "Recent backend/frontend logs"
    Invoke-DockerCompose -Arguments (@("logs", "--tail", "50") + $LogServices) -FailureMessage "Failed to read Lakodi dev logs."
}

function Invoke-SmokeCheck {
    param(
        [string]$Name,
        [string]$Url,
        [int]$ExpectedStatus
    )

    $lastError = $null

    for ($attempt = 1; $attempt -le $SmokeRetryCount; $attempt++) {
        $responsePath = [System.IO.Path]::GetTempFileName()

        try {
            $httpCode = & curl.exe -s -o $responsePath -w "%{http_code}" $Url
            if ($LASTEXITCODE -ne 0) {
                throw "curl.exe failed for $Url"
            }

            $statusCode = [int]$httpCode
            if ($statusCode -ne $ExpectedStatus) {
                $body = Get-Content -LiteralPath $responsePath -Raw
                throw "$Name expected HTTP $ExpectedStatus but got HTTP $statusCode for $Url.`nResponse body:`n$body"
            }

            Write-Success "$Name -> HTTP $statusCode"
            return
        } catch {
            $lastError = $_

            if ($attempt -lt $SmokeRetryCount) {
                Start-Sleep -Seconds $SmokeRetryDelaySeconds
            }
        } finally {
            Remove-Item -LiteralPath $responsePath -ErrorAction SilentlyContinue
        }
    }

    throw $lastError
}

Push-Location $RepoRoot

try {
    Test-ComposeFiles
    Test-DockerRunning
    Assert-ExpectedServices

    switch ($Command) {
        "start" {
            Start-Stack
        }
        "stop" {
            Stop-Stack
        }
        "restart" {
            Restart-Stack
        }
        "rebuild" {
            Rebuild-Stack
        }
        "status" {
            Show-Status
        }
        "logs" {
            Show-Logs
        }
        "smoke" {
            Write-Section "Smoke checks"
            foreach ($check in $SmokeChecks) {
                Invoke-SmokeCheck -Name $check.Name -Url $check.Url -ExpectedStatus $check.ExpectedStatus
            }
            Write-WarningLine "Expected unauthenticated admin API response is HTTP 401."
        }
        default {
            throw "Unsupported command: $Command"
        }
    }
} finally {
    Pop-Location
}
