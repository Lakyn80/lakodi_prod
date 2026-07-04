# Accounting Production Readiness Plan

Project: `lakodi.cz`  
Date: `2026-07-04`  
Task: **Accounting Production Readiness Plan**

Related documents:

- [`docs/accounting-functional-map.md`](accounting-functional-map.md) — backend vs FE capability matrix
- [`INVOICING_PROGRESS.md`](../INVOICING_PROGRESS.md) — batch tracking

Routes:

- New accounting: `/admin/ucetnictvi-new`
- Legacy invoices (must remain safe): `/admin/invoices`

---

## Executive summary

| Layer | Status |
|-------|--------|
| Backend `/api/admin/invoices/*` | Largely complete (~70+ admin endpoints) |
| New FE `/admin/ucetnictvi-new` | **Partial** — read-only shell (22B–22I) + **23A document/payment write** (`6aaccc4`) |
| Legacy FE `/admin/invoices` | Functional fallback — invoice-only, ARES, PDF, email, payments, settings |
| Mobile/PWA for accounting | **Not validated / not production-hardened** |
| RAG / Voice | **Metadata-only** — no runtime implementation |

### Production readiness verdict

**Not production-ready today.**

Minimum path to production: **4 implementation batches after closed 23A** (23B → 23C → 23D → 23E), then controlled deploy per checklist below.

### Stop rule before deploy

Do **not** deploy new accounting as primary operator UI until:

1. All P0 items in sections A–I are implemented in new FE.
2. Legacy customer backfill into `invoice_subjects` has been executed on target DB.
3. Mobile/PWA acceptance matrix passes.
4. `npm run build`, accounting i18n check, and Docker smoke pass.
5. Protected legacy invoice files have zero diffs.
6. `/admin/invoices` remains available and unchanged.
7. **No** old invoice migration, **no** legacy UI removal, **no** redirect.

---

## Current state

### Completed — Batch 23A (`6aaccc4`)

- Create/edit document draft (`/doklady/novy`, `/doklady/[id]/upravit`)
- Issue/finalize with confirmation dialog
- Add payment with confirmation dialog
- PDF download (same backend as legacy)
- Subject picker via `GET /subjects` or manual customer snapshot
- Deferred: email send, payment delete

### Read-only modules (22B–22I)

Dashboard, documents, expenses, suppliers, bank transactions, payment matching overview, todos, reminder emails, attachments/inbox, recurring — all GET-only via `frontend/src/lib/accountingNew.ts`.

### Critical gaps (user P0 requirements)

| Requirement | Legacy `/admin/invoices` | New `/admin/ucetnictvi-new` | Backend |
|-------------|--------------------------|-------------------------------|---------|
| ARES lookup by IČO | Yes (`InvoiceForm.tsx`) | **No** | Yes (`GET /ares/{ico}`) |
| ARES name search | Yes | **No** | Yes (`GET /ares/search`) |
| Save reusable customer | **No** (snapshot only on invoice) | **No** (picker if subjects exist) | Yes (`POST /subjects`) |
| Duplicate prevention | N/A | **No** | **No DB unique on IČO** |
| Pre-seed legacy customers | N/A | **No backfill yet** | Data in `invoices.customer_*` |

**User requirement (P0):** All companies already invoiced in legacy UI must be pre-loaded into `invoice_subjects` so new accounting starts with saved clients ready. This is a **one-time backfill** from invoice customer snapshots — it does **not** migrate or rewrite legacy invoices.

---

## Production capability requirements (A–N)

### A. Core documents

| Capability | Priority | Status |
|------------|----------|--------|
| Create draft | P0 | Done (23A) |
| Edit draft | P0 | Done (23A) |
| Issue/finalize | P0 | Done (23A) |
| PDF/download | P0 | Done (23A) |
| Add payment | P0 | Done (23A) |
| Email/send | P1 | Deferred → 23D |
| Payment delete | P1 | Deferred |
| Document conversions (proforma/final/quote/correction) | P1 | Deferred |
| Status lifecycle + validation | P0 | Partial (client-side + backend) |
| Audit on detail | P1 | Read-only on detail |

### B. Customers/subjects with ARES — **P0**

| Capability | Priority | Status |
|------------|----------|--------|
| ARES lookup by IČO | P0 | Missing in new UI |
| ARES name search | P0 | Missing in new UI |
| Autofill name, IČO, DIČ, address, country | P0 | Backend ready |
| Save client as subject | P0 | Missing |
| Reuse saved subject in document form | P0 | Partial (dropdown only) |
| Duplicate prevention (IČO) | P0 | Missing (UI + optional backend hardening) |
| Subject list/detail/create/edit routes | P0 | Missing (`/odberatele/*`) |
| Legacy customer backfill | P0 | Missing |
| Customer document history on detail | P1 | Missing |
| Mobile-friendly customer picker | P0 | Not validated |

#### ARES implementation acceptance (P0)

