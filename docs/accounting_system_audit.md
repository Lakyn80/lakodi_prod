# Accounting System Audit

Project: `lakodi.cz`

Audit scope:
- Repository inspection only
- No application code changes
- Focus on existing accounting / invoicing functionality

## 1. Existing accounting / invoicing module location

### Relevant backend files

- `backend/app/modules/invoices/models.py`
- `backend/app/modules/invoices/schemas.py`
- `backend/app/modules/invoices/router.py`
- `backend/app/modules/invoices/service.py`
- `backend/app/modules/invoices/numbering_service.py`
- `backend/app/modules/invoices/payment_service.py`
- `backend/app/modules/invoices/pdf_service.py`
- `backend/app/modules/invoices/email_service.py`
- `backend/app/modules/invoices/exporters.py`
- `backend/app/modules/invoices/cache_service.py`
- `backend/app/modules/invoices/ares_service.py`
- `backend/app/main.py`
- `backend/app/db.py`
- `backend/app/modules/admin/email_service.py`
- `backend/tests/test_invoices.py`

### Relevant frontend/admin files

- `frontend/src/app/admin/invoices/page.tsx`
- `frontend/src/components/admin/invoices/InvoiceForm.tsx`
- `frontend/src/components/admin/invoices/InvoiceList.tsx`
- `frontend/src/components/admin/invoices/InvoiceDetail.tsx`
- `frontend/src/components/admin/invoices/InvoiceSettingsForm.tsx`
- `frontend/src/lib/invoices.ts`
- `frontend/src/app/admin/page.tsx`
- `frontend/src/app/admin/AdminLayoutClient.tsx`

### Relevant shared utilities / services

- `backend/app/modules/admin/email_service.py`
  Purpose: shared HTML email sender used by invoice email sending
- `backend/app/db.py`
  Purpose: table creation and lightweight schema backfill for `invoices`
- `scripts/test-invoices.ps1`
  Purpose: manual/smoke API test script for invoices

### Current structure

The accounting/invoicing system is implemented as a dedicated backend module under `backend/app/modules/invoices/` and a dedicated admin UI under `frontend/src/app/admin/invoices/`.

Current architecture:

- `models.py` stores invoice persistence models
- `schemas.py` defines request/response contracts
- `router.py` exposes admin-only API endpoints
- `service.py` contains invoice creation/update/detail/list/PDF/email orchestration
- `numbering_service.py` handles invoice numbers and variable symbols
- `payment_service.py` handles billing settings, bank account normalization, IBAN generation, and QR payment payload generation
- `pdf_service.py` builds PDF invoices with ReportLab
- `email_service.py` sends invoice emails with PDF attachments
- `exporters.py` builds a stable export DTO used by PDF/email/cache
- `cache_service.py` writes invoice/customer cache snapshots to Redis
- `ares_service.py` looks up Czech company data from ARES or a mock provider

There is no separate accounting subdomain beyond outgoing invoices. The system currently centers on issued invoices only. There is no separate ledger, payment journal, expense module, received-invoice module, inventory module, or accounting event log.

## 2. Database models / tables

### `invoices`

File path:
- `backend/app/modules/invoices/models.py`

Model/table name:
- `Invoice`
- SQL table: `invoices`

Important fields:

- `id`
- `invoice_number`
- `variable_symbol`
- `issue_date`
- `due_date`
- `issuer_name`
- `issuer_address`
- `issuer_city`
- `issuer_zip`
- `issuer_ico`
- `issuer_dic`
- `issuer_data_box`
- `customer_name`
- `customer_email`
- `customer_phone`
- `customer_address`
- `customer_ico`
- `customer_dic`
- `note`
- `business_mode`
- `tax_mode`
- `currency`
- `subtotal`
- `vat_rate`
- `vat_amount`
- `total`
- `status`
- `reverse_charge_reason`
- `reverse_charge_text`
- `payment_method`
- `bank_account_number`
- `bank_account_prefix`
- `bank_code`
- `bank_iban`
- `created_at`

Relationships:

- one-to-many to `InvoiceItem` through `items`

Constraints:

- `invoice_number` is `unique=True`, indexed, non-null
- `variable_symbol` is `unique=True`, indexed, non-null
- most issuer and financial fields are non-null snapshots
- no SQL enum constraints for `business_mode`, `tax_mode`, or `status`

