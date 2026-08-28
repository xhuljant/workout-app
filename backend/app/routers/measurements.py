"""Body-measurement routes: log / list / edit / delete dated measurement entries.

Mounted under /api/measurements. Every route requires a valid access token and
only touches the caller's own non-deleted entries. Values are stored in
canonical units (kg / cm / %); the client converts for display.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import MeasurementEntry, User
from ..schemas import MeasurementCreate, MeasurementListItem, MeasurementPublic

router = APIRouter(prefix="/api/measurements", tags=["measurements"])


def _owned_entry(db: Session, user: User, entry_id: uuid.UUID) -> MeasurementEntry:
    entry = (
        db.query(MeasurementEntry)
        .filter(
            MeasurementEntry.id == entry_id,
            MeasurementEntry.user_id == user.id,
            MeasurementEntry.deleted_at.is_(None),
        )
        .first()
    )
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Measurement not found."
        )
    return entry


@router.get("", response_model=list[MeasurementListItem])
def list_measurements(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """All of the user's entries, newest first. Omits the photo blob."""
    rows = (
        db.query(MeasurementEntry)
        .filter(
            MeasurementEntry.user_id == current_user.id,
            MeasurementEntry.deleted_at.is_(None),
        )
        .order_by(
            MeasurementEntry.measured_on.desc(),
            MeasurementEntry.created_at.desc(),
        )
        .all()
    )
    return [
        MeasurementListItem(
            id=r.id,
            measured_on=r.measured_on,
            values=r.values or {},
            photo_count=len(r.photos or []),
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post("", response_model=MeasurementPublic, status_code=status.HTTP_201_CREATED)
def create_measurement(
    body: MeasurementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = MeasurementEntry(
        user_id=current_user.id,
        measured_on=body.measured_on,
        values=dict(body.values),
        photos=list(body.photos),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _to_public(entry)


@router.get("/{entry_id}", response_model=MeasurementPublic)
def get_measurement(
    entry_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _to_public(_owned_entry(db, current_user, entry_id))


@router.put("/{entry_id}", response_model=MeasurementPublic)
def update_measurement(
    entry_id: uuid.UUID,
    body: MeasurementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = _owned_entry(db, current_user, entry_id)
    entry.measured_on = body.measured_on
    entry.values = dict(body.values)   # fresh dict so SQLAlchemy sees the change
    entry.photos = list(body.photos)
    db.commit()
    db.refresh(entry)
    return _to_public(entry)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_measurement(
    entry_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = _owned_entry(db, current_user, entry_id)
    entry.deleted_at = func.now()          # soft delete, never a real DELETE
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _to_public(entry: MeasurementEntry) -> MeasurementPublic:
    photos = entry.photos or []
    return MeasurementPublic(
        id=entry.id,
        measured_on=entry.measured_on,
        values=entry.values or {},
        photo_count=len(photos),
        created_at=entry.created_at,
        photos=photos,
    )
