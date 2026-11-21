"""Exercise library routes.

Mounted under /api/exercises. Every route requires a valid access token.

The table is one shared, global library -- there is no per-user filtering -- so a
custom exercise one user adds is immediately visible to everyone else.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Exercise, Routine, User, Workout
from ..schemas import (
    ExerciseCreate,
    ExerciseHistoryItem,
    ExercisePublic,
    ExerciseSessionStat,
    ExerciseStats,
    ExerciseUpdate,
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


@router.get("/history", response_model=list[ExerciseHistoryItem])
def exercise_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Every exercise the current user has completed at least one set of, in a
    finished non-deleted workout -- most recent activity first. Feeds the
    Progress screen's Exercises tab. Declared before /{exercise_id}/stats so
    "history" isn't parsed as an id.
    """
    workouts = (
        db.query(Workout)
        .filter(
            Workout.user_id == current_user.id,
            Workout.status == "finished",
            Workout.deleted_at.is_(None),
        )
        .all()
    )

    # exercise_id (str) -> {"last": datetime, "count": int}
    seen: dict[str, dict] = {}
    for w in workouts:
        when = w.finished_at or w.started_at
        for entry in (w.content or {}).get("exercises", []):
            ex_id = str(entry.get("exercise_id") or "")
            if not ex_id:
                continue
            if not any(s.get("done") for s in entry.get("sets", [])):
                continue
            agg = seen.setdefault(ex_id, {"last": when, "count": 0})
            agg["count"] += 1
            if when and (agg["last"] is None or when > agg["last"]):
                agg["last"] = when

    if not seen:
        return []

    ids = []
    for k in seen:
        try:
            ids.append(uuid.UUID(k))
        except ValueError:
            pass
    rows = (
        db.query(Exercise)
        .filter(Exercise.id.in_(ids), Exercise.deleted_at.is_(None))
        .all()
    )
    items = [
        ExerciseHistoryItem(
            id=ex.id,
            name=ex.name,
            tracking_type=ex.tracking_type,
            images=ex.images or [],
            last_performed=seen[str(ex.id)]["last"],
            session_count=seen[str(ex.id)]["count"],
        )
        for ex in rows
    ]
    items.sort(key=lambda i: i.last_performed, reverse=True)
    return items