Current purpose:

- stores issued invoice header snapshot, customer snapshot, payment snapshot, and totals snapshot

Notes:

- customer data is embedded directly into each invoice row
- supplier data is also embedded directly into each invoice row as issuer snapshot
- there is no separate invoice payment table
- there is no `paid_at`, `cancelled_at`, `taxable_supply_date`, `discount`, `external_id`, `zakazka_id`, or attachment field

### `invoice_items`

File path:
- `backend/app/modules/invoices/models.py`

Model/table name:
- `InvoiceItem`
- SQL table: `invoice_items`

Important fields:

- `id`
- `invoice_id`
- `description`
- `quantity`
- `unit_price`
- `line_total`

Relationships:

- many-to-one to `Invoice` through `invoice`

Constraints:

- `invoice_id` foreign key to `invoices.id` with `ondelete="CASCADE"`
- `description`, `quantity`, `unit_price`, `line_total` are non-null

Current purpose:

- stores issued invoice line items

Notes:

- line totals are persisted as snapshots
- there is no VAT-per-line field
- there is no unit field, SKU, stock link, or discount-per-line field

### `invoice_sequence_states`

File path:
- `backend/app/modules/invoices/models.py`

Model/table name:
- `InvoiceSequenceState`
- SQL table: `invoice_sequence_states`

Important fields:

- `id`
- `sequence_key`
- `last_number`
- `padding`
- `updated_at`

Relationships:

- NOT FOUND

Constraints:

- `sequence_key` is unique, indexed, non-null

Current purpose:

- stores the current state of the invoice numbering sequence

Notes:

- current code only uses one series key: `default`
- no year dimension
- no company/account dimension
- no separate variable-symbol sequence

### `invoice_settings`

File path:
- `backend/app/modules/invoices/models.py`

Model/table name:
- `InvoiceSettings`
- SQL table: `invoice_settings`

Important fields:

- `id`
- `owner_email`
- `payment_method`
- `bank_account_number`
- `bank_account_prefix`
- `bank_code`
- `bank_iban`
- `created_at`
- `updated_at`

Relationships:

- NOT FOUND

Constraints:

- no explicit SQL uniqueness except the app-level convention that row id `1` is used
- fields are mostly non-null except `bank_account_prefix`

Current purpose:

- stores default payment/account settings for future invoices and BCC email recipient for invoice sending

Notes:

- this is not full company/account settings storage
- issuer company profile is not stored here; it is hard-coded in `service.py`

### Customers / clients / subjects

Separate model/table:
- NOT FOUND

Current implementation:

- customer data exists only as snapshot fields on `invoices`
- a lightweight Redis customer cache profile is generated in `backend/app/modules/invoices/cache_service.py`, but it is not a relational table

### Suppliers

Separate model/table:
- NOT FOUND

Current implementation:

- supplier/issuer data exists only as invoice snapshot fields
- default issuer profile is hard-coded in `backend/app/modules/invoices/service.py` as `ISSUER_PROFILES`

### Payments

Separate model/table:
- NOT FOUND

Current implementation:

- payment method and bank account snapshot fields are stored directly on `invoices`
- invoice-level defaults are stored in `invoice_settings`
- no payment rows, no payment history, no reconciliation table

### Expenses / costs

Separate model/table:
- NOT FOUND

### VAT / tax handling

Separate model/table:
- NOT FOUND

Current implementation:

- VAT handling is implemented by fields on `invoices`
- relevant fields: `tax_mode`, `vat_rate`, `vat_amount`, `reverse_charge_reason`, `reverse_charge_text`
- request validation is in `backend/app/modules/invoices/schemas.py`
- totals calculation is in `backend/app/modules/invoices/service.py`

### Number sequences

Separate model/table:
- EXISTS: `invoice_sequence_states`

### Bank accounts

Separate model/table:
- NOT FOUND

Current implementation:

- bank account defaults live in `invoice_settings`
- bank account snapshot fields live on `invoices`

### PDF / export data

Separate model/table:
- NOT FOUND

Current implementation:

- PDF/export payload is built at runtime from invoice data via `backend/app/modules/invoices/exporters.py`

### Accounting settings

Separate model/table:
- EXISTS: `invoice_settings`

Scope of settings:

- owner email
- payment method
- one bank account
- one IBAN

