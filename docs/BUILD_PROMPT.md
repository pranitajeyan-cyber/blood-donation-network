# Build Prompt — Blood Donation Network (Copy-Paste Ready)

> Paste everything below into any AI coding agent or hand it to your team. It is self-contained and ordered for incremental, testable delivery.

---

## ROLE

You are a senior full-stack engineer + ML engineer. Build a production-grade MVP for the **Blood Donation Network**, a predictive, escalating marketplace connecting verified blood donors to urgent hospital needs. You must deliver working, tested, deployable code — not stubs. Follow the phases below in order; finish each phase fully (code + tests) before moving on.

---

## PROJECT SUMMARY

India has a ~20% blood shortage. Hospitals spend 1–3 hours manually finding donors during emergencies, and blood banks discover shortages only after they happen. Build a platform where:

1. Verified donors register with blood group + location + availability.
2. Hospitals post urgent requests ("O+, 3 units, URGENT").
3. A matching engine finds eligible donors by blood group + radius (PostGIS).
4. Notifications (push + SMS) reach matched donors; a timer-based **escalation engine** expands 5km → 15km → caregiver SMS blast.
5. Completed donations update inventory and lock the donor for 120 days (WHO guideline).
6. A nightly **demand-forecasting ML job** predicts `units_needed[group][district][next 7 days]` and flags HIGH shortage risk, auto-triggering admin alerts and donor re-engagement.

**Novelty (must be implemented and emphasized):** existing platforms are reactive directories; this one *predicts* shortages and *escalates* automatically. Three pillars: predict, escalate, prove-impact.

---

## NON-NEGOTIABLE REQUIREMENTS

- **Roles:** donor (PWA/web), hospital admin (web), super admin (web).
- **Real-time:** WebSockets or polling for urgent request updates; push via FCM/Expo, SMS via gateway.
- **Geospatial:** PostgreSQL + PostGIS for radius queries. Never filter by lat/lng in application code.
- **Verification:** DigiLocker-style identity attestation flow (in MVP: simulate with a mock endpoint that returns a token; keep the interface swappable for the real API). NEVER store raw Aadhaar numbers.
- **120-day lock:** donors cannot be `is_available` within 120 days of last donation. Cron job re-enables them and sends a push.
- **Request expiry:** OPEN requests expire after 6 hours.
- **Escalation SLA:** T+15min radius 5→15km; T+30min SMS caregivers (if any). Stop when request leaves OPEN status.
- **Security:** bcrypt/JWT auth, role-based access, rate limiting on auth endpoints, encryption at rest, PII minimization (DPDP Act mindset).
- **Forecasting:** daily cron; model baseline = naive 7-day rolling average; upgrade path to Prophet/SARIMA/XGBoost. Backtest scorecard (WMAPE) rendered on admin dashboard.
- **Tests:** backend unit + integration tests for matching, escalation, 120-day lock, expiry, forecasting. Frontend smoke tests.
- **Deployability:** Docker + docker-compose for full stack; GitHub Actions CI; seed script with realistic demo data (2 hospitals, 50 donors, 90 days of consumption logs).

---

## TECH STACK (USE THESE — DO NOT SUBSTITUTE WITHOUT JUSTIFICATION)

| Layer | Choice |
|---|---|
| Donor frontend | React + Vite, PWA (offline shell) |
| Admin/hospital frontend | React + Vite + Tailwind CSS |
| Backend | Node.js + Express (or Python FastAPI) + REST, WebSocket |
| DB | PostgreSQL 15 + PostGIS 3 |
| Cache/queues/timers | Redis |
| Scheduler | node-cron / Celery |
| ML | Python + pandas + scikit-learn/Prophet (separate service) |
| Notifications | FCM/Expo push + SMS gateway (abstract behind a provider interface) |
| Files | S3-compatible (MinIO local) |
| Maps | Leaflet + Mapbox/OSM tiles |
| Infra | Docker + docker-compose, GitHub Actions |
| Logs/observability | structured JSON logs + basic /health endpoint |

---

## DATA MODEL (AUTHORITATIVE — IMPLEMENT EXACTLY)