@router.get("/{exercise_id}/stats", response_model=ExerciseStats)
def exercise_stats(
    exercise_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The current user's history for one exercise: per-session numbers plus
    all-time bests. Only completed sets from finished, non-deleted workouts."""
    exercise = (
        db.query(Exercise)
        .filter(Exercise.id == exercise_id, Exercise.deleted_at.is_(None))
        .first()
    )
    mode = exercise.tracking_type if exercise else "weight_reps"

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

    stats = ExerciseStats(tracking_type=mode)
    for w in workouts:
        top_w = top_r = top_s = top_d = None
        best_1rm = None
        volume = 0.0
        sess_reps = sess_seconds = 0
        sess_distance = 0.0
        did_something = False

        for entry in (w.content or {}).get("exercises", []):
            if str(entry.get("exercise_id") or "") != target:
                continue
            for s in entry.get("sets", []):
                if not s.get("done"):
                    continue
                wt = s.get("weight") or 0
                rp = s.get("reps") or 0
                sec = s.get("seconds") or 0
                dist = s.get("distance") or 0
                did_something = True

                volume += wt * rp
                sess_reps += rp
                sess_seconds += sec
                sess_distance += dist

                if wt and (top_w is None or wt > top_w):
                    top_w, top_r = wt, rp
                if rp and (top_r is None or rp > top_r):
                    top_r = rp
                if sec and (top_s is None or sec > top_s):
                    top_s = sec
                if dist and (top_d is None or dist > top_d):
                    top_d = dist
                if wt and rp:
                    e = round(wt * (1 + rp / 30), 1)
                    if best_1rm is None or e > best_1rm:
                        best_1rm = e

                # all-time bests
                if wt and (stats.heaviest_weight is None or wt > stats.heaviest_weight):
                    stats.heaviest_weight, stats.heaviest_weight_reps = wt, rp
                if rp and (stats.most_reps is None or rp > stats.most_reps):
                    stats.most_reps, stats.most_reps_weight = rp, wt
                if sec and (stats.longest_seconds is None or sec > stats.longest_seconds):
                    stats.longest_seconds = sec
                if dist and (
                    stats.farthest_distance is None or dist > stats.farthest_distance
                ):
                    stats.farthest_distance = dist
                if dist and sec:
                    pace = sec / dist
                    if stats.best_pace is None or pace < stats.best_pace:
                        stats.best_pace = round(pace, 1)

        if not did_something:
            continue

        when = w.finished_at or w.started_at
        stats.performed_count += 1
        stats.last_performed = when
        stats.total_volume += volume
        stats.total_reps = (stats.total_reps or 0) + sess_reps
        stats.total_seconds = (stats.total_seconds or 0) + sess_seconds
        stats.total_distance = round((stats.total_distance or 0) + sess_distance, 2)
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
                top_seconds=top_s,
                top_distance=top_d,
                best_1rm=best_1rm,
                volume=volume,
            )
        )

    return stats


def _clean_list(items: list[str]) -> list[str]:
    return [s.strip() for s in items if s.strip()]


def _rename_in_content(rows, target_id: str, new_name: str) -> None:
    """Rewrite the denormalized exercise `name` inside every workout/routine
    `content` blob that references `target_id`, so a rename shows up in past
    history and current routines. Bumps `content_version` on workouts it touches
    (routines have no such column).

    Builds a fresh list of fresh dicts -- mutating the loaded content in place
    would also mutate SQLAlchemy's "old" value, so no UPDATE would be emitted
    (JSONB columns here aren't MutableDict-tracked)."""
    for row in rows:
        exs = (row.content or {}).get("exercises", [])
        new_exs = [
            {**e, "name": new_name}
            if str(e.get("exercise_id") or "") == target_id
            else e
            for e in exs
        ]
        if new_exs != exs:
            row.content = {**(row.content or {}), "exercises": new_exs}
            if getattr(row, "content_version", None):
                row.content_version += 1


@router.post("", response_model=ExercisePublic, status_code=status.HTTP_201_CREATED)
def create_exercise(
    body: ExerciseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a custom exercise to the shared library."""
    exercise = Exercise(
        name=body.name.strip(),
        tracking_type=body.tracking_type,
        category=(body.category or None),
        equipment=(body.equipment or None),
        primary_muscles=_clean_list(body.primary_muscles),
        secondary_muscles=_clean_list(body.secondary_muscles),
        instructions=_clean_list(body.instructions),
        images=list(body.images),   # already validated to data:image/ URLs, max 2
        is_custom=True,
        created_by=current_user.id,
    )
    db.add(exercise)
    db.commit()
    db.refresh(exercise)
    return exercise


def _custom_exercise(db: Session, exercise_id: uuid.UUID) -> Exercise:
    """Load a non-deleted exercise and require that it's user-added. Seeded
    library rows (is_custom=False) are read-only for everyone."""
    exercise = (
        db.query(Exercise)
        .filter(Exercise.id == exercise_id, Exercise.deleted_at.is_(None))
        .first()
    )
    if exercise is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found."
        )
    if not exercise.is_custom:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only custom exercises can be changed.",
        )
    return exercise


@router.put("/{exercise_id}", response_model=ExercisePublic)
def update_exercise(
    exercise_id: uuid.UUID,
    body: ExerciseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit a custom exercise. Any signed-in user may edit any custom exercise --
    the library is one shared table.

    A rename cascades: the denormalized `name` in every past workout's and
    current routine's `content` is rewritten so history and routines stay in
    sync. `category` / `equipment` / muscles aren't denormalized, so they update
    everywhere automatically.

    Note: changing `tracking_type` only affects future workouts and routine
    entries. Existing workout `content` blobs keep their own per-entry snapshot,
    but the /stats endpoint reads the live value, so past sessions of a re-typed
    exercise are re-interpreted in the new mode -- expected when you deliberately
    change it.
    """
    exercise = _custom_exercise(db, exercise_id)
    old_name = exercise.name
    new_name = body.name.strip()
    exercise.name = new_name
    exercise.tracking_type = body.tracking_type
    exercise.category = body.category or None
    exercise.equipment = body.equipment or None
    exercise.primary_muscles = _clean_list(body.primary_muscles)
    exercise.secondary_muscles = _clean_list(body.secondary_muscles)
    exercise.instructions = _clean_list(body.instructions)
    exercise.images = list(body.images)

    if new_name != old_name:
        target = str(exercise_id)
        _rename_in_content(
            db.query(Workout).filter(Workout.deleted_at.is_(None)).all(), target, new_name
        )
        _rename_in_content(
            db.query(Routine).filter(Routine.deleted_at.is_(None)).all(), target, new_name
        )

    db.commit()
    db.refresh(exercise)
    return exercise


@router.delete("/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exercise(
    exercise_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-delete a custom exercise and strip it out of every routine that used
    it. Finished/active workouts are left as-is -- their entries carry their own
    name + tracking snapshot and still render."""
    exercise = _custom_exercise(db, exercise_id)
    exercise.deleted_at = func.now()

    target = str(exercise_id)
    routines = (
        db.query(Routine).filter(Routine.deleted_at.is_(None)).all()
    )
    for routine in routines:
        entries = (routine.content or {}).get("exercises", [])
        kept = [e for e in entries if str(e.get("exercise_id") or "") != target]
        if len(kept) != len(entries):
            routine.content = {**(routine.content or {}), "exercises": kept}

    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
