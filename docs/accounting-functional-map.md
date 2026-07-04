# Accounting Functional Completion Map

Project: `lakodi.cz`  
Date: `2026-07-04`  
Task: **Úkol 22J-FUNCTIONAL-MAP**

Purpose: define what the accounting system must do, what already exists, what is missing, and the smallest safe path to a **functional non-RAG MVP**.

---

## Executive summary

| Layer | State |
|-------|--------|
| Backend (`/api/admin/invoices/*`) | **Largely complete** — CRUD + payments + bank + attachments + recurring + exports + audit + settings |
| New FE (`/admin/ucetnictvi-new`) | **Batch 23A complete** — document draft create/edit, issue, PDF download, add payment; expenses/subjects/suppliers/bank/etc. still read-only |
| Old FE (`/admin/invoices`) | **Functional for legacy outgoing invoices only** — create/edit, PDF, email, payments, settings, ARES |
| Gap | New UI must gain write flows; old UI must remain untouched for issued legacy invoices |

### Today-finish verdict

**Verdict C:** Functional non-RAG MVP **cannot** be finished today without unsafe shortcuts.  
**Minimum safe path: 3 implementation batches** (23A → 23B → 23C).

Rationale: P0 spans document forms, payments, expenses, master data, attachments, bank apply, and settings. Each batch is already a large, confirmation-heavy UI surface. Rushing all P0 into one day would skip confirmations, duplicate legacy logic unsafely, or break isolation rules.

### Pragmatic interim (available **today**)

- **Create/edit/issue outgoing invoices, PDF, email, payments (legacy invoice kind only)** → `/admin/invoices` (legacy, working)
- **Create/edit/issue accounting documents (all kinds), PDF, add payment** → `/admin/ucetnictvi-new/doklady/*` (Batch 23A)
- **Read full accounting picture** → `/admin/ucetnictvi-new` (dashboard + all modules; non-document modules still read-only until 23B/23C)

Legacy issued invoices stay in old UI by design. New write UI must not migrate or rewrite them.

**Production readiness plan:** see [`docs/accounting-production-readiness-plan.md`](accounting-production-readiness-plan.md) — verdict: not production-ready; batches 23B–23E remain after closed 23A (`6aaccc4`).

---

## 1. What the accounting system must do (target)

Functional non-RAG MVP (practical, not perfect):

1. **Documents** — list, detail, create/edit draft, set status to issued, PDF download, email send (if configured), payments, relations view
2. **Document conversions** — proforma → final invoice, quote convert, correction, tax document from payment (P1 if not daily-critical)
3. **Expenses** — list, detail, create/edit, payments, attachments
4. **Customers (subjects)** — list, detail, create/edit, ARES assist
5. **Suppliers** — list, detail, create/edit
6. **Bank** — list, detail, import, generate matches, **apply match** (with confirmation)
7. **Attachments** — upload, link to document/expense/todo/transaction, download, archive (delete deferred P2)
8. **Todos/reminders** — create/update/complete; reminder email preview + send (with confirmation)
9. **Settings** — read/update numbering & issuer defaults **before** new document issue in new UI
10. **Audit** — read-only log (already partially available via detail panels)
11. **Deferred** — recurring generate, exports automation, AI/RAG, voice, destructive deletes, old invoice migration

---

## 2. Backend capability map

Base prefix: `/api/admin/invoices` (admin auth required).

### A. Documents / invoices

| Capability | Method | Endpoint | Mutates | Safe UI | Confirm | Audit likely |
|------------|--------|----------|---------|---------|---------|--------------|
| List | GET | `/` | no | yes | no | n/a |
| Detail | GET | `/{invoice_id}` | no | yes | no | n/a |
| Create | POST | `/` | yes | yes | no* | yes |
| Update | PUT | `/{invoice_id}` | yes | yes | yes if issued | yes |
| Payments list | GET | `/{invoice_id}/payments` | no | yes | no | n/a |
| Add payment | POST | `/{invoice_id}/payments` | yes | yes | yes | yes |
| Delete payment | DELETE | `/{invoice_id}/payments/{payment_id}` | yes | yes | **yes** | yes |
| Relations | GET | `/{invoice_id}/relations` | no | yes | no | n/a |
| PDF | GET | `/{invoice_id}/pdf` | no | yes | no | n/a |
| Send email | POST | `/{invoice_id}/send-email` | yes | yes | **yes** | yes |
| Audit events | GET | `/{invoice_id}/audit-events` | no | yes | no | n/a |
| Global relations | GET | `/relations` | no | yes | no | n/a |
| Global audit | GET | `/audit-events` | no | yes | no | n/a |
| Delete document | — | **none** | — | — | — | — |