### Related enums / status fields

Defined in code:

- `BusinessMode = Literal["autoservice", "construction"]` in `backend/app/modules/invoices/schemas.py`
- `TaxMode = Literal["standard", "reverse_charge"]` in `backend/app/modules/invoices/schemas.py`
- `status` is stored as plain string and currently defaults to `draft`

Known status values in code:

- `draft`

Additional status values:

- NOT FOUND in invoice module

## 3. API endpoints / routes

Base route:
- `/api/admin/invoices`

Auth requirement:
- all invoice routes depend on `require_admin` from `backend/app/modules/admin/router.py`
- current auth mechanism is admin session cookie based

### `GET /api/admin/invoices/ares/search`

File location:
- `backend/app/modules/invoices/router.py`

Request:

- query param `name`

Response:

- `list[AresCompanyLookupResponse]`
- fields visible in schema:
  `ico`, `dic`, `company_name`, `address_line`, `city`, `zip`, `country`, `data_box`, `source`

Permissions/auth:

- admin-only

What it currently does:

- searches companies in ARES by company name
- uses real or mock provider depending runtime configuration
- sets response header `X-Ares-Provider`

### `GET /api/admin/invoices/ares/{ico}`

File location:
- `backend/app/modules/invoices/router.py`

Request:

- path param `ico`

Response:

- `AresCompanyLookupResponse`

Permissions/auth:

- admin-only

What it currently does:

- loads one company by IČO from ARES
- uses real or mock provider depending runtime configuration
- sets response header `X-Ares-Provider`

### `POST /api/admin/invoices`

File location:
- `backend/app/modules/invoices/router.py`

Request body shape:

- `InvoiceCreate`
- fields:
  `invoice_number?`, `issue_date`, `due_date`, `customer_name`, `customer_email`, `customer_phone?`, `customer_address`, `customer_ico?`, `customer_dic?`, `note?`, `business_mode`, `tax_mode`, `currency`, `vat_rate?`, `items[]`
- item fields:
  `description`, `quantity`, `unit_price`

Response:

- `InvoiceDetailResponse`
- invoice fields plus `items[]`

Permissions/auth:

- admin-only

What it currently does:

- validates payload
- reserves or normalizes invoice number and variable symbol
- calculates totals
- snapshots issuer and payment settings
- stores invoice and invoice items
- writes non-fatal Redis cache snapshots

### `GET /api/admin/invoices/defaults`

File location:
- `backend/app/modules/invoices/router.py`

Response:

- `InvoiceDefaultsResponse`
- fields:
  `suggested_invoice_number`, `suggested_variable_symbol`

Permissions/auth:

- admin-only

What it currently does:

- previews the next invoice number/variable symbol from the numbering service

### `GET /api/admin/invoices/settings`

File location:
- `backend/app/modules/invoices/router.py`

Response:

- `InvoiceSettingsResponse`
- fields:
  `owner_email`, `payment_method`, `bank_account_number`, `bank_account_prefix`, `bank_code`, `bank_iban`, `account_label`

Permissions/auth:

- admin-only

What it currently does:

- returns current invoice payment/email defaults
- falls back to environment-based defaults if DB row does not exist

### `PUT /api/admin/invoices/settings`

File location:
- `backend/app/modules/invoices/router.py`

Request body shape:

- `InvoiceSettingsUpdate`
- fields:
  `owner_email`, `payment_method`, `bank_account_number`, `bank_account_prefix?`, `bank_code`, `bank_iban?`

Response:

- `InvoiceSettingsResponse`

Permissions/auth:

- admin-only

What it currently does:

- upserts the single settings row used for future invoices and invoice email BCC

### `PUT /api/admin/invoices/{invoice_id}`

File location:
- `backend/app/modules/invoices/router.py`

Request body shape:

- `InvoiceUpdate`
- currently same shape as `InvoiceCreate`

Response:

- `InvoiceDetailResponse`

Permissions/auth:

- admin-only

What it currently does:

- updates invoice header and replaces all invoice items
- may also change invoice number and variable symbol
- recalculates totals

### `GET /api/admin/invoices`

File location:
- `backend/app/modules/invoices/router.py`

Response:

- `list[InvoiceSummaryResponse]`

Permissions/auth:

- admin-only

What it currently does:

- lists invoices ordered by `Invoice.id desc`

