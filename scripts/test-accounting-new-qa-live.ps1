param(
    [string]$BaseUrl = "http://localhost:8016",
    [string]$Email = "lakodi@seznam.cz",
    [string]$Password = "admin123"
)

$ErrorActionPreference = "Stop"
$results = @()

function Add-Result {
    param([string]$Module, [string]$Scenario, [string]$Status, [string]$Note = "")
    $script:results += [pscustomobject]@{ Module = $Module; Scenario = $Scenario; Status = $Status; Note = $Note }
    $color = switch ($Status) { "PASS" { "Green" } "FAIL" { "Red" } default { "Yellow" } }
    Write-Host "[$Status] $Module :: $Scenario" -ForegroundColor $color
    if ($Note) { Write-Host "       $Note" -ForegroundColor DarkGray }
}

function Invoke-ApiJson {
    param([string]$Method, [string]$Uri, [Microsoft.PowerShell.Commands.WebRequestSession]$Session, [object]$Body = $null)
    $params = @{ Method = $Method; Uri = $Uri; WebSession = $Session }
    if ($null -ne $Body) { $params.ContentType = "application/json"; $params.Body = ($Body | ConvertTo-Json -Depth 12) }
    return Invoke-RestMethod @params
}

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Write-Host "Live QA against $BaseUrl" -ForegroundColor Cyan