\*Create confirmation optional; recommend confirm when status=`issued`.

**Status model:** `InvoiceCreate.status` defaults to `issued`; draft flow = create/update with `status: draft` then update to `issued`.

### B. Proforma / tax / final / quote

| Capability | Method | Endpoint | Mutates | Priority |
|------------|--------|----------|---------|----------|
| Final invoice from proformas | POST | `/final-invoice` | yes | P1 |
| Quote convert | POST | `/{quote_id}/convert` | yes | P1 |
| Correction | POST | `/{invoice_id}/correction` | yes | P1 |
| Tax doc from payment | POST | `/{invoice_id}/payments/{payment_id}/tax-document` | yes | P1 |

### C. Expenses

| Capability | Method | Endpoint | Mutates | Priority |
|------------|--------|----------|---------|----------|
| List | GET | `/expenses` | no | P0 |
| Detail | GET | `/expenses/{expense_id}` | no | P0 |
| Create | POST | `/expenses` | yes | P0 |
| Update | PUT | `/expenses/{expense_id}` | yes | P0 |
| Delete | DELETE | `/expenses/{expense_id}` | yes | P2 |
| Payments list | GET | `/expenses/{expense_id}/payments` | no | P0 |
| Add payment | POST | `/expenses/{expense_id}/payments` | yes | P0 |
| Delete payment | DELETE | `/expenses/{expense_id}/payments/{payment_id}` | yes | P1 |
| Audit | GET | `/expenses/{expense_id}/audit-events` | no | P1 |

### D. Customers / subjects

| Capability | Method | Endpoint | Mutates | Priority |
|------------|--------|----------|---------|----------|
| List | GET | `/subjects` | no | P0 |
| Detail | GET | `/subjects/{subject_id}` | no | P0 |
| Create | POST | `/subjects` | yes | P0 |
| Update | PUT | `/subjects/{subject_id}` | yes | P0 |
| Delete | DELETE | `/subjects/{subject_id}` | yes | P2 |
| ARES search | GET | `/ares/search` | no | P0 |
| ARES by IČO | GET | `/ares/{ico}` | no | P0 |

### E. Suppliers

| Capability | Method | Endpoint | Mutates | Priority |
|------------|--------|----------|---------|----------|
| List | GET | `/suppliers` | no | P0 |
| Detail | GET | `/suppliers/{supplier_id}` | no | P0 |
| Create | POST | `/suppliers` | yes | P0 |
| Update | PUT | `/suppliers/{supplier_id}` | yes | P0 |
| Delete | DELETE | `/suppliers/{supplier_id}` | yes | P2 |

### F. Bank transactions / matching

| Capability | Method | Endpoint | Mutates | Confirm | Priority |
|------------|--------|----------|---------|---------|----------|
| List | GET | `/bank-transactions` | no | no | P0 read |
| Detail | GET | `/bank-transactions/{id}` | no | no | P0 |
| Import | POST | `/bank-transactions/import` | yes | yes | P1 |
| Ignore | POST | `/bank-transactions/{id}/ignore` | yes | yes | P1 |
| Matches list | GET | `/bank-transactions/{id}/matches` | no | no | P0 |
| Generate candidates | POST | `/bank-transactions/{id}/matches/generate` | yes | no | P1 |
| Apply match | POST | `/bank-transactions/{id}/matches/{match_id}/apply` | yes | **yes** | **P0** |
| Reject match | POST | `/bank-transactions/{id}/matches/{match_id}/reject` | yes | yes | P1 |

