def _routine_content(exercise_id):
    return {"exercises": [{
        "exercise_id": exercise_id,
        "name": "Bench",
        "tracking_type": "weight_reps",
        "sets": [{"weight": 100, "reps": 5}],
    }]}


def _workout_content(exercise_id):
    return {"exercises": [{
        "exercise_id": exercise_id,
        "name": "Bench",
        "tracking_type": "weight_reps",
        "notes": "felt strong",
        "sets": [{"weight": 100, "reps": 5, "done": True, "pr_weight": True}],
    }]}


def test_share_routine(client, headers, a_weight_exercise):
    created = client.post("/api/routines", headers=headers, json={
        "name": "Push day",
        "content": _routine_content(a_weight_exercise),
        "rest_seconds": 90,
    }).json()

    r = client.get(f"/api/routines/{created['id']}/share", headers=headers)
    assert r.status_code == 200
    doc = r.json()
    assert doc["kind"] == "routine"
    assert doc["name"] == "Push day"
    assert doc["rest_seconds"] == 90
    assert doc["content"] == created["content"]
    # No account-identifying fields leak into the shareable payload.
    assert "id" not in doc and "user_id" not in doc and "folder_id" not in doc


def test_share_workout_strips_done_and_pr_flags(client, headers, a_weight_exercise):
    client.post("/api/workouts", headers=headers)
    client.put("/api/workouts/active", headers=headers, json={
        "content": _workout_content(a_weight_exercise),
    })
    finished = client.post("/api/workouts/active/finish", headers=headers).json()

    r = client.get(f"/api/workouts/{finished['id']}/share", headers=headers)
    assert r.status_code == 200
    doc = r.json()
    assert doc["kind"] == "workout"
    assert doc["name"] == "Workout"   # ad-hoc, no routine behind it
    entry = doc["content"]["exercises"][0]
    aset = entry["sets"][0]
    assert "done" not in aset and "pr_weight" not in aset
    assert aset["weight"] == 100 and aset["reps"] == 5


def test_share_workout_from_routine_uses_routine_name(client, headers, a_weight_exercise):
    routine = client.post("/api/routines", headers=headers, json={
        "name": "Leg day", "content": _routine_content(a_weight_exercise),
    }).json()
    client.post("/api/workouts", headers=headers, json={"routine_id": routine["id"]})
    finished = client.post("/api/workouts/active/finish", headers=headers).json()

    doc = client.get(f"/api/workouts/{finished['id']}/share", headers=headers).json()
    assert doc["name"] == "Leg day"


def test_import_lands_in_chosen_folder_for_the_importing_user(client, make_user, a_weight_exercise):
    exporter = make_user("exporter@example.com")
    routine = client.post("/api/routines", headers=exporter, json={
        "name": "Push day", "content": _routine_content(a_weight_exercise), "rest_seconds": 90,
    }).json()
    shared = client.get(f"/api/routines/{routine['id']}/share", headers=exporter).json()

    importer = make_user("importer@example.com")
    dest_folder = client.post("/api/folders", headers=importer, json={"name": "Friend's routines"}).json()

    r = client.post("/api/routines/import", headers=importer, json={
        "name": "Push day (from a friend)",
        "folder_id": dest_folder["id"],
        "payload": shared,
    })
    assert r.status_code == 201
    imported = r.json()
    assert imported["name"] == "Push day (from a friend)"
    assert imported["folder_id"] == dest_folder["id"]
    assert imported["rest_seconds"] == 90
    assert imported["content"] == shared["content"]

    # It belongs to the importer, not the exporter.
    mine = client.get("/api/routines", headers=importer).json()
    assert any(r["id"] == imported["id"] for r in mine)
    theirs = client.get("/api/routines", headers=exporter).json()
    assert all(r["id"] != imported["id"] for r in theirs)


def test_import_without_folder_id_lands_in_default_folder(client, headers, a_weight_exercise):
    shared = {
        "kind": "routine", "version": 1, "name": "Push day",
        "rest_seconds": None, "content": _routine_content(a_weight_exercise),
    }
    folders = client.get("/api/folders", headers=headers).json()
    default_id = next(f["id"] for f in folders if f["is_default"])

    r = client.post("/api/routines/import", headers=headers, json={
        "name": "Push day", "folder_id": None, "payload": shared,
    })
    assert r.status_code == 201
    assert r.json()["folder_id"] == default_id


def test_import_with_foreign_folder_id_falls_back_to_default(client, make_user, a_weight_exercise):
    other = make_user("other@example.com")
    other_folder = client.post("/api/folders", headers=other, json={"name": "Not yours"}).json()

    mine = make_user("me@example.com")
    folders = client.get("/api/folders", headers=mine).json()
    default_id = next(f["id"] for f in folders if f["is_default"])

    shared = {
        "kind": "routine", "version": 1, "name": "Push day",
        "rest_seconds": None, "content": _routine_content(a_weight_exercise),
    }
    r = client.post("/api/routines/import", headers=mine, json={
        "name": "Push day", "folder_id": other_folder["id"], "payload": shared,
    })
    assert r.status_code == 201
    assert r.json()["folder_id"] == default_id
