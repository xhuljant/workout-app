def _seed_account(client, headers, exercise_id):
    client.post("/api/routines", headers=headers, json={
        "name": "Leg day", "content": {"exercises": []},
    })
    client.post("/api/measurements", headers=headers, json={
        "measured_on": "2026-07-15", "values": {"bodyweight": 82.0}, "photos": [],
    })
    client.post("/api/workouts", headers=headers)
    client.put("/api/workouts/active", headers=headers, json={"content": {"exercises": [{
        "exercise_id": exercise_id, "name": "Squat", "tracking_type": "weight_reps",
        "notes": "", "sets": [{"weight": 140, "reps": 5, "done": True}],
    }]}})
    client.post("/api/workouts/active/finish", headers=headers)


def test_export_then_import_into_fresh_account(client, make_user, a_weight_exercise):
    alice = make_user(email="alice@example.com")
    _seed_account(client, alice, a_weight_exercise)

    export = client.get("/api/data/export", headers=alice)
    assert export.status_code == 200
    doc = export.json()
    assert len(doc["routines"]) == 1
    assert len(doc["workouts"]) == 1
    assert len(doc["measurements"]) == 1

    bob = make_user(email="bob@example.com")
    assert client.get("/api/workouts", headers=bob).json() == []

    r = client.post("/api/data/import", headers=bob, json=doc)
    assert r.status_code == 200
    ins = r.json()["inserted"]
    assert ins["routines"] == 1
    assert ins["workouts"] == 1
    assert ins["measurements"] == 1

    # Bob now sees the imported data.
    assert len(client.get("/api/workouts", headers=bob).json()) == 1
    assert len(client.get("/api/routines", headers=bob).json()) == 1

    # Re-importing the same document is a no-op (merge-by-id).
    r = client.post("/api/data/import", headers=bob, json=doc)
    ins2 = r.json()["inserted"]
    assert sum(ins2.values()) == 0
    skipped = r.json()["skipped"]
    assert skipped["workouts"] == 1 and skipped["routines"] == 1