### G. Attachments / inbox

| Capability | Method | Endpoint | Mutates | Confirm | Priority |
|------------|--------|----------|---------|---------|----------|
| List | GET | `/attachments` | no | no | P0 |
| Inbox filter | GET | `/attachments?unlinked_only=true` | no | no | P0 |
| Detail | GET | `/attachments/{id}` | no | no | P0 |
| Upload | POST | `/attachments` (multipart) | yes | no | **P0** |
| Link | POST | `/attachments/{id}/link` | yes | yes | **P0** |
| Archive | POST | `/attachments/{id}/archive` | yes | yes | P1 |
| Delete | DELETE | `/attachments/{id}` | yes | **yes** | P2 |
| Download | GET | `/attachments/{id}/download` | no* | no | P0 |

\*Download is GET but triggers file stream; treat as safe read in UI.

**Note:** No dedicated unlink endpoint; re-link or archive is the pattern.

### H. Todos / reminders / emails

| Capability | Method | Endpoint | Mutates | Confirm | Priority |
|------------|--------|----------|---------|---------|----------|
| List | GET | `/todos` | no | no | P0 read |
| Detail | GET | `/todos/{id}` | no | no | P0 |
| Create | POST | `/todos` | yes | no | P1 |
| Update | PUT | `/todos/{id}` | yes | no | P1 |
| Complete | POST | `/todos/{id}/complete` | yes | no | P1 |
| Cancel | POST | `/todos/{id}/cancel` | yes | yes | P1 |
| Delete | DELETE | `/todos/{id}` | yes | **yes** | P2 |
| Generate todos | POST | `/todos/generate` | yes | yes | P2 |
| Reminder preview | GET | `/{invoice_id}/reminder-email/preview` | no | no | P1 |
| Reminder send | POST | `/{invoice_id}/reminder-email/send` | yes | **yes** | P1 |
| Reminder history | GET | `/{invoice_id}/reminder-emails` | no | no | P0 read |

### I. Recurring

| Capability | Method | Endpoint | Mutates | Confirm | Priority |
|------------|--------|----------|---------|---------|----------|
| List/detail | GET | `/recurring-templates`, `/{id}` | no | no | P0 read |
| Create/update | POST/PUT | `/recurring-templates`, `/{id}` | yes | no | P1 |
| Pause/activate/cancel | POST | `/{id}/pause`, `/activate`, `/cancel` | yes | yes | P1 |
| Generate run | POST | `/{id}/generate` | yes | **yes** | P1 |
| Generation history | GET | `/{id}/generations` | no | no | P0 read |
| Delete | DELETE | `/{id}` | yes | **yes** | P2 |

### J. Exports / settings / audit

| Capability | Method | Endpoint | Mutates | Priority |
|------------|--------|----------|---------|----------|
| Outgoing CSV/XLSX | GET | `/exports/outgoing.csv`, `.xlsx` | no | P1 |
| Expenses CSV/XLSX | GET | `/exports/expenses.csv`, `.xlsx` | no | P1 |
| Defaults | GET | `/defaults` | no | P0 |
| Settings read | GET | `/settings` | no | P0 |
| Settings update | PUT | `/settings` | yes | **P0** (before new issue) |

---

## 3. New frontend map (`/admin/ucetnictvi-new`)

