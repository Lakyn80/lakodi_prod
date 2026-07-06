# Lakodi Development README

This README is intentionally development-focused.
It documents how to run, modify, and test the project locally.
Production deployment and release documentation can be added later in a separate main README.

## What This Project Is

Lakodi is a full-stack web application for an automotive service business.
The repository contains:

- a FastAPI backend
- a Next.js frontend
- SQLite-backed local data storage
- uploaded media and generated service-gallery assets
- optional Docker-based local development

## Tech Stack

- Backend: FastAPI, SQLAlchemy, SQLite
- Frontend: Next.js 15, React 18, TypeScript, Tailwind CSS
- Media processing: Pillow, pillow-heif, sharp
- Auth: cookie-based admin session
- Local persistence: `data/app.db`, `data/uploads`
- Dev container option: Docker Compose

## Repository Layout

```text
.
|-- backend/                 FastAPI application
|-- frontend/                Next.js application
|-- data/                    SQLite DB, uploads, gallery metadata
|-- img_dilna/ or img_dílna/ Source images used by media sync
|-- tests/                   Frontend SEO guard tests
|-- .github/workflows/       CI only
|-- docker-compose.yml       Local all-in-one dev stack
|-- Dockerfile               Local all-in-one image
|-- build.ps1                Manual deployment script
|-- deploy.ps1               Wrapper around build.ps1
```

## Prerequisites

For native local development:

- Python 3.11
- Node.js 20
- npm

For Docker-based development:

- Docker
- Docker Compose

Recommended:

- PowerShell on Windows
- Git

## Environment Variables

Start by copying `.env.example` to `.env`.

The most important development variables are:

```env
DATABASE_URL=sqlite:///./data/app.db
UPLOAD_DIR=./data/uploads
NEXT_PUBLIC_API_URL=http://localhost:8016
CORS_ORIGINS=http://localhost:3000,http://localhost:8080,http://localhost:8090

ADMIN_EMAIL=lakodi@seznam.cz
ADMIN_PASSWORD=admin123
ADMIN_RECOVERY_TOKEN=change-me
ADMIN_SESSION_SECRET=change-me
WHATSAPP_NUMBER=420776053625
```

Notes:

- The backend seeds an admin user on startup from `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
- If `DATABASE_URL` points to SQLite, the app creates the DB directory automatically.
- Uploaded files are served from `/api/uploads`.
- Recovery email settings are optional for local dev.
- Owner booking notifications use email only.
- Deployment-specific variables can stay unset during normal local development.

For new booking notifications, the backend currently supports:

- owner email notification via Resend or SMTP
- owner email recipient override via `BOOKING_NOTIFICATION_EMAIL` (defaults to `lakodi@seznam.cz`)
- admin detail links in notifications via `BOOKING_ADMIN_BASE_URL` (falls back to `ADMIN_RECOVERY_BASE_URL`)

## Local Development Without Docker

### 1. Create a Python virtual environment

Windows PowerShell:

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
```

macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install backend dependencies

There is no dedicated production-grade `requirements.txt` for local setup, so install the dependencies used by the project and CI:

```bash
pip install --upgrade pip
pip install fastapi uvicorn python-multipart pillow pillow-heif sqlalchemy resend passlib "bcrypt==4.0.1" pytest httpx
```

### 3. Install frontend dependencies

```bash
cd frontend
npm ci
cd ..
```

### 4. Create the local environment file

```bash
cp .env.example .env
```

If you are on Windows and `cp` is not available:

```powershell
Copy-Item .env.example .env
```

At minimum, verify:

- `NEXT_PUBLIC_API_URL=http://localhost:8016`
- `DATABASE_URL=sqlite:///./data/app.db`
- `UPLOAD_DIR=./data/uploads`

### 5. Start the backend

From the repository root:

```bash
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8016
```

Backend URLs:

- API root health check: `http://127.0.0.1:8016/api/health`
- Admin API prefix: `http://127.0.0.1:8016/api/admin`
- Uploads: `http://127.0.0.1:8016/api/uploads`

### 6. Start the frontend

In a second terminal:

```bash
cd frontend
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Frontend URL:

- `http://127.0.0.1:3000`

Why port `3000`:

- Next.js defaults to `3000`
- `next.config.mjs` rewrites `/api/*` requests to `NEXT_PUBLIC_API_URL`
- the backend default for local development is `http://127.0.0.1:8016`

## Local Development With Docker

The repository includes a single-container dev setup that starts:

- Redis
- FastAPI on `8016`
- Next.js dev server on `8080`

Start it from the repository root:

```bash
docker compose up --build
```

Exposed ports:

- Backend: `http://localhost:8016`
- Frontend: `http://localhost:8090`
- Redis: `localhost:6381`

Docker notes:

- `backend/` and `frontend/` are bind-mounted for live editing
- `data/` is bind-mounted and persists your SQLite DB and uploads
- `img_dílna` is mounted read-only into the container for service-image generation

## Generated Service Images

The frontend runs `media:sync` automatically during both `npm run dev` and `npm run build`.

The sync script:

- looks for a source folder named `img_dílna` or `img_dilna`
- converts selected images to optimized `.webp`
- writes generated files into `frontend/public/services`

If the source folder is missing:

- the script logs a warning
- existing generated files are kept

This means the app can still run even if the original source image folder is not present, as long as `frontend/public/services` already contains generated output.

## Admin Login in Development

On startup, the backend ensures that the admin user from the environment exists.

Default dev credentials from `.env.example`:

- Email: `lakodi@seznam.cz`
- Password: `admin123`

Relevant frontend routes:

- Admin login page: `http://127.0.0.1:3000/admin/login`
- Admin dashboard: `http://127.0.0.1:3000/admin`

If you use Docker, replace port `3000` with `8090`.

## Data and Persistence

Important local data paths:

- SQLite database: `data/app.db`
- Upload root: `data/uploads`
- Service gallery metadata: `data/service_gallery.json`
- Service gallery overrides: `data/service_gallery_overrides.json`

The backend initializes tables automatically on startup.
For SQLite, it also performs a small in-place schema expansion for some `zakazky` columns if they are missing.

Treat `data/` as real local state.
Do not delete it unless you explicitly want to reset the application.

## Tests and Quality Checks

### Backend tests

```bash
pytest backend/tests -q
```

### Frontend lint

```bash
cd frontend
npm run lint
```

### Frontend production build

```bash
cd frontend
NEXT_PUBLIC_API_URL=http://localhost:8016 npm run build
```

PowerShell equivalent:

```powershell
$env:NEXT_PUBLIC_API_URL="http://localhost:8016"
cd frontend
npm run build
```

### SEO guard test

The repository contains a lightweight SEO/canonical test in `tests/seo.test.ts`.
The CI workflow builds the frontend, starts it locally, and then runs the test.

A similar manual flow is:

1. Build the frontend
2. Start it with `npm run start`
3. Run the SEO test against the local URL

## CI

GitHub Actions currently runs CI only.
It does not deploy the application.

Current CI jobs:

- backend tests
- frontend build
- SEO guard test

Workflow file:

- `.github/workflows/ci.yml`

## Manual Deployment Scripts

This repository already contains deployment scripts, but they are out of scope for this development README:

- `build.ps1`
- `deploy.ps1`
- `docker-compose.server.yml`

They are used for manual deployment and server updates, not for local development.

## Common Issues

### Frontend starts but service images are missing

Check whether `img_dílna` or `img_dilna` exists in the repository root.
If it does not, ensure `frontend/public/services` already contains generated images.

### Admin login does not work

Check:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- whether you are using the correct frontend port
- whether the backend is using the same `.env` you expect

### Uploaded images do not appear

Check:

- `UPLOAD_DIR`
- that `data/uploads` exists
- that the backend is reachable on port `8016`
- that the frontend `NEXT_PUBLIC_API_URL` points to the same backend

### CORS errors in local development

Make sure `CORS_ORIGINS` includes the frontend origin you are actually using, for example:

```env
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:8090
```

## Recommended Development Workflow

1. Copy `.env.example` to `.env`
2. Keep `data/` under control and back it up before risky changes
3. Run backend and frontend separately during normal feature work
4. Use Docker Compose when you want the all-in-one environment
5. Run backend tests before pushing
6. Run frontend build and lint before merging larger UI changes

## Next Documentation Step

This file is the development README only.
When the project expansion is complete, a separate main README can be added for:

- product overview
- deployment and operations
- production environment
- release flow
- server maintenance