- New document form and subject form include ARES lookup by IČO and name search.
- Reuse backend: `GET /api/admin/invoices/ares/{ico}`, `GET /api/admin/invoices/ares/search`.
- Create `frontend/src/lib/accountingNewAres.ts` mirroring legacy field mapping from `InvoiceForm.tsx` — **do not import** `frontend/src/lib/invoices.ts` in new accounting components.
- ARES fills: company name, IČO, DIČ (if available), registered address, country, legal-form fields if backend returns them.
- User can save ARES-loaded company as subject via `POST /subjects`.
- i18n keys for ARES flow in `cs`, `ua`, `ru`, `en`.

#### Saved client / backfill acceptance (P0)

One-time admin operation before go-live (script in `scripts/` calling `POST /subjects` or guarded admin tool):

1. **Source:** distinct rows from `invoices` table — `customer_name`, `customer_email`, `customer_address`, `customer_ico`, `customer_dic`, `customer_phone`.
2. **Dedup:** normalized IČO (primary); if no IČO, normalized `email + name`.
3. **Skip** if subject with same IČO already exists.
4. **Idempotent:** safe to re-run; log created / skipped / duplicate counts.
5. **Does not** change legacy invoice records, numbering, or PDF behavior.
6. Optional later: link `invoices.subject_id` where snapshot matches — separate controlled task.

#### Duplicate prevention acceptance (P0)

- Before `POST /subjects`, UI searches existing subjects by IČO.
- If match found: show existing customer, offer "use existing" — **do not silently create duplicate**.
- If backend lacks unique constraint on `ico`: list **backend unique index** as production hardening follow-up.

### C. Expenses / received invoices — P0 in 23B

Create/edit expense, supplier select, payments, attachments (read link until 23C), status display, audit read.

### D. Suppliers — P0 in 23B

Create/edit, reuse saved supplier, duplicate prevention UI (IČO), relation to expenses, mobile picker.

### E. Attachments / inbox — P0 in 23C

Upload, link to document/expense/todo/transaction, download, mobile upload readiness, camera/photo via PWA file input, audit. Archive/delete deferred P2.

### F. Bank transactions and matching — P0 in 23C

| Step | Description |
|------|-------------|
| Import | Upload bank file (`POST /bank-transactions/import`) |
| List | Read-only done |
| Candidates | Matching overview done |
| Apply | `POST /bank-transactions/{id}/matches/{match_id}/apply` — **mutates state**, creates/links payment |
| Confirm | Required before apply — show counterparty, amount, target document/expense |
| Unmatched queue | Visible list of transactions without applied match |
| Audit | Event visible after apply |

Apply is **high-risk**: incorrect match creates wrong payment. Confirmation text must state accounting state change.

### G. Reminders / todos / emails — P1/P0 mix in 23C

Todo create/update/complete, reminder preview, send reminder email with confirmation, email history read, audit.

### H. Recurring — P1 in 23D

Template create/edit, enable/disable, manual generate with confirmation, generation history, audit.

### I. Exports / settings — P0 in 23D

Numbering settings, issuer/account settings (`GET/PUT /settings`), export generation + download, production-safe admin permissions, audit.

### J. Audit log — P1 in 23D

Central audit UI with filters, entity detail links, mobile-readable timeline. Per-entity audit on detail panels already exists (read-only).

### K. Mobile / PWA — P0 in 23E

#### Viewport matrix

| Viewport | Device class |
|----------|--------------|
| 390×844 | iPhone 14 / small phone |
| 414×896 | iPhone 11 Pro Max |
| 430×932 | iPhone 14 Pro Max |
| 768×1024 | iPad portrait |

#### Critical screens

- `/admin/ucetnictvi-new` (dashboard)
- Document create / edit / detail
- Customer select / create / ARES
- Expense create / edit
- Attachment upload / link
- Bank matching apply
- Reminder send preview
- Settings / export
- Audit log
- Legacy `/admin/invoices` (fallback must remain usable)

#### Acceptance criteria

- No horizontal overflow on listed screens
- Primary action visible without hunting (sticky footer or header actions)
- Touch targets ≥ 44px
- Tables degrade to cards or safe horizontal scroll
- Confirmation dialogs fit viewport
- Success/error messages visible
- PWA install + admin navigation usable
- File upload works on mobile (attachments)
- Auth/session stable on mobile admin

Note: unstaged PWA work in repo (`pwa.ts`, `sw.js`) is **not** accounting-ready — integrate only in 23E.

### L. Future RAG readiness — metadata only

Extend `accountingNewModules.ts` and `accountingNewMetadata.ts`:

- Add `subjects` / `subject-detail` module registry entries
- Searchable fields: `name`, `ico`, `dic`, `email`, `address`, `country`
- Entity type coverage for all write modules after 23B–23D
- Action safety metadata (read vs write vs confirm-required)

**Do not** implement RAG backend, vector DB, or AI runtime in these batches.