| Module | Route | List | Detail | Write | Registry status |
|--------|-------|------|--------|-------|-----------------|
| Dashboard | `/admin/ucetnictvi-new` | yes | — | no | implemented-read-only |
| Documents | `#documents` | yes | `/doklady/[id]` | **missing** | implemented-read-only |
| Expenses | `#expenses` | yes | `/vydaje/[id]` | **missing** | implemented-read-only |
| Suppliers | `#suppliers` | yes | `/dodavatele/[id]` | **missing** | implemented-read-only |
| Subjects/customers | — | partial (dashboard stats) | **no route** | **missing** | not implemented |
| Bank transactions | `#bank-transactions` | yes | `/bankovni-transakce/[id]` | **missing** | implemented-read-only |
| Payment matching | `#payment-matching` | yes | — | **missing** | implemented-read-only |
| Todos | `#reminders` | yes | `/ukoly/[id]` | **missing** | implemented-read-only |
| Reminder emails | `#reminder-emails` | yes | `/upominky-emaily/[id]` | **missing** | implemented-read-only |
| Attachments | `#attachments` | yes | `/prilohy/[id]` | **missing** | implemented-read-only |
| Attachment inbox | `#attachment-inbox` | yes | — | **missing** | implemented-read-only |
| Recurring | `#recurring` | yes | `/opakovane/[id]` | **missing** | implemented-read-only |
| Exports | `#exports` | **missing** | — | **missing** | future |
| Audit | `#audit` | partial (embedded) | — | n/a | deferred |
| Settings | — | **missing** | — | **missing** | not in registry |

**API client:** `frontend/src/lib/accountingNew.ts` — **GET-only** (32 exported functions, all read).

**i18n / registry / RAG metadata:** complete for read-only modules (cs/ua/ru/en).

---

## 4. Old frontend map (`/admin/invoices`)

| Capability | Status | Notes |
|------------|--------|-------|
| List invoices | available | `InvoiceList.tsx` |
| Create invoice | available | `InvoiceForm.tsx` → `createInvoice` |
| Edit invoice | available | `updateInvoice` |
| Invoice detail | available | `InvoiceDetail.tsx` |
| PDF download | available | `downloadInvoicePdf` |
| Send email | available | `sendInvoiceEmail` |
| Add/delete payment | available | with basic UX, no fancy confirm dialog |
| Settings / numbering | available | `InvoiceSettingsForm.tsx` |
| ARES lookup | available | in form |
| Defaults | available | `getInvoiceDefaults` |
| document_kind / proforma / quote / correction | **unavailable** | not exposed in legacy form |
| Expenses, suppliers, bank, attachments, todos, recurring, exports | **unavailable** | not in old UI |

**Temporary coverage:** legacy UI covers **P0 outgoing invoice write** for simple invoices only. It does **not** cover expenses, master data, bank, attachments, or multi-kind document flows.

---

## 5. Functional matrix (selected rows)

Full matrix — key P0/P1 rows:

