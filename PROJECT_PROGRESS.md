# Project Progress — Lakodi

## 2026-07-29 — Hybrid search Phase 1 (exact / normalized columns)

- **Status:** implemented locally (not committed in this task)
- **Goal:** Canonical search normalization + nullable norm columns + indexes +
  idempotent backfill + exact/normalized match before legacy ILIKE when
  `HYBRID_SEARCH_ENABLED=true` (default `false`)
- **Files:**
  - `backend/app/modules/invoices/search_normalize.py` (new)
  - `backend/app/modules/invoices/models.py` (norm columns + ORM hooks)
  - `backend/app/db.py` (`_ensure_invoice_search_norm_columns`, `backfill_invoice_search_norms`)
  - `backend/app/modules/invoices/service.py` (`list_invoice_subjects`, `_load_filtered_outgoing_invoices`)
  - `backend/tests/test_invoice_search_normalize.py` (new)
  - `.env.example` (`HYBRID_SEARCH_ENABLED=false`)
- **Not in this phase:** RapidFuzz, FTS5, embeddings, vectors, Qdrant, pgvector, RAG
- **Tests:** `python -m pytest backend/tests/test_invoice_search_normalize.py -q` → 25 passed
- **Note:** two existing AI-internal error-path tests still fail via `business_span`
  generator/`HTTPException` TestClient interaction (pre-existing; unrelated to search)

## 2026-07-24 — AI Accounting admin BFF foundation

- **Status:** implemented in Lakodi backend (not committed in this task pass)
- **Goal:** Secure server-side bridge between authenticated Lakodi admin UI and
  standalone `AI_Agent_Accounting` (browser never talks to AI service directly)

### Implemented components

| Component | Path | Role |
|-----------|------|------|
| Host JWT minting | `backend/app/modules/ai_accounting/host_auth.py` | Short-lived HS256 `AI_AUTH` tokens |
| HTTP proxy client | `backend/app/modules/ai_accounting/bff_client.py` | Upstream calls to AI platform |
| BFF router | `backend/app/modules/ai_accounting/bff_router.py` | Admin cookie → mint → proxy |
| App mount | `backend/app/main.py` | `/api/admin/ai` |
| Tests | `backend/tests/test_ai_accounting_bff.py` | Auth, tenant, claims, proxy, errors |
| Env docs | `.env.example`, `.env.prod.example` | `AI_AUTH_*`, `AI_AGENT_*`, existing S2S |

### Configuration variables

**S2S (AI → Lakodi internal API, already present):**

- `AI_ACCOUNTING_SERVICE_TOKEN_SECRET`
- `AI_ACCOUNTING_EXPECTED_TENANT_ID`
- `AI_ACCOUNTING_ALLOWED_KEY_ID`
- `AI_ACCOUNTING_TOKEN_ISSUER` (default `ai-agent-accounting`)
- `AI_ACCOUNTING_TOKEN_AUDIENCE` (default `lakodi-internal-accounting`)
- `AI_ACCOUNTING_MAX_TOKEN_TTL_SECONDS`

**Host → AI (BFF mint + proxy):**

- `AI_AUTH_TOKEN_ISSUER` (default `lakodi-host`)
- `AI_AUTH_TOKEN_AUDIENCE` (default `ai-agent-accounting`)
- `AI_AUTH_KEY_ID`
- `AI_AUTH_SIGNING_SECRET` (≥32 chars)
- `AI_AUTH_TENANT_ID` (fallback: `AI_ACCOUNTING_EXPECTED_TENANT_ID`)
- `AI_AUTH_TOKEN_TTL_SECONDS` (default 300, max 900)
- `AI_AUTH_DEFAULT_SCOPES` (CSV; always includes `ai.chat`)
- `AI_AGENT_BASE_URL` (no trailing slash)
- `AI_AGENT_TIMEOUT_SECONDS` (default 60)

### Lakodi BFF endpoint paths

