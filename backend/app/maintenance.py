"""Background housekeeping that isn't schema work.

Right now this is just one job: closing out workouts that were started and then
forgotten. A workout row stays ``status='active'`` (with ``finished_at`` NULL)
until the user taps Finish -- nothing else ever ends it. A forgotten one keeps
being returned by ``GET /api/workouts/active`` (so the client auto-resumes into
it and the home button's elapsed timer ticks forever) and, via the partial
unique index ``ix_one_active_workout_per_user``, blocks starting a new workout.

``reap_stale_workouts`` is called lazily from the workout read/start endpoints
and once from the app's startup hook.
"""
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from .models import Workout

# How long an active workout may go without a save before we treat it as
# abandoned. Measured against ``updated_at``, which is bumped on every accepted
# PUT /api/workouts/active -- a genuinely long session that's still being logged
# keeps saving and never trips this; only a forgotten one does.
STALE_ACTIVE_HOURS = 6


def _has_logged_work(workout: Workout) -> bool:
    """True if any set in the workout is marked done (mirrors ``_summarize`` in
    routers/workouts.py)."""
    for exercise in (workout.content or {}).get("exercises", []):
        for s in exercise.get("sets", []):
            if s.get("done"):
                return True
    return False


def reap_stale_workouts(db: Session) -> tuple[int, int]:
    """Close out every active workout untouched for more than
    ``STALE_ACTIVE_HOURS``. Hybrid rule: if it has at least one completed set it
    becomes ``finished`` and stays in History; otherwise it's soft-deleted and
    the existing 30-day Trash purge collects it.

    Returns ``(finished_count, discarded_count)``.
    """
    cutoff = func.now() - text(f"interval '{STALE_ACTIVE_HOURS} hours'")
    stale = (
        db.query(Workout)
        .filter(
            Workout.status == "active",
            Workout.deleted_at.is_(None),
            Workout.updated_at < cutoff,
        )
        .all()
    )

    finished = discarded = 0
    for workout in stale:
        if _has_logged_work(workout):
            workout.status = "finished"
            workout.finished_at = func.now()
            finished += 1
        else:
            workout.deleted_at = func.now()
            discarded += 1

    if stale:
        db.commit()
    return finished, discarded
