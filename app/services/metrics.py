"""Impact metrics.

These are the numbers the pitch promises to move, exposed as an API so they
can be tracked over time rather than asserted once in a slide.
"""

from __future__ import annotations

import statistics

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    BloodRequest,
    DonationBag,
    Match,
    User,
)


def collect_metrics(db: Session) -> dict:
    """Compute the headline impact metrics for the whole network."""
    open_requests = (
        db.execute(
            select(func.count(BloodRequest.id)).where(
                BloodRequest.status.in_(("OPEN", "MATCHED"))
            )
        ).scalar_one()
    )

    matches_created = db.execute(select(func.count(Match.id))).scalar_one()
    matches_accepted = db.execute(
        select(func.count(Match.id)).where(Match.status.in_(("ACCEPTED", "CONFIRMED")))
    ).scalar_one()

    units_fulfilled = db.execute(
        select(func.coalesce(func.sum(BloodRequest.units_fulfilled), 0))
    ).scalar_one()

    # Time from a donor being notified to the moment they accepted.
    response_times = []
    for notified_at, responded_at in db.execute(
        select(Match.notified_at, Match.responded_at).where(Match.responded_at.is_not(None))
    ):
        response_times.append((responded_at - notified_at).total_seconds() / 60.0)

    median_response = round(statistics.median(response_times), 2) if response_times else None

    # Donor repeat rate: donors who have given more than once.
    total_donors = db.execute(
        select(func.count(User.id)).where(User.role == "donor")
    ).scalar_one()
    repeat_donors = db.execute(
        select(func.count(func.distinct(DonationBag.donor_id)))
    ).scalar_one()
    repeat_rate = round(repeat_donors / total_donors, 4) if total_donors else 0.0

    return {
        "open_requests": int(open_requests),
        "matches_created": int(matches_created),
        "matches_accepted": int(matches_accepted),
        "median_match_to_donation_minutes": median_response,
        "donor_repeat_rate": repeat_rate,
        "units_fulfilled": int(units_fulfilled),
    }
