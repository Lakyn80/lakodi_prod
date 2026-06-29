# Lakodi local Docker dev helper

Use the helper script for local Docker Desktop work:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/lakodi-docker-dev.ps1 start
```

Supported commands:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/lakodi-docker-dev.ps1 status
powershell -ExecutionPolicy Bypass -File scripts/lakodi-docker-dev.ps1 start
powershell -ExecutionPolicy Bypass -File scripts/lakodi-docker-dev.ps1 stop
powershell -ExecutionPolicy Bypass -File scripts/lakodi-docker-dev.ps1 restart
powershell -ExecutionPolicy Bypass -File scripts/lakodi-docker-dev.ps1 rebuild
powershell -ExecutionPolicy Bypass -File scripts/lakodi-docker-dev.ps1 logs
powershell -ExecutionPolicy Bypass -File scripts/lakodi-docker-dev.ps1 smoke
```

Why the helper exists:

- Plain `docker compose up -d` at the repo root loads only `docker-compose.yml`.
- In Lakodi, that base compose file defines only `lakodi-redis`.
- The actual local dev stack requires both compose files:
  - `docker-compose.yml`
  - `docker-compose.dev.yml`

The helper always uses the correct local dev services:

- `lakodi-redis`
- `lakodi-backend-dev`
- `lakodi-frontend-dev`

Expected local URLs:

- `http://localhost:8016/api/health`
- `http://localhost:8090/admin/ucetnictvi-new`
- `http://localhost:8090/admin/invoices`

Smoke check:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/lakodi-docker-dev.ps1 smoke
```

The smoke command verifies:

- `/api/health` returns `200`
- `/admin/ucetnictvi-new` returns `200`
- `/admin/ucetnictvi-new/doklady/1` returns `200`
- `/admin/invoices` returns `200`
- unauthenticated `/api/admin/invoices` returns `401`

Do not use plain `docker compose up -d` alone for the Lakodi local dev stack unless you intentionally want only Redis.
