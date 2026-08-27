"""Workout routes: start / resume / edit / finish / discard the active workout.

Mounted under /api/workouts. Every route requires a valid access token and only
ever touches the current user's own workouts.

There is at most one *active* workout per user (enforced by a partial unique
index on the table), so the client can just ask for "my active workout" and get
an unambiguous answer when it reloads.
"""
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import User, Workout
from ..schemas import WorkoutPublic, WorkoutUpdate

router = APIRouter(prefix="/api/workouts", tags=["workouts"])


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


@router.post("", response_model=WorkoutPublic, status_code=status.HTTP_201_CREATED)
def start_workout(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Start an empty workout. Idempotent: if one is already in progress, return
    that one instead of creating a second."""
    existing = _active_workout(db, current_user)
    if existing is not None:
        return existing

    workout = Workout(user_id=current_user.id, content={"exercises": []})
    db.add(workout)
    db.commit()
    db.refresh(workout)
    return workout


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
