"""Exercise library routes.

Mounted under /api/exercises. Every route requires a valid access token.

The table is one shared, global library -- there is no per-user filtering -- so a
custom exercise one user adds is immediately visible to everyone else.
"""
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Exercise, User
from ..schemas import ExerciseCreate, ExercisePublic

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
