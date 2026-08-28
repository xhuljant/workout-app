"""Exercise library routes.

Mounted under /api/exercises. Every route requires a valid access token.

The table is one shared, global library -- there is no per-user filtering -- so a
custom exercise one user adds is immediately visible to everyone else.
"""
import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Exercise, User, Workout
from ..schemas import (
    ExerciseCreate,
    ExercisePublic,
    ExerciseSessionStat,
    ExerciseStats,
)

router = APIRouter(prefix="/api/exercises", tags=["exercises"])


@router.get("", response_model=list[ExercisePublic])
def list_exercises(
    q: str | None = Query(default=None, description="Case-insensitive name search"),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Return the whole library, alphabetically, optionally filtered by name.

    No pagination yet: the library is under a thousand rows and a home server has
    a handful of users. We'll page it if that ever stops being true.
    """
    query = db.query(Exercise).filter(Exercise.deleted_at.is_(None))

    if q and q.strip():
        query = query.filter(Exercise.name.ilike(f"%{q.strip()}%"))

    return query.order_by(func.lower(Exercise.name)).all()


@router.get("/{exercise_id}/stats", response_model=ExerciseStats)
def exercise_stats(
    exercise_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The current user's history for one exercise: per-session numbers plus
    all-time bests. Only completed sets from finished, non-deleted workouts."""
    target = str(exercise_id)
    workouts = (
        db.query(Workout)
        .filter(
            Workout.user_id == current_user.id,
            Workout.status == "finished",
            Workout.deleted_at.is_(None),
        )
        .order_by(Workout.finished_at.asc().nullsfirst(), Workout.started_at.asc())
        .all()
    )

    stats = ExerciseStats()
    for w in workouts:
        top_w = top_r = None
        best_1rm = None
        volume = 0.0
        did_something = False

        for entry in (w.content or {}).get("exercises", []):
            if str(entry.get("exercise_id") or "") != target:
                continue
            for s in entry.get("sets", []):
                if not s.get("done"):
                    continue
                wt = s.get("weight") or 0
                rp = s.get("reps") or 0
                did_something = True
                volume += wt * rp
                if wt and (top_w is None or wt > top_w):
                    top_w, top_r = wt, rp
                if wt and rp:
                    e = round(wt * (1 + rp / 30), 1)
                    if best_1rm is None or e > best_1rm:
                        best_1rm = e
                # heaviest single set (all-time)
                if wt and (stats.heaviest_weight is None or wt > stats.heaviest_weight):
                    stats.heaviest_weight, stats.heaviest_weight_reps = wt, rp
                # most reps in a single set (all-time)
                if rp and (stats.most_reps is None or rp > stats.most_reps):
                    stats.most_reps, stats.most_reps_weight = rp, wt

        if not did_something:
            continue

        when = w.finished_at or w.started_at
        stats.performed_count += 1
        stats.last_performed = when
        stats.total_volume += volume
        if best_1rm is not None and (stats.best_1rm is None or best_1rm > stats.best_1rm):
            stats.best_1rm = best_1rm
        if stats.best_session_volume is None or volume > stats.best_session_volume:
            stats.best_session_volume = volume
        stats.sessions.append(
            ExerciseSessionStat(
                workout_id=w.id,
                date=when,
                top_weight=top_w,
                top_reps=top_r,
                best_1rm=best_1rm,
                volume=volume,
            )
        )

    return stats


@router.post("", response_model=ExercisePublic, status_code=status.HTTP_201_CREATED)
def create_exercise(
    body: ExerciseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a custom exercise to the shared library."""
    exercise = Exercise(
        name=body.name.strip(),
        category=(body.category or None),
        equipment=(body.equipment or None),
        primary_muscles=[m.strip() for m in body.primary_muscles if m.strip()],
        instructions=[line.strip() for line in body.instructions if line.strip()],
        is_custom=True,
        created_by=current_user.id,
    )
    db.add(exercise)
    db.commit()
    db.refresh(exercise)
    return exercise