| Method | Path | Upstream |
|--------|------|----------|
| `POST` | `/api/admin/ai/chat/messages` | `POST /api/v1/chat/messages` |
| `GET` | `/api/admin/ai/conversations/{id}` | `GET /api/v1/conversations/{id}` |
| `GET` | `/api/admin/ai/conversations/{id}/messages` | `GET /api/v1/conversations/{id}/messages` |
| `GET` | `/api/admin/ai/actions/{id}` | `GET /api/v1/actions/{id}` |
| `POST` | `/api/admin/ai/actions/{id}/approve` | `POST /api/v1/actions/{id}/approve` |
| `POST` | `/api/admin/ai/actions/{id}/reject` | `POST /api/v1/actions/{id}/reject` |
| `GET` | `/api/admin/ai/health` | `GET /health` |

All require Lakodi `admin_session` cookie with `role=admin`.
Approve requires `Idempotency-Key` (AI contract). Chat generates one if omitted.

### AI authentication flow

```text
Browser (admin UI)
  → cookie admin_session
  → Lakodi BFF (/api/admin/ai/...)
       → decode session → user_id + role=admin
       → resolve tenant from AI_AUTH_TENANT_ID (server env only)
       → mint HS256 JWT (iss=lakodi-host, aud=ai-agent-accounting, kid, scopes)
       → Authorization: Bearer <token> → AI_AGENT_BASE_URL
  → AI_Agent_Accounting
       → optional connector S2S → Lakodi /internal/ai/v1/accounting
```

**JWT claims minted by Lakodi:**

- Header: `typ=JWT`, `alg=HS256`, `kid=<AI_AUTH_KEY_ID>`
- Payload: `iss`, `aud`, `sub`, `user_id`, `tenant_id`, `roles`, `scopes`,
  `iat`, `nbf`, `exp`, `jti`
- Default scopes: `ai.chat`, `lakodi.invoices.read`, `lakodi.payments.read`,
  `lakodi.customers.read`

Identity / tenant / issuer / audience are **never** taken from the frontend body.

### Security notes

- Signing secrets and connector keys stay server-side only.
- Non-admin authenticated users → HTTP 403.
- Missing tenant/auth config → HTTP 503.
- Upstream timeout → 504; connection error → 502; AI status codes forwarded.
- Approve has no JSON body (matches AI OpenAPI); reject may send `{reason}`.

### Tests

Suite: `backend/tests/test_ai_accounting_bff.py` — **15 passed**

Coverage includes:

- unauthenticated → 401
- non-admin role → 403
- missing tenant → 503
- correct JWT claims
- successful chat proxy
- successful action get + approve proxy
- upstream timeout / connection error
- upstream 401 / 503 forwarding
- secrets not present in BFF responses

Ruff on BFF modules: **All checks passed**

Note: `backend/tests/test_ai_accounting_internal.py` still has 2 pre-existing failures
(`RuntimeError: generator didn't stop after throw()` around tracing middleware +
HTTPException), unrelated to this BFF work.
### Remaining work (out of this task)

1. Deploy AI platform beside Lakodi (`AI_Agent_Accounting` PRODUCTION_DEPLOY).
2. Align live secrets 1:1 (connector + `AI_AUTH_*`).
3. ~~Frontend chat panel calling only `/api/admin/ai/...`~~ — done (see FE section below).
4. Staging smoke: chat read → draft proposal → approve → issue/email.

### Contract reference

Verified against adjacent repo (read-only):

- `AI_Agent_Accounting/docs/WEB_INTEGRATION.md`
- `AI_Agent_Accounting/app/api/chat.py`
- `AI_Agent_Accounting/app/api/actions.py`
- `AI_Agent_Accounting/app/core/security.py`

---

## 2026-07-24 — AI Accounting admin chat frontend

- **Status:** implemented in Lakodi frontend (not committed in this task pass)
- **Goal:** Authenticated admin chat UI that talks only to Lakodi BFF (`/api/admin/ai/...`)
- **Location:** `/admin/ucetnictvi-new/ai-asistent` (module grid: **AI asistent**)

### Frontend components created

| Component / module | Path |
|--------------------|------|
| Typed BFF client | `frontend/src/lib/aiAccountingAdmin.ts` |
| Action ID extractor | `frontend/src/lib/aiAccountingActionIds.ts` |
| TS schemas | `frontend/src/types/aiAccounting.ts` |
| Chat panel | `frontend/src/components/admin/accounting-new/AccountingNewAiChatPanel.tsx` |
| Action card | `frontend/src/components/admin/accounting-new/AccountingNewAiActionCard.tsx` |
| Module page | `frontend/src/app/admin/ucetnictvi-new/ai-asistent/page.tsx` |
| Vitest setup | `frontend/vitest.config.ts`, `frontend/src/test/setup.ts` |

