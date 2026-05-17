# ⚡ Watt Do We Have Here

A self-hosted, multi-tenant home energy monitor for **Shelly 1PM Mini Gen3** smart switches. Track multiple devices in real time per user account, compare ECO vs FULL operating modes, project cost and CO₂ impact, manage native Shelly schedules / scripts / webhooks from one UI, and ship the whole thing to your own VPS.

**Stack:** React (Vite) · Python FastAPI · SQLAlchemy async + PostgreSQL (asyncpg) · JWT auth · Recharts

---

## 🛰 Mission · The Kardashev angle

Energy is civilization. Climbing the [Kardashev scale](https://en.wikipedia.org/wiki/Kardashev_scale) starts with knowing — and respecting — every watt that flows through our homes. This project is a tiny, opinionated step in that direction: take a cheap commodity smart switch, give it a long memory, and turn its readings into something you can actually reason about. Useful at the household level today; the same shape of tool, scaled up, is how we eventually balance grids and budget joules across cities. Plumbing for a Type-I future.

---

## Features

| Section | What it does |
|---|---|
| **Auth + multi-tenancy** | Email / password accounts, JWT (7-day), every device & reading is scoped to a user_id |
| **Multi-device fleet** | Add any number of Shelly devices, each polled in its own async task, encrypted credentials at rest |
| **Native Shelly tabs** | Schedules · Scripts (mJS templates) · Webhooks (ntfy.sh templates) · Settings (WiFi, power-limit, reboot, factory reset) |
| **Control Panel** | ON/OFF with auto-off timer (presets + countdown + arc), ECO 🌿 / FULL ⚡ tagging for experiments |
| **Live Metrics** | Custom SVG power gauge, 2×4 mini-card grid (voltage, current, today, month, all-time, temp, cost/h, uptime) |
| **Energy Chart** | `ComposedChart` with filled gradient, ECO/FULL overlay, mode-shaded bands, off-peak (22:00-08:00) shade, Brush, Smooth/Step toggle, CSV export, **period A vs period B compare mode** |
| **Insights tabs** | Overview (streak, best/worst day, deltas vs last month) · Costs (month selector, YoY) · Patterns (heatmap, MoM) · CO₂ |
| **Alerts** | Per-device threshold + duration rule; trigger log persisted; header badge while active |

---

## ECO vs FULL — a manual tag, not a hardware feature

The Shelly 1PM Mini Gen3 does **not** expose ECO or FULL modes. The distinction in this app is a **manual label you attach to a window of time** for your own experiment tracking. Toggle it before flipping your appliance's mode dial; the collector then tags all subsequent readings with that label. Months later, the ECO vs FULL chart shows the difference. The label is yours — call it Heater A / Heater B, Summer / Winter, whatever your A/B test is.

---

## Architecture

```
                ┌─────────────────────────────────────────────┐
                │  React (Vite)  ·  /login /register /        │
                │  axios + interceptor (Bearer JWT)           │
                └────────────────┬────────────────────────────┘
                                 │ HTTPS
                                 ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  FastAPI                                                    │
   │   ├─ JWT auth (HS256, 7d)                                   │
   │   ├─ Per-endpoint Depends(get_current_user)                 │
   │   ├─ slowapi rate limit + CORS + security headers           │
   │   ├─ Fernet-encrypted Shelly passwords                      │
   │   └─ asyncio.Task per device → polls Shelly every 30s ───┐  │
   └────────────────┬─────────────────────────────────────────│──┘
                    │ SQLAlchemy async                        │
                    ▼                                         ▼
        ┌──────────────────────┐                  ┌────────────────────────┐
        │  PostgreSQL          │                  │  Shelly 1PM Mini Gen3  │
        │  (asyncpg)           │                  │  HTTP RPC + digest     │
        │  users · devices ·   │                  │  Schedules · Scripts · │
        │  readings · alerts · │                  │  Webhooks · Switch     │
        │  schedules_cache     │                  └────────────────────────┘
        └──────────────────────┘
```

---

## Local setup

### Prerequisites
- Python 3.12+
- Node 20+
- A Shelly 1PM Mini Gen3 on the local network (HTTP digest auth supported, username `admin`)

### 1. Backend
```bash
cd backend
cp .env.example .env
# Generate the two required secrets:
python -c "import secrets;print('SECRET_KEY=' + secrets.token_hex(32))" >> .env
python -c "from cryptography.fernet import Fernet;print('ENCRYPTION_KEY=' + Fernet.generate_key().decode())" >> .env

python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API at <http://localhost:8000>, OpenAPI docs at <http://localhost:8000/docs>.
SQLite (`./energy.db`) is used by default — set `DATABASE_URL=postgresql+asyncpg://…` for Postgres.

### 2. Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open <http://localhost:5173>. Register an account, then add your Shelly device.

### 3. Tests
```bash
cd backend
pip install pytest pytest-asyncio
python -m pytest tests/ -v
```

---

## Environment variables

### `backend/.env`

| Variable | Required | Example | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | `postgresql+asyncpg://user:pass@host:5432/db` | `sqlite+aiosqlite:///./energy.db` for dev |
| `SECRET_KEY` | yes | 64-char hex | JWT signing — rotate invalidates all tokens. Generate with `secrets.token_hex(32)` |
| `ENCRYPTION_KEY` | yes | Fernet key (44 char b64) | At-rest encryption for Shelly passwords. Generate with `Fernet.generate_key()` |
| `ALLOWED_ORIGINS` | no | `https://watt.example.com,https://staging.example.com` | Comma-separated CORS origins. Defaults to `http://localhost:5173` |
| `POLL_INTERVAL` | no | `30` | Seconds between Shelly polls per device |
| `ENVIRONMENT` | no | `production` | `production` skips `init_db()` on startup (alembic owns the schema) |
| `SHELLY_IP` / `SHELLY_PASS` | no | — | Legacy bootstrap, ignored in 3.x |

### `frontend/.env`

| Variable | Required | Example | Notes |
|---|---|---|---|
| `VITE_API_URL` | no in dev, yes in prod | `https://watt-api.example.com` | When empty, Vite proxies `/api` to `localhost:8000` (dev only) |

---

## Self-hosted vs cloud

Both work. Pick based on how much ops you want.

| | Self-hosted | Cloud (Vultr + Vercel + Supabase) |
|---|---|---|
| **What you run** | One VPS (or laptop) with Postgres + uvicorn + nginx | Vercel for the frontend, a VPS or container host for the API, Supabase for Postgres |
| **Cost** | €5-10/month for a small VPS | Vercel free + Supabase free for hobby; ~€5-15/month at scale |
| **Setup time** | 30 minutes | 10-20 minutes |
| **Backups** | You manage `pg_dump` to S3/B2 | Supabase has automated backups on paid tiers |
| **Maintenance** | OS updates, certs, log rotation | Just app updates |
| **Privacy** | Data never leaves your box | Encrypted in transit + at rest, but third parties hold it |

The codebase makes no assumption about which path you pick. It just needs a Postgres URL and a place to run `uvicorn`.

---

## Deployment

The default cloud path is **Vercel** (frontend) + **Fly.io** (backend) + **Supabase** (Postgres). Backend is containerised — `backend/Dockerfile` and `backend/fly.toml` are committed. A `.github/workflows/deploy.yml` redeploys the backend to Fly on every push to `main`.

### 1. Supabase (Postgres)

1. Create a project at <https://supabase.com>.
2. Settings → Database → **Connection string** → URI. Looks like `postgresql://postgres:[password]@db.xxx.supabase.co:5432/postgres`.
3. Replace the scheme so SQLAlchemy/asyncpg picks it up: `postgresql+asyncpg://postgres:[password]@db.xxx.supabase.co:5432/postgres`. Save it for step 2.

### 2. Fly.io (backend)

```bash
brew install flyctl                       # or: curl -L https://fly.io/install.sh | sh
flyctl auth signup                        # or login if you already have an account
cd backend
# Edit `app = "watt-api"` in fly.toml to something unique to you.
flyctl apps create <your-app-name>

# Generate prod secrets locally and push them to Fly:
SECRET_KEY=$(python -c "import secrets; print(secrets.token_hex(32))")
ENCRYPTION_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
flyctl secrets set \
  DATABASE_URL='postgresql+asyncpg://postgres:[password]@db.xxx.supabase.co:5432/postgres' \
  SECRET_KEY="$SECRET_KEY" \
  ENCRYPTION_KEY="$ENCRYPTION_KEY" \
  ALLOWED_ORIGINS='https://your-frontend.vercel.app'

flyctl deploy
```

The first deploy runs `alembic upgrade head` automatically (see the Dockerfile `CMD`). Health check hits `/api/health`. After deploy, the API is at `https://<your-app-name>.fly.dev`.

To enable auto-deploy from GitHub: `flyctl auth token` → paste into the repo's GitHub **Settings → Secrets → Actions** as `FLY_API_TOKEN`. Push to `main` now triggers `.github/workflows/deploy.yml`.

### 3. Vercel (frontend)

1. Import the repo at <https://vercel.com/new>.
2. **Root directory** → `frontend`. Framework auto-detected (Vite).
3. **Environment variables** → `VITE_API_URL = https://<your-app-name>.fly.dev`.
4. Deploy. Vercel auto-rebuilds on every push to `main`.

Update the Fly secret `ALLOWED_ORIGINS` to match whatever Vercel domain you end up with (preview and prod), comma-separated.

### Single-box self-host

The simpler path: install Postgres locally, run uvicorn under systemd, serve the built frontend via nginx. One machine, no cloud accounts.

```bash
# On a fresh Debian/Ubuntu:
sudo apt install postgresql python3.12 python3.12-venv nginx
sudo -u postgres createuser -P watt
sudo -u postgres createdb -O watt watt
# Then proceed as in the local setup section, with DATABASE_URL pointing at the local Postgres.
```

---

## API reference

OpenAPI docs are auto-generated at `/docs`. The shape:

- `/api/auth/*` — `register`, `login`, `me`, `logout`
- `/api/devices` (CRUD), `/api/devices/{id}/*` (status, switch, mode, readings, insights, info, alert-config, alerts)
- `/api/devices/{id}/shelly/*` — native Shelly proxies: `schedules`, `timer`, `webhooks`, `scripts`, `config`, `wifi`, `reboot`, `info`, `power-limit`, `factory-reset`
- `/api/aggregate/*` — combined status, insights, readings across the user's fleet
- `/api/alerts` — global alert log
- `/api/health` — unauthenticated liveness probe

Every endpoint except auth + health requires `Authorization: Bearer <jwt>`.

---

## Database schema

Managed by alembic (`backend/migrations/versions/0001_initial.py`). Models live in `backend/models_db.py`. Tables: `users`, `devices`, `readings`, `alert_configs`, `alerts`, `shelly_schedules_cache`. Every non-user table has a `user_id` FK with `ON DELETE CASCADE`.

To create a new migration:
```bash
cd backend
alembic revision --autogenerate -m "add foo column"
alembic upgrade head
```

---

## Security

- **Auth**: bcrypt password hashing (72-byte cap), HS256 JWT, 7-day expiry, signed with `SECRET_KEY`
- **At-rest encryption**: Shelly device passwords are Fernet-encrypted before being written to `devices.password`; the API never returns them in responses
- **Multi-tenancy**: every query is filtered by `user_id` from the JWT. Cross-user access returns 403 (never 404 — we don't leak existence)
- **Rate limits**: `/auth/register` 5/min, `/auth/login` 10/min (per IP)
- **CORS**: explicit `ALLOWED_ORIGINS` allowlist
- **Headers**: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`
- **Validation**: IPv4 regex on device IPs, length caps on all strings, HTML tag stripping on user-supplied text fields

Found a vulnerability? Email the maintainer or open a private GitHub security advisory.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Issues and PRs welcome — focused, small, well-tested. Big rewrites start with an issue.

---

## License

MIT — see `LICENSE`.