```sql
users(id, name, phone UNIQUE, blood_group CHECK in A+/A-/B+/B-/AB+/AB-/O+/O-,
      lat, lng, geom GEOGRAPHY(POINT,4326), digilocker_token, verified BOOL,
      is_available BOOL, last_donation_at TIMESTAMPTZ, caregivers BIGINT[], created_at)
-- GIST index on geom; partial index on (blood_group) WHERE is_available AND verified

hospitals(id, name, license_no, phone, lat, lng, geom, verified)

requests(id, hospital_id FK, blood_group, units_needed CHECK 1..10,
         urgency CHECK NORMAL|URGENT|EMERGENCY,
         status CHECK OPEN|MATCHED|FULFILLED|EXPIRED, expires_at, created_at)

matches(id, request_id FK, donor_id FK, distance_km,
        status CHECK NOTIFIED|ACCEPTED|DECLINED|CONFIRMED, accepted_at)

inventory(hospital_id FK, blood_group, units_in_stock, updated_at, PK(hospital_id, blood_group))

consumption_log(hospital_id FK, blood_group, units_issued, day DATE, PK(hospital_id, blood_group, day))

donations(id, donor_id FK, hospital_id FK, units, donated_at, bag_refs TEXT[])

blood_bags(bag_id TEXT PK, donation_id FK, hospital_id, screening_result,
           storage_start, expiry, recipient_id, scanned_at)
```

---

## PHASES (DELIVER IN ORDER, EACH MUST PASS TESTS)

### Phase 1 — Foundation
- Docker compose: postgres+postgis, redis, minio, backend, frontend, worker.
- Auth: register/login (phone/email + password), JWT, refresh, bcrypt, rate limits.
- Donor profile CRUD with PostGIS geocoding (use a mock geocoder interface).
- Hospital onboarding + admin role.
- Verification flow: upload ID → mock DigiLocker endpoint → verified flag. Admin approval screen.
- Migrations + seed script.

### Phase 2 — Matching
- Hospital creates request (validates group/units, sets expires_at = +6h).
- Matching service: PostGIS query eligible donors within 5km → create NOTIFIED matches → send push/SMS.
- Donor accept/decline endpoints (accept enforces blood-group + eligibility server-side).
- Request status machine: OPEN → MATCHED → FULFILLED / EXPIRED.
- Donation confirmation: donor locked 120 days, inventory updated, consumption_log row written, blood_bag created.

### Phase 3 — Escalation
- Timer jobs keyed on request id: T+15min → 15km push; T+30min → caregiver SMS.
- Escalation stops if request not OPEN. Log every escalation event for analytics.
- Donor eligibility endpoint (days remaining until re-eligible).

### Phase 4 — Forecasting
- consumption_log ingestion API (hospital-side).
- Python service: nightly job pulls logs + calendar features (day-of-week, month, festival flags, weather from mock/IMD) → predicts next 7 days per (group, district).
- Shortage risk classification: `P(days_of_stock_remaining < 2)` → LOW/MEDIUM/HIGH.
- HIGH triggers: admin dashboard alert + push to eligible donors in district ("You can donate again").
- Backtest job: predicted vs actual, WMAPE per group, weekly scorecard.

### Phase 5 — Polish
- Admin analytics dashboard: response times, fulfillment rate, escalation funnel, forecast accuracy, inventory heatmap.
- Bag tracking: barcode scan timeline (donor → screening → storage → recipient) shown to donor.
- PWA offline shell, deployment via CI, README with run instructions, demo video script.

---

## DEFINITION OF DONE (PER PHASE)

- All endpoints have automated tests (matching correctness, escalation timers, 120-day lock, expiry, forecast scoring).
- `docker compose up` boots the full stack with seeded data.
- The admin dashboard renders real numbers from real flows.
- A manual test script (given in README) reproduces the full emergency flow end-to-end.

---

## BEHAVIORAL CONSTRAINTS

- Do NOT invent medical eligibility rules beyond: age ≥ 18, 120-day interval, verified identity, blood-group match. This is a coordination platform, not a clinical decision system.
- Keep a `providers/` abstraction for SMS, push, geocoding, and DigiLocker so real services can be swapped in without touching business logic.
- Write code for an Indian tier-2/3 city: assume patchy internet (PWA + offline shell), cheap SMS preferred over app-only push.
- Log every state transition (audit trail). No silent failures.
- If something is ambiguous, implement the simplest reasonable behavior and document the decision in a DECISIONS.md file.

---

## DELIVERABLES

1. Working monorepo: `apps/backend`, `apps/frontend-donor`, `apps/frontend-admin`, `services/forecasting`, `infra/`.
2. `docker-compose.yml` + `.env.example` + seed data.
3. README (setup, run, test, demo script) + DECISIONS.md + API reference (OpenAPI).
4. CI pipeline (lint, typecheck, test, build).
5. Final summary: what was built, what is mocked, what real APIs need swapping in, and the next steps to production.
