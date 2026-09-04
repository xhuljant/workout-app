"""Workout routes: start / resume / edit / finish / discard the active workout.

Mounted under /api/workouts. Every route requires a valid access token and only
ever touches the current user's own workouts.

There is at most one *active* workout per user (enforced by a partial unique
index on the table), so the client can just ask for "my active workout" and get
an unambiguous answer when it reloads.
"""
import csv
import io
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Routine, User, Workout
from ..schemas import (
    ExercisePrevious,
    ShareExport,
    WorkoutCalendarEntry,
    WorkoutPublic,
    WorkoutSet,
    WorkoutStart,
    WorkoutSummary,
    WorkoutTrashItem,
    WorkoutUpdate,
)

router = APIRouter(prefix="/api/workouts", tags=["workouts"])


def _summarize(workout: Workout, routine_names: dict | None = None) -> WorkoutSummary:
    """Roll a workout's JSONB content up into a History list row. `routine_names`
    maps routine id -> name so the row can show the workout's name without the
    client having to have its routine list loaded."""
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
        name=(routine_names or {}).get(workout.routine_id, ""),
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


_SET_METRICS = ("weight", "reps", "seconds", "distance")


def _fresh_exercises(source_exercises: list, *, keep_notes: bool) -> dict:
    """Copy an exercise list into a fresh workout body: logged numbers become
    targets, every set starts un-done, PR flags are dropped."""
    out = []
    for entry in source_exercises or []:
        out.append(
            {
                "exercise_id": entry.get("exercise_id"),
                "name": entry.get("name", ""),
                "tracking_type": entry.get("tracking_type", "weight_reps"),
                "notes": entry.get("notes", "") if keep_notes else "",
                "rest_seconds": entry.get("rest_seconds"),
                "sets": [
                    {**{m: s.get(m) for m in _SET_METRICS}, "done": False}
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
    rest_seconds = None   # concrete value resolved below

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
        rest_seconds = src.rest_seconds
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
        rest_seconds = routine.rest_seconds

    if not rest_seconds:
        rest_seconds = (current_user.preferences or {}).get("default_rest_seconds") or 90

    workout = Workout(
        user_id=current_user.id,
        routine_id=routine_id,
        rest_seconds=rest_seconds,
        content=content,
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
    routine_names = {
        r.id: r.name
        for r in db.query(Routine).filter(Routine.user_id == current_user.id).all()
    }
    return [_summarize(w, routine_names) for w in rows]


@router.get("/calendar", response_model=list[WorkoutCalendarEntry])
def workout_calendar(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Every finished workout as {id, timestamp, routine name} for the Calendar.
    Lightweight: selects only the columns needed, no JSONB content, no paging."""
    routine_names = {
        r.id: r.name
        for r in db.query(Routine).filter(Routine.user_id == current_user.id).all()
    }
    rows = (
        db.query(
            Workout.id, Workout.routine_id,
            Workout.started_at, Workout.finished_at,
        )
        .filter(
            Workout.user_id == current_user.id,
            Workout.status == "finished",
            Workout.deleted_at.is_(None),
        )
        .order_by(Workout.finished_at.asc().nullsfirst(), Workout.started_at.asc())
        .all()
    )
    return [
        WorkoutCalendarEntry(
            id=r.id,
            at=r.finished_at or r.started_at,
            name=routine_names.get(r.routine_id, ""),
        )
        for r in rows
    ]


@router.get("/export.csv")
def export_history_csv(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Every logged set across the user's finished workouts, as a CSV download."""
    routine_names = {
        r.id: r.name
        for r in db.query(Routine).filter(Routine.user_id == current_user.id).all()
    }

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

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        ["date", "routine", "exercise", "tracking", "set",
         "weight_lb", "reps", "seconds", "distance_mi", "completed"]
    )
    cell = lambda v: v if v is not None else ""
    for w in workouts:
        when = (w.finished_at or w.started_at).date().isoformat()
        routine = routine_names.get(w.routine_id, "")
        for entry in (w.content or {}).get("exercises", []):
            name = entry.get("name", "")
            tracking = entry.get("tracking_type", "weight_reps")
            for i, s in enumerate(entry.get("sets", []), start=1):
                writer.writerow([
                    when,
                    routine,
                    name,
                    tracking,
                    i,
                    cell(s.get("weight")),
                    cell(s.get("reps")),
                    cell(s.get("seconds")),
                    cell(s.get("distance")),
                    "yes" if s.get("done") else "no",
                ])

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="workout-history.csv"'},
    )


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
    """Overwrite the active workout's contents (exercises, sets, notes), and the
    rest-timer length when supplied.

    Optimistic concurrency: if the client sends `content_version` and it no
    longer matches, another device saved in between -- reject with 409 and hand
    back the authoritative copy so the client can reconcile instead of silently
    clobbering those edits.
    """
    workout = _require_active(db, current_user)

    if body.content_version is not None and body.content_version != workout.content_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "stale",
                "message": "This workout was updated on another device.",
                "server": jsonable_encoder(WorkoutPublic.model_validate(workout)),
            },
        )

    workout.content = body.content.model_dump(mode="json")
    workout.content_version = (workout.content_version or 1) + 1
    if body.rest_seconds is not None:
        workout.rest_seconds = body.rest_seconds
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
            prev = result[eid]
            for s in done_sets:
                wt = s.get("weight") or 0
                rp = s.get("reps") or 0
                sec = s.get("seconds") or 0
                dist = s.get("distance") or 0
                if wt and (prev.best_weight is None or wt > prev.best_weight):
                    prev.best_weight = wt
                if wt and rp:
                    e = round(_epley_1rm(wt, rp), 1)
                    if prev.best_1rm is None or e > prev.best_1rm:
                        prev.best_1rm = e
                if rp and (prev.best_reps is None or rp > prev.best_reps):
                    prev.best_reps = rp
                if sec and (prev.best_seconds is None or sec > prev.best_seconds):
                    prev.best_seconds = sec
                if dist and (prev.best_distance is None or dist > prev.best_distance):
                    prev.best_distance = dist

            if eid not in got_last and done_sets:
                prev.last_sets = [
                    WorkoutSet(
                        weight=s.get("weight"),
                        reps=s.get("reps"),
                        seconds=s.get("seconds"),
                        distance=s.get("distance"),
                        done=True,
                    )
                    for s in done_sets
                ]
                got_last.add(eid)

    return result


def _owned_workout(db: Session, user: User, workout_id: uuid.UUID) -> Workout:
    workout = (
        db.query(Workout)
        .filter(
            Workout.id == workout_id,
            Workout.user_id == user.id,
            Workout.deleted_at.is_(None),
        )
        .first()
    )
    if workout is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found."
        )
    return workout


