"""Workout routes: start / resume / edit / finish / discard the active workout.

Mounted under /api/workouts. Every route requires a valid access token and only
ever touches the current user's own workouts.

There is at most one *active* workout per user (enforced by a partial unique
index on the table), so the client can just ask for "my active workout" and get
an unambiguous answer when it reloads.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Routine, User, Workout
from ..schemas import (
    ExercisePrevious,
    WorkoutPublic,
    WorkoutSet,
    WorkoutStart,
    WorkoutSummary,
    WorkoutUpdate,
)

router = APIRouter(prefix="/api/workouts", tags=["workouts"])


def _summarize(workout: Workout) -> WorkoutSummary:
    """Roll a workout's JSONB content up into a History list row."""
    exercises = (workout.content or {}).get("exercises", [])
    set_count = 0
    volume = 0.0
    for entry in exercises:
        for s in entry.get("sets", []):
            if s.get("done"):
                set_count += 1
                volume += (s.get("weight") or 0) * (s.get("reps") or 0)
    return WorkoutSummary(
        id=workout.id,
        routine_id=workout.routine_id,
        started_at=workout.started_at,
        finished_at=workout.finished_at,
        exercise_count=len(exercises),
        set_count=set_count,
        volume=volume,
    )


def _active_workout(db: Session, user: User) -> Workout | None:
    """The user's in-progress workout, if any."""
    return (
        db.query(Workout)
        .filter(
            Workout.user_id == user.id,
            Workout.status == "active",
            Workout.deleted_at.is_(None),
        )
        .first()
    )


def _require_active(db: Session, user: User) -> Workout:
    workout = _active_workout(db, user)
    if workout is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active workout.",
        )
    return workout


def _fresh_exercises(source_exercises: list, *, keep_notes: bool) -> dict:
    """Copy an exercise list into a fresh workout body: weights/reps become
    targets, every set starts un-done, PR flags are dropped."""
    out = []
    for entry in source_exercises or []:
        out.append(
            {
                "exercise_id": entry.get("exercise_id"),
                "name": entry.get("name", ""),
                "notes": entry.get("notes", "") if keep_notes else "",
                "sets": [
                    {"weight": s.get("weight"), "reps": s.get("reps"), "done": False}
                    for s in entry.get("sets", [])
                ],
            }
        )
    return {"exercises": out}


def _content_from_routine(routine: Routine) -> dict:
    return _fresh_exercises(routine.content.get("exercises", []), keep_notes=False)


def _content_from_workout(src: Workout) -> dict:
    return _fresh_exercises((src.content or {}).get("exercises", []), keep_notes=True)


