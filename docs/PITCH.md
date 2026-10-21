# Blood Donation Network — Pitch

**Tagline:** *Finding a donor used to take hours. Predicting a shortage used to be impossible. We fixed both.*

---

## The Problem

India collects ~11.9M units of blood every year but needs ~14.6M. That's a **~20% gap** — and it's a *predictable* one.

- A patient needs blood **today** → hospitals burn 1–3 hours calling people, posting on Facebook.
- A blood bank will run dry **next week** → nobody knows until the fridge is empty.
- Donors are willing but scattered, unverified, and unreachable in emergencies.
- Fake donors and fake requests erode whatever trust exists.

**The failure is not a shortage of blood. It's a shortage of connection and foresight.**

---

## Our Solution

A **predictive, escalating marketplace** for blood:

| For the **consumer** (patient / family / donor) | For the **admin** (hospital / blood bank / regulator) |
|---|---|
| Post an urgent request → verified donors within 5km get alerted instantly | Post needs, see matched donors ranked by distance & recency |
| Donor accepts → chat opens, ETA shared | Live inventory dashboard per blood group |
| Auto-escalation: 5km → 15km → caregiver SMS blast if no one responds | **Shortage forecasts** — know *which group runs out in which district in 6 days* |
| Scan a barcode to see your bag's full journey | Auto-triggered donor alerts & camp planning before shortages |
| Track your donations, get "you can donate again" reminders | Analytics scorecard: response times, fulfillment, accuracy |

---

## The Novelty — What No One Else Does

Existing platforms (Friends2Support, e-RaktKosh) are **directories** — they react *after* a crisis. We built a system that **predicts the crisis before it happens**:

1. **Shortage forecasting (ML)** — nightly model predicts `units_needed[group][district][next 7 days]` from hospital consumption, seasonality, festivals, and weather. HIGH-risk groups trigger donor alerts and camp planning automatically.
2. **SLA escalation engine** — a request that finds no donor in 15 minutes expands its radius; at 30 minutes it SMS-blasts the family's emergency caregivers.
3. **Automated identity verification** — DigiLocker API attestation instead of a human reviewing a photo. Fake donors drop to ~0.
4. **Impact transparency** — barcode-scanned bags prove to every donor that "my blood saved a life," which is what makes them come back.

> *"Others show you who can donate. We tell you when your city will run out — and fix it before it does."*

---

## How It Works (90-second explanation)

```
Hospital posts: "O+ needed, 3 units, URGENT"
    ↓
Matching engine finds verified, eligible donors within 5km
    ↓
Push + SMS alerts in seconds → donor accepts → ETA shared
    ↓
No accept in 15 min → radius expands to 15km
No accept in 30 min → caregiver SMS blast
    ↓
Donation done → barcode bag → inventory +3 → donor auto-locked 120 days
    ↓
Consumption data feeds the forecast → next shortage predicted early
```

---

## Impact Metrics (what we measure)

- **Match-to-donation time:** from 1–3 hours to **under 20 minutes**
- **Fulfillment:** % of requests filled within escalation tiers
- **Forecast accuracy:** WMAPE per blood group (backtested weekly)
- **Shortages prevented:** HIGH-risk alerts where stock held
- **Donor repeat rate:** from ~15% to **30%+** through impact feedback
- **Fraud:** ~0 fake donors via automated verification

---

## Feasibility

- **Technical:** Standard, proven stack — PostGIS geospatial matching, Redis timers, a nightly ML batch job. No exotic infrastructure.
- **Data:** The platform self-generates consumption logs; public feeds (e-RaktKosh, IMD) supplement them.
- **Cost:** Runs on free tiers; SMS at ~₹0.2/message. MVP viable with 2 hospitals + 50 donors in one district.
- **Compliance:** Built for India's DPDP Act — consent, encryption, minimal data, and **no Aadhaar numbers stored** (only attestation tokens).

---

## Roadmap

| Phase | Timeline | Deliverable |
|---|---|---|
| Foundation | wk 1–3 | Auth + DigiLocker verify, donor profiles, hospital onboarding |
| Matching | wk 4–6 | Urgent requests, radius matching, notifications, 120-day lock |
| Escalation | wk 7–8 | SLA tiers + caregiver SMS |
| Forecasting | wk 9–10 | Consumption logging + ML shortage predictions + admin dashboard |
| Polish | wk 11–12 | Bag tracking, scorecard, demo data, deployment |

---

## The Ask

1. **A partner blood bank / hospital** for one pilot district (real data, real donors).
2. **Design & dataset feedback** — we want to model real consumption, not synthetic.
3. **Adoption channels** — local colleges, rotary clubs, religious institutions for donor onboarding.

---

## One-Line Close

> "A mother waiting for B+ blood shouldn't depend on luck. A blood bank running dry shouldn't be a surprise. We turn both into a system — and we can prove it in one district in three months."
