"""Full-account data export / import.

Mounted under /api/data. Every route requires a valid access token and only ever
touches the caller's own rows.

  GET  /api/data/export  -> one JSON document with everything the user owns
                            (routines, folders, workouts incl. finished &
                            trashed, measurements incl. photos, custom
                            exercises). A real, restorable backup -- unlike the
                            lossy CSV.
  POST /api/data/import  -> take such a document and MERGE it in by id: rows the
                            user doesn't already have are inserted; existing rows
                            are left untouched. Never overwrites or deletes.
"""
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Exercise, Folder, MeasurementEntry, Routine, User, Workout
from ..schemas import DataExport, DataImport, DataImportResult

router = APIRouter(prefix="/api/data", tags=["data"])


def _dt(v):
    """ISO string -> datetime, tolerating a trailing 'Z'. None stays None."""
    if v in (None, ""):
        return None
    if isinstance(v, datetime):
        return v
    return datetime.fromisoformat(str(v).replace("Z", "+00:00"))


def _uuid(v):
    if v in (None, ""):
        return None
    if isinstance(v, uuid.UUID):
        return v
    return uuid.UUID(str(v))


# --- export ----------------------------------------------------------------

def _workout_dict(w: Workout) -> dict:
    return {
        "id": str(w.id),
        "routine_id": str(w.routine_id) if w.routine_id else None,
        "status": w.status,
        "rest_seconds": w.rest_seconds,
        "content_version": w.content_version,
        "content": w.content or {"exercises": []},
        "started_at": w.started_at.isoformat() if w.started_at else None,
        "finished_at": w.finished_at.isoformat() if w.finished_at else None,
        "deleted_at": w.deleted_at.isoformat() if w.deleted_at else None,
    }


def _routine_dict(r: Routine) -> dict:
    return {
        "id": str(r.id),
        "folder_id": str(r.folder_id) if r.folder_id else None,
        "name": r.name,
        "position": r.position,
        "rest_seconds": r.rest_seconds,
        "content": r.content or {"exercises": []},
        "deleted_at": r.deleted_at.isoformat() if r.deleted_at else None,
    }


def _folder_dict(f: Folder) -> dict:
    return {
        "id": str(f.id),
        "name": f.name,
        "position": f.position,
        "collapsed": f.collapsed,
        "is_default": f.is_default,
        "deleted_at": f.deleted_at.isoformat() if f.deleted_at else None,
    }


def _measurement_dict(m: MeasurementEntry) -> dict:
    return {
        "id": str(m.id),
        "measured_on": m.measured_on.isoformat(),
        "values": m.values or {},
        "photos": m.photos or [],
        "deleted_at": m.deleted_at.isoformat() if m.deleted_at else None,
    }


def _exercise_dict(e: Exercise) -> dict:
    return {
        "id": str(e.id),
        "name": e.name,
        "tracking_type": e.tracking_type,
        "category": e.category,
        "equipment": e.equipment,
        "force": e.force,
        "level": e.level,
        "mechanic": e.mechanic,
        "primary_muscles": e.primary_muscles or [],
        "secondary_muscles": e.secondary_muscles or [],
        "instructions": e.instructions or [],
        "images": e.images or [],
        "deleted_at": e.deleted_at.isoformat() if e.deleted_at else None,
    }


@router.get("/export", response_model=DataExport)
def export_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    uid = current_user.id
    workouts = db.query(Workout).filter(Workout.user_id == uid).all()
    routines = db.query(Routine).filter(Routine.user_id == uid).all()
    folders = db.query(Folder).filter(Folder.user_id == uid).all()
    measurements = db.query(MeasurementEntry).filter(MeasurementEntry.user_id == uid).all()
    exercises = db.query(Exercise).filter(Exercise.created_by == uid).all()

    return DataExport(
        exported_at=datetime.now(timezone.utc),
        user={
            "display_name": current_user.display_name,
            "email": current_user.email,
            "preferences": current_user.preferences or {},
        },
        exercises=[_exercise_dict(e) for e in exercises],
        folders=[_folder_dict(f) for f in folders],
        routines=[_routine_dict(r) for r in routines],
        workouts=[_workout_dict(w) for w in workouts],
        measurements=[_measurement_dict(m) for m in measurements],
    )


# --- import --------------------------------------------------------------