@router.post("", response_model=WorkoutPublic, status_code=status.HTTP_201_CREATED)
def start_workout(
    body: WorkoutStart | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Start a workout. Idempotent: if one is already in progress, return that one
    instead of creating a second. `routine_id` pre-fills from a routine template;
    `from_workout_id` repeats a past workout."""
    existing = _active_workout(db, current_user)
    if existing is not None:
        return existing

    routine_id = body.routine_id if body else None
    from_workout_id = body.from_workout_id if body else None
    content = {"exercises": []}

    if from_workout_id is not None:
        src = (
            db.query(Workout)
            .filter(
                Workout.id == from_workout_id,
                Workout.user_id == current_user.id,
                Workout.deleted_at.is_(None),
            )
            .first()
        )
        if src is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found."
            )
        content = _content_from_workout(src)
        if routine_id is None:
            routine_id = src.routine_id   # carry the routine link so Finish can still sync it
    elif routine_id is not None:
        routine = (
            db.query(Routine)
            .filter(
                Routine.id == routine_id,
                Routine.user_id == current_user.id,
                Routine.deleted_at.is_(None),
            )
            .first()
        )
        if routine is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Routine not found."
            )
        content = _content_from_routine(routine)

    workout = Workout(
        user_id=current_user.id, routine_id=routine_id, content=content
    )
    db.add(workout)
    db.commit()
    db.refresh(workout)
    return workout


@router.get("", response_model=list[WorkoutSummary])
def list_workouts(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Finished workouts, newest first -- the History list."""
    rows = (
        db.query(Workout)
        .filter(
            Workout.user_id == current_user.id,
            Workout.status == "finished",
            Workout.deleted_at.is_(None),
        )
        .order_by(Workout.finished_at.desc().nullslast(), Workout.started_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [_summarize(w) for w in rows]


@router.get("/active", response_model=WorkoutPublic | None)
def get_active_workout(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The current user's active workout, or null if there isn't one. The client
    calls this on load to resume where it left off."""
    return _active_workout(db, current_user)


@router.put("/active", response_model=WorkoutPublic)
def update_active_workout(
    body: WorkoutUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Overwrite the active workout's contents (exercises, sets, notes)."""
    workout = _require_active(db, current_user)
    workout.content = body.content.model_dump(mode="json")
    db.commit()
    db.refresh(workout)
    return workout


@router.post("/active/finish", response_model=WorkoutPublic)
def finish_active_workout(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark the active workout finished. It stays in the table as history."""
    workout = _require_active(db, current_user)
    workout.status = "finished"
    workout.finished_at = func.now()
    db.commit()
    db.refresh(workout)
    return workout


@router.delete("/active", status_code=status.HTTP_204_NO_CONTENT)
def discard_active_workout(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Throw the active workout away (soft delete, so the discard can sync)."""
    workout = _require_active(db, current_user)
    workout.deleted_at = func.now()
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _epley_1rm(weight: float, reps: float) -> float:
    return weight * (1 + reps / 30)


@router.get("/previous", response_model=dict[str, ExercisePrevious])
def previous_performance(
    exercise_ids: str = Query(..., description="comma-separated exercise UUIDs"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """For each exercise id: the sets from the most recent finished workout that
    included it (the "previous" column + autofill), plus the user's all-time best
    weight and best estimated 1RM (the PR baselines)."""
    wanted: set[str] = set()
    for part in exercise_ids.split(","):
        part = part.strip()
        if part:
            try:
                wanted.add(str(uuid.UUID(part)))
            except ValueError:
                pass
    if not wanted:
        return {}

    finished = (
        db.query(Workout)
        .filter(
            Workout.user_id == current_user.id,
            Workout.status == "finished",
            Workout.deleted_at.is_(None),
        )
        .order_by(Workout.finished_at.desc().nullslast(), Workout.started_at.desc())
        .all()
    )

    result = {eid: ExercisePrevious() for eid in wanted}
    got_last: set[str] = set()

    for w in finished:  # newest first
        for entry in (w.content or {}).get("exercises", []):
            eid = entry.get("exercise_id")
            if not eid:
                continue
            eid = str(eid)
            if eid not in wanted:
                continue

            done_sets = [s for s in entry.get("sets", []) if s.get("done")]
            for s in done_sets:
                wt = s.get("weight") or 0
                rp = s.get("reps") or 0
                if wt:
                    prev = result[eid]
                    if prev.best_weight is None or wt > prev.best_weight:
                        prev.best_weight = wt
                    if rp:
                        e = round(_epley_1rm(wt, rp), 1)
                        if prev.best_1rm is None or e > prev.best_1rm:
                            prev.best_1rm = e

            if eid not in got_last and done_sets:
                result[eid].last_sets = [
                    WorkoutSet(weight=s.get("weight"), reps=s.get("reps"), done=True)
                    for s in done_sets
                ]
                got_last.add(eid)

    return result


@router.get("/{workout_id}", response_model=WorkoutPublic)
def get_workout(
    workout_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """One of the user's workouts in full -- the History detail view."""
    workout = (
        db.query(Workout)
        .filter(
            Workout.id == workout_id,
            Workout.user_id == current_user.id,
            Workout.deleted_at.is_(None),
        )
        .first()
    )
    if workout is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found."
        )
    return workout
