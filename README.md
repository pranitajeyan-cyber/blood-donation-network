<div align="center">

# Blood Donation Network

**A predictive, escalating marketplace for blood.**

Finding a donor used to take hours. Predicting a shortage used to be impossible.
This builds both.

[![CI](https://github.com/pranitajeyan-cyber/blood-donation-network/actions/workflows/ci.yml/badge.svg)](https://github.com/pranitajeyan-cyber/blood-donation-network/actions/workflows/ci.yml)
[![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688.svg)](https://fastapi.tiangolo.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-72%20passing-brightgreen.svg)](#testing)

</div>

---

## The problem

India collects ~11.9M units of blood a year and needs ~14.6M. That ~20% gap
is not random — it is **predictable**.

- A patient needs blood *today* → hospitals burn one to three hours on
  phone calls and Facebook posts.
- A blood bank will run dry *next week* → nobody notices until the fridge is
  empty.
- Donors are willing but scattered, unverified and unreachable in emergencies.
- Fake donors and fake requests erode whatever trust exists.

> **The failure is not a shortage of blood. It is a shortage of connection and
> foresight.**

## What this repo actually builds

Existing platforms (Friends2Support, e-RaktKosh) are **directories**. They
react *after* a crisis. This system predicts the crisis and escalates
automatically until someone responds.

| Feature | What it does | Where it lives |
|---|---|---|
| **Matching engine** | Ranks eligible donors by blood-group compatibility, distance, verification status and the 120-day donation gap | [`app/services/matching.py`](app/services/matching.py) |
| **SLA escalation** | No donor in 15 min → radius grows 5 → 15 → 50 km. No donor in 30 min → caregiver SMS blast | [`app/services/escalation.py`](app/services/escalation.py) |
| **Shortage forecasting** | Predicts units needed per blood group per district for the next 7 days, with a backtested accuracy number | [`app/services/forecasting.py`](app/services/forecasting.py) |
| **Impact transparency** | Every unit gets a barcode-tracked bag the donor can scan to see it reached a patient | [`app/models.py`](app/models.py) |

---

## Architecture

```
                    ┌────────────────────────────────────────┐
                    │            FastAPI  (app/)            │
                    │  routers/ · services/ · models/        │
                    └───────────────────┬────────────────────┘
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              │                         │                         │
      ┌───────▼────────┐      ┌─────────▼────────┐      ┌─────────▼────────┐
      │  Donor app     │      │  Hospital app    │      │  Admin console   │
      │  (PWA, React)  │      │  (React + Vite)  │      │  (React)         │
      └────────────────┘      └──────────────────┘      └──────────────────┘
                                        │
                    ┌───────────────────▼────────────────────┐
                    │         Service layer (pure logic)      │
                    │  matching · escalation · forecasting    │
                    └───────────────────┬────────────────────┘
                                        │
                    ┌───────────────────▼────────────────────┐
                    │  SQLAlchemy 2.0  (ORM + migrations)     │
                    └────┬──────────────────────┬─────────────┘
                         │                      │
                 ┌───────▼────────┐    ┌────────▼────────┐
                 │ SQLite (local)│    │ Postgres+PostGIS│
                 │ zero setup     │    │ production       │
                 └────────────────┘    └─────────────────┘

    Celery beat (planned)  →  runs the SLA escalation sweep every 60s
```

### Why it is split this way

The interesting logic — blood-group compatibility, haversine distance, the
escalation state machine, the forecasting maths — lives in `app/services/` as
**plain functions with no HTTP and no framework coupling**. The routers are
thin adapters over it. That is why the test suite is fast, why the forecasting
model can be backtested without a database, and why swapping FastAPI for
Django later would not touch the domain logic.

---

## The two hard parts

### 1. The escalation engine

A request that finds nobody does not fail quietly — it escalates.

```python
# app/services/escalation.py
elapsed = (now - request.created_at).total_seconds() / 60.0
tier = target_tier(elapsed, settings.escalation_tiers_minutes)

if tier > previous_tier:
    request.escalation_tier = tier
    request.radius_km = settings.escalation_radii_km[tier]
    request.last_escalated_at = now
    donors_notified = notify_donors(db, request, request.radius_km, now)
```

| Elapsed | Radius | Action |
|---|---|---|
| 0 min | 5 km | Push alert to eligible donors |
| 15 min | 15 km | Widen the search, alert the new ring |
| 30 min | 50 km | Widen again **and** SMS the family's emergency caregivers |

The engine is a **pure function of elapsed time**, so it is replayable for
backtesting and safe to retry: running the scheduler twice in the same window
changes nothing the second time, and a donor is never alerted twice for the
same request.

### 2. The forecaster

A **day-of-week-adjusted moving average**. It is deliberately not a black
box — a baseline you can explain to a hospital is worth more than an
unexplainable one, and it is measured, not asserted:

```
adjusted_ma       mean WMAPE = 0.2211   (8 series)
seasonal_naive    mean WMAPE = 0.7782   (8 series)
```

Both models run through **the same backtest harness** (train on the first 80%
of history, predict the rest, score with WMAPE), so the comparison is
apples-to-apples. The next step is gradient boosting with festival and
weather features — evaluated through that same harness, so the new model has
to *beat 0.2211* to ship.

---

## Quick start

No Docker, no database server, no cloud account. Python 3.11+ is enough.

```bash
git clone https://github.com/pranitajeyan-cyber/blood-donation-network.git
cd blood-donation-network

python -m venv .venv
# Windows: .venv\Scripts\activate     macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt

python -m app.seed          # 2 hospitals, 60 donors, 120 days of consumption history
python -m uvicorn app.main:app --reload
```

Open **http://127.0.0.1:8000/docs** for the interactive API explorer.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@bdn.dev` | `admin12345` |
| Hospital | `hospital1@bdn.dev` | `hospital12345` |
| Donor | `arun.krishnan7@example.com` | `donor12345` |

### See it work

```bash
python scripts/demo.py
```

```
========================================================================
  3. Tier 0 - donors within 5 km were alerted immediately
========================================================================
  1 donor(s) notified:
    - Arun Krishnan          O+    3.72 km   NOTIFIED

========================================================================
  4. SLA escalation - the request ages past 15 minutes
========================================================================
  tier 0 -> 1, radius 15km, 1 new donor(s) alerted, caregiver SMS: False
  2 donor(s) notified in total
```

The script walks the whole lifecycle: request → notification → escalation →
acceptance → collection → barcode trail → forecast → backtest.

---

## API

| Method | Path | Who | What |
|---|---|---|---|
| `POST` | `/api/auth/register` | public | Register a donor |
| `POST` | `/api/auth/login` | public | Exchange credentials for a JWT |
| `GET` | `/api/auth/me` | any | Current profile |
| `PATCH` | `/api/donors/me` | donor | Update blood group / location / availability |
| `POST` | `/api/donors/me/verify` | donor | Submit DigiLocker attestation |
| `GET` | `/api/donors/me/eligibility` | donor | Am I eligible? When can I donate again? |
| `GET` | `/api/donors/me/matches` | donor | Requests I was alerted to |
| `GET` | `/api/donors/me/bags` | donor | My donation history |
| `POST` | `/api/requests` | hospital | Raise a blood request |
| `GET` | `/api/requests` | hospital | My requests (admin sees all) |
| `GET` | `/api/requests/{id}/matches` | hospital | Who was notified, and how far away |
| `POST` | `/api/requests/{id}/escalate` | hospital | Force an escalation tick |
| `POST` | `/api/matches/{id}/accept` | donor | Accept the alert |
| `PUT` | `/api/hospitals/me/inventory` | hospital | Set cold-storage stock |
| `POST` | `/api/hospitals/me/consumption` | hospital | Log a day of consumption |
| `POST` | `/api/hospitals/me/donations` | hospital | Register a collected unit |
| `GET` | `/api/admin/forecast` | admin | 7-day shortage forecast |
| `GET` | `/api/admin/backtest?model=` | admin | Score the model on unseen history |
| `GET` | `/api/admin/metrics` | admin | Headline impact metrics |
| `POST` | `/api/admin/escalate` | admin | Run one escalation cycle |
| `GET` | `/api/meta/spec` | public | Escalation ladder and thresholds actually in force |
| `GET` | `/api/meta/pulse` | public | Live counts straight from the database |
| `GET` | `/api/meta/accuracy` | public | Backtest scores for both forecast models |

---

## Web client

The repo ships with a React + TypeScript console under `web/`. Every figure it
renders is read from the API above — there is no hard-coded copy of a metric,
no mocked data source, and no second calculation of a number the backend
already owns.

```bash
cd web
npm install
npm run build      # emits web/dist
```

`app/main.py` mounts `web/dist` on the same origin as the API when it exists, so
a single `uvicorn` process serves both. Hashed assets are streamed from disk and
every other path falls through to `index.html`, which keeps client-side routes
alive across a hard refresh. Paths under `/api` that miss still return a real
404 rather than the SPA shell. A fresh clone works before anyone has built the
frontend: the API simply runs on its own.

For frontend development, `npm run dev` starts Vite on its own port and proxies
`/api` to `http://127.0.0.1:8000`, so hot reload works against the live backend
without CORS configuration.

### Screens

| Route | Role | What it does |
|---|---|---|
| `/` | public | Landing page; live pulse, the escalation ladder as configured, and measured forecast accuracy |
| `/login`, `/register` | public | Credential sign-in and donor self-registration |
| `/donor` | donor | Eligibility countdown and current alerts |
| `/donor/alerts` | donor | Open alerts with distance and one-tap accept/decline |
| `/donor/history` | donor | Past donations and the cooldown they impose |
| `/donor/profile` | donor | Blood group, district, coordinates, availability, verification |
| `/hospital` | hospital | Stock posture and open requests |
| `/hospital/requests` | hospital | Raise a request, watch the match funnel and escalation tier |
| `/hospital/inventory` | hospital | Per-group stock and consumption logging |
| `/hospital/actions` | hospital | Register a collected unit against a fulfilled request |
| `/admin` | admin | Live metrics, the forecaster, the backtest comparison, an on-demand escalation sweep and the audit trail |
| `/privacy` | public | What the database stores, what it refuses to collect, and how long it is kept |
| `/terms` | public | Scope, acceptable use, and the limits of a demonstration service |

Route-level code splitting keeps the admin tables and charts out of the entry
chunk: only Landing, the auth screens and the legal pages load up front.

### Fonts, icons and social preview

The three typefaces are served from `web/public/fonts/`, not from a font CDN, so
there is no third-party request on first paint and the privacy notice can say
so honestly. `python scripts/fetch_fonts.py` re-downloads the latin subsets and
regenerates `web/src/styles/fonts.css`; Inter and JetBrains Mono arrive as
variable fonts, so each family is a single file with a weight range.

The favicon, the 180px touch icon and the 1200x630 social card are generated
from the site's own mark and typefaces by `npm run og` (Playwright renders the
card), rather than being sourced as stock imagery.

### Metadata and crawling

`web/index.html` carries the description, Open Graph and Twitter tags and a
`SoftwareApplication` JSON-LD block. `usePageMeta` rewrites the title,
description, canonical URL and `og:url` on each navigation, and marks the
authenticated consoles `noindex`. `robots.txt` and `sitemap.xml` are generated
per request from the incoming origin, so they describe whatever hostname is
actually serving the app.

### Deploying on a custom domain

API calls, assets and sign-in all use same-origin relative paths, so changing
the hostname needs no rebuild. Terminate TLS at a proxy and forward to uvicorn:

```bash
export BDN_SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"
uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers
```

Three details are read from the request rather than baked into the bundle, and
stay correct on any domain: the sitemap and `robots.txt` origins, the canonical
and Open Graph URLs, and the absolute preview-image URL. Keep `--proxy-headers`
enabled so `X-Forwarded-Proto` and `X-Forwarded-Host` reach the app; without it
the generated URLs will say `http` and name the internal host.

If you must split the SPA and API across hosts, set `VITE_API_BASE` at build
time to the API origin. `BDN_DATABASE_URL` points the server at Postgres
instead of SQLite. The default secret key in `app/config.py` is deliberately
insecure — replace it before exposing the app.

Real services also need more than this demo provides: clinical validation,
retention automation, an account-deletion endpoint, and audit review. See the
privacy and terms pages for what is and is not claimed.

### Verification

Three harnesses exercise the client against a running server:

```bash
python scripts/e2e_web.py          # 30 API-contract checks, incl. the escalation ladder
node web/scripts/browser-check.mjs # browser checks across all three roles and both legal routes
node web/scripts/design-audit.mjs  # layout, contrast, shape, metadata and crawl checks
```

The browser check fails on any console error, page error or 5xx response, and
walks the footer's Privacy and Terms links and the skip link to prove they are
real navigation. The design audit asserts the dark base, WCAG AA contrast,
single-`h1` hierarchy, absence of emoji, absence of purple, absence of
pill-shaped buttons and of horizontal overflow at desktop, tablet and phone
widths, and that the metadata, `robots.txt`, `sitemap.xml` and social card all
resolve. Playwright is a dev dependency of `web/`; run
`npx playwright install chromium` once after `npm install`.

---

## Testing

```bash
python -m pytest              # 72 tests
python -m pytest --cov=app    # with coverage
```

```
........................................................................  [100%]
72 passed
```

The suite is split by concern:

| File | Covers |
|---|---|
| `test_geo.py` | Haversine distance, bounding-box maths, pole edge case |
| `test_auth.py` | Registration, validation, login, JWT, password hashing |
| `test_matching.py` | Compatibility, radius, verification, 120-day cooldown, double-alerting |
| `test_escalation.py` | Tier transitions, caregiver SMS, expiry, idempotency |
| `test_forecasting.py` | WMAPE/MAE, weekday factors, backtest harness, risk levels |
| `test_api.py` | Full HTTP lifecycle, role guards, cold-storage decrement |

Every test gets an isolated in-memory SQLite database via `StaticPool` — no
containers, no migrations, sub-second runs.

---

## Design decisions and trade-offs

The parts a reviewer will actually ask about.

**SQLite locally, Postgres in production.** The schema is Postgres-safe:
`Float` latitude/longitude columns map 1:1 onto a PostGIS
`geography(POINT, 4324)` column, and the radius query is a bounding-box
pre-filter in SQL plus an exact haversine in Python — the same two-step shape
as `ST_DWithin` plus a GIST index. Swapping the backend means changing one
environment variable, not rewriting the service layer.

**PBKDF2-HMAC-SHA256, 200k iterations, per-user salt.** Standard library only.
No native bcrypt wheel to break on Windows, and PBKDF2 is an algorithm NIST
accepts for password storage. Verification is constant-time
(`hmac.compare_digest`).

**Naive UTC datetimes throughout.** SQLite has no timezone-aware type, so
mixing aware and naive datetimes is the classic source of silent off-by-hours
bugs in escalation timers. Everything is normalised to naive UTC at the
boundary and compared naive-to-naive.

**One identity table, three roles.** Donors, hospital staff and admins all live
in `users`; hospitals hold the hospital-specific attributes keyed by
`user_id`. One auth path, one place to audit, role checks in one dependency
(`require_roles`).

**Attestation tokens, never Aadhaar numbers.** The platform stores a DigiLocker
*attestation* token, never the identity number itself. That keeps the design
inside the DPDP Act's data-minimisation rule — and a database breach cannot
leak identity numbers.

**A baseline, not a black box.** The forecaster is a moving average with a
weekday term, scored against a seasonal-naive baseline through one shared
backtest harness. An ML model has to earn its place by beating 0.2211 WMAPE
on the same split. This is a deliberate choice to make the model *trustworthy*
before making it *clever*.

### What is deliberately not built

- **No payment flow.** Blood is not sold; taking money for it is illegal in
  India. The revenue model in the pitch is B2B SaaS for blood banks, not a
  transaction fee.
- **No real SMS/DigiLocker integration.** Both are behind interfaces with
  mocked implementations; the adapters are the next layer, not the next
  feature.
- **No React frontend yet.** The API is complete and documented; the PWA is
  the next milestone (see the roadmap).

---

## Roadmap

| Phase | Status | Deliverable |
|---|---|---|
| **Foundation** | ✅ Done | Auth, roles, donor profiles, hospital onboarding, inventory |
| **Matching** | ✅ Done | Compatibility + distance + eligibility engine, notification alerts |
| **Escalation** | ✅ Done | SLA tiers, radius expansion, caregiver SMS, expiry |
| **Forecasting** | ✅ Done | Backtested baseline, 7-day horizon, risk levels, admin API |
| **Impact** | ✅ Done | Barcode bag tracking, impact metrics API |
| **Frontend** | ⬜ Next | Donor PWA + hospital dashboard (React + Vite) |
| **Scale** | ⬜ Next | Postgres + PostGIS, Celery beat scheduler, Redis timers |
| **Intelligence** | ⬜ Next | Gradient boosting with festival/weather features, beating the baseline |
| **Reach** | ⬜ Planned | Real FCM/SMS providers, DigiLocker sandbox, volunteer onboarding |

---

## Project layout

```
blood-donation-network/
├── app/
│   ├── main.py              # FastAPI app factory
│   ├── config.py            # pydantic-settings, env-driven
│   ├── models.py            # SQLAlchemy models + blood-group compatibility
│   ├── schemas.py           # Pydantic request/response contracts
│   ├── security.py          # PBKDF2 hashing, JWT
│   ├── deps.py              # auth + role dependencies
│   ├── geo.py               # haversine + bounding box
│   ├── seed.py              # demo dataset generator
│   ├── routers/             # auth · donors · hospitals · requests · admin
│   └── services/            # matching · escalation · forecasting · metrics
├── scripts/demo.py          # end-to-end demo
├── tests/                   # 72 tests
├── docs/                    # pitch, technical framework, build prompt
└── .github/workflows/ci.yml
```

---

## Documentation

| Document | What it covers |
|---|---|
| [`docs/PITCH.md`](docs/PITCH.md) | The problem, the solution, novelty, impact metrics |
| [`docs/TECHNICAL_FRAMEWORK.md`](docs/TECHNICAL_FRAMEWORK.md) | Full stack, data model, escalation design, forecasting plan |
| [`docs/BUILD_PROMPT.md`](docs/BUILD_PROMPT.md) | The original build specification |

---

## Contributing

Issues and PRs are welcome. Please run the suite before opening one:

```bash
python -m pytest
ruff check app tests
```

---

## License

[MIT](LICENSE) © 2026 Pranita Jeyan
