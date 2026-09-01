import pytest


def test_seed_library_present(client, headers):
    lst = client.get("/api/exercises", headers=headers).json()
    assert len(lst) > 100          # the free-exercise-db snapshot is ~800 rows


@pytest.mark.parametrize("mode", ["weight_reps", "reps", "time", "distance_time"])
def test_create_custom_exercise_each_mode(client, headers, mode):
    r = client.post("/api/exercises", headers=headers, json={
        "name": f"Custom {mode}", "tracking_type": mode,
    })
    assert r.status_code == 201
    assert r.json()["tracking_type"] == mode
    assert r.json()["is_custom"] is True


def test_bogus_tracking_type_is_coerced(client, headers):
    r = client.post("/api/exercises", headers=headers, json={
        "name": "Weird one", "tracking_type": "banana",
    })
    assert r.status_code == 201
    assert r.json()["tracking_type"] == "weight_reps"


_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="


def test_seeded_exercise_exposes_image_paths(client, headers):
    lst = client.get("/api/exercises", headers=headers).json()
    sit_up = next(e for e in lst if e["name"] == "3/4 Sit-Up")
    assert sit_up["images"] == ["3_4_Sit-Up/0.jpg", "3_4_Sit-Up/1.jpg"]


def test_seed_backfills_images_and_is_idempotent(client, headers):
    from sqlalchemy import func
    from app.database import SessionLocal
    from app.models import Exercise
    from app.seed import backfill_images

    db = SessionLocal()
    try:
        row = db.query(Exercise).filter(Exercise.source_id == "3_4_Sit-Up").first()
        row.images = []
        db.commit()

        assert backfill_images(db) >= 1          # refilled at least our row
        db.refresh(row)
        assert row.images == ["3_4_Sit-Up/0.jpg", "3_4_Sit-Up/1.jpg"]

        # Second run finds nothing empty.
        assert backfill_images(db) == 0
        empty = (
            db.query(Exercise)
            .filter(Exercise.is_custom.is_(False),
                    func.jsonb_array_length(Exercise.images) == 0)
            .count()
        )
        assert empty == 0
    finally:
        db.close()