### `GET /api/admin/invoices/{invoice_id}/pdf`

File location:
- `backend/app/modules/invoices/router.py`

Response:

- raw PDF response
- `Content-Disposition` attachment filename is `{invoice_number}.pdf`

Permissions/auth:

- admin-only

What it currently does:

- generates PDF on demand from invoice data

### `POST /api/admin/invoices/{invoice_id}/send-email`

File location:
- `backend/app/modules/invoices/router.py`

Request body shape:

- `InvoiceSendEmailRequest`
- field:
  `to_email?`

Response:

- `InvoiceSendEmailResponse`
- fields:
  `ok`, `invoice_id`, `invoice_number`, `sent_to`, `copied_to`

Permissions/auth:

- admin-only

What it currently does:

- generates invoice PDF
- generates HTML email
- sends it to the provided email or invoice customer email
- BCCs owner email if configured and different from recipient

### `GET /api/admin/invoices/{invoice_id}`

File location:
- `backend/app/modules/invoices/router.py`

Response:

- `InvoiceDetailResponse`

Permissions/auth:

- admin-only

What it currently does:

- returns one invoice including items

## 4. Frontend / admin UI

### Main invoicing screen

Page/component path:
- `frontend/src/app/admin/invoices/page.tsx`

Route/page URL:
- `/admin/invoices`

Purpose:

- one-page admin invoicing workspace

Displayed content:

- invoicing page header
- invoice settings form
- invoice create/edit form
- invoice list
- selected invoice detail

Actions:

- create invoice
- edit existing invoice
- refresh list/detail

Current limitations:

- no separate route for create vs. detail vs. edit
- no filters, search, status tabs, pagination, delete, payment actions, or bulk actions

### Invoice settings form

Component path:
- `frontend/src/components/admin/invoices/InvoiceSettingsForm.tsx`

Purpose:

- edit default invoice email/bank settings

Fields displayed:

- owner email
- payment method
- bank account prefix
- bank account number
- bank code
- IBAN

Actions available:

- load settings
- save settings
- refresh settings

Forms available:

- one settings form

Current limitations:

- only one account/profile
- no company identity settings
- no multiple bank accounts

### Invoice create/edit form

Component path:
- `frontend/src/components/admin/invoices/InvoiceForm.tsx`

Purpose:

- create a new invoice or edit an existing one

Fields displayed:

- invoice number
- issue date
- due date
- business mode
- tax mode
- currency
- VAT rate
- customer name
- customer email
- customer phone
- customer IČO
- customer DIČ
- customer address
- note
- invoice items array:
  `description`, `quantity`, `unit_price`

Actions available:

- load invoice defaults
- search company by name in ARES
- fetch company by IČO from ARES
- add line item
- remove line item
- create invoice
- update invoice
- cancel edit
- clear form

Forms available:

- one combined create/edit form

Current limitations:

- no taxable supply date field
- no discount field
- no status field
- no payment status field
- no link to zakázka
- no inventory/service catalog item picker

### Invoice list

Component path:
- `frontend/src/components/admin/invoices/InvoiceList.tsx`

Purpose:

- browse issued invoices

Fields displayed:

- invoice number
- issue date
- due date
- customer name
- business mode
- tax mode
- total
- status

Actions available:

- refresh
- open detail

Current limitations:

- no server-side filtering
- no sorting controls
- no pagination
- no delete/archive/cancel action

### Invoice detail

Component path:
- `frontend/src/components/admin/invoices/InvoiceDetail.tsx`

Purpose:

- display one invoice in detail and expose export/send actions

Fields displayed:

- issuer snapshot
- customer snapshot
- item rows
- due date
- variable symbol
- payment method
- bank account
- IBAN
- note
- reverse charge reason/text
- subtotal
- VAT
- total

Actions available:

- edit invoice
- send invoice by email
- download PDF

Current limitations:

- no payment registration
- no status change
- no cancel/delete
- no attachment upload
- no audit trail

### Entry points from admin

Files:

- `frontend/src/app/admin/page.tsx`
- `frontend/src/app/admin/AdminLayoutClient.tsx`

Visible routes:

- `/admin/invoices` is linked from the main admin page and admin layout navigation

## 5. Existing invoice functionality

### Invoice creation

- EXISTS
- implemented by `POST /api/admin/invoices`
- UI form in `InvoiceForm.tsx`

