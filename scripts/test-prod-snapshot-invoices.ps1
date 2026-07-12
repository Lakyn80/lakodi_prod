param(
    [string]$SnapshotPath = "",
    [string]$ExpectedSha256 = "8e85cf8e8e497ef1fd94a56d78a7717dfd246bd0275293e7cf822c642d463268",
    [int]$ExpectedInvoiceCount = 20,
    [int]$ExpectedLastNumber = 43,
    [string]$ExpectedNextNumber = "0044",
    [string]$ExpectedMaxInvoiceNumber = "0043",
    [string]$AdminEmail = "lakodi@seznam.cz",
    [string]$AdminPassword = "admin123",
    [switch]$KeepApiTestCopy
)

$ErrorActionPreference = "Stop"

$Root = Split-Path $PSScriptRoot -Parent
if (-not $SnapshotPath) {
    $SnapshotPath = Join-Path $Root "production-data\lakodi-prod-invoices-2026-07-12\app.db"
}

$VerifyScript = Join-Path $PSScriptRoot "verify_prod_invoice_snapshot.py"
$ApiScript = Join-Path $PSScriptRoot "run_snapshot_invoice_api_check.py"
$SnapshotDir = Split-Path $SnapshotPath -Parent
$ApiTestCopy = Join-Path $SnapshotDir "app.api-test.db"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "== $Message ==" -ForegroundColor Cyan
}

function Invoke-PythonScript {
    param(
        [string]$ScriptPath,
        [string[]]$Arguments
    )

    $output = & python $ScriptPath @Arguments 2>&1
    $output | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) {
        throw "Script failed: $ScriptPath (exit $LASTEXITCODE)"
    }
}

Write-Host "Lakodi prod snapshot invoice verification"
Write-Host "Root: $Root"
Write-Host "Snapshot: $SnapshotPath"

if (-not (Test-Path $SnapshotPath)) {
    throw "Snapshot DB not found: $SnapshotPath"
}

Write-Step "1/3 Read-only snapshot verify"
Invoke-PythonScript -ScriptPath $VerifyScript -Arguments @(
    "--db-path", $SnapshotPath,
    "--expected-sha256", $ExpectedSha256,
    "--expected-invoice-count", $ExpectedInvoiceCount,
    "--expected-last-number", $ExpectedLastNumber,
    "--expected-next-number", $ExpectedNextNumber
)

Write-Step "2/3 Prepare writable API test copy"
if (Test-Path $ApiTestCopy) {
    Remove-Item $ApiTestCopy -Force
}
Copy-Item $SnapshotPath $ApiTestCopy
Write-Host "Copy: $ApiTestCopy"

Write-Step "3/3 API checks on DB copy (no writes except startup migrations/password sync on copy)"
$env:ADMIN_EMAIL = $AdminEmail
$env:ADMIN_PASSWORD = $AdminPassword
Invoke-PythonScript -ScriptPath $ApiScript -Arguments @(
    "--db-path", $ApiTestCopy,
    "--expected-invoice-count", $ExpectedInvoiceCount,
    "--expected-next-number", $ExpectedNextNumber,
    "--expected-max-invoice-number", $ExpectedMaxInvoiceNumber,
    "--admin-email", $AdminEmail,
    "--admin-password", $AdminPassword
)

Write-Step "4/4 Confirm original snapshot unchanged"
Invoke-PythonScript -ScriptPath $VerifyScript -Arguments @(
    "--db-path", $SnapshotPath,
    "--expected-sha256", $ExpectedSha256,
    "--expected-invoice-count", $ExpectedInvoiceCount,
    "--expected-last-number", $ExpectedLastNumber,
    "--expected-next-number", $ExpectedNextNumber
)

if (-not $KeepApiTestCopy) {
    Remove-Item $ApiTestCopy -Force
    Write-Host "Removed temporary API test copy."
} else {
    Write-Host "Kept API test copy: $ApiTestCopy"
}

Write-Host ""
Write-Host "All prod snapshot invoice tests passed." -ForegroundColor Green