```text
Area: Documents
Capability: Create draft / issue document
Backend: yes | POST / | PUT /{id} | status field
New FE: **implemented-write (23A)** | routes: doklady/novy, doklady/[id]/upravit, detail actions
Old FE: available (create/update, defaults to issued, invoice kind only)
Risk: medium
Confirmation required: yes when issuing / editing issued doc
Priority: P0
Recommended next action: Batch 23B — expenses/subjects write

Area: Documents
Capability: PDF download
Backend: yes | GET /{id}/pdf
New FE: **implemented-write (23A)** | download button on document detail
Old FE: available
Risk: low
Confirmation required: no
Priority: P0
Recommended next action: Batch 23B

Area: Documents
Capability: Send email
Backend: yes | POST /{id}/send-email
New FE: **deferred (23C)** | translated deferred note on detail; confirm/preview flow not ready
Old FE: available
Risk: medium
Confirmation required: yes
Priority: P1 (P0 if new UI replaces old for sending)
Recommended next action: Batch 23C with confirm dialog

Area: Documents
Capability: Add / remove payment
Backend: yes | POST/DELETE payments
New FE: **add implemented (23A)** | POST payment with confirm; delete deferred
Old FE: available
Risk: medium / high for delete
Confirmation required: yes on delete
Priority: P0
Recommended next action: Batch 23C or later safe delete with confirm

Area: Expenses
Capability: Create / edit expense
Backend: yes | POST/PUT /expenses
New FE: missing
Old FE: unavailable
Risk: medium
Confirmation required: no create; yes on major status change if added
Priority: P0
Recommended next action: Batch 23B

Area: Subjects (customers)
Capability: CRUD + ARES
Backend: yes
New FE: missing (no detail route)
Old FE: unavailable
Risk: low
Confirmation required: no
Priority: P0
Recommended next action: Batch 23B — list + detail + form

Area: Suppliers
Capability: CRUD
Backend: yes
New FE: missing write on existing read detail
Old FE: unavailable
Risk: low
Confirmation required: no
Priority: P0
Recommended next action: Batch 23B

Area: Attachments
Capability: Upload + link
Backend: yes | POST /attachments, POST /link
New FE: missing
Old FE: unavailable
Risk: medium
Confirmation required: yes on link target
Priority: P0
Recommended next action: Batch 23B

Area: Bank matching
Capability: Apply match
Backend: yes | POST .../matches/{id}/apply
New FE: missing (read-only candidates)
Old FE: unavailable
Risk: high
Confirmation required: yes
Priority: P0
Recommended next action: Batch 23C

Area: Settings / numbering
Capability: Read / update before issue
Backend: yes | GET/PUT /settings, GET /defaults
New FE: missing
Old FE: available (legacy settings form)
Risk: medium
Confirmation required: yes on update
Priority: P0 for new UI issue path
Recommended next action: Batch 23C (or minimal read-only link to old settings until then)

Area: Reminder send
Capability: Preview + send
Backend: yes
New FE: missing
Old FE: unavailable
Risk: medium
Confirmation required: yes
Priority: P1
Recommended next action: Batch 23C

Area: Recurring generate
Capability: Manual generate run
Backend: yes | POST /generate
New FE: missing
Old FE: unavailable
Risk: high
Confirmation required: yes
Priority: P1
Recommended next action: Batch 23C

Area: Exports download
Capability: CSV/XLSX
Backend: yes | GET /exports/*
New FE: missing
Old FE: unavailable
Risk: low
Confirmation required: no
Priority: P1
Recommended next action: Batch 23C

Area: AI / RAG / voice
Capability: Search / voice capture
Backend: no
New FE: metadata only
Old FE: unavailable
Risk: n/a
Priority: deferred
Recommended next action: do not implement in MVP

Area: Delete entities (expense, subject, supplier, todo, attachment)
Capability: Destructive delete
Backend: yes (various DELETE)
New FE: missing
Old FE: unavailable
Risk: high
Confirmation required: yes
Priority: P2 / deferred
Recommended next action: defer past MVP
```

---

## 6. P0 / P1 / P2 summary

### P0 (MVP blockers — new UI must implement)

- Document create/edit + issue status in new UI
- Document PDF download in new UI
- Document payment add (+ delete with confirm)
- Expense create/edit + payments
- Subject create/edit + ARES assist + detail route
- Supplier create/edit (extend existing detail)
- Attachment upload + link (+ download)
- Bank match **apply** with confirmation
- Settings/defaults read (update before first new issue in new UI — can link to legacy settings short-term)

### P1 (important, batch 3 or soon after MVP)

- Document email send, proforma/final/quote/correction/tax flows
- Bank import, ignore, reject match, generate candidates
- Reminder preview + send
- Todo create/update/complete
- Recurring CRUD + pause/activate + generate
- Export CSV/XLSX download
- Dedicated audit module panel
- Attachment archive

### P2 / deferred

- Entity deletes (expense, subject, supplier, todo, attachment, recurring template)
- Todo auto-generate
- Old invoice migration / hiding legacy nav
- AI/RAG backend + voice capture
- Advanced automation

---

## 7. Three implementation batches (max)

### Batch 23A — Core documents and payments write

**Status:** **Implemented** (`2026-07-04`)

**Goal:** Make `/admin/ucetnictvi-new` able to create and manage **new** accounting documents (all supported kinds) with payments and PDF — without touching legacy `/admin/invoices`.

**Endpoints used:** `POST/PUT /api/admin/invoices`, `GET /{id}/pdf`, `POST /{id}/payments`, `GET /defaults`, `GET /subjects` (read-only picker)

**Implemented:** create draft, edit draft, issue (confirm), PDF download, add payment (confirm), legacy preservation notice

**Deferred:** email send (confirm/preview not ready), delete payment, settings update

**Commit message:** `Add accounting document write actions`

---

### Batch 23B — Expenses, subjects, suppliers, attachments write