### Invoice editing

- EXISTS
- implemented by `PUT /api/admin/invoices/{invoice_id}`
- UI action in `InvoiceDetail.tsx` opens edit mode in `InvoiceForm.tsx`

### Invoice detail

- EXISTS
- implemented by `GET /api/admin/invoices/{invoice_id}`
- UI in `InvoiceDetail.tsx`

### Invoice list

- EXISTS
- implemented by `GET /api/admin/invoices`
- UI in `InvoiceList.tsx`

### Invoice deletion / cancellation

- NOT FOUND

### Draft invoice

- PARTIAL
- `Invoice.status` exists and defaults to `draft`
- all created invoices are stored with `draft`
- no separate draft workflow, publish action, or other statuses found

### Issued invoice

- PARTIAL
- invoices are created and treated in UI as issued business documents
- however stored `status` still defaults to `draft`
- no explicit “issued” status transition found

### Overdue invoice

- NOT FOUND

### Paid invoice

- NOT FOUND

### Invoice statuses

- PARTIAL
- status field exists
- current visible status mapping in frontend only defines `draft`

### Invoice item rows

- EXISTS
- stored in `invoice_items`
- editable in UI

### Totals calculation

- EXISTS
- backend source of truth in `backend/app/modules/invoices/service.py`
- frontend preview duplicate exists in `InvoiceForm.tsx`

### VAT calculation

- EXISTS
- standard mode calculates VAT from subtotal and `vat_rate`
- reverse charge stores `vat_amount = 0`

### Discounts

- NOT FOUND

### Due date

- EXISTS
- stored as `due_date`

### Taxable supply date

- NOT FOUND

### Variable symbol

- EXISTS
- stored as `variable_symbol`
- currently generated to match invoice number

### Notes / texts

- EXISTS
- `note`
- `reverse_charge_reason`
- `reverse_charge_text`

### Customer data

- EXISTS
- customer snapshot fields are stored directly on invoice
- ARES prefill exists for company data

### Supplier / company data

- PARTIAL
- issuer snapshot fields exist on invoice
- default issuer profile is hard-coded in backend
- no editable company profile UI or DB model was found

## 6. Numbering system

Current implementation:

- invoice numbers are generated in `backend/app/modules/invoices/numbering_service.py`
- variable symbol currently equals invoice number
- one sequence state row is stored in `invoice_sequence_states`
- sequence key is hard-coded to `default`

How numbers are generated:

- automatic path uses `last_number + 1`
- padding is at least `3`
- preview/default endpoint returns the next number without creating invoice row
- manual invoice number is allowed if numeric, positive, max 9 digits, and not conflicting

Whether number sequences exist:

- EXISTS
- only one global sequence exists

Whether multiple number series exist:

- NOT FOUND

Whether numbers can be manually edited:

- EXISTS
- both create and update flows accept manual `invoice_number`

Whether year-based numbering exists:

- NOT FOUND

Current numbering risks:

- single global sequence only
- no year-based reset
- no per-document-type series
- no per-company/per-account series
- no explicit locking strategy for concurrent writers was found
- unique constraint collisions are handled reactively, not by a dedicated concurrency-safe allocator
- sequence padding grows based on longest used number and never shrinks
- variable symbol is capped by the same 9-digit numeric limit as invoice number
- manual lower free numbers are allowed while next auto number still follows the highest historical number

## 7. PDF / export system

Whether invoice PDF generation exists:

- EXISTS

Where it is implemented:

- `backend/app/modules/invoices/pdf_service.py`
- endpoint: `GET /api/admin/invoices/{invoice_id}/pdf`

What template is used:

- custom ReportLab template built directly in Python code
- no external HTML template or PDF template file found

What data is included:

- invoice number
- issue date
- due date
- business mode
- tax mode
- issuer block
- customer block
- payment information
- QR payment
- line items
- subtotal
- VAT
- total
- reverse charge text
- note
- logo image from `frontend/public/logo/lakodi_logo_crena_pozadi.png` if present

Whether downloads are supported:

- EXISTS
- frontend uses `downloadInvoicePdf()` in `frontend/src/lib/invoices.ts`

Whether email sending exists:

- EXISTS
- `backend/app/modules/invoices/email_service.py`
- shared sender in `backend/app/modules/admin/email_service.py`

