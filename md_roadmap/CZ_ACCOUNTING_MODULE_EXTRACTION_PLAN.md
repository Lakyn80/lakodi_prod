# CZ Accounting Module — Technical Extraction Plan

**Status:** Approved direction, revised per stakeholder corrections (2026-07-13)  
**Scope:** Czech companies only, one company per deployment, functional parity with current Lakodi accounting  
**Repository strategy (final):** Separate GitHub repository `cz-accounting-module`; Lakodi becomes a consumer  

**This document is a plan only.** No repository, migration, adapter, or production code has been implemented.

---

## 1. Executive Summary

The Lakodi accounting domain is production-ready for Czech SMB invoicing. Verified scope:

| Metric | Verified value | How verified |
|--------|----------------|--------------|
| Backend Python files | **14** | Glob `backend/app/modules/invoices/*.py` |
| Backend LOC (invoices module) | **12,084** | Line count per file, summed |
| API route handlers | **85** | `@router.(get\|post\|put\|delete\|patch)` in `router.py` |
| SQLAlchemy tables (`invoice_*` + `invoices`) | **20** | `__tablename__` in `models.py` |
| Backend test file LOC | **6,786** | `test_invoices.py` |
| Backend test functions | **100** | `^def test_` count |
| Frontend pages (`ucetnictvi-new`) | **32** | `page.tsx` glob |
| Frontend components (`accounting-new`) | **72** | File count in directory |
| Frontend lib modules (`accountingNew*`) | **17** | Glob |
| Frontend type files | **2** | Glob |
| API client LOC | **3,562** | `accountingNew.ts` |
| Exported API functions | **73** | `^export (async )?function` count |
| Legacy invoice UI files | **6** | 1 page + 5 components (+ `invoices.ts` lib = 7 total frontend legacy) |

**Extraction goal:** Move this domain into `cz-accounting-module` as a reusable package for any Czech company, without international tax abstraction, without multi-tenant SaaS, without new accounting features.

**Estimated duration:** 10–12 weeks (high complexity), assuming incremental cutover (not copy-then-sync).

**Critical rule:** During extraction, Lakodi must **always** use the extracted package version for any moved code **before** the inline Lakodi copy is deleted. No parallel duplicate business logic.

---

