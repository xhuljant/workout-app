"""Folder routes: group / collapse / reorder / rename / delete the home-screen
routine folders.

Mounted under /api/folders. Every route requires a valid access token and only
touches the caller's own non-deleted folders. Every user has exactly one
undeletable `is_default` folder ("My Routines"); it's created lazily on first
read, and routines with no folder are filed under it.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Folder, Routine, User
from ..schemas import FolderCreate, FolderPublic, FolderReorder, FolderUpdate

router = APIRouter(prefix="/api/folders", tags=["folders"])


def _default_folder(db: Session, user: User) -> Folder:
    """The user's "My Routines" folder, creating it (and back-filling any
    folder-less routines into it) the first time it's needed."""
    folder = (
        db.query(Folder)
        .filter(
            Folder.user_id == user.id,
            Folder.is_default.is_(True),
            Folder.deleted_at.is_(None),
        )
        .first()
    )
    if folder is None:
        folder = Folder(
            user_id=user.id, name="My Routines", position=0, is_default=True
        )
        db.add(folder)
        db.commit()
        db.refresh(folder)

    db.query(Routine).filter(
        Routine.user_id == user.id,
        Routine.folder_id.is_(None),
        Routine.deleted_at.is_(None),
    ).update({Routine.folder_id: folder.id}, synchronize_session=False)
    db.commit()
    return folder


def _user_folders(db: Session, user: User) -> list[Folder]:
    return (
        db.query(Folder)
        .filter(Folder.user_id == user.id, Folder.deleted_at.is_(None))
        .order_by(Folder.is_default.desc(), Folder.position, Folder.created_at)
        .all()
    )


def _owned_folder(db: Session, user: User, folder_id: uuid.UUID) -> Folder:
    folder = (
        db.query(Folder)
        .filter(
            Folder.id == folder_id,
            Folder.user_id == user.id,
            Folder.deleted_at.is_(None),
        )
        .first()
    )
    if folder is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found."
        )
    return folder


@router.get("", response_model=list[FolderPublic])
def list_folders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The user's folders, default first."""
    _default_folder(db, current_user)   # ensure it exists
    return _user_folders(db, current_user)


@router.post("", response_model=FolderPublic, status_code=status.HTTP_201_CREATED)
def create_folder(
    body: FolderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    highest = (
        db.query(func.max(Folder.position))
        .filter(Folder.user_id == current_user.id, Folder.deleted_at.is_(None))
        .scalar()
    )
    folder = Folder(
        user_id=current_user.id,
        name=body.name.strip(),
        position=(highest + 1) if highest is not None else 1,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


@router.put("/order", response_model=list[FolderPublic])
def reorder_folders(
    body: FolderReorder,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reposition the custom folders. The default folder stays pinned first."""
    mine = {
        f.id: f
        for f in _user_folders(db, current_user)
        if not f.is_default
    }
    for index, folder_id in enumerate(body.ids, start=1):
        folder = mine.get(folder_id)
        if folder is not None:
            folder.position = index
    db.commit()
    return _user_folders(db, current_user)


@router.put("/{folder_id}", response_model=FolderPublic)
def update_folder(
    folder_id: uuid.UUID,
    body: FolderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    folder = _owned_folder(db, current_user, folder_id)
    if body.name is not None:
        folder.name = body.name.strip()
    if body.collapsed is not None:
        folder.collapsed = body.collapsed
    db.commit()
    db.refresh(folder)
    return folder


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder(
    folder_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a folder; its routines fall back to "My Routines"."""
    folder = _owned_folder(db, current_user, folder_id)
    if folder.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The default folder can't be deleted.",
        )
    default = _default_folder(db, current_user)
    db.query(Routine).filter(
        Routine.user_id == current_user.id, Routine.folder_id == folder.id
    ).update({Routine.folder_id: default.id}, synchronize_session=False)
    folder.deleted_at = func.now()
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