### Integration

- Module id `ai-assistant` registered in routes, registry, and grid.
- Wired through `AccountingNewModulePageShell` (skips dashboard fetch for this module).
- Conversation id persisted in `sessionStorage` (`lakodi.admin.aiAccounting.conversationId`).

### BFF endpoints consumed

| Method | Path |
|--------|------|
| `GET` | `/api/admin/ai/health` (once on mount, no polling) |
| `POST` | `/api/admin/ai/chat/messages` |
| `GET` | `/api/admin/ai/conversations/{id}` |
| `GET` | `/api/admin/ai/conversations/{id}/messages` |
| `GET` | `/api/admin/ai/actions/{id}` |
| `POST` | `/api/admin/ai/actions/{id}/approve` (`Idempotency-Key`, no JSON body) |
| `POST` | `/api/admin/ai/actions/{id}/reject` (`{ reason? }`) |

### Chat / action behavior

- Message history, Enter send / Shift+Enter newline, pending send lock
- Continues via `conversation_id` from BFF
- Loads history when stored conversation id exists; 404 clears storage
- Action IDs parsed from assistant text / `route_evidence`; pending shows Approve/Reject
- Approve requires confirm dialog; reject/approve refresh action status; duplicate action submits blocked
- Unavailable UI when health check fails
- Browser never sees AI base URL, JWT secrets, or host signing config

### Localization

- New `accountingNew.aiChat.*` strings + module registry / voice / RAG labels
- Languages: **cs**, **ua**, **ru**, **en**

### Tests and validation

| Check | Result |
|-------|--------|
| `npm run test` (vitest) | **10 passed** (2 files) |
| `npx eslint` on new AI FE files | **clean** |
| `npm run typecheck` (`tsc --noEmit`) | **clean** |
| `npm run build` | **success** (route `/admin/ucetnictvi-new/ai-asistent` present) |
| Full `npm run lint` | Pre-existing noise from `.next` / `.next_old` generated types (not introduced by this work) |

Test coverage includes empty state, send/response, conversation continuation, pending send lock, validation error, unavailable health, pending action, approve with confirmation, reject, and duplicate action prevention.

### Remaining deployment / configuration

1. Production secrets rotation / GHCR image pin (do not reuse local-dev fingerprints).
2. Staging smoke: chat → draft action → approve → verify accounting side effects.
3. Optional: clear empty `OTEL_EXPORTER_OTLP_ENDPOINT` noise in AI API logs when OTEL is unused.

---

## 2026-07-24 — Docker audit + local AI Accounting integration deploy

- **Status:** local Docker stack wired and smoke-verified (not committed)
- **Compose used (Lakodi):** `docker-compose.yml` + `docker-compose.dev.yml`
- **Compose used (AI):** `docker-compose.yml` + `docker-compose.lakodi-bridge.yml` (new)

### Final Docker topology

```text
Browser
  -> lakodi-frontend-dev (:8090 -> :8080)
       rewrite /api/* -> http://lakodi-backend-dev:8016
  -> lakodi-backend-dev (:8016)
       BFF /api/admin/ai/*  --(network lakodi-ai-shared)-->  ai-agent-accounting-api:8000
  -> ai_agent_accounting api (:8001 host -> :8000)
       connector S2S --(lakodi-ai-shared)--> http://lakodi-backend-dev:8016/internal/ai/v1/accounting/...
  -> postgres + redis (AI project network) + celery-worker (shared network attached)
```

Separate AI local-demo stack (`ai-agent-accounting-local-demo-e4d947f1`, host :8003 → Lakodi :8101) was left untouched.

### Shared network

| Item | Value |
|------|-------|
| Name | `lakodi-ai-shared` (external bridge) |
| Attached | `lakodi-lakodi-backend-dev-1`, `ai_agent_accounting-api-1`, `ai_agent_accounting-celery-worker-1` |
| DNS aliases | `lakodi-backend-dev`, `ai-agent-accounting-api`, `ai-agent-accounting-celery` |