**Goal:** Master data + expenses + file inbox become fully operational in new UI.

**Endpoints:** expenses CRUD + payments; subjects CRUD + ARES; suppliers CRUD; attachments upload/link/download

**Actions:** expense form, subject list/detail/form, supplier edit form, upload + link from inbox/detail

**Files likely touched:**
- Write extensions in `accountingNew.ts`
- `AccountingNewExpenseForm.tsx`, `AccountingNewSubject*.tsx`, supplier form updates
- `AccountingNewAttachmentsPanel.tsx`, inbox panel upload
- New routes: `/odberatele/[id]`, `/odberatele/novy` (or modal pattern)
- i18n + registry updates (`canUpload`, `canLink` → true where implemented)

**Safety:** confirm attachment link target; no delete endpoints in MVP

**Acceptance:** create expense with payment; create customer via ARES; upload file and link to expense; i18n + build + smoke pass

**Commit message:** `Add write flows for expenses subjects suppliers attachments`

---

### Batch 23C — Bank matching, reminders, recurring, exports, settings closure

**Goal:** Close operational loops — bank apply, optional reminders/recurring, exports, settings panel in new UI.

**Endpoints:** bank import/apply/reject; reminder preview/send; recurring pause/generate; exports GET; settings PUT

**Actions:** apply match (confirm), import bank file, send reminder (confirm), generate recurring (confirm), download exports, settings form

**Acceptance:** apply bank match creates payment; settings update works; exports download; full non-RAG MVP operational

**Commit message:** `Add bank matching reminders recurring exports settings write`

---

## 8. Ready-to-copy prompt — Batch 23A (next)

```
You are a senior AI engineer on lakodi.cz. Implement Úkol 23A — Core documents and payments write in ÚčetnictvíNew.

Goal: Add the first functional write layer to /admin/ucetnictvi-new for accounting documents (all backend document_kind values) and payments. Keep /admin/invoices and all files under frontend/src/components/admin/invoices/ and frontend/src/lib/invoices.ts UNTOUCHED.

Backend (use existing endpoints only, no backend changes):
- POST /api/admin/invoices — create
- PUT /api/admin/invoices/{id} — update
- GET /api/admin/invoices/{id}/pdf — download
- POST /api/admin/invoices/{id}/payments — add payment
- DELETE /api/admin/invoices/{id}/payments/{payment_id} — delete payment
- GET /api/admin/invoices/defaults — form defaults
- GET /api/admin/invoices/settings — read issuer/numbering context

Requirements:
1. Extend accountingNew.ts with typed write functions + existing error/i18n patterns.
2. Add AccountingNewDocumentForm (create + edit) with document_kind, status draft/issued, items, customer snapshot, ARES optional later or minimal manual fields.
3. Extend AccountingNewDocumentDetail with: Edit button → form, Issue/Save with confirmation when issuing or editing issued docs, PDF download, add payment form, delete payment with confirmation dialog.
4. Add "New document" entry on documents panel → route or modal.
5. Update accountingNewModules.ts: documents + document-detail → writeEnabled with canCreate/canUpdate/canApply as appropriate; keep canDelete false.
6. Full i18n cs/ua/ru/en — no hardcoded strings.
7. Legacy preservation notice on every write surface: issued legacy invoices remain in /admin/invoices.
8. Do NOT implement: email send, proforma/final/quote/correction (defer P1), deletes of documents, migration.
9. Run check-accounting-i18n.ps1, npm run build, lakodi-docker-dev.ps1 smoke.
10. Update INVOICING_PROGRESS.md, commit: Add write flows for accounting documents and payments — local only, no push.

Protected files (no diffs): frontend/src/app/admin/invoices/*, frontend/src/components/admin/invoices/*, frontend/src/lib/invoices.ts
```

---

## 9. References

- Backend router: `backend/app/modules/invoices/router.py`
- New API client: `frontend/src/lib/accountingNew.ts`
- Module registry: `frontend/src/lib/accountingNewModules.ts`
- Legacy client: `frontend/src/lib/invoices.ts`
- Prior audit (partially outdated): `docs/accounting_system_audit.md`