Whether CSV/XLSX/XML exports exist:

- CSV: NOT FOUND
- XLSX: NOT FOUND
- XML: NOT FOUND
- ISDOC: NOT FOUND

Notes:

- `backend/app/modules/invoices/exporters.py` defines a stable internal export DTO, but this is not an external file export endpoint

## 8. Payments

Whether invoices can be marked as paid:

- NOT FOUND

Whether partial payments are supported:

- NOT FOUND

Whether multiple payments per invoice are supported:

- NOT FOUND

Whether payment date is stored:

- NOT FOUND

Whether bank matching exists:

- NOT FOUND

Whether variable symbol matching exists:

- PARTIAL
- variable symbol generation exists for outgoing invoice payment instructions
- no incoming payment matching logic exists

## 9. Expenses / costs

Whether the system supports received invoices:

- NOT FOUND

Whether the system supports supplier expenses:

- NOT FOUND

Whether the system supports cost evidence:

- NOT FOUND

Whether the system supports expense payments:

- NOT FOUND

Whether the system supports attachments:

- NOT FOUND for expense/accounting documents

Whether the system supports statuses:

- NOT FOUND for expenses

Whether the system supports due dates:

- NOT FOUND for expenses

## 10. Automation

Recurring invoices:
- NOT FOUND

Recurring expenses:
- NOT FOUND

Automatic reminders:
- NOT FOUND

Email reminders:
- NOT FOUND

Invoice templates:
- NOT FOUND

Prefilled invoice items:
- NOT FOUND

Automatic payment matching:
- NOT FOUND

## 11. Gap analysis against Fakturoid-style invoicing system

| Functional area | Status | Reason |
|---|---|---|
| company/account settings | PARTIAL | `invoice_settings` stores only owner email and one payment profile; issuer company identity is hard-coded, not managed as account settings |
| bank accounts | PARTIAL | one editable bank account profile exists; multiple accounts were NOT FOUND |
| number formats / number sequences | PARTIAL | single numeric sequence exists; year-based, multiple series, and format customization were NOT FOUND |
| customers / subjects | PARTIAL | customer snapshot fields and ARES prefill exist; standalone customer registry was NOT FOUND |
| invoices | EXISTS | create, update, list, detail, PDF, and email send exist |
| proforma invoices | MISSING | NOT FOUND |
| tax documents for received payments | MISSING | NOT FOUND |
| correction tax documents / credit notes | MISSING | NOT FOUND |
| final invoices | MISSING | NOT FOUND |
| quotes/offers | MISSING | NOT FOUND |
| invoice payments | MISSING | no payment records or payment status workflow found |
| expenses | MISSING | NOT FOUND |
| expense payments | MISSING | NOT FOUND |
| inbox/attachments | MISSING | no accounting inbox or document attachment module found |
| inventory items | MISSING | NOT FOUND |
| inventory movements | MISSING | NOT FOUND |
| recurring invoice generators | MISSING | NOT FOUND |
| events/audit log | MISSING | NOT FOUND |
| todos/reminders | MISSING | NOT FOUND |
| webhooks | MISSING | NOT FOUND |
| PDF export | EXISTS | custom ReportLab PDF endpoint exists |
| email sending | EXISTS | email send endpoint with PDF attachment exists |
| CSV/XLSX/XML export | MISSING | NOT FOUND |
| payment matching | MISSING | no bank/payment reconciliation found |
| statistics dashboard | MISSING | admin dashboard stats are zakázka-oriented, not invoice/accounting analytics |

## 12. Risks before implementation

### Duplicated invoice logic

- frontend preview totals in `frontend/src/components/admin/invoices/InvoiceForm.tsx` duplicate backend totals logic from `backend/app/modules/invoices/service.py`
- PDF/email rendering both contain formatting logic derived from the same export DTO but maintained in separate files

### Unsafe schema changes

- database initialization uses `Base.metadata.create_all()` plus manual SQLite column backfill in `backend/app/db.py`
- adding richer accounting schema without explicit migrations can easily drift between environments

### Unclear ownership of totals calculation

- backend is the source of truth
- frontend computes preview totals independently
- later changes to VAT/discount/tax rules could diverge if both are not updated together

### Missing tests