### Service names / ports

| Service | Compose name | Internal | Host publish |
|---------|--------------|----------|--------------|
| Lakodi FE | `lakodi-frontend-dev` | 8080 | 8090 |
| Lakodi BE | `lakodi-backend-dev` | 8016 | 8016 |
| Lakodi Redis | `lakodi-redis` | 6379 | (none) |
| AI API | `api` | 8000 | 8001 |
| AI Celery | `celery-worker` | 8000 | (none) |
| AI Postgres | `postgres` | 5432 | 55432 |
| AI Redis | `redis` | 6379 | (none) |

### Env mapping (secrets redacted)

Lakodi `.env` (gitignored) + `docker-compose.dev.yml` injection:

- `AI_AGENT_BASE_URL=http://ai-agent-accounting-api:8000`
- `AI_AUTH_TOKEN_ISSUER=lakodi-host` / `AI_AUTH_TOKEN_AUDIENCE=ai-agent-accounting`
- `AI_AUTH_KEY_ID=lakodi-local-inbound` (fingerprint `8ad0708f3f16`)
- `AI_AUTH_TENANT_ID=tenant-1`
- `AI_ACCOUNTING_*` matched to connector (`lakodi-local-s2s`, tenant `tenant-1`)

AI `.env` (gitignored):

- Matching `AI_AUTH_*`
- `ACCOUNTING_CONNECTOR_BASE_URL=http://lakodi-backend-dev:8016`
- Matching `ACCOUNTING_CONNECTOR_TENANT_ID` / `KEY_ID` / signing secret

### Code / compose changes for deploy

**Lakodi**

- `docker-compose.dev.yml` — AI env injection + `lakodi-ai-shared`
- `.env.example` — Docker DNS comment for `AI_AGENT_BASE_URL`
- `.env` — local secrets upserted (ignored)

**AI_Agent_Accounting**

- `docker-compose.lakodi-bridge.yml` — external network + aliases
- `accounting_connector/client.py` — allow HTTP to `lakodi-backend-dev` (Compose alias) under local HTTP host allowlist
- `.env` — matched connector/auth (ignored)
- Alembic `upgrade head` on AI Postgres (was empty / missing `agent_runs`)

### Deployment commands executed

```powershell
docker network create lakodi-ai-shared
cd lakodi
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --force-recreate lakodi-backend-dev
cd AI_Agent_Accounting
docker compose -f docker-compose.yml -f docker-compose.lakodi-bridge.yml build api celery-worker
docker compose -f docker-compose.yml -f docker-compose.lakodi-bridge.yml up -d --force-recreate api celery-worker
docker compose -f docker-compose.yml -f docker-compose.lakodi-bridge.yml run --rm --no-deps api python -m alembic upgrade head
cd lakodi
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart lakodi-frontend-dev
```

### Validation results

| Check | Result |
|-------|--------|
| Shared network DNS both ways | OK |
| Unauth `GET /api/admin/ai/health` | **401** |
| Auth BFF health (BE + FE proxy) | **200** upstream AI ok |
| FE `/admin/ucetnictvi-new/ai-asistent` | **200** after Next compile |
| FE bundle secret/hostname scan | **none** |
| Read-only chat via FE `/api/admin/ai/chat/messages` | **200**; tools `list_outgoing_documents`, `get_outgoing_documents_summary` |
| Conversation + messages reload | **200**, 2 messages |
| Lakodi BFF pytest | **15 passed** |
| Ruff BFF modules | **All checks passed** |
| FE vitest / tsc / eslint (AI files) | **pass** |
| AI unit `test_health` (+application via host python) | **2 passed** |
| Internal accounting pytest (sample in live container) | **setup errors** (sqlite locked / concurrent live DB) — not used for E2E proof; live S2S smoke already succeeded |

### AI assistant URL

`http://localhost:8090/admin/ucetnictvi-new/ai-asistent`

### Notes / non-blockers

- AI API logs may show OTEL exporter URL errors when `OTEL_EXPORTER_OTLP_ENDPOINT` is empty; health/chat still work.
- Observability orphan containers from prior AI compose overlays left running (Loki/Tempo/etc.).
- Nothing committed or pushed.