### M. Future voice readiness — metadata only

- Voice alias keys per module and action
- Taxonomy: read-only commands (list, show detail) vs write commands (create, issue, pay, apply, send)
- Write voice actions require confirmation metadata flag
- No voice capture, STT, or TTS implementation now

### N. Legacy safety — permanent until separate migration plan

Protected files (never modify in accounting batches):

- `frontend/src/app/admin/invoices/page.tsx`
- `frontend/src/components/admin/invoices/InvoiceForm.tsx`
- `frontend/src/components/admin/invoices/InvoiceList.tsx`
- `frontend/src/components/admin/invoices/InvoiceDetail.tsx`
- `frontend/src/components/admin/invoices/InvoiceSettingsForm.tsx`
- `frontend/src/lib/invoices.ts`

Rules:

- `/admin/invoices` stays in navigation
- Legacy issued invoices unchanged
- No migration, no renumbering, no PDF behavior change for old records
- New write UI uses same backend tables but separate FE routes

---

## Implementation batch plan (max 5 after 23A)

### 23A-FINALIZE — closed

- Commit: `6aaccc4` — `Add accounting document write actions`
- No second 23A commit required

---

### Batch 23B — Customers, ARES, legacy backfill, expenses, suppliers

**Goal:** Master data + ARES parity with legacy + pre-seed all legacy-invoiced companies + expense/supplier write.

**Scope:**

- One-time backfill script (`scripts/backfill-invoice-subjects.ps1` or Python)
- `accountingNewAres.ts` + ARES UI in document and subject forms
- Routes: `/odberatele`, `/odberatele/novy`, `/odberatele/[id]`, `/odberatele/[id]/upravit`
- Expense create/edit + payments; supplier create/edit
- Duplicate IČO prevention in UI

**Must not include:** Bank apply, attachments upload, email, recurring, exports, RAG/voice runtime, legacy file changes.

**Backend endpoints:** `GET/POST/PUT /subjects`, `GET /ares/{ico}`, `GET /ares/search`, `POST/PUT /expenses`, `POST/PUT /suppliers`, expense payments.

**Safety:** Expense payment confirm; backfill idempotent; duplicate IČO blocked.

**Mobile/PWA:** Subject picker + ARES usable at 390px width.

**Commit message:** `Add accounting subjects ARES expenses suppliers write`

---

### Batch 23C — Attachments, bank apply, reminders

**Goal:** File inbox, bank reconciliation apply, reminder send loops.

**Scope:** Upload/link/download attachments; bank import UI; match apply with confirmation; todo write; reminder preview + send.

**Must not include:** Recurring, settings, central audit, mobile hardening, RAG/voice.

**Commit message:** `Add accounting attachments bank reminders write`

---

### Batch 23D — Recurring, exports, settings, email, audit UI

**Goal:** Settings, exports, recurring, document email, global audit panel.

**Scope:** Settings form, export download, recurring CRUD + generate (confirm), document email (confirm), central audit UI.

**Commit message:** `Add accounting recurring exports settings audit write`

---

### Batch 23E — Mobile/PWA hardening + full QA + controlled deploy

**Goal:** Production-ready on mobile; regression; deploy checklist execution.

**Scope:** Responsive pass all accounting screens; PWA admin shell; mobile smoke; staging verification; production deploy checklist.

**Commit message:** `Harden accounting mobile PWA for production`

---

## Production deploy checklist

1. Batches 23B–23E committed; build + i18n green
2. Legacy customer backfill executed on target DB (log: created / skipped / duplicates)
3. Staging smoke: ARES → save subject → reuse in document → issue → PDF → payment
4. Staging smoke: expense + attachment + bank apply + reminder (one happy path each)
5. Settings/numbering verified before first prod issue in new UI
6. Mobile viewport QA (4 sizes × critical screens)
7. `/admin/invoices` returns 200; protected files have no diffs
8. Database backup before prod deploy
9. Deploy backend + frontend; curl smoke (8016 health, 8090 routes)
10. Legacy nav remains; document operator fallback to `/admin/invoices`
11. Monitor audit log for 48h post-deploy

---

## Known risks

| Risk | Mitigation |
|------|------------|
| Empty subjects registry until backfill | Run backfill as first step of 23B before operator UAT |
| Backend allows duplicate subjects | UI prevention in 23B; optional DB unique on `ico` later |
| Legacy customers are snapshots only | Backfill dedup by IČO then email+name; accept incomplete historical data |
| 23B is large | Single batch justified to limit prompt churn; split only if unsafe in review |
| PWA dirty files in worktree | Never commit with accounting batches; isolate to 23E |
| Bank apply irreversible | Strong confirmation + show target entity before apply |

---

## Next recommended batch

**Batch 23B — Customers ARES legacy backfill expenses suppliers write**

Prompt name for Cursor: `23B Customers subjects ARES backfill expenses suppliers write`
