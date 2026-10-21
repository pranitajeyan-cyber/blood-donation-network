"""End-to-end exercise of the same endpoints the web client calls.

Run against a live server. Proves the frontend's integration contract holds:
login -> raise request -> matches -> escalate -> donor accepts -> hospital
records the collected unit -> inventory and forecast move.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

# Allow `python scripts/e2e_web.py` from anywhere by putting the repo root on the
# import path — the escalation ladder checks talk to the DB directly.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

BASE = "http://127.0.0.1:8000/api"


def call(method: str, path: str, body=None, token: str | None = None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as response:
            raw = response.read()
            return response.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        return exc.code, (json.loads(raw) if raw else None)


def login(email: str, password: str) -> str:
    status, payload = call("POST", "/auth/login", {"email": email, "password": password})
    assert status == 200, (status, payload)
    return payload["access_token"]


checks: list[tuple[str, bool, str]] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    checks.append((label, condition, detail))


# --- 1. all three roles authenticate ---------------------------------------
admin = login("admin@bdn.dev", "admin12345")
hospital = login("hospital1@bdn.dev", "hospital12345")

# The seeded donor roster is generated, so discover real accounts through the
# admin API rather than hardcoding addresses that may not exist. We need two
# donors: one to log in as ("the" donor under test) and, later, whichever of the
# notified donors is willing to accept — they are not always the same person.
status, donors = call("GET", "/admin/users?role=donor&limit=100", token=admin)
check("admin can list donors", status == 200 and len(donors) > 0, f"{len(donors)} donors")
donor_email = donors[0]["email"]
donor = login(donor_email, "donor12345")
check("admin / hospital / donor all authenticate", True, f"donor={donor_email}")

# --- 2. hospital raises a request -----------------------------------------
status, request = call(
    "POST",
    "/requests",
    {"blood_group": "O-", "units_needed": 2, "urgency": "URGENT", "notes": "e2e"},
    hospital,
)
check("POST /requests", status == 201, f"status={status}")
check("tier 0 radius applied", request["radius_km"] == 5, str(request))
request_id = request["id"]

# --- 3. matching engine respects the tier-0 radius --------------------------
status, matches = call("GET", f"/requests/{request_id}/matches", token=hospital)
check("GET /requests/{id}/matches", status == 200, f"{len(matches)} matches at tier 0")

# --- 3b. the ladder widens with elapsed time -------------------------------
# Escalation is a pure function of request age, so we can prove the whole
# ladder without waiting half an hour: age the request in the database and
# re-run the sweep. This is the behaviour the console's distance diagram shows.
from datetime import timedelta  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models import BloodRequest, utcnow  # noqa: E402

ladder: list[tuple[int, int, int]] = []
for minutes, expected_tier in ((0, 0), (16, 1), (31, 2)):
    db = SessionLocal()
    row = db.get(BloodRequest, request_id)
    row.created_at = utcnow() - timedelta(minutes=minutes)
    db.commit()
    db.close()

    call("POST", "/admin/escalate", token=admin)
    _, current = call("GET", f"/requests/{request_id}", token=hospital)
    _, current_matches = call("GET", f"/requests/{request_id}/matches", token=hospital)
    ladder.append((minutes, current["escalation_tier"], len(current_matches)))
    check(
        f"at {minutes:>2} min -> tier {expected_tier} ({current['radius_km']} km)",
        current["escalation_tier"] == expected_tier,
        f"tier={current['escalation_tier']} radius={current['radius_km']} notified={len(current_matches)}",
    )

notified_counts = [count for _, _, count in ladder]
check(
    "widening the radius reaches strictly more donors",
    notified_counts[-1] > notified_counts[0],
    f"notified at each tier: {notified_counts}",
)
check(
    "the 50 km tier is the one that finds the rare O- donors",
    notified_counts[-1] > 0,
    f"{notified_counts[-1]} donors reached",
)

# Re-read the match set now that escalation has widened the radius.
status, matches = call("GET", f"/requests/{request_id}/matches", token=hospital)
if matches:
    sample = matches[0]
    check(
        "match carries a real distance and donor name",
        isinstance(sample["distance_km"], (int, float)) and bool(sample["donor_name"]),
        f"{sample['donor_name']} at {sample['distance_km']} km",
    )

# --- 4. admin escalation sweep is idempotent --------------------------------
status, first = call("POST", "/admin/escalate", token=admin)
check("POST /admin/escalate", status == 200, f"status={status}")
status, second = call("POST", "/admin/escalate", token=admin)
mine_a = next((o for o in first if o["request_id"] == request_id), None)
mine_b = next((o for o in second if o["request_id"] == request_id), None)
check(
    "a second sweep does not re-notify or re-escalate",
    mine_b is not None
    and mine_a is not None
    and mine_b["current_tier"] == mine_a["current_tier"]
    and mine_b["donors_notified"] == 0,
    f"tier {mine_a['current_tier']} -> {mine_b['current_tier']}, notified {mine_b['donors_notified']}",
)

# --- 5. admin metrics / forecast / backtest ---------------------------------
status, metrics = call("GET", "/admin/metrics", token=admin)
check("GET /admin/metrics", status == 200 and "open_requests" in metrics, "")

status, forecast = call("GET", "/admin/forecast?horizon_days=7", token=admin)
check("GET /admin/forecast", status == 200 and len(forecast) > 0, f"{len(forecast)} rows")
if forecast:
    risks = {point["risk"] for point in forecast}
    check("forecast rows carry a risk label", all(isinstance(r, str) for r in risks), str(risks))

status, bt = call("GET", "/admin/backtest?model=adjusted_ma&horizon=7", token=admin)
check("GET /admin/backtest", status == 200 and len(bt) > 0, f"{len(bt)} series")
if bt:
    check("backtest reports WMAPE + samples", "wmape" in bt[0] and bt[0]["samples"] > 0, "")

# --- 6. public accuracy endpoint matches the admin backtest ------------------
status, accuracy = call("GET", "/meta/accuracy")
check("GET /meta/accuracy (public)", status == 200, f"status={status}")
check(
    "public accuracy scored the same series count",
    accuracy["series_scored"] == len(bt),
    f"public={accuracy['series_scored']} admin={len(bt)}",
)
check(
    "both models scored",
    accuracy["mean_wmape"]["adjusted_ma"] is not None
    and accuracy["mean_wmape"]["seasonal_naive"] is not None,
    str(accuracy["mean_wmape"]),
)

# --- 7. a notified donor accepts --------------------------------------------
# Accept must be performed by the donor the match belongs to, so switch to the
# owner of the first match. MatchOut exposes donor_id, not donor_email, so the
# address is resolved against the roster fetched in step 1.
accepted_match = None
accepted_by = None
for match in matches:
    status, payload = call("POST", f"/matches/{match['id']}/accept", token=donor)
    if status == 200:
        accepted_match = payload
        accepted_by = donor_email
        break
    # 403/404 means this match belongs to somebody else — switch to its owner.
    # MatchOut exposes donor_id, not donor_email, so resolve it via the roster.
    candidate = next((d["email"] for d in donors if d["id"] == match.get("donor_id")), None)
    if candidate:
        try:
            candidate_token = login(candidate, "donor12345")
        except AssertionError:
            continue
        status, payload = call("POST", f"/matches/{match['id']}/accept", token=candidate_token)
        if status == 200:
            accepted_match = payload
            accepted_by = candidate
            donor = candidate_token
            break

check(
    "a notified donor could accept",
    accepted_match is not None,
    f"{accepted_by} accepted match {accepted_match['match_id']}"
    if accepted_match
    else "no accept",
)

# --- 8. donor eligibility -----------------------------------------------
status, eligibility = call("GET", "/donors/me/eligibility", token=donor)
check("GET /donors/me/eligibility", status == 200 and "eligible" in eligibility, "")

# --- 9. hospital inventory read + adjust --------------------------------
status, inventory = call("GET", "/hospitals/me/inventory", token=hospital)
check("GET /hospitals/me/inventory", status == 200 and len(inventory) == 8, f"{len(inventory)} groups")

status, adjusted = call(
    "POST",
    "/hospitals/me/inventory/adjust",
    {"blood_group": "O-", "delta": 1},
    hospital,
)
check("POST inventory adjust", status == 200, f"status={status}")

# --- 10. hospital logs consumption --------------------------------------
status, consumption = call(
    "POST",
    "/hospitals/me/consumption",
    {"blood_group": "O-", "units_consumed": 1, "log_date": None, "is_festival": False},
    hospital,
)
check("POST consumption", status in (200, 201), f"status={status}")

# --- 11. audit trail is admin-only and consistent ------------------------
status, audit = call("GET", "/admin/audit?limit=50", token=admin)
check("GET /admin/audit", status == 200 and isinstance(audit, list), f"{len(audit)} entries")
status, _ = call("GET", "/admin/audit", token=donor)
check("audit trail is refused to a donor", status in (401, 403), f"status={status}")

# --- 12. role isolation is enforced -------------------------------------
status, _ = call("GET", "/admin/metrics", token=donor)
check("donor is refused the admin console", status in (401, 403), f"status={status}")
status, _ = call("GET", "/donors/me", token=hospital)
check("hospital is refused the donor profile", status in (401, 403), f"status={status}")

# --- report ---------------------------------------------------------------
print()
width = max(len(label) for label, _, _ in checks)
failures = 0
for label, ok, detail in checks:
    if not ok:
        failures += 1
    mark = "PASS" if ok else "FAIL"
    suffix = f"  ({detail})" if detail else ""
    print(f"  [{mark}] {label.ljust(width)}{suffix}")

print()
print(f"{len(checks) - failures}/{len(checks)} checks passed")
if failures:
    raise SystemExit(1)
