# Blood Donation Network — Technical Framework

> A predictive, escalating marketplace that connects verified donors to urgent blood needs and forecasts group-wise shortages before they occur.

---

## 1. System Overview

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  Donor App    │   │ Hospital Web │   │ Admin Panel  │
│  (React PWA)  │   │    (React)   │   │  (React)     │
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       │                  │                  │
       └──────────────────┼──────────────────┘
                          ▼
              ┌───────────────────────┐
              │    REST / WebSocket   │
              │   API Gateway (Nginx) │
              └───────────┬───────────┘
                          ▼
        ┌─────────────────────────────────────┐
        │          Backend Services           │
        ├─────────────────────────────────────┤
        │ Auth (JWT + DigiLocker verify)      │
        │ Matching & Escalation Engine        │
        │ Demand Forecasting Service (ML)     │
        │ Notification Dispatcher (push/SMS)  │
        │ Inventory & Bag Tracking Service    │
        │ Chat / Coordination                 │
        └─────────────────────────────────────┘
                          ▼
        ┌─────────────────────────────────────┐
        │  PostgreSQL + PostGIS               │
        │  Redis (cache, queues, timers)      │
        │  MinIO/S3 (ID docs, bag labels)     │
        │  Worker queue (scheduled jobs)      │
        └─────────────────────────────────────┘
                          ▼
        ┌─────────────────────────────────────┐
        │   External: DigiLocker API, SMS     │
        │   Gateway, FCM/Expo Push, Google    │
        │   Maps, e-RaktKosh data, IMD        │
        └─────────────────────────────────────┘
