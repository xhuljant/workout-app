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
from ..schemas import WorkoutPublic, WorkoutStart, WorkoutSummary, WorkoutUpdate

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


def _content_from_routine(routine: Routine) -> dict:
    """Turn a routine template into a fresh workout body: every set starts
    un-done, and each exercise gets an empty notes field."""
    exercises = []
    for entry in routine.content.get("exercises", []):
        exercises.append(
            {
                "exercise_id": entry.get("exercise_id"),
                "name": entry.get("name", ""),
                "notes": "",
                "sets": [
                    {"weight": s.get("weight"), "reps": s.get("reps"), "done": False}
                    for s in entry.get("sets", [])
                ],
            }
        )
    return {"exercises": exercises}


@router.post("", response_model=WorkoutPublic, status_code=status.HTTP_201_CREATED)
def start_workout(
    body: WorkoutStart | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Start a workout. Idempotent: if one is already in progress, return that one
    instead of creating a second. If `routine_id` is given, the new workout is
    pre-filled from that routine."""
    existing = _active_workout(db, current_user)
    if existing is not None:
        return existing

    routine_id = body.routine_id if body else None
    content = {"exercises": []}
    if routine_id is not None:
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