## 2. Confirmed Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Lakodi Host (today)                                             │
│  frontend: Next.js /admin/ucetnictvi-new + accounting-new       │
│  backend:  FastAPI /api/admin/invoices                          │
│  auth:     admin.router.require_admin (cookie → users.role)     │
│  email:    admin.email_service (Resend/SMTP)                    │
│  db:       SQLite data/app.db + db.py _ensure_invoice_*         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Accounting domain (backend/app/modules/invoices/)               │
│  service.py (5,711 LOC) — core business logic                   │
│  router.py (1,627 LOC) — 85 endpoints, all require_admin        │
│  12 supporting modules + 20 tables                              │
└─────────────────────────────────────────────────────────────────┘
```

**Mount:** [`backend/app/main.py`](../backend/app/main.py) — `app.include_router(invoices_router, prefix="/api/admin/invoices")`

**No background workers:** No Celery, cron, or `BackgroundTasks`. Todo/recurring/bank-match generation is synchronous via API only. Redis is optional write-cache (`REDIS_URL`).

---

## 3. Lakodi Coupling Inventory

| # | Coupling | File(s) | Extraction action |
|---|----------|---------|-------------------|
| 1 | Admin auth | `router.py` → `require_admin` | Replace with injected auth dependency |
| 2 | Users table | `admin/router.py` session → `users` | Host adapter only; package never imports `users` |
| 3 | DB bootstrap | `db.py` lines 46–794, 811–823 | Move to package Alembic; remove from Lakodi after cutover |
| 4 | Email | `email_service.py` → `admin.email_service` | Email port + Lakodi adapter |
| 5 | Company defaults | `payment_service.py` env fallbacks (Lakodi IČO/bank) | Remove; require settings row or explicit env |
| 6 | Mock ARES | `ares_service.py` Lakodi mock data | Generic mock; configurable |
| 7 | PDF logo | `pdf_service.py` → `frontend/public/logo/lakodi_logo_*` | Configurable `ACCOUNTING_LOGO_PATH` |
| 8 | Attachment path | `attachment_storage.py` hardcoded `backend/storage/invoice_attachments` | Storage port |
| 9 | API prefix | `/api/admin/invoices` | Preserved via Lakodi host mount (no API redesign) |
| 10 | FE routes | `/admin/ucetnictvi-new` | Configurable `appBaseRoute` in package |
| 11 | FE API client | `adminApiUrl("/invoices")` | Configurable `apiPrefix` in package |
| 12 | i18n | `translations.ts` `accountingNew` blocks | Move to package `locales/` |
| 13 | shadcn UI | 12 `@/components/ui/*` modules | Bundle inside `accounting-ui` (see §18) |
| 14 | Middleware | `middleware.ts` feature flag + hostname | Remains in Lakodi host |
| 15 | Legacy UI | `admin/invoices` (6 files + `invoices.ts`) | Delete after parity verification |
| 16 | Shared SQLite | `init_db()` creates zakazky/gallery/users + invoices | Host keeps non-accounting tables; package owns invoice migrations |

---

## 4. Backend Dependency Graph

**Outbound from invoices module (must become ports or package-internal):**

```
router.py ──► get_db (host session)
           ──► require_admin (host auth port)

email_service.py ──► admin.email_service

models.py ──► backend.app.db.Base (becomes accounting_api.db.AccountingBase)

service.py, payment_service.py, etc. ──► sqlalchemy.orm.Session (injected)
```

**Inbound to invoices module:**

- `main.py` — router mount
- `db.py` — model import + `_ensure_invoice_*`
- `test_invoices.py` — full test suite

**No imports from:** zakazky, gallery, RAG, convertor (verified).

---

## 5. Frontend Dependency Graph

```
32 pages (thin wrappers)
  └── 72 components (accounting-new/)
        ├── 17 lib modules (accountingNew*)
        ├── 2 type files
        ├── LanguageContext + translations.accountingNew  → package i18n provider
        ├── 12 shadcn primitives (@/components/ui/*)    → bundled in accounting-ui
        └── accountingNew.ts → adminApiUrl("/invoices")  → configurable apiPrefix
```

**Host-retained in Lakodi:** login, `AdminLayoutClient`, zakázky nav, `middleware.ts` host redirects, global theme, `lib/hosts.ts`.

---

## 6. Database Ownership and Migration Analysis

### Verified: 20 accounting tables

`invoices`, `invoice_items`, `invoice_payments`, `invoice_document_relations`, `invoice_sequence_states`, `invoice_settings`, `invoice_subjects`, `invoice_suppliers`, `invoice_expenses`, `invoice_expense_items`, `invoice_expense_payments`, `invoice_bank_transactions`, `invoice_payment_matches`, `invoice_recurring_templates`, `invoice_recurring_template_items`, `invoice_recurring_generations`, `invoice_todos`, `invoice_reminder_emails`, `invoice_attachments`, `invoice_accounting_events`

### Verified: 13 migration functions in `db.py` to extract

| Function | Lines |
|----------|------:|
| `_ensure_invoice_columns` | 46–99 |
| `_ensure_invoice_subjects_table` | 102–133 |
| `_ensure_invoice_suppliers_table` | 136–167 |
| `_ensure_invoice_expense_tables` | 170–277 |
| `_ensure_invoice_bank_matching_tables` | 280–349 |
| `_ensure_invoice_recurring_tables` | 352–436 |
| `_ensure_invoice_settings_columns` | 439–466 |
| `_ensure_invoice_sequence_state_columns` | 469–495 |
| `_ensure_invoice_document_relations_table` | 498–596 |
| `_ensure_invoice_todos_table` | 599–631 |
| `_ensure_invoice_reminder_emails_table` | 634–666 |
| `_ensure_invoice_attachments_table` | 669–713 |
| `_ensure_invoice_accounting_events_table` | 716–794 |

Called from `init_db()` at lines 811–823.

### Chosen database ownership model (final — not optional)

| Responsibility | Owner |
|----------------|-------|
| SQLAlchemy models + `AccountingBase.metadata` | `accounting-api` |
| Alembic revisions for accounting tables | `accounting-api` |
| SQLAlchemy `engine` + `SessionLocal` | **Lakodi host** (unchanged) |
| `get_db()` session dependency | **Lakodi host** — passed into `create_accounting_router(get_db=...)` |
| Physical database file | **Same SQLite file** (`data/app.db`) during Lakodi integration |
| Table names | **Unchanged** — no rename |
| Host redefining accounting models | **Forbidden** |

**Why this works with current Lakodi SQLAlchemy:** Lakodi uses a single `engine` + `sessionmaker` in [`backend/app/db.py`](../backend/app/db.py) (`declarative_base()` line 19). SQLAlchemy supports multiple `MetaData` registries bound to the same engine. The package registers `AccountingBase.metadata` against the host engine at startup via `init_accounting_schema(engine)`. Host `init_db()` stops calling `_ensure_invoice_*` after cutover but continues managing zakazky/gallery/users tables.

**MVP database target:** SQLite only. Migrations must be verified against a copy of the real Lakodi production database (existing snapshot workflow: `scripts/verify_prod_invoice_snapshot.py`).

**PostgreSQL:** Documented as a future compatibility target only. **Not in extraction scope.** Do not claim Postgres support until implemented and tested.

---

## 7. Recommended Target Architecture

### Repository layout (final)

```
PYTHON_PROJECTS/
├── lakodi/                          # consumer
└── cz-accounting-module/            # separate GitHub repo
    ├── packages/
    │   ├── accounting-api/
    │   │   ├── pyproject.toml
    │   │   ├── src/accounting_api/
    │   │   ├── migrations/          # Alembic
    │   │   └── tests/
    │   └── accounting-ui/
    │       ├── package.json
    │       ├── src/
    │       │   ├── components/
    │       │   ├── features/
    │       │   ├── api/
    │       │   ├── types/
    │       │   ├── locales/
    │       │   ├── hooks/
    │       │   ├── validation/
    │       │   ├── config/
    │       │   └── ui/              # 12 bundled shadcn primitives
    │       └── tests/
    ├── apps/
    │   └── accounting-admin/        # standalone demo
    ├── docker/
    ├── docs/
    ├── .github/workflows/
    ├── README.md
    └── .env.example
```

### Integration contract (backend)

```python
from accounting_api import create_accounting_router

app.include_router(
    create_accounting_router(
        get_db=get_db,                          # host session factory
        auth_dependency=lakodi_auth_dependency,   # host adapter
        email_provider=lakodi_email_provider,
        storage_provider=lakodi_storage_provider,
    ),
    prefix="/api/admin/invoices",  # unchanged for Lakodi v1
)
```

### Integration contract (frontend)

```tsx
import { AccountingConfigProvider, AccountingApp } from "@cz/accounting-ui";

<AccountingConfigProvider config={{
  apiBaseUrl: "",
  apiPrefix: "/api/admin/invoices",
  appBaseRoute: "/admin/ucetnictvi-new",
  locale: "cs",
}}>
  <AccountingApp />
</AccountingConfigProvider>
```

---

## 8. Development Workflow (required)

### Local layout

During active extraction, both repositories exist as **sibling directories**:

```
PYTHON_PROJECTS/
├── lakodi/
└── cz-accounting-module/
```

### Local dependencies (development)

**Backend** — editable install in Lakodi venv / Docker:

```text
# lakodi requirements (dev)
-e ../cz-accounting-module/packages/accounting-api
```

or `pyproject.toml`:

```toml
[tool.poetry.dependencies]  # or pip requirements
accounting-api = { path = "../cz-accounting-module/packages/accounting-api", develop = true }
```

**Frontend** — file dependency in Lakodi `package.json`:

```json
"@cz/accounting-ui": "file:../cz-accounting-module/packages/accounting-ui"
```

**Docker dev:** mount sibling `cz-accounting-module` into container or build from editable path.

### Production dependencies (first release — no registry required)

**Backend** — Git dependency pinned to tag or commit:

```text
accounting-api @ git+https://github.com/<org>/cz-accounting-module.git@v1.0.0#subdirectory=packages/accounting-api
```

**Frontend** — Git dependency pinned to release:

```json
"@cz/accounting-ui": "github:<org>/cz-accounting-module#v1.0.0&path:packages/accounting-ui"
```

Publishing to PyPI, npm, GitHub Packages, or a private registry is **optional future work** and must **not** block extraction.

### Cutover rule (mandatory)

1. Move code into `cz-accounting-module`.
2. Wire Lakodi to consume it via local editable/file dependency **in the same phase**.
3. Run full test suite; verify backward compatibility.
4. Delete the inline Lakodi copy **in the same phase**.
5. **Never** maintain two copies of business logic.

Extraction is **not** “copy everything first and synchronize later.”

---

## 9. Authentication Port Design

The package must not import Lakodi cookies or the `users` table.

```python
# accounting_api/ports/auth.py
from dataclasses import dataclass
from typing import Protocol, Callable

@dataclass(frozen=True)
class AccountingPrincipal:
    """Normalized authenticated administrator."""
    user_id: str
    email: str

AuthDependency = Callable[[], AccountingPrincipal]
```

**Lakodi adapter** (`lakodi/integrations/accounting/auth.py`):

- Wraps existing `require_admin` session decode.
- Maps `role == "admin"` → `AccountingPrincipal`.
- Raises `HTTPException(401, detail="Přihlaste se do adminu")` — **same message as today** (verified in `admin/router.py` line 336).

**No new accounting role system.** Single requirement: authenticated administrator. All 85 endpoints remain protected.

---

## 10. Email Port Design

```python
@dataclass
class OutboundEmail:
    to: list[str]
    subject: str
    html_body: str
    attachments: list[EmailAttachment]
    bcc: list[str] | None = None

class EmailProvider(Protocol):
    def is_configured(self) -> bool: ...
    def send(self, message: OutboundEmail) -> None: ...
```

**Lakodi adapter:** delegates to `admin.email_service.send_html_email` + Resend/SMTP env.

**Test implementation:** `InMemoryEmailProvider` in package tests.

**Retries / Celery:** Out of scope. Synchronous send; fail fast with `InvoiceEmailSendError` (preserved).

---

## 11. Settings and Company Configuration Design

### Verified: VAT representation (no schema change)

- **No `vat_payer` column exists** anywhere in the invoices module (grep verified).
- VAT behavior is per-document via `tax_mode` (`standard`, `reverse_charge`, etc.) on `invoices` and templates.
- Issuer tax ID via `issuer_dic` on `invoice_settings` and per-invoice issuer fields.
- Per-invoice `vat_rate` and `vat_amount` fields.

**Extraction must preserve this model.** Do not add `vat_payer` or other domain fields unless a proven gap is found during implementation (none found in planning audit).

### Settings sources

1. **Runtime (authoritative):** `invoice_settings` row (id=1) — already exists.
2. **Bootstrap env:** `ACCOUNTING_ISSUER_*` — empty by default in package; no Lakodi fallbacks.
3. **Onboarding gate:** Existing settings screen + API validation — block invoice issue if mandatory issuer/bank fields missing. **No new wizard.**

### Mandatory fields for invoice issue (validation gate)

Derived from current `payment_service.py` and PDF requirements:

- `issuer_name`, `issuer_address`, `issuer_city`, `issuer_zip`, `issuer_ico`
- `bank_account_number`, `bank_code`, `bank_iban`
- `payment_method`, `owner_email`

Return `422` with field-level errors (current FastAPI style).

---

## 12. File Storage Design

```python
class FileStorage(Protocol):
    def store(self, namespace: str, stored_name: str, data: bytes) -> str: ...
    def open(self, namespace: str, stored_name: str) -> BinaryIO: ...
    def delete(self, namespace: str, stored_name: str) -> None: ...
    def exists(self, namespace: str, stored_name: str) -> bool: ...
```

**V1 adapter:** `LocalFileStorage(base_path=ACCOUNTING_STORAGE_PATH)` — replaces hardcoded `backend/storage/invoice_attachments`.

**Verified current path:** `backend/storage/invoice_attachments/` via `attachment_storage.py` (`parents[3] / "storage" / "invoice_attachments"`).

**Security:** basename sanitization (existing), auth on download endpoints, size limit 10 MB (existing).

---

## 13. Background Processing

**Verified:** Fully synchronous. No job queue.

**Extraction rule:** Remain synchronous. **Do not** create job protocols, Celery interfaces, or Redis worker abstractions during extraction.

Redis remains optional for `InvoiceCacheService` write-cache only.

---

## 14. Czech Accounting Domain Boundaries

Explicitly in scope (preserve Czech concepts and naming):

| Concept | Implementation |
|---------|----------------|
| IČO / DIČ | ARES, schemas, issuer fields |
| ARES | `ares_service.py`, `accountingNewAres.ts` |
| Document kinds (záloha, DD, opravný…) | `document_types.py` |
| DPH / reverse charge | `tax_mode`, `business_mode`, `service.py` |
| Variabilní symbol | `numbering_service.py` |
| SPAYD QR | `payment_service.py` |
| Czech bank account | `payment_service.py` |
| CZK + EUR | `accountingNewCurrencies.ts` |
| Invoice numbering | `invoice_sequence_states` |
| Bank CSV import + matching | `service.py`, bank models |
| PDF statutory fields | `pdf_service.py` |

Out of scope: OSS, účetní závěrka, payroll, sklad, multi-country tax engine.

---

## 15. API Migration Plan (v1 — no changes)

**Preserve for first extracted version:**

- All endpoint paths relative to mounted prefix (85 handlers)
- Request and response schemas (Pydantic models in `schemas.py`)
- Error responses (`{"detail": ...}` FastAPI format)
- Synchronous behavior
- Lakodi mount prefix `/api/admin/invoices` via host adapter

**Explicitly removed from extraction scope:**

- Custom API version headers
- New pagination
- New endpoints or features
- New error formats
- Endpoint redesign

Greenfield demo app may mount at `/api/invoices` but must expose the **same handler implementations** (no schema changes).

---

## 16. Frontend Extraction Plan

1. Create `@cz/accounting-ui` with `AccountingConfigProvider`.
2. Configurable: `apiBaseUrl`, `apiPrefix`, `appBaseRoute`, `locale`, `branding`.
3. Split `accountingNew.ts` (3,562 LOC, 73 functions) into `api/client.ts` + domain modules — **same API shapes**, no new client features.
4. Replace `LanguageContext` dependency with package `AccountingI18nProvider`.
5. Bundle 12 shadcn primitives in `src/ui/` (see §18).
6. Lakodi pages become thin re-exports mounting package routes.
7. Delete duplicated Lakodi source in the **same phase** as package cutover.

---

## 17. i18n Extraction Plan

### Verified locale identifiers in Lakodi

[`frontend/src/contexts/LanguageContext.tsx`](../frontend/src/contexts/LanguageContext.tsx):

```typescript
export type Language = 'cs' | 'ua' | 'ru' | 'en';
```

[`frontend/src/data/translations.ts`](../frontend/src/data/translations.ts) top-level locale keys: `cs` (line 2), `ua` (line 1920), `ru` (line 3838), `en` (line 5756).

**Do not rename `ua` to `uk`.** Keep `ua` as the locale identifier in package JSON files (`locales/ua.json`).

### Verified `accountingNew` block start lines per locale

| Locale | `accountingNew:` line | Approx. block size |
|--------|----------------------:|-------------------:|
| `cs` | 91 | ~1,828 lines |
| `ua` | 2009 | ~1,828 lines |
| `ru` | 3927 | ~1,828 lines |
| `en` | 5845 | ~1,828 lines |

**Leaf translation key count:** ~900–1,000 per locale (**approximate** — dense nested objects; exact count deferred to automated extraction script in Phase 5).

### Target structure

```
packages/accounting-ui/src/locales/
  cs.json
  en.json
  ru.json
  ua.json
```

**No new translation work.** Move existing strings only.

**Fallback:** `cs` if key missing in selected locale.

---

## 18. UI Component Strategy (final decision)

### Verified: 12 shadcn modules used by accounting-new

`alert`, `alert-dialog`, `badge`, `button`, `card`, `input`, `label`, `select`, `separator`, `skeleton`, `table`, `textarea`

(Verified via grep of `@/components/ui/` imports across `accounting-new/`. `AccountingNewConfirmDialog.tsx` uses `alert-dialog`. `AccountingNewPaymentMethodSelect.tsx` uses native `<select>`, not shadcn select — only `AccountingNewCurrencySelect.tsx` imports shadcn `select`.)

### Decision: bundle primitives inside `accounting-ui`

**Rationale:** A separate-repo consumer (demo app, third-party host) should not depend on fragile peer-install of shadcn + Tailwind path alignment. Copy the 12 required primitive files from Lakodi `frontend/src/components/ui/` into `packages/accounting-ui/src/ui/` with package-local `@/` path alias.

**Do not** copy all 49 Lakodi UI components.

**Tailwind:** Package ships `tailwind.preset.js` documenting required `content` paths for host apps that embed the package.

---

## 19. Testing Migration Plan

| Test | Source | Target | Notes |
|------|--------|--------|-------|
| API integration | `backend/tests/test_invoices.py` (6,786 LOC, 100 tests) | `accounting-api/tests/` | Replace `_login_admin` with `TestAuthAdapter` |
| Auth adapter | — | `tests/test_lakodi_auth_adapter.py` in Lakodi | Verifies 401 behavior preserved |
| Email adapter | partial in test_invoices | `tests/adapters/test_email.py` | `InMemoryEmailProvider` |
| Alembic | — | `tests/test_migrations_sqlite.py` | Against empty DB + prod snapshot copy |
| ARES mock | existing | move unchanged | |
| Bank matching | existing | move unchanged | |
| Snapshot scripts | `scripts/verify_prod_invoice_snapshot.py`, etc. | `accounting-api/scripts/` | Update imports |
| PowerShell smoke | `scripts/test-invoices.ps1`, `test-prod-snapshot-invoices.ps1` | package + Lakodi CI | |
| Frontend unit | none today | `accounting-ui/tests/` | Config provider, formatters — minimal v1 |
| E2E | `scripts/test-accounting-new-qa-live.ps1` | demo app CI | |

**Lakodi regression gate:** After every phase, `pytest backend/tests/test_invoices.py` (or package equivalent wired through adapter) must pass.

---

## 20. Security Considerations

| Area | Current state | Extraction requirement |
|------|---------------|------------------------|
| Authorization | All 85 routes `require_admin` | Auth port on every route |
| Attachments | basename sanitization | Preserve + storage port |
| Bank CSV import | parse only | Size limits preserved |
| PDF/attachment download | auth required | Preserve |
| Email HTML | `html.escape` | Preserve |
| ARES | fixed gov.cz URLs, IČO validation | Preserve; no open URL |
| Audit log | `invoice_accounting_events` | Preserve in package |
| Secrets | backend env only | Never in frontend `NEXT_PUBLIC_*` |

---

## 21. Deployment and Configuration Model

### `.env.example` (package root)

```text
# Backend — secrets (never expose to frontend)
ACCOUNTING_DATABASE_URL=sqlite:///./data/accounting.db
ACCOUNTING_STORAGE_PATH=./data/accounting-storage
ACCOUNTING_EMAIL_PROVIDER=console
ACCOUNTING_RESEND_API_KEY=
ACCOUNTING_SMTP_HOST=
ACCOUNTING_SMTP_PORT=
ACCOUNTING_SMTP_USER=
ACCOUNTING_SMTP_PASSWORD=

# Bootstrap — leave empty; configure via Settings UI
ACCOUNTING_ISSUER_NAME=
ACCOUNTING_ISSUER_ICO=
ACCOUNTING_ISSUER_DIC=
ACCOUNTING_ISSUER_ADDRESS=
ACCOUNTING_ISSUER_CITY=
ACCOUNTING_ISSUER_ZIP=
ACCOUNTING_ISSUER_DATA_BOX=
ACCOUNTING_BANK_ACCOUNT_NUMBER=
ACCOUNTING_BANK_ACCOUNT_PREFIX=
ACCOUNTING_BANK_CODE=
ACCOUNTING_IBAN=
ACCOUNTING_DEFAULT_CURRENCY=CZK
ACCOUNTING_DEFAULT_DUE_DAYS=14
ACCOUNTING_EMAIL_FROM=
ACCOUNTING_ARES_PROVIDER=mock
ACCOUNTING_LOGO_PATH=
REDIS_URL=

# Public frontend only (non-secret)
NEXT_PUBLIC_ACCOUNTING_API_URL=http://localhost:8016
NEXT_PUBLIC_ACCOUNTING_API_PREFIX=/api/invoices
NEXT_PUBLIC_ACCOUNTING_APP_BASE=/accounting
NEXT_PUBLIC_ACCOUNTING_DEFAULT_LOCALE=cs
```

**Lakodi production:** continues using existing `.env` with adapter mapping `INVOICE_*` → package settings where applicable during transition.

---

## 22. Lakodi Compatibility Strategy

1. Sibling repo + editable local deps during development.
2. Pin Git tag in Lakodi `requirements` / `package.json` for production releases.
3. Thin adapters in `lakodi/backend/integrations/accounting/` and `lakodi/frontend/integrations/accounting/` (**adapters only, no business logic**).
4. Preserve URLs: `/api/admin/invoices`, `/admin/ucetnictvi-new`.
5. No duplicate domain code in Lakodi after each phase.
6. Lakodi `init_db()` delegates accounting schema to package; removes `_ensure_invoice_*` only in final DB phase.

---

## 23. Legacy UI Removal Strategy

**Classification:** `admin/invoices` = **delete only after migration** (superseded by accounting-new; same backend API).

| File | Path |
|------|------|
| Page | `frontend/src/app/admin/invoices/page.tsx` |
| Components (5) | `frontend/src/components/admin/invoices/*.tsx` |
| API client | `frontend/src/lib/invoices.ts` |

**Delete when:**

- [ ] Lakodi uses `@cz/accounting-ui` exclusively for accounting navigation
- [ ] `NEXT_PUBLIC_ACCOUNTING_NEW_ENABLED` flag removed (new UI always on)
- [ ] Parity verified: issue, PDF, payment, settings, bank matching
- [ ] No references to `invoices.ts` (grep clean)
- [ ] 30 days no traffic to `/admin/invoices` (optional log check)

---

## 24. Standalone Demo Application Plan

`apps/accounting-admin`:

- Minimal demo auth (not Lakodi `users` table)
- Full accounting UI at `/accounting`
- API at `/api/invoices`
- SQLite volume via Docker
- Empty settings on first boot → validation gate blocks invoice issue
- README: deploy for any Czech company via `.env` + Settings UI

---

## 25. CI/CD and Release Strategy

**In `cz-accounting-module` repo only (no registry required for v1):**

| Workflow | Trigger | Actions |
|----------|---------|---------|
| `ci-api.yml` | PR / push | `pytest` on SQLite; ruff |
| `ci-ui.yml` | PR / push | typecheck, lint, build |
| `ci-demo.yml` | PR / push | docker compose smoke |
| `release.yml` | Git tag `v*` | create GitHub Release; document Git install pins |

**Lakodi CI:** add job installing package from Git SHA under test.

---

## 26. Risks and Mitigations

| Risk | Level | Mitigation |
|------|-------|------------|
| `service.py` monolith (5,711 LOC) | High | Move as-is; no refactor during extraction |
| Alembic parity with prod SQLite | High | Verify against prod snapshot DB copy |
| Incremental cutover breaks Lakodi | High | Phase gate: tests + rollback pin |
| Dual-repo drift | Medium | Editable deps in dev; tag pins in prod |
| Tailwind in package | Medium | Bundled ui/ + documented preset |
| No frontend tests today | Medium | Add minimal tests in Phase 8 |

---

## 27. Exact File Inventory

### Backend — `backend/app/modules/invoices/` (move with modifications)

| File | LOC (verified) | Classification | Notes |
|------|-------------:|----------------|-------|
| `service.py` | 5,711 | move with modifications | inject ports |
| `router.py` | 1,627 | move with modifications | `create_accounting_router`, auth port |
| `schemas.py` | 1,574 | move unchanged | |
| `models.py` | 498 | move with modifications | `AccountingBase` |
| `payment_service.py` | 479 | move with modifications | remove Lakodi defaults |
| `numbering_service.py` | 357 | move unchanged | |
| `ares_service.py` | 351 | move with modifications | generic mock |
| `pdf_service.py` | 493 | move with modifications | configurable logo |
| `email_service.py` | 251 | move with modifications | email port |
| `accounting_exports.py` | 260 | move unchanged | |
| `exporters.py` | 152 | move unchanged | |
| `cache_service.py` | 122 | move unchanged | optional Redis |
| `document_types.py` | 124 | move unchanged | |
| `attachment_storage.py` | 85 | move with modifications | storage port |

### Backend — remain in Lakodi / adapter

| File | Classification |
|------|----------------|
| `backend/app/main.py` | remain — mount package router |
| `backend/app/db.py` | remain — remove `_ensure_invoice_*` in Phase 10 |
| `backend/app/modules/admin/router.py` | remain — auth adapter source |
| `backend/app/modules/admin/email_service.py` | remain — email adapter source |
| `backend/conftest.py` | remain — extend for integration tests |
| `backend/tests/test_invoices.py` | move to package in Phase 3; Lakodi runs package tests via CI |

### Frontend pages — 32 files (move with modifications)

All under `frontend/src/app/admin/ucetnictvi-new/**/page.tsx` → become thin wrappers or move to `apps/accounting-admin` + exportable route kit.

### Frontend components — 72 files (move with modifications)

All under `frontend/src/components/admin/accounting-new/` → `packages/accounting-ui/src/components/`.

### Frontend lib — 17 files (move with modifications)

All `frontend/src/lib/accountingNew*` → `packages/accounting-ui/src/api/` and `src/lib/`.

### Frontend types — 2 files (move unchanged)

`frontend/src/types/accountingNew.ts`, `accountingNewMetadata.ts`.

### Legacy — delete after Phase 11

`frontend/src/app/admin/invoices/page.tsx`, 5 components in `admin/invoices/`, `frontend/src/lib/invoices.ts`.

### Scripts

| File | Classification |
|------|----------------|
| `scripts/verify_prod_invoice_snapshot.py` | move |
| `scripts/run_snapshot_invoice_api_check.py` | move |
| `scripts/test-prod-snapshot-invoices.ps1` | move |
| `scripts/test-invoices.ps1` | move |
| `scripts/test-accounting-new-qa-live.ps1` | move to demo app |
| `scripts/check-accounting-i18n.ps1` | move, retarget locales |
| `scripts/*23*-i18n*.mjs` | delete after Phase 5 (one-time Lakodi tooling) |

### Docs — copy to new repo

`docs/accounting-functional-map.md`, `docs/accounting-production-readiness-plan.md`, `docs/accounting_system_audit.md`.

### Unrelated — remain in Lakodi

All zakazky, gallery, RAG, marketing pages, convertor.

**Total classified files: 147** (14 backend + 32 pages + 72 components + 17 lib + 2 types + 7 legacy + 8 scripts + 3 docs + host files).

---

## 28. Implementation Phases (12 phases)

Each phase lists: package changes, Lakodi changes, local deps, tests, rollback.

---

### Phase 0 — Repository bootstrap

| Item | Detail |
|------|--------|
| **Objective** | Create `cz-accounting-module` GitHub repo skeleton |
| **Package** | Empty `accounting-api`, `accounting-ui`, `accounting-admin`; CI stubs; README; `.env.example` |
| **Lakodi** | No changes |
| **Local deps** | None yet |
| **Tests** | CI green on empty packages |
| **Rollback** | N/A |
| **Risk** | Low |

---

### Phase 1 — Port interfaces

| Item | Detail |
|------|--------|
| **Objective** | Define auth, email, settings, storage ports + in-memory test implementations |
| **Package new files** | `accounting_api/ports/{auth,email,settings,storage}.py`, `tests/adapters/` |
| **Lakodi** | No runtime change |
| **Tests** | Port unit tests in package |
| **Rollback** | Delete port files |
| **Risk** | Low |

---

### Phase 2 — Alembic migrations (SQLite)

| Item | Detail |
|------|--------|
| **Objective** | Initial Alembic revision reproducing current prod schema |
| **Package** | `migrations/` from `db.py` `_ensure_invoice_*` logic |
| **Lakodi** | Add script calling `accounting_api.migrations.upgrade(engine)` **alongside** existing `_ensure_*` for verification only — no removal yet |
| **Tests** | `test_migrations_sqlite.py` on empty DB + prod snapshot copy (`scripts/verify_prod_invoice_snapshot.py`) |
| **Rollback** | Stop calling package migration; `_ensure_*` still active |
| **Risk** | High |

---

### Phase 3 — Backend cutover

| Item | Detail |
|------|--------|
| **Objective** | Move 14 backend files; Lakodi consumes package; delete inline module |
| **Package** | Full domain code; `create_accounting_router()` |
| **Lakodi** | `-e ../cz-accounting-module/packages/accounting-api`; adapters for auth/email/storage; mount package router; **delete** `backend/app/modules/invoices/` |
| **Local deps** | Editable backend path |
| **Tests** | All 100 tests in `test_invoices.py` pass via package |
| **Rollback** | Git revert Lakodi to previous commit; pin previous Lakodi commit without package |
| **Risk** | High |

---

### Phase 4 — Remove Lakodi defaults + validation gate

| Item | Detail |
|------|--------|
| **Objective** | No Lakodi IČO/bank fallbacks; block invoice issue without settings |
| **Package** | `payment_service.py` defaults empty; `validate_issuer_settings()` |
| **Lakodi** | Map existing `INVOICE_*` env to bootstrap only if set |
| **Tests** | Fresh DB cannot issue invoice until settings saved |
| **Rollback** | Revert package commit |
| **Risk** | Medium |

---

### Phase 5 — i18n extraction

| Item | Detail |
|------|--------|
| **Objective** | Move `accountingNew` to `locales/{cs,en,ru,ua}.json` |
| **Package** | `AccountingI18nProvider`; keep locale id `ua` |
| **Lakodi** | Remove `accountingNew` blocks from `translations.ts` (4 × ~1,828 lines); consume package locales via file dep |
| **Local deps** | `"@cz/accounting-ui": "file:../cz-accounting-module/packages/accounting-ui"` |
| **Tests** | `check-accounting-i18n.ps1` passes |
| **Rollback** | Restore translations blocks from git |
| **Risk** | Medium |

---

### Phase 6 — Frontend cutover

| Item | Detail |
|------|--------|
| **Objective** | Move 72 components + 17 lib + 2 types; bundle 12 ui primitives |
| **Package** | Full `accounting-ui`; `AccountingConfigProvider` |
| **Lakodi** | Thin page wrappers importing package; **delete** duplicated `accounting-new/` source |
| **Tests** | `npm run build` in Lakodi; smoke routes |
| **Rollback** | Revert to previous file dep tag |
| **Risk** | High |

---

### Phase 7 — Demo application

| Item | Detail |
|------|--------|
| **Objective** | `apps/accounting-admin` deployable standalone |
| **Lakodi** | No change |
| **Tests** | `ci-demo.yml` smoke |
| **Risk** | Low |

---

### Phase 8 — Frontend tests + E2E

| Item | Detail |
|------|--------|
| **Objective** | Minimal unit tests + QA smoke script on demo |
| **Risk** | Medium |

---

### Phase 9 — Observability (minimal)

| Item | Detail |
|------|--------|
| **Objective** | Structured logging for email/import/PDF/migration failures |
| **Scope** | Logging only — no Prometheus, no metrics infrastructure |
| **Risk** | Low |

---

### Phase 10 — Remove `db.py` accounting migrations

| Item | Detail |
|------|--------|
| **Objective** | Delete 13 `_ensure_invoice_*` functions from Lakodi `db.py` |
| **Lakodi** | Package Alembic is sole accounting schema manager |
| **Tests** | Prod snapshot verify + full pytest |
| **Rollback** | Restore `_ensure_*` functions from git |
| **Risk** | High |

---

### Phase 11 — Legacy UI removal

| Item | Detail |
|------|--------|
| **Objective** | Delete 6 legacy invoice UI files + `invoices.ts`; remove feature flag |
| **Lakodi** | Remove `NEXT_PUBLIC_ACCOUNTING_NEW_ENABLED`; simplify middleware |
| **Tests** | Grep clean; smoke all accounting routes |
| **Risk** | Low |

---

### Phase 12 — Release v1.0.0

| Item | Detail |
|------|--------|
| **Objective** | Git tag; Lakodi pins tag in requirements/package.json |
| **Production deps** | Git URL + tag (no registry) |
| **Tests** | Full CI on both repos |
| **Risk** | Low |

---

## 29. Acceptance Criteria (definition of done)

- [ ] `cz-accounting-module` repo on GitHub with CI green
- [ ] Lakodi consumes package via editable (dev) and Git tag (prod) — **no inline accounting domain code**
- [ ] All 100 backend tests pass in package CI
- [ ] 85 API endpoints — same paths (relative to prefix), schemas, errors, sync behavior
- [ ] SQLite Alembic verified against prod snapshot copy
- [ ] No Lakodi IČO/bank defaults in package code
- [ ] Locales `cs`, `en`, `ru`, `ua` moved without new translation work
- [ ] Demo app deploys one Czech company without source edits
- [ ] Legacy `/admin/invoices` removed from Lakodi
- [ ] VAT behavior unchanged (`tax_mode` model, no `vat_payer` column added)
- [ ] No background job abstractions introduced
- [ ] README documents sibling-repo workflow and Git pin install

---

## 30. Complexity Estimates

| Phase | Complexity | Duration |
|-------|------------|----------|
| 0 | Low | 2–3 days |
| 1 | Low | 2–3 days |
| 2 | High | 1–1.5 weeks |
| 3 | High | 1.5–2 weeks |
| 4 | Medium | 3–5 days |
| 5 | Medium | 1 week |
| 6 | High | 1.5–2 weeks |
| 7 | Low | 3–5 days |
| 8 | Medium | 3–5 days |
| 9 | Low | 2–3 days |
| 10 | High | 3–5 days |
| 11 | Low | 2–3 days |
| 12 | Low | 2–3 days |
| **Total** | **High** | **10–12 weeks** |

---

## Appendix A — Verified vs approximate metrics

| Metric | Status |
|--------|--------|
| 14 backend files | **Verified** |
| 12,084 backend LOC | **Verified** |
| 85 routes | **Verified** |
| 20 tables | **Verified** |
| 6,786 test LOC, 100 test functions | **Verified** |
| 32 pages, 72 components, 17 lib, 2 types | **Verified** |
| 3,562 API client LOC, 73 exports | **Verified** |
| ~1,828 lines per locale `accountingNew` block | **Verified** (line ranges) |
| ~900–1,000 leaf i18n keys per locale | **Approximate** |
| 12 shadcn modules | **Verified** |
| Postgres compatibility | **Not verified — out of scope** |
| Docker prod build with Git dep | **Assumption — needs verification in Phase 3** |

---

## Appendix B — Remaining unverified assumptions

1. **Lakodi Dockerfile** can install `accounting-api` from sibling path / Git URL without structural changes — to be verified in Phase 3.
2. **Exact leaf i18n key count** — automated extraction script will produce exact count in Phase 5.
3. **Bundled shadcn primitives** build correctly in isolation with package Tailwind config — to be verified in Phase 6 build.
4. **Greenfield demo** at `/api/invoices` prefix works with same schemas when mounted outside `/api/admin` — to be verified in Phase 7 (no schema change expected).

---

*End of extraction plan. No code has been extracted or modified.*