def test_custom_exercise_round_trips_uploaded_images(client, headers):
    r = client.post("/api/exercises", headers=headers, json={
        "name": "Custom with pics", "images": [_PNG, _PNG],
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["is_custom"] is True
    assert body["images"] == [_PNG, _PNG]


def test_custom_exercise_rejects_external_or_path_images(client, headers):
    for bad in (["http://evil/x.jpg"], ["../secret/0.jpg"], ["3_4_Sit-Up/0.jpg"]):
        r = client.post("/api/exercises", headers=headers, json={
            "name": "nope", "images": bad,
        })
        assert r.status_code == 422, bad


def test_custom_exercise_rejects_more_than_two_images(client, headers):
    r = client.post("/api/exercises", headers=headers, json={
        "name": "too many", "images": [_PNG, _PNG, _PNG],
    })
    assert r.status_code == 422


def test_edit_updates_images_but_seeded_stay_readonly(client, headers):
    ex = client.post("/api/exercises", headers=headers, json={
        "name": "Editable pics", "images": [_PNG],
    }).json()
    r = client.put(f"/api/exercises/{ex['id']}", headers=headers, json={
        "name": "Editable pics", "tracking_type": "weight_reps", "images": [_PNG, _PNG],
    })
    assert r.status_code == 200
    assert len(r.json()["images"]) == 2

    seeded = next(e for e in client.get("/api/exercises", headers=headers).json()
                  if not e["is_custom"])
    r = client.put(f"/api/exercises/{seeded['id']}", headers=headers, json={
        "name": "hijack", "tracking_type": "weight_reps", "images": [_PNG],
    })
    assert r.status_code == 403


def test_edit_custom_exercise(client, headers):
    ex = client.post("/api/exercises", headers=headers, json={
        "name": "My Curl", "tracking_type": "weight_reps",
    }).json()

    r = client.put(f"/api/exercises/{ex['id']}", headers=headers, json={
        "name": "My Curl v2",
        "tracking_type": "reps",
        "equipment": "dumbbell",
        "primary_muscles": ["biceps"],
        "secondary_muscles": ["forearms"],
        "instructions": ["step one", "step two"],
    })
    assert r.status_code == 200, r.text

    got = next(e for e in client.get("/api/exercises", headers=headers).json()
               if e["id"] == ex["id"])
    assert got["name"] == "My Curl v2"
    assert got["tracking_type"] == "reps"
    assert got["equipment"] == "dumbbell"
    assert got["primary_muscles"] == ["biceps"]
    assert got["secondary_muscles"] == ["forearms"]
    assert got["instructions"] == ["step one", "step two"]


def _finish_workout(client, headers, exercise_id, name, sets):
    client.post("/api/workouts", headers=headers)
    content = {"exercises": [{
        "exercise_id": exercise_id, "name": name, "tracking_type": "weight_reps",
        "notes": "", "sets": [{"weight": w, "reps": r, "done": True} for (w, r) in sets],
    }]}
    assert client.put("/api/workouts/active", headers=headers,
                      json={"content": content}).status_code == 200
    assert client.post("/api/workouts/active/finish", headers=headers).status_code == 200


def test_exercise_history_lists_only_performed_newest_first(client, headers, a_weight_exercise):
    done = a_weight_exercise
    never = client.post("/api/exercises", headers=headers, json={
        "name": "Never done", "tracking_type": "weight_reps",
    }).json()["id"]

    # Two finished sessions of the seeded lift.
    _finish_workout(client, headers, done, "Seeded lift", [(100, 5)])
    _finish_workout(client, headers, done, "Seeded lift", [(105, 5)])

    hist = client.get("/api/exercises/history", headers=headers).json()
    assert [h["id"] for h in hist] == [done]          # the never-done one is absent
    assert hist[0]["session_count"] == 2
    assert hist[0]["tracking_type"] == "weight_reps"
    assert never not in [h["id"] for h in hist]

    # A started-but-not-finished workout doesn't count.
    client.post("/api/workouts", headers=headers)
    still = client.get("/api/exercises/history", headers=headers).json()
    assert still[0]["session_count"] == 2


def test_exercise_history_empty_without_workouts(client, headers):
    assert client.get("/api/exercises/history", headers=headers).json() == []


def test_rename_custom_exercise_cascades_to_history_and_routines(client, headers):
    ex = client.post("/api/exercises", headers=headers, json={
        "name": "Foo Lift", "tracking_type": "weight_reps",
    }).json()

    routine = client.post("/api/routines", headers=headers, json={
        "name": "R", "content": {"exercises": [
            {"exercise_id": ex["id"], "name": "Foo Lift",
             "tracking_type": "weight_reps", "sets": [{"weight": 50, "reps": 5}]},
        ]},
    }).json()

    client.post("/api/workouts", headers=headers)
    client.put("/api/workouts/active", headers=headers, json={"content": {"exercises": [
        {"exercise_id": ex["id"], "name": "Foo Lift", "tracking_type": "weight_reps",
         "notes": "", "sets": [{"weight": 60, "reps": 5, "done": True}]},
    ]}})
    workout = client.post("/api/workouts/active/finish", headers=headers).json()

    r = client.put(f"/api/exercises/{ex['id']}", headers=headers, json={
        "name": "Bar Lift", "tracking_type": "weight_reps",
    })
    assert r.status_code == 200

    got_routine = next(x for x in client.get("/api/routines", headers=headers).json()
                       if x["id"] == routine["id"])
    assert got_routine["content"]["exercises"][0]["name"] == "Bar Lift"

    got_workout = client.get(f"/api/workouts/{workout['id']}", headers=headers).json()
    assert got_workout["content"]["exercises"][0]["name"] == "Bar Lift"
    assert got_workout["content_version"] == workout["content_version"] + 1

    # Renaming to the same value is a no-op -- no version thrash.
    client.put(f"/api/exercises/{ex['id']}", headers=headers, json={
        "name": "Bar Lift", "tracking_type": "weight_reps",
    })
    again = client.get(f"/api/workouts/{workout['id']}", headers=headers).json()
    assert again["content_version"] == workout["content_version"] + 1


def test_cannot_edit_or_delete_seeded_exercise(client, headers, a_weight_exercise):
    edit = client.put(f"/api/exercises/{a_weight_exercise}", headers=headers, json={
        "name": "hijacked", "tracking_type": "weight_reps",
    })
    assert edit.status_code == 403
    assert client.delete(f"/api/exercises/{a_weight_exercise}", headers=headers).status_code == 403


def test_delete_custom_exercise_cascades_to_routines(client, headers, a_weight_exercise):
    custom = client.post("/api/exercises", headers=headers, json={
        "name": "Doomed lift", "tracking_type": "weight_reps",
    }).json()

    routine = client.post("/api/routines", headers=headers, json={
        "name": "Mixed", "content": {"exercises": [
            {"exercise_id": custom["id"], "name": "Doomed lift",
             "tracking_type": "weight_reps", "sets": [{"weight": 50, "reps": 5}]},
            {"exercise_id": a_weight_exercise, "name": "Keeper",
             "tracking_type": "weight_reps", "sets": [{"weight": 60, "reps": 5}]},
        ]},
    }).json()

    assert client.delete(f"/api/exercises/{custom['id']}", headers=headers).status_code == 204

    # gone from the library
    assert all(e["id"] != custom["id"]
               for e in client.get("/api/exercises", headers=headers).json())

    # stripped out of the routine, the other exercise kept
    after = next(r for r in client.get("/api/routines", headers=headers).json()
                 if r["id"] == routine["id"])
    ids = [e["exercise_id"] for e in after["content"]["exercises"]]
    assert ids == [a_weight_exercise]