- backend invoice module has good API coverage in `backend/tests/test_invoices.py`
- frontend/admin invoice UI tests were NOT FOUND
- concurrency tests for numbering were NOT FOUND
- migration tests were NOT FOUND

### Missing validation

- `customer_email` is treated as required text, not as a strongly validated email type
- no explicit validation for taxable supply date because field is absent
- no explicit validation around payment state transitions because payment state model is absent

### Weak numbering logic

- one global numeric-only sequence
- no year-based series
- no multi-series support
- concurrency safety is based on uniqueness checks and commit behavior, not on explicit locking or a dedicated allocator

### VAT correctness risks

- reverse-charge support exists but document semantics are narrow
- no taxable supply date field
- no support for advanced VAT cases, reduced rates matrices, or multiple VAT rates per invoice
- the admin form explicitly says reverse charge is not limited by business type, while `scripts/test-invoices.ps1` still expects a rejected autoservice reverse-charge invoice; this is an operational drift risk

### Payment state inconsistencies

- invoices contain payment instructions but no payment records
- `status` exists but there is no paid/overdue/cancelled workflow
- downstream features could incorrectly overload `status` unless payment modeling is introduced carefully

### PDF/export coupling

- PDF and email rendering depend on the runtime invoice export DTO
- PDF generation depends on ReportLab and on a frontend logo path existing in the repository layout
- there is no versioned export schema or external export contract beyond internal DTOs

### Frontend/backend mismatch

- frontend presents invoices as active issued documents while backend persists `status="draft"` by default
- frontend totals preview duplicates backend math
- operational smoke script expectations do not fully match current reverse-charge behavior

## 13. Recommended implementation order

Do not implement these steps now. This is a safe later-task order based on the current codebase.

1. Preserve and extend current backend test coverage before any schema changes.
2. Clarify domain rules on top of the existing `Invoice` model first.
   Specifically: invoice lifecycle/status semantics, payment semantics, reverse-charge rules, and whether invoices should remain editable after issuance.
3. Introduce explicit migrations before adding new accounting tables.
   Avoid relying only on `create_all()` and ad-hoc SQLite column backfills for new accounting scope.
4. Extend `invoice_settings` and issuer/profile management incrementally instead of duplicating issuer logic elsewhere.
5. Extend the numbering service before adding more document types.
   Prefer reusing `invoice_sequence_states` with explicit series keys rather than creating a parallel numbering mechanism.
6. Add explicit payment data structures before implementing paid/overdue dashboards or reminder automation.
   Do not overload the existing `status` string without a payment model.
7. Introduce standalone customer/subject records only if the product really needs reusable customer master data.
   Current invoice snapshots should remain the historical source of truth.
8. Add document variants in low-risk order.
   Suggested order: issued invoice lifecycle cleanup -> payment records -> richer settings/numbering -> customer master data -> proforma/credit-note/final-invoice variants -> exports -> reminders/automation.
9. Keep PDF/email generation on top of the existing export DTO path.
   Extend `exporters.py` rather than creating separate parallel payload builders.
10. Add frontend functionality only after backend semantics and tests are stable.

## 14. Final audit summary

### What already exists

- dedicated outgoing invoice backend module
- admin invoicing page at `/admin/invoices`
- invoice create/list/detail/update
- invoice numbering and variable symbol generation
- invoice payment settings with one bank account
- ARES company lookup/search
- PDF invoice generation
- invoice email sending with PDF attachment
- backend tests for the current invoice API

### What is production-ready

- basic issued-invoice workflow for internal admin use
- single-series numbering
- invoice PDF generation
- invoice email delivery through shared email service
- snapshot-based invoice persistence

### What is incomplete

- status lifecycle beyond `draft`
- payment records and payment reconciliation
- expense/received-invoice functionality
- customer master data
- multiple numbering series and year formats
- CSV/XLSX/XML exports
- richer accounting settings
- reminders, recurring documents, audit log, inventory, attachments/inbox

### What should be implemented first

- tests and domain-rule clarification
- explicit migration strategy
- payment/status model design
- incremental extension of existing numbering/settings/export paths

### What must not be touched without explicit approval

- existing invoice numbering semantics without a migration plan
- existing invoice snapshot fields without backward compatibility planning
- PDF/email/export DTO flow without regression tests
- auth/session behavior around admin invoicing endpoints
- database initialization/backfill behavior without an agreed migration path
