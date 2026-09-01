"""Seed the exercise library from the vendored free-exercise-db snapshot.

The snapshot (public domain, from https://github.com/yuhonas/free-exercise-db) is
committed at app/data/exercises.json so seeding works with no network access and
builds are reproducible.

seed_exercises() runs on every startup. It only inserts rows whose source_id
isn't in the table yet, so running it repeatedly is harmless and it back-fills
anything new if the snapshot file is later refreshed. It also back-fills the
`images` list onto rows that predate that column. Custom exercises added through
the app have source_id = NULL and are never touched here.
"""
import json
from pathlib import Path

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import Exercise

_DATA_FILE = Path(__file__).parent / "data" / "exercises.json"


def _tracking_for(category: str | None) -> str:
    if category == "cardio":
        return "distance_time"
    if category == "stretching":
        return "time"
    return "weight_reps"


def seed_exercises(db: Session) -> int:
    """Insert any library exercises not already present. Returns the count added."""
    records = json.loads(_DATA_FILE.read_text(encoding="utf-8"))

    # One query for every slug we already have, so the loop below is just a set
    # lookup rather than a query per row.
    already_seeded = {
        source_id
        for (source_id,) in db.query(Exercise.source_id).filter(
            Exercise.source_id.isnot(None)
        )
    }

    new_rows = []
    for item in records:
        source_id = item.get("id")
        if not source_id or source_id in already_seeded:
            continue
        new_rows.append(
            Exercise(
                source_id=source_id,
                name=item["name"],
                tracking_type=_tracking_for(item.get("category")),
                category=item.get("category"),
                equipment=item.get("equipment"),
                force=item.get("force"),
                level=item.get("level"),
                mechanic=item.get("mechanic"),
                primary_muscles=item.get("primaryMuscles") or [],
                secondary_muscles=item.get("secondaryMuscles") or [],
                instructions=item.get("instructions") or [],
                images=item.get("images") or [],
                is_custom=False,
            )
        )

    if new_rows:
        db.add_all(new_rows)
        db.commit()

    backfill_images(db, records)
    return len(new_rows)


def backfill_images(db: Session, records: list[dict] | None = None) -> int:
    """Fill `images` on seeded rows that predate the column (still []). Keyed by
    source_id, only touches rows that are still empty, so it's a no-op once every
    row has its media. Returns the number of rows updated."""
    if records is None:
        records = json.loads(_DATA_FILE.read_text(encoding="utf-8"))
    by_slug = {r["id"]: (r.get("images") or []) for r in records if r.get("id")}
    if not by_slug:
        return 0

    stale = (
        db.query(Exercise)
        .filter(
            Exercise.is_custom.is_(False),
            Exercise.source_id.isnot(None),
            func.jsonb_array_length(Exercise.images) == 0,
        )
        .all()
    )
    updated = 0
    for row in stale:
        imgs = by_slug.get(row.source_id)
        if imgs:
            row.images = list(imgs)
            updated += 1
    if updated:
        db.commit()
        print(f"Back-filled example media on {updated} exercises.")
    return updated