@router.post("/import", response_model=DataImportResult)
def import_data(
    body: DataImport,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    uid = current_user.id
    inserted = {k: 0 for k in ("exercises", "folders", "routines", "workouts", "measurements")}
    skipped = dict(inserted)

    def have(model, row_id) -> bool:
        return db.query(model.id).filter(model.id == row_id).first() is not None

    # Folders first (routines reference them), then routines, then workouts.
    for f in body.folders:
        fid = _uuid(f.get("id")) or uuid.uuid4()
        if have(Folder, fid):
            skipped["folders"] += 1
            continue
        db.add(Folder(
            id=fid, user_id=uid,
            name=f.get("name") or "Imported folder",
            position=int(f.get("position") or 0),
            collapsed=bool(f.get("collapsed")),
            is_default=False,   # the user already has their own default folder
            deleted_at=_dt(f.get("deleted_at")),
        ))
        inserted["folders"] += 1

    for r in body.routines:
        rid = _uuid(r.get("id")) or uuid.uuid4()
        if have(Routine, rid):
            skipped["routines"] += 1
            continue
        folder_id = _uuid(r.get("folder_id"))
        if folder_id is not None and not have(Folder, folder_id):
            folder_id = None   # its folder didn't come along -- fall back to default
        db.add(Routine(
            id=rid, user_id=uid, folder_id=folder_id,
            name=r.get("name") or "Imported routine",
            position=int(r.get("position") or 0),
            rest_seconds=r.get("rest_seconds"),
            content=r.get("content") or {"exercises": []},
            deleted_at=_dt(r.get("deleted_at")),
        ))
        inserted["routines"] += 1

    for w in body.workouts:
        wid = _uuid(w.get("id")) or uuid.uuid4()
        if have(Workout, wid):
            skipped["workouts"] += 1
            continue
        routine_id = _uuid(w.get("routine_id"))
        if routine_id is not None and not have(Routine, routine_id):
            routine_id = None
        wstatus = w.get("status") if w.get("status") in ("active", "finished") else "finished"
        # An import must never create a second ACTIVE workout (partial unique index).
        if wstatus == "active":
            wstatus = "finished"
        db.add(Workout(
            id=wid, user_id=uid, routine_id=routine_id,
            status=wstatus,
            rest_seconds=w.get("rest_seconds"),
            content_version=int(w.get("content_version") or 1),
            content=w.get("content") or {"exercises": []},
            started_at=_dt(w.get("started_at")) or datetime.now(timezone.utc),
            finished_at=_dt(w.get("finished_at")),
            deleted_at=_dt(w.get("deleted_at")),
        ))
        inserted["workouts"] += 1

    for m in body.measurements:
        mid = _uuid(m.get("id")) or uuid.uuid4()
        if have(MeasurementEntry, mid):
            skipped["measurements"] += 1
            continue
        raw_date = m.get("measured_on")
        measured_on = raw_date if isinstance(raw_date, date) else date.fromisoformat(str(raw_date))
        db.add(MeasurementEntry(
            id=mid, user_id=uid,
            measured_on=measured_on,
            values=m.get("values") or {},
            photos=(m.get("photos") or [])[:4],
            deleted_at=_dt(m.get("deleted_at")),
        ))
        inserted["measurements"] += 1

    for e in body.exercises:
        eid = _uuid(e.get("id")) or uuid.uuid4()
        if have(Exercise, eid):
            skipped["exercises"] += 1
            continue
        tt = e.get("tracking_type")
        db.add(Exercise(
            id=eid,
            source_id=None,           # imported rows never claim a library slug
            name=e.get("name") or "Imported exercise",
            tracking_type=tt if tt in ("weight_reps", "reps", "time", "distance_time") else "weight_reps",
            category=e.get("category"),
            equipment=e.get("equipment"),
            force=e.get("force"),
            level=e.get("level"),
            mechanic=e.get("mechanic"),
            primary_muscles=e.get("primary_muscles") or [],
            secondary_muscles=e.get("secondary_muscles") or [],
            instructions=e.get("instructions") or [],
            images=[
                s for s in (e.get("images") or [])
                if isinstance(s, str) and s.startswith("data:image/")
            ][:2],
            is_custom=True,
            created_by=uid,
            deleted_at=_dt(e.get("deleted_at")),
        ))
        inserted["exercises"] += 1

    db.commit()
    return DataImportResult(inserted=inserted, skipped=skipped)
