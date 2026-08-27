"""Seed the exercise library from the vendored free-exercise-db snapshot.

The snapshot (public domain, from https://github.com/yuhonas/free-exercise-db) is
committed at app/data/exercises.json so seeding works with no network access and
builds are reproducible.

seed_exercises() runs on every startup. It only inserts rows whose source_id
isn't in the table yet, so running it repeatedly is harmless and it back-fills
anything new if the snapshot file is later refreshed. Custom exercises added
through the app have source_id = NULL and are never touched here.
"""
import json
from pathlib import Path

from sqlalchemy.orm import Session

from .models import Exercise

_DATA_FILE = Path(__file__).parent / "data" / "exercises.json"


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
                category=item.get("category"),
                equipment=item.get("equipment"),
                force=item.get("force"),
                level=item.get("level"),
                mechanic=item.get("mechanic"),
                primary_muscles=item.get("primaryMuscles") or [],
                secondary_muscles=item.get("secondaryMuscles") or [],
                instructions=item.get("instructions") or [],
                is_custom=False,
            )
        )

    if new_rows:
        db.add_all(new_rows)
        db.commit()

    return len(new_rows)