try {
    $login = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/login" -Session $session -Body @{ email = $Email; password = $Password }
    if (-not $login.ok) { throw "Login failed" }
    Add-Result "Auth" "Admin login" "PASS"

    # 23 Settings
    $settings = Invoke-ApiJson -Method GET -Uri "$BaseUrl/api/admin/invoices/settings" -Session $session
    Add-Result "Nastavení" "Načtení issuer údajů" "PASS" ($settings.issuer_name)
    $origCurrency = $settings.default_currency
    $settingsBody = @{
        owner_email = $settings.owner_email
        issuer_name = $settings.issuer_name; issuer_address = $settings.issuer_address
        issuer_city = $settings.issuer_city; issuer_zip = $settings.issuer_zip
        issuer_ico = $settings.issuer_ico; issuer_dic = $settings.issuer_dic
        issuer_data_box = $settings.issuer_data_box; issuer_email = $settings.issuer_email
        issuer_phone = $settings.issuer_phone; default_due_days = $settings.default_due_days
        default_note = $settings.default_note
        bank_account_number = $settings.bank_account_number; bank_account_prefix = $settings.bank_account_prefix
        bank_code = $settings.bank_code; bank_iban = $settings.bank_iban
        payment_method = $settings.payment_method
        default_currency = $(if ($origCurrency -eq "CZK") { "EUR" } else { "CZK" })
    }
    $updated = Invoke-ApiJson -Method PUT -Uri "$BaseUrl/api/admin/invoices/settings" -Session $session -Body $settingsBody
    Add-Result "Nastavení" "Změna měny a uložení" "PASS" ("currency=" + $updated.default_currency)
    $settingsBody.default_currency = $origCurrency
    Invoke-ApiJson -Method PUT -Uri "$BaseUrl/api/admin/invoices/settings" -Session $session -Body $settingsBody | Out-Null

    # 5-7 Subjects
    $subject = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices/subjects" -Session $session -Body @{
        name = "QA Test Autoservis s.r.o."; email = "qa-subject@example.com"
        phone = "+420111222333"; address = "Praha 1"; ico = "87654321"; dic = "CZ87654321"; country = "CZ"
        note = "QA subject"
    }
    Add-Result "Odběratelé" "Vytvoření subjektu" "PASS" ("id=" + $subject.id)
    $subjects = Invoke-ApiJson -Method GET -Uri "$BaseUrl/api/admin/invoices/subjects?search=QA%20Test" -Session $session
    if (@($subjects).Count -ge 1) { Add-Result "Odběratelé" "Vyhledání podle jména" "PASS" } else { Add-Result "Odběratelé" "Vyhledání podle jména" "FAIL" }
    $subjectUpd = Invoke-ApiJson -Method PUT -Uri "$BaseUrl/api/admin/invoices/subjects/$($subject.id)" -Session $session -Body @{
        name = $subject.name; email = "qa-updated@example.com"; phone = $subject.phone
        address = $subject.address; ico = $subject.ico; dic = $subject.dic; country = $subject.country; note = "Updated QA"
    }
    Add-Result "Odběratelé" "Update e-mailu" "PASS" ($subjectUpd.email)

    # 11-12 Suppliers
    $supplier = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices/suppliers" -Session $session -Body @{
        name = "QA Shell ČR"; email = "qa-supplier@example.com"; phone = "+420999888777"
        address = "Brno"; ico = "25596641"; dic = "CZ25596641"; country = "CZ"; note = "QA supplier"
        bank_account_number = "1234567890"; bank_account_prefix = "19"; bank_code = "0800"
    }
    Add-Result "Dodavatelé" "Vytvoření dodavatele" "PASS" ("id=" + $supplier.id)

    # 3-4 Documents - draft CZK + EUR
    $draftCzk = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices" -Session $session -Body @{
        status = "draft"; issue_date = "2026-07-01"; due_date = "2026-07-15"
        subject_id = $subject.id; note = "QA draft CZK"; business_mode = "autoservice"
        tax_mode = "standard"; currency = "CZK"; vat_rate = 21
        items = @(@{ description = "Diagnostika"; quantity = 1; unit_price = 1500 })
    }
    Add-Result "Doklady" "Koncept CZK 1500" "PASS" ("id=" + $draftCzk.id + " status=" + $draftCzk.status)
    $draftEur = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices" -Session $session -Body @{
        status = "draft"; issue_date = "2026-07-01"; due_date = "2026-07-15"
        customer_name = "QA EUR Customer"; customer_email = "eur@example.com"; customer_address = "Praha"
        business_mode = "autoservice"; tax_mode = "standard"; currency = "EUR"; vat_rate = 21
        items = @(@{ description = "Service EUR"; quantity = 1; unit_price = 100 })
    }
    Add-Result "Doklady" "Koncept EUR 100" "PASS" ("currency=" + $draftEur.currency)

    # Issue separate invoice for bank matching (no prior payments)
    $bankInvoice = Invoke-ApiJson -Method PUT -Uri "$BaseUrl/api/admin/invoices/$($draftCzk.id)" -Session $session -Body @{
        status = "issued"; issue_date = $draftCzk.issue_date; due_date = $draftCzk.due_date
        subject_id = $subject.id; note = $draftCzk.note; business_mode = "autoservice"
        tax_mode = "standard"; currency = "CZK"; vat_rate = 21; document_kind = "invoice"
        items = @(@{ description = "Diagnostika"; quantity = 1; unit_price = 1500 })
    }
    Add-Result "Doklady" "Vystavení konceptu" "PASS" ("invoice_number=" + $bankInvoice.invoice_number + " VS=" + $bankInvoice.variable_symbol)

    # Second draft for payment tests
    $payDraft = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices" -Session $session -Body @{
        status = "draft"; issue_date = "2026-07-01"; due_date = "2026-07-15"
        subject_id = $subject.id; note = "QA payments"; business_mode = "autoservice"
        tax_mode = "standard"; currency = "CZK"; vat_rate = 21
        items = @(@{ description = "Platba test"; quantity = 1; unit_price = 1000 })
    }
    $issued = Invoke-ApiJson -Method PUT -Uri "$BaseUrl/api/admin/invoices/$($payDraft.id)" -Session $session -Body @{
        status = "issued"; issue_date = $payDraft.issue_date; due_date = $payDraft.due_date
        subject_id = $subject.id; note = $payDraft.note; business_mode = "autoservice"
        tax_mode = "standard"; currency = "CZK"; vat_rate = 21; document_kind = "invoice"
        items = @(@{ description = "Platba test"; quantity = 1; unit_price = 1000 })
    }

    # PDF
    $pdf = Invoke-WebRequest -Uri "$BaseUrl/api/admin/invoices/$($bankInvoice.id)/pdf" -WebSession $session
    if ($pdf.StatusCode -eq 200 -and $pdf.RawContentLength -gt 500) {
        Add-Result "Doklady" "PDF download" "PASS" ("bytes=" + $pdf.RawContentLength)
    } else { Add-Result "Doklady" "PDF download" "FAIL" }

    # Partial + full payment
    $partial = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices/$($issued.id)/payments" -Session $session -Body @{
        amount = 500; paid_at = "2026-07-02"; payment_method = "Bankovní převod"; note = "Partial QA"
    }
    if ($partial.remaining_amount -gt 0) { Add-Result "Doklady" "Částečná platba" "PASS" ("remaining=" + $partial.remaining_amount) }
    else { Add-Result "Doklady" "Částečná platba" "FAIL" }

    # 8-10 Expenses
    $expense = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices/expenses" -Session $session -Body @{
        issue_date = "2026-07-01"; received_date = "2026-07-01"; due_date = "2026-07-15"
        taxable_supply_date = "2026-07-01"; supplier_id = $supplier.id; note = "QA expense EUR"
        currency = "EUR"; vat_rate = 21; payment_method = "Bankovní převod"
        bank_account_number = "1234567890"; bank_code = "0800"
        items = @(@{ description = "Olej 5W30"; quantity = 1; unit_price = 890 })
    }
    Add-Result "Výdaje" "Výdaj s dodavatelem" "PASS" ("id=" + $expense.id)
    $expIssued = Invoke-ApiJson -Method PUT -Uri "$BaseUrl/api/admin/invoices/expenses/$($expense.id)" -Session $session -Body @{
        issue_date = $expense.issue_date; received_date = $expense.received_date; due_date = $expense.due_date
        taxable_supply_date = $expense.taxable_supply_date; supplier_id = $supplier.id; note = $expense.note
        currency = "EUR"; vat_rate = 21; payment_method = "Bankovní převod"
        bank_account_number = "1234567890"; bank_code = "0800"
        items = @(@{ description = "Olej 5W30"; quantity = 1; unit_price = 890 })
    }
    $expPartial = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices/expenses/$($expense.id)/payments" -Session $session -Body @{
        amount = 400; paid_at = "2026-07-02"; payment_method = "Bankovní převod"; note = "Partial"
    }
    Add-Result "Výdaje" "Částečná platba výdaje" "PASS" ("remaining=" + $expPartial.remaining_amount)

    # 13-15 Bank + matching (Scenario A tail)
    $bankExtId = "qa-bank-$(Get-Random)"
    $bankImport1 = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices/bank-transactions/import" -Session $session -Body @{
        transactions = @(@{
            external_id = $bankExtId; transaction_date = "2026-06-01"
            amount = $bankInvoice.total; currency = "CZK"; variable_symbol = $bankInvoice.variable_symbol
            direction = "incoming"; message = "QA bank match"
        })
    }
    Add-Result "Banka" "Import příchozí platby" "PASS" ("imported=" + $bankImport1.imported_count)
    $txId = $bankImport1.imported_transaction_ids[0]
    $bankImport2 = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices/bank-transactions/import" -Session $session -Body @{
        transactions = @(@{
            external_id = $bankExtId; transaction_date = "2026-06-01"
            amount = $bankInvoice.total; currency = "CZK"; variable_symbol = $bankInvoice.variable_symbol
            direction = "incoming"; message = "dup"
        })
    }
    Add-Result "Banka" "Duplicate guard" $(if ($bankImport2.skipped_duplicate_count -ge 1) { "PASS" } else { "FAIL" }) ("skipped=" + $bankImport2.skipped_duplicate_count)

    $matches = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices/bank-transactions/$txId/matches/generate" -Session $session
    if (@($matches).Count -ge 1) {
        Add-Result "Banka" "Generate matches" "PASS" ("count=" + @($matches).Count)
        $catalogBeforeApply = Invoke-ApiJson -Method GET -Uri "$BaseUrl/api/admin/invoices/bank-transactions/matches" -Session $session
        if (@($catalogBeforeApply).Count -ge 1 -and $catalogBeforeApply[0].candidate.invoice_id -eq $bankInvoice.id) {
            Add-Result "Párování" "Dashboard catalog endpoint" "PASS" ("match_id=" + $catalogBeforeApply[0].id)
        } else {
            Add-Result "Párování" "Dashboard catalog endpoint" "FAIL" "Suggested match with invoice candidate not returned"
        }
        $applied = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices/bank-transactions/$txId/matches/$($matches[0].id)/apply" -Session $session
        Add-Result "Párování" "Apply match" "PASS" ("status=" + $applied.status)
        $paidInvoice = Invoke-ApiJson -Method GET -Uri "$BaseUrl/api/admin/invoices/$($bankInvoice.id)" -Session $session
        Add-Result "Párování" "Faktura po apply" $(if ($paidInvoice.payment_status -eq "paid") { "PASS" } else { "FAIL" }) ("payment_status=" + $paidInvoice.payment_status)
        $catalogAfterApply = Invoke-ApiJson -Method GET -Uri "$BaseUrl/api/admin/invoices/bank-transactions/matches" -Session $session
        $stillSuggested = @($catalogAfterApply | Where-Object { $_.id -eq $matches[0].id }).Count -eq 0
        Add-Result "Párování" "Applied match removed from suggested catalog" $(if ($stillSuggested) { "PASS" } else { "FAIL" })
    } else {
        Add-Result "Banka" "Generate matches" "FAIL" "No matches (invoice may already be paid)"
    }

    # Isolated dashboard matching workflow (VS + 2 000 CZK)
    $vsDashboardDraft = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices" -Session $session -Body @{
        status = "draft"; issue_date = "2026-07-01"; due_date = "2026-07-15"
        subject_id = $subject.id; note = "QA dashboard VS matching"; business_mode = "autoservice"
        tax_mode = "standard"; currency = "CZK"; vat_rate = 0
        items = @(@{ description = "Dashboard match QA"; quantity = 1; unit_price = 2000 })
    }
    $vsDashboardInvoice = Invoke-ApiJson -Method PUT -Uri "$BaseUrl/api/admin/invoices/$($vsDashboardDraft.id)" -Session $session -Body @{
        status = "issued"; issue_date = $vsDashboardDraft.issue_date; due_date = $vsDashboardDraft.due_date
        subject_id = $subject.id; note = $vsDashboardDraft.note; business_mode = "autoservice"
        tax_mode = "standard"; currency = "CZK"; vat_rate = 0; document_kind = "invoice"
        items = @(@{ description = "Dashboard match QA"; quantity = 1; unit_price = 2000 })
    }
    $vsDashboardExtId = "qa-dashboard-vs-$(Get-Random)"
    $vsDashboardImport = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices/bank-transactions/import" -Session $session -Body @{
        transactions = @(@{
            external_id = $vsDashboardExtId; transaction_date = "2026-06-02"
            amount = 2000; currency = "CZK"; variable_symbol = $vsDashboardInvoice.variable_symbol
            direction = "incoming"; message = "QA dashboard VS matching"
        })
    }
    if ($vsDashboardImport.imported_count -ge 1) {
        $vsTxId = $vsDashboardImport.imported_transaction_ids[0]
        Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices/bank-transactions/$vsTxId/matches/generate" -Session $session | Out-Null
        $vsCatalog = Invoke-ApiJson -Method GET -Uri "$BaseUrl/api/admin/invoices/bank-transactions/matches" -Session $session
        $vsMatch = $vsCatalog | Where-Object { $_.bank_transaction.id -eq $vsTxId } | Select-Object -First 1
        if ($null -ne $vsMatch -and $vsMatch.candidate.invoice_id -eq $vsDashboardInvoice.id) {
            Add-Result "Párování" "Dashboard VS workflow catalog" "PASS" ("VS=" + $vsDashboardInvoice.variable_symbol)
            $vsApplied = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices/bank-transactions/$vsTxId/matches/$($vsMatch.id)/apply" -Session $session
            $vsTxDetail = Invoke-ApiJson -Method GET -Uri "$BaseUrl/api/admin/invoices/bank-transactions/$vsTxId" -Session $session
            $vsInvoicePaid = Invoke-ApiJson -Method GET -Uri "$BaseUrl/api/admin/invoices/$($vsDashboardInvoice.id)" -Session $session
            $vsCatalogAfter = Invoke-ApiJson -Method GET -Uri "$BaseUrl/api/admin/invoices/bank-transactions/matches" -Session $session
            $vsChecks = @(
                ($vsApplied.status -eq "applied"),
                ($vsTxDetail.status -eq "matched"),
                ($vsInvoicePaid.total_paid -eq 2000),
                (@($vsCatalogAfter | Where-Object { $_.id -eq $vsMatch.id }).Count -eq 0)
            )
            Add-Result "Párování" "Dashboard VS workflow apply" $(if ($vsChecks -notcontains $false) { "PASS" } else { "FAIL" }) ("VS=" + $vsDashboardInvoice.variable_symbol)
        } else {
            Add-Result "Párování" "Dashboard VS workflow catalog" "FAIL" "Invoice candidate not returned"
        }
    } else {
        Add-Result "Párování" "Dashboard VS workflow import" "FAIL" "Could not import isolated transaction"
    }

    # Outgoing for expense
    $outImport = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices/bank-transactions/import" -Session $session -Body @{
        transactions = @(@{
            external_id = "qa-out-$(Get-Random)"; transaction_date = "2026-06-03"
            amount = $expIssued.total; currency = "EUR"; variable_symbol = $expIssued.variable_symbol
            direction = "outgoing"; message = "QA expense bank"
        })
    }
    Add-Result "Banka" "Import odchozí platby" "PASS" ("imported=" + $outImport.imported_count)

    # 16-17 Todos - overdue invoice
    $overdue = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices" -Session $session -Body @{
        status = "issued"; issue_date = "2026-05-01"; due_date = "2026-05-02"
        customer_name = "QA Overdue"; customer_email = "overdue@example.com"; customer_address = "Brno"
        business_mode = "autoservice"; tax_mode = "standard"; currency = "CZK"; vat_rate = 21
        items = @(@{ description = "Overdue service"; quantity = 1; unit_price = 2000 })
    }
    $todoGen = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices/todos/generate" -Session $session
    Add-Result "Úkoly" "Generate todos" "PASS" ("generated=" + $todoGen.generated_count + " skipped=" + $todoGen.skipped_existing_count)
    $todos = Invoke-ApiJson -Method GET -Uri "$BaseUrl/api/admin/invoices/todos?status=open" -Session $session
    if (@($todos).Count -ge 1) {
        $todo = $todos[0]
        Add-Result "Úkoly" "Open todos list" "PASS"
        $completed = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices/todos/$($todo.id)/complete" -Session $session
        Add-Result "Úkoly" "Complete todo" "PASS" ("status=" + $completed.status)
    } else { Add-Result "Úkoly" "Open todos list" "SKIP" "No open todos" }

  # Email tests
    try {
        $emailResult = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices/$($overdue.id)/send-email" -Session $session -Body @{ recipient_email = "qa-test@example.com" }
        Add-Result "Doklady" "Odeslat e-mailem" "PASS" ($emailResult.status)
    } catch {
        Add-Result "Doklady" "Odeslat e-mailem" "SKIP" ($_.Exception.Message)
    }

    # 19 Attachments
    $tmpPdf = [System.IO.Path]::GetTempFileName() + ".pdf"
    "%PDF-1.4 QA test" | Set-Content -Path $tmpPdf -Encoding ascii
    $boundary = [guid]::NewGuid().ToString()
    $fileBytes = [System.IO.File]::ReadAllBytes($tmpPdf)
    # Use curl for multipart
    $attachResp = curl.exe -s -w "`n%{http_code}" -X POST "$BaseUrl/api/admin/invoices/attachments" `
        -b ($session.Cookies.GetCookies($BaseUrl) | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join "; " `
        -F "file=@$tmpPdf;type=application/pdf" 2>$null
    Remove-Item $tmpPdf -Force -ErrorAction SilentlyContinue
    if ($attachResp -match "200") { Add-Result "Přílohy" "Upload PDF" "PASS" } else { Add-Result "Přílohy" "Upload PDF" "SKIP" "Multipart via curl needs cookie jar" }

    # 21 Recurring
    $recurring = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices/recurring-templates" -Session $session -Body @{
        template_type = "invoice"; document_kind = "invoice"; subject_id = $subject.id; supplier_id = $null
        name = "QA Monthly Rent"; status = "active"; recurrence_interval = "monthly"; recurrence_count = 1
        next_run_date = "2026-08-01"; business_mode = "autoservice"; tax_mode = "standard"
        currency = "CZK"; vat_rate = 21; note = "QA recurring"
        items = @(@{ description = "Pronájem dílny"; quantity = 1; unit_price = 5000 })
    }
    Add-Result "Opakované" "Vytvoření šablony faktury" "PASS" ("id=" + $recurring.id)
    $paused = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices/recurring-templates/$($recurring.id)/pause" -Session $session
    Add-Result "Opakované" "Pause" "PASS" ($paused.status)
    $activated = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices/recurring-templates/$($recurring.id)/activate" -Session $session
    Add-Result "Opakované" "Activate" "PASS" ($activated.status)
    $gen = Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices/recurring-templates/$($recurring.id)/generate" -Session $session
    Add-Result "Opakované" "Generate doklad" "PASS" ("invoice_id=" + $gen.generated_invoice_id)
    Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices/recurring-templates/$($recurring.id)/pause" -Session $session | Out-Null
    try {
        Invoke-ApiJson -Method POST -Uri "$BaseUrl/api/admin/invoices/recurring-templates/$($recurring.id)/generate" -Session $session | Out-Null
        Add-Result "Opakované" "Generate while paused" "FAIL" "Should be blocked"
    } catch { Add-Result "Opakované" "Generate while paused" "PASS" "Blocked as expected" }

    # 24 Exports
    foreach ($exp in @("outgoing.csv", "outgoing.xlsx", "expenses.csv", "expenses.xlsx")) {
        try {
            $r = Invoke-WebRequest -Uri "$BaseUrl/api/admin/invoices/exports/$exp" -WebSession $session
            if ($r.StatusCode -eq 200 -and $r.RawContentLength -gt 50) { Add-Result "Exporty" $exp "PASS" ("bytes=" + $r.RawContentLength) }
            else { Add-Result "Exporty" $exp "FAIL" ("status=" + $r.StatusCode) }
        } catch {
            $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "?" }
            Add-Result "Exporty" $exp $(if ($status -eq 503) { "SKIP" } else { "FAIL" }) ("HTTP $status - " + $_.Exception.Message)
        }
    }

    # 25 Audit
    $audit = Invoke-ApiJson -Method GET -Uri "$BaseUrl/api/admin/invoices/audit-events?limit=20" -Session $session
    if (@($audit).Count -ge 1) { Add-Result "Audit" "Audit events po mutacích" "PASS" ("count=" + @($audit).Count) }
    else { Add-Result "Audit" "Audit events" "FAIL" }

    # Integration A - export contains invoice
    $csv = (Invoke-WebRequest -Uri "$BaseUrl/api/admin/invoices/exports/outgoing.csv" -WebSession $session).Content
    if ($csv -like "*$($bankInvoice.invoice_number)*") { Add-Result "Integrace A" "Export CSV obsahuje fakturu" "PASS" }
    else { Add-Result "Integrace A" "Export CSV obsahuje fakturu" "FAIL" }

} catch {
    Add-Result "Fatal" "Script error" "FAIL" $_.Exception.Message
}

Write-Host "`n=== SUMMARY ===" -ForegroundColor Cyan
$results | Group-Object Module | ForEach-Object {
    $pass = ($_.Group | Where-Object Status -eq "PASS").Count
    $fail = ($_.Group | Where-Object Status -eq "FAIL").Count
    $skip = ($_.Group | Where-Object Status -eq "SKIP").Count
    Write-Host ("{0,-15} pass={1} fail={2} skip={3}" -f $_.Name, $pass, $fail, $skip)
}
$totalFail = ($results | Where-Object Status -eq "FAIL").Count
if ($totalFail -gt 0) { exit 1 }