```

---

## 2. Tech Stack

| Layer              | Choice                                   | Rationale |
|--------------------|------------------------------------------|-----------|
| Donor frontend     | React PWA (or React Native)              | No app install; adoption in tier-2/3 cities |
| Admin/hospital UI  | React + Vite + Tailwind                  | Dashboards + map views |
| Backend            | Node.js + Express (or Python FastAPI)    | Fast MVP; FastAPI if ML lives in-service |
| Database           | PostgreSQL + PostGIS                     | Geospatial radius queries |
| Cache / queues     | Redis                                    | OTPs, escalation timers, rate limits |
| Scheduler          | Celery / BullMQ + cron                   | Nightly forecasts, 120-day unlock |
| ML                 | Python, scikit-learn / XGBoost / Prophet | Demand forecasting |
| Notifications      | FCM / Expo Push + SMS (Twilio/Msg91)     | Reach non-smartphone donors |
| Verification       | DigiLocker API (Aadhaar attestation)     | Auto-verify identity, no Aadhaar storage |
| Files              | S3-compatible (MinIO local / Backblaze B2 prod) | ID scans, photos |
| Maps               | Leaflet / Mapbox GL                      | Radius maps, heatmaps |
| Deployment         | Docker + docker-compose, GitHub Actions  | Reproducible demo |

---

## 3. Data Model

```sql
-- Identity & verification
users(
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  phone           TEXT UNIQUE NOT NULL,
  blood_group     CHAR(2) NOT NULL CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  geom            GEOGRAPHY(POINT, 4326),           -- PostGIS
  digilocker_token TEXT,                            -- attestation, NOT the Aadhaar number
  verified        BOOLEAN DEFAULT FALSE,
  is_available    BOOLEAN DEFAULT TRUE,
  last_donation_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_users_geom ON users USING GIST (geom);
CREATE INDEX idx_users_group ON users (blood_group) WHERE is_available AND verified;

hospitals(
  id, name, license_no, phone, lat, lng, geom, verified
);

requests(
  id, hospital_id REFERENCES hospitals,
  blood_group, units_needed INT CHECK (units_needed BETWEEN 1 AND 10),
  urgency TEXT CHECK (urgency IN ('NORMAL','URGENT','EMERGENCY')),
  status TEXT CHECK (status IN ('OPEN','MATCHED','FULFILLED','EXPIRED')),
  expires_at TIMESTAMPTZ,                           -- default now() + 6h
  created_at TIMESTAMPTZ DEFAULT now()
);

matches(
  id, request_id REFERENCES requests,
  donor_id  REFERENCES users,
  distance_km DOUBLE PRECISION,
  status TEXT CHECK (status IN ('NOTIFIED','ACCEPTED','DECLINED','CONFIRMED')),
  accepted_at TIMESTAMPTZ
);

inventory(
  hospital_id REFERENCES hospitals,
  blood_group CHAR(2),
  units_in_stock INT,
  updated_at TIMESTAMPTZ,
  PRIMARY KEY (hospital_id, blood_group)
);

consumption_log(                            -- forecasting input
  hospital_id, blood_group, units_issued INT, day DATE,
  PRIMARY KEY (hospital_id, blood_group, day)
);

donations(
  id, donor_id, hospital_id, units INT, donated_at TIMESTAMPTZ,
  bag_refs TEXT[]
);

blood_bags(                                 -- impact transparency
  bag_id TEXT PRIMARY KEY,                  -- barcode
  donation_id REFERENCES donations,
  hospital_id, screening_result, storage_start, expiry,
  recipient_id, scanned_at
);
```

---

## 4. Core Flow — Emergency Request

```
1. Hospital posts: O+, 3 units, URGENT
2. Matching engine: verified + eligible donors within 5km (PostGIS query)
3. Notification dispatcher: push + SMS blast to matched donors
4. Donor accepts -> chat opens, ETA shared
5. T+15 min no accept  -> expand radius to 15km, notify more
6. T+30 min still none -> SMS blast to donor's registered caregivers
7. Donation completed -> barcode bag issued, inventory += units
8. Donor auto-locked for 120 days (WHO guideline) via cron
9. consumption_log updated -> feeds the forecast model
```

**Escalation algorithm:**

```
escalate(request):
  for tier in [(5km, push), (15km, push), (district, sms_caregivers)]:
    notify_eligible(request, tier)
    await 15 minutes
    if request.status != OPEN: stop
```

---

## 5. Demand-Forecasting Module (Novelty)

### Target
`units_needed[blood_group][district][next_7_days]`

### Features
- Lagged consumption (7 / 14 / 30-day rolling means)
- Day-of-week, month, festival/holiday flags
- Wedding-season & exam-season boosts
- Rainfall & temperature (IMD) — trauma correlates with weather
- Compatible-donor population in catchment

### Model pipeline
```
1. Pull consumption_log + external feeds (nightly cron)
2. Train/update baseline model: Prophet or SARIMA
3. Predict next 7 days per (group, district)
4. Compare vs current inventory -> shortage risk:
     ShortageRisk = P(days_of_stock_remaining < 2)
     Level = LOW / MEDIUM / HIGH
5. HIGH -> auto-actions:
     - alert blood bank admins (dashboard + SMS)
     - push "you can donate again" to eligible donors in district
     - suggest camp scheduling
6. Weekly backtest scorecard: predicted vs actual (WMAPE)
```

### Evaluation
- WMAPE per blood group
- Precision/recall on "shortage occurred" classification
- Baseline comparison: naive 7-day rolling average

---

## 6. Novelty vs Existing Systems

| Capability                    | Friends2Support | e-RaktKosh | BloodBridge | **Ours** |
|-------------------------------|:---:|:---:|:---:|:---:|
| Donor directory + search      |  ✅  |  ✅  |  ✅  |  ✅  |
| OTP verification              |  ✅  |  —  |  ✅  |  ✅  |
| Auto ID verification (DigiLocker) |  —  |  —  | Manual |  ✅  |
| SLA escalation (5→15→caregivers) |  —  |  —  |  ✅  |  ✅  |
| Shortage *forecasting*        |  —  |  —  |  —  |  ✅  |
| Inventory ↔ citizen heatmap   |  —  | Partial |  —  |  ✅  |
| Bag-level impact transparency |  —  |  —  |  —  |  ✅  |
| Donor retention (eligible push) | —  |  —  |  ✅  |  ✅  |
| Admin analytics scorecard     | Partial |  ✅  |  —  |  ✅  |

---

## 7. Impact Metrics

- Match-to-donation time: manual 1–3 hrs -> target < 20 min
- % requests fulfilled within escalation
- Forecast accuracy (WMAPE) per blood group
- Shortages prevented (HIGH-risk alerts where stock held)
- Donor repeat rate: ~15% baseline -> 30%+ target
- Fake-donor rate ~0 via automated verification

---

## 8. Feasibility

| Dimension      | Verdict | Notes |
|----------------|---------|-------|
| Technical      | High    | Standard components; no exotic infra |
| Data           | High    | Platform self-generates data; e-RaktKosh/IMD open |
| Regulatory     | Medium  | DPDP Act compliance: consent, encryption, no raw Aadhaar |
| Cost (MVP)     | High    | Free tiers; SMS ~₹0.2/msg |
| Operational    | High    | 1 city, 2 hospitals, 50 donors proves the loop |
| Scale          | Medium  | Nationwide needs government partnership (out of scope) |

---

## 9. MVP Roadmap (8–12 weeks)

- **Phase 1 (wk 1–3)** Auth + DigiLocker verify, donor profile w/ PostGIS, hospital onboarding
- **Phase 2 (wk 4–6)** Request creation, radius match, push/SMS notify, accept flow, 120-day lock
- **Phase 3 (wk 7–8)** Escalation timers + radius expansion + caregiver SMS
- **Phase 4 (wk 9–10)** Consumption logging, baseline forecast model, admin risk dashboard
- **Phase 5 (wk 11–12)** Bag tracking, scorecard, demo data, CI/CD, deployment

---

## 10. Risks & Mitigations

| Risk                        | Mitigation |
|-----------------------------|------------|
| Low donor adoption          | PWA (no install), SMS reach, real blood-bank partner |
| Model over-promise          | Decision-support framing, backtest scorecard |
| Data privacy                | DPDP consent flow, encrypt PII, no Aadhaar storage |
| Thin data for ML            | Seed with MoHFW public stats; naive baseline first |
| Verification friction       | One-time DigiLocker auth; manual-review fallback |
