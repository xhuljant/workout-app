"""Routine routes: build / edit / delete / reorder a user's workout templates.

Mounted under /api/routines. Every route requires a valid access token and only
touches the caller's own non-deleted routines.

A routine's body (its exercises and planned sets) lives in one JSONB `content`
blob, the same way a workout does -- the editor sends the whole thing on Save.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Routine, User
from ..schemas import RoutineCreate, RoutinePublic, RoutineReorder, RoutineUpdate

router = APIRouter(prefix="/api/routines", tags=["routines"])


def _owned_routine(db: Session, user: User, routine_id: uuid.UUID) -> Routine:
    routine = (
        db.query(Routine)
        .filter(
            Routine.id == routine_id,
            Routine.user_id == user.id,
            Routine.deleted_at.is_(None),
        )
        .first()
    )
    if routine is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Routine not found."
        )
    return routine


def _user_routines(db: Session, user: User):
    return (
        db.query(Routine)
        .filter(Routine.user_id == user.id, Routine.deleted_at.is_(None))
        .order_by(Routine.position, Routine.created_at)
        .all()
    )


@router.get("", response_model=list[RoutinePublic])
def list_routines(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The user's routines, in home-screen order."""
    return _user_routines(db, current_user)


@router.post("", response_model=RoutinePublic, status_code=status.HTTP_201_CREATED)
def create_routine(
    body: RoutineCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a routine. New routines go to the bottom of the list."""
    highest = (
        db.query(func.max(Routine.position))
        .filter(Routine.user_id == current_user.id, Routine.deleted_at.is_(None))
        .scalar()
    )
    routine = Routine(
        user_id=current_user.id,
        name=body.name.strip(),
        position=(highest + 1) if highest is not None else 0,
        content=body.content.model_dump(mode="json"),
    )
    db.add(routine)
    db.commit()
    db.refresh(routine)
    return routine


@router.put("/order", response_model=list[RoutinePublic])
def reorder_routines(
    body: RoutineReorder,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set each routine's position from its index in the given id list. Ids that
    aren't the user's (or don't exist) are ignored."""
    mine = {r.id: r for r in _user_routines(db, current_user)}
    for index, routine_id in enumerate(body.ids):
        routine = mine.get(routine_id)
        if routine is not None:
            routine.position = index
    db.commit()
    return _user_routines(db, current_user)


@router.put("/{routine_id}", response_model=RoutinePublic)
def update_routine(
    routine_id: uuid.UUID,
    body: RoutineUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Overwrite a routine's name and contents."""
    routine = _owned_routine(db, current_user, routine_id)
    routine.name = body.name.strip()
    routine.content = body.content.model_dump(mode="json")
    db.commit()
    db.refresh(routine)
    return routine


@router.delete("/{routine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_routine(
    routine_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-delete a routine (so the deletion can sync later)."""
    routine = _owned_routine(db, current_user, routine_id)
    routine.deleted_at = func.now()
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
