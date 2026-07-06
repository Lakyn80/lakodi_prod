param(
    [string]$BaseUrl = "http://localhost:8016",
    [string]$Email = "lakodi@seznam.cz",
    [string]$Password = "admin123",
    [switch]$SkipAres
)

$ErrorActionPreference = "Stop"

function Write-Pass {
    param([string]$Message)
    Write-Host "[PASS] $Message" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[FAIL] $Message" -ForegroundColor Red
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

function Assert-Equal {
    param(
        [string]$Name,
        $Actual,
        $Expected
    )

    if ($Actual -ne $Expected) {
        throw "$Name expected '$Expected' but got '$Actual'"
    }
}

function Assert-True {
    param(
        [string]$Name,
        [bool]$Condition
    )

    if (-not $Condition) {
        throw "$Name expected True but got False"
    }
}

function Invoke-ExpectHttpError {
    param(
        [string]$Name,
        [scriptblock]$Action,
        [int]$ExpectedStatus,
        [string]$ExpectedBodySubstring
    )

    try {
        & $Action | Out-Null
        throw "$Name unexpectedly succeeded"
    } catch {
        if (-not $_.Exception.Response) {
            throw
        }

        $status = [int]$_.Exception.Response.StatusCode
        if ($status -ne $ExpectedStatus) {
            throw "$Name expected HTTP $ExpectedStatus but got HTTP $status"
        }

        $body = ""
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            $body = [string]$_.ErrorDetails.Message
        } elseif ($_.Exception.Response.GetResponseStream()) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $body = $reader.ReadToEnd()
        }
        if ($body -notlike "*$ExpectedBodySubstring*") {
            throw "$Name expected response containing '$ExpectedBodySubstring' but got '$body'"
        }

        Write-Pass "$Name returned HTTP $ExpectedStatus"
    }
}

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

Write-Host "Base URL: $BaseUrl"
Write-Host "Testing invoices backend..."

