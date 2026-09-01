"""Copy the exercise demo images referenced by app/data/exercises.json out of a
local free-exercise-db checkout and into backend/static/exercises/, where the
FastAPI StaticFiles mount serves them at /exercises/<slug>/N.jpg.

This is a ONE-OFF developer step, not something the app runs. Re-run it only
when the exercises.json snapshot is refreshed.

Usage:
    git clone https://github.com/yuhonas/free-exercise-db /tmp/fedb
    # check out the commit the JSON snapshot came from, then:
    python backend/scripts/vendor_exercise_images.py /tmp/fedb

Only the files listed in each exercise's "images" array are copied (~1.7k JPEGs,
~60-120 MB). Existing files are skipped, so it's safe to re-run.
"""
import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent
DATA_FILE = BACKEND / "app" / "data" / "exercises.json"
DEST_ROOT = BACKEND / "static" / "exercises"


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2

    src_repo = Path(argv[1]).expanduser().resolve()
    src_images = src_repo / "exercises"
    if not src_images.is_dir():
        print(f"No 'exercises/' directory under {src_repo}", file=sys.stderr)
        return 1

    records = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    wanted = [rel for r in records for rel in (r.get("images") or [])]

    copied = skipped = missing = 0
    for rel in wanted:
        src = src_images / rel
        dst = DEST_ROOT / rel
        if dst.exists():
            skipped += 1
            continue
        if not src.is_file():
            missing += 1
            print(f"  missing in source: {rel}", file=sys.stderr)
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        copied += 1

    print(f"copied {copied}, skipped {skipped} (already present), missing {missing}")
    print(f"-> {DEST_ROOT}")
    return 0 if missing == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
