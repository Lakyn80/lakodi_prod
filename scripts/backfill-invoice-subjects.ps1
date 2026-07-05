# Requires PowerShell 7+ for correct UTF-8 (diacritics). On Windows use:
#   pwsh -File .\scripts\backfill-invoice-subjects.ps1 [-DryRun]
# Do not use `powershell -File` — that launches Windows PowerShell 5.1.

param(
    [string]$BaseUrl = "http://localhost:8016",
    [string]$Email = "lakodi@seznam.cz",
    [string]$Password = "admin123",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Write-Info([string]$Message) {
    Write-Host $Message
}

function Invoke-ApiJson {
    param(
        [string]$Method,
        [string]$Uri,
        [Microsoft.PowerShell.Commands.WebRequestSession]$Session,
        [object]$Body = $null
    )

    $params = @{
        Method     = $Method
        Uri        = $Uri
        WebSession = $Session
    }

    if ($null -ne $Body) {
        $params.ContentType = "application/json"
        $params.Body = ($Body | ConvertTo-Json -Depth 10)
    }

    return Invoke-RestMethod @params
}

function Normalize-Ico([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $null
    }

    $digits = ($Value -replace "\D", "").Trim()
    if ($digits.Length -eq 0) {
        return $null
    }

    return $digits
}

function Normalize-Key([string]$Name, [string]$Email, [string]$Ico) {
    $normalizedIco = Normalize-Ico $Ico
    if ($normalizedIco) {
        return "ico:$normalizedIco"
    }

    $emailValue = if ($Email) { $Email } else { "" }
    $nameValue = if ($Name) { $Name } else { "" }
    $normalizedEmail = $emailValue.Trim().ToLowerInvariant()
    $normalizedName = $nameValue.Trim().ToLowerInvariant()
    return "contact:$normalizedEmail|$normalizedName"
}

Write-Info "Logging in to $BaseUrl ..."
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{ email = $Email; password = $Password }
Invoke-ApiJson -Method "POST" -Uri "$BaseUrl/api/admin/login" -Session $session -Body $loginBody | Out-Null

$invoices = Invoke-ApiJson -Method "GET" -Uri "$BaseUrl/api/admin/invoices" -Session $session
$existingSubjects = Invoke-ApiJson -Method "GET" -Uri "$BaseUrl/api/admin/invoices/subjects" -Session $session

$existingKeys = @{}
foreach ($subject in $existingSubjects) {
    $key = Normalize-Key $subject.name $subject.email $subject.ico
    $existingKeys[$key] = $subject.id
}

$candidates = @{}
foreach ($invoice in $invoices) {
    $name = [string]$invoice.customer_name
    $email = [string]$invoice.customer_email
    $address = [string]$invoice.customer_address

    if ([string]::IsNullOrWhiteSpace($name) -or [string]::IsNullOrWhiteSpace($email) -or [string]::IsNullOrWhiteSpace($address)) {
        continue
    }

    $key = Normalize-Key $name $email $invoice.customer_ico
    if ($existingKeys.ContainsKey($key) -or $candidates.ContainsKey($key)) {
        continue
    }

    $candidates[$key] = [ordered]@{
        name    = $name.Trim()
        email   = $email.Trim()
        phone   = if ($invoice.customer_phone) { [string]$invoice.customer_phone } else { $null }
        address = $address.Trim()
        ico     = if ($invoice.customer_ico) { [string]$invoice.customer_ico } else { $null }
        dic     = if ($invoice.customer_dic) { [string]$invoice.customer_dic } else { $null }
        country = "CZ"
        note    = "Backfill from legacy invoice $($invoice.invoice_number)"
    }
}

Write-Info "Found $($candidates.Count) unique legacy customers to backfill (existing subjects: $($existingSubjects.Count))."

$created = 0
foreach ($entry in $candidates.GetEnumerator()) {
    $payload = @{
        name    = $entry.Value.name
        email   = $entry.Value.email
        phone   = $entry.Value.phone
        address = $entry.Value.address
        ico     = $entry.Value.ico
        dic     = $entry.Value.dic
        country = $entry.Value.country
        note    = $entry.Value.note
    }

    if ($DryRun) {
        Write-Info "[DRY-RUN] Would create subject $($entry.Value.name) ($($entry.Key))"
        continue
    }

    $result = Invoke-ApiJson -Method "POST" -Uri "$BaseUrl/api/admin/invoices/subjects" -Session $session -Body $payload
    $existingKeys[$entry.Key] = $result.id
    $created += 1
    Write-Info "Created subject #$($result.id): $($entry.Value.name)"
}

if ($DryRun) {
    Write-Info "Dry run complete."
} else {
    Write-Info "Backfill complete. Created $created subjects."
}