try {
    $login = Invoke-ApiJson -Method "POST" -Uri "$BaseUrl/api/admin/login" -Session $session -Body @{
        email = $Email
        password = $Password
    }
    Assert-True -Name "login.ok" -Condition ([bool]$login.ok)
    Assert-Equal -Name "login.role" -Actual $login.role -Expected "admin"
    Write-Pass "Admin login"

    $check = Invoke-ApiJson -Method "GET" -Uri "$BaseUrl/api/admin/check" -Session $session
    Assert-True -Name "check.authenticated" -Condition ([bool]$check.authenticated)
    Assert-Equal -Name "check.role" -Actual $check.role -Expected "admin"
    Write-Pass "Admin session"

    if ($SkipAres) {
        Write-Host "[SKIP] ARES lookup" -ForegroundColor Yellow
    } else {
        try {
            $ares = Invoke-ApiJson -Method "GET" -Uri "$BaseUrl/api/admin/invoices/ares/09695982" -Session $session
        } catch {
            if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 502) {
                throw "ARES lookup returned 502. If you want local dev fallback, make sure the running backend has ARES_PROVIDER=mock and restart the container, or run this script with -SkipAres."
            }
            throw
        }

        Assert-Equal -Name "ares.ico" -Actual $ares.ico -Expected "09695982"
        Assert-Equal -Name "ares.company_name" -Actual $ares.company_name -Expected "lakodi s.r.o."
        Assert-True -Name "ares.source" -Condition ($ares.source -in @("ares", "mock_ares"))
        Write-Pass "ARES lookup"
    }

    $standardInvoice = @{
        issue_date = "2026-04-05"
        due_date = "2026-04-19"
        customer_name = "Jan Novak"
        customer_email = "jan@example.com"
        customer_phone = "+420123456789"
        customer_address = "Praha 10"
        customer_ico = "12345678"
        customer_dic = "CZ12345678"
        note = "PowerShell smoke test"
        business_mode = "autoservice"
        tax_mode = "standard"
        currency = "CZK"
        vat_rate = 21
        items = @(
            @{ description = "Diagnostics"; quantity = 1; unit_price = 1200 }
            @{ description = "Gearbox repair"; quantity = 2; unit_price = 3500 }
        )
    }

    $created = Invoke-ApiJson -Method "POST" -Uri "$BaseUrl/api/admin/invoices" -Session $session -Body $standardInvoice
    Assert-True -Name "created.id" -Condition ([int]$created.id -gt 0)
    Assert-Equal -Name "created.business_mode" -Actual $created.business_mode -Expected "autoservice"
    Assert-Equal -Name "created.tax_mode" -Actual $created.tax_mode -Expected "standard"
    Assert-Equal -Name "created.currency" -Actual $created.currency -Expected "CZK"
    Assert-Equal -Name "created.total" -Actual ([double]$created.total) -Expected 9922
    Write-Pass "Standard invoice create"

    $detail = Invoke-ApiJson -Method "GET" -Uri "$BaseUrl/api/admin/invoices/$($created.id)" -Session $session
    Assert-Equal -Name "detail.id" -Actual ([int]$detail.id) -Expected ([int]$created.id)
    Assert-Equal -Name "detail.customer_name" -Actual $detail.customer_name -Expected "Jan Novak"
    Assert-Equal -Name "detail.items.count" -Actual ([int]$detail.items.Count) -Expected 2
    Write-Pass "Invoice detail"

    $list = Invoke-ApiJson -Method "GET" -Uri "$BaseUrl/api/admin/invoices" -Session $session
    if (@($list).Count -lt 1) {
        throw "Invoice list is empty"
    }
    Write-Pass "Invoice list"

    $reverseInvoice = @{
        issue_date = "2026-04-05"
        due_date = "2026-04-20"
        customer_name = "Stavby Partner"
        customer_email = "stavby@example.com"
        customer_phone = "+420777888999"
        customer_address = "Brno"
        business_mode = "construction"
        tax_mode = "reverse_charge"
        currency = "CZK"
        vat_rate = 21
        items = @(
            @{ description = "Construction service"; quantity = 3; unit_price = 5000 }
        )
    }

    $reverseCreated = Invoke-ApiJson -Method "POST" -Uri "$BaseUrl/api/admin/invoices" -Session $session -Body $reverseInvoice
    Assert-Equal -Name "reverse.tax_mode" -Actual $reverseCreated.tax_mode -Expected "reverse_charge"
    Assert-Equal -Name "reverse.business_mode" -Actual $reverseCreated.business_mode -Expected "construction"
    Assert-Equal -Name "reverse.vat_amount" -Actual ([double]$reverseCreated.vat_amount) -Expected 0
    Assert-Equal -Name "reverse.total" -Actual ([double]$reverseCreated.total) -Expected 15000
    Write-Pass "Reverse charge invoice create"

    Invoke-ExpectHttpError -Name "standard_without_vat_rate" -ExpectedStatus 422 -ExpectedBodySubstring "VAT rate is required for standard tax mode." -Action {
        Invoke-ApiJson -Method "POST" -Uri "$BaseUrl/api/admin/invoices" -Session $session -Body @{
            issue_date = "2026-04-05"
            due_date = "2026-04-19"
            customer_name = "Bad Test"
            customer_email = "bad@example.com"
            business_mode = "autoservice"
            tax_mode = "standard"
            currency = "CZK"
            items = @(
                @{ description = "Diagnostics"; quantity = 1; unit_price = 1200 }
            )
        }
    }

    Invoke-ExpectHttpError -Name "reverse_charge_wrong_business_mode" -ExpectedStatus 422 -ExpectedBodySubstring "Reverse charge invoices must use business mode 'construction'." -Action {
        Invoke-ApiJson -Method "POST" -Uri "$BaseUrl/api/admin/invoices" -Session $session -Body @{
            issue_date = "2026-04-05"
            due_date = "2026-04-19"
            customer_name = "Bad Test"
            customer_email = "bad@example.com"
            business_mode = "autoservice"
            tax_mode = "reverse_charge"
            currency = "CZK"
            items = @(
                @{ description = "Service"; quantity = 1; unit_price = 5000 }
            )
        }
    }

    Invoke-ExpectHttpError -Name "empty_items" -ExpectedStatus 422 -ExpectedBodySubstring "Invoice must contain at least one item." -Action {
        Invoke-ApiJson -Method "POST" -Uri "$BaseUrl/api/admin/invoices" -Session $session -Body @{
            issue_date = "2026-04-05"
            due_date = "2026-04-19"
            customer_name = "Bad Test"
            customer_email = "bad@example.com"
            business_mode = "autoservice"
            tax_mode = "standard"
            currency = "CZK"
            vat_rate = 21
            items = @()
        }
    }

    Invoke-ExpectHttpError -Name "quantity_zero" -ExpectedStatus 422 -ExpectedBodySubstring "Item quantity must be greater than zero." -Action {
        Invoke-ApiJson -Method "POST" -Uri "$BaseUrl/api/admin/invoices" -Session $session -Body @{
            issue_date = "2026-04-05"
            due_date = "2026-04-19"
            customer_name = "Bad Test"
            customer_email = "bad@example.com"
            business_mode = "autoservice"
            tax_mode = "standard"
            currency = "CZK"
            vat_rate = 21
            items = @(
                @{ description = "Diagnostics"; quantity = 0; unit_price = 1200 }
            )
        }
    }

    Invoke-ExpectHttpError -Name "negative_unit_price" -ExpectedStatus 422 -ExpectedBodySubstring "Item unit price cannot be negative." -Action {
        Invoke-ApiJson -Method "POST" -Uri "$BaseUrl/api/admin/invoices" -Session $session -Body @{
            issue_date = "2026-04-05"
            due_date = "2026-04-19"
            customer_name = "Bad Test"
            customer_email = "bad@example.com"
            business_mode = "autoservice"
            tax_mode = "standard"
            currency = "CZK"
            vat_rate = 21
            items = @(
                @{ description = "Diagnostics"; quantity = 1; unit_price = -1 }
            )
        }
    }

    Invoke-ExpectHttpError -Name "missing_invoice_detail" -ExpectedStatus 404 -ExpectedBodySubstring "Invoice not found." -Action {
        Invoke-ApiJson -Method "GET" -Uri "$BaseUrl/api/admin/invoices/999999" -Session $session
    }

    Write-Host ""
    Write-Host "All invoice tests passed." -ForegroundColor Green
} catch {
    Write-Fail $_.Exception.Message
    exit 1
}