@router.get("/trash", response_model=list[WorkoutTrashItem])
def list_trashed_workouts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-deleted workouts, newest deletion first. Purged after 30 days."""
    routine_names = {
        r.id: r.name
        for r in db.query(Routine).filter(Routine.user_id == current_user.id).all()
    }
    rows = (
        db.query(Workout)
        .filter(
            Workout.user_id == current_user.id,
            Workout.deleted_at.isnot(None),
        )
        .order_by(Workout.deleted_at.desc())
        .all()
    )
    return [
        WorkoutTrashItem(
            id=w.id,
            name=routine_names.get(w.routine_id, "Workout"),
            at=w.finished_at or w.started_at,
            deleted_at=w.deleted_at,
            exercise_count=len((w.content or {}).get("exercises", [])),
        )
        for w in rows
    ]


@router.post("/{workout_id}/restore", response_model=WorkoutPublic)
def restore_workout(
    workout_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Undo a soft-delete. Only works while the workout is still in Trash (not
    yet purged) and there isn't already an active workout blocking an active one."""
    workout = (
        db.query(Workout)
        .filter(
            Workout.id == workout_id,
            Workout.user_id == current_user.id,
            Workout.deleted_at.isnot(None),
        )
        .first()
    )
    if workout is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout not found in Trash.",
        )
    if workout.status == "active" and _active_workout(db, current_user) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Finish or discard your current workout before restoring this one.",
        )
    workout.deleted_at = None
    db.commit()
    db.refresh(workout)
    return workout


@router.get("/{workout_id}", response_model=WorkoutPublic)
def get_workout(
    workout_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """One of the user's workouts in full -- the History detail view."""
    return _owned_workout(db, current_user, workout_id)


@router.get("/{workout_id}/share", response_model=ShareExport)
def share_workout(
    workout_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Package one of the user's logged workouts for export as a reusable
    template -- PR flags and done-state are stripped (via _content_from_workout,
    the same helper used to start a fresh session from a past one), and there's
    no id/user_id/folder_id: the importer picks where it lands."""
    workout = _owned_workout(db, current_user, workout_id)
    name = "Workout"
    if workout.routine_id is not None:
        routine = (
            db.query(Routine)
            .filter(Routine.id == workout.routine_id, Routine.user_id == current_user.id)
            .first()
        )
        if routine is not None:
            name = routine.name
    return ShareExport(
        kind="workout",
        name=name,
        rest_seconds=workout.rest_seconds,
        content=_content_from_workout(workout),
    )


@router.delete("/{workout_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workout(
    workout_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-delete a workout -- removes it from History, the exercise stats, PR
    baselines and the CSV export."""
    workout = _owned_workout(db, current_user, workout_id)
    workout.deleted_at = func.now()
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
