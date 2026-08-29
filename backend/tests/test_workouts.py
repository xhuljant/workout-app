def _content(exercise_id, weight, reps, done=True):
    return {"exercises": [{
        "exercise_id": exercise_id,
        "name": "Bench",
        "tracking_type": "weight_reps",
        "notes": "",
        "sets": [{"weight": weight, "reps": reps, "done": done}],
    }]}


def test_workout_lifecycle_and_history(client, headers, a_weight_exercise):
    r = client.post("/api/workouts", headers=headers)
    assert r.status_code == 201
    w = r.json()
    assert w["status"] == "active"
    assert w["content_version"] == 1

    r = client.put("/api/workouts/active", headers=headers, json={
        "content": _content(a_weight_exercise, 100, 5),
        "content_version": 1,
    })
    assert r.status_code == 200
    assert r.json()["content_version"] == 2

    assert client.get("/api/workouts/active", headers=headers).json()["id"] == w["id"]

    r = client.post("/api/workouts/active/finish", headers=headers)
    assert r.status_code == 200

    hist = client.get("/api/workouts", headers=headers).json()
    assert len(hist) == 1
    assert hist[0]["set_count"] == 1
    assert hist[0]["volume"] == 500


def test_stale_content_version_conflicts(client, headers, a_weight_exercise):
    client.post("/api/workouts", headers=headers)

    ok = client.put("/api/workouts/active", headers=headers, json={
        "content": _content(a_weight_exercise, 100, 5), "content_version": 1,
    })
    assert ok.status_code == 200 and ok.json()["content_version"] == 2

    stale = client.put("/api/workouts/active", headers=headers, json={
        "content": _content(a_weight_exercise, 105, 5), "content_version": 1,
    })
    assert stale.status_code == 409
    body = stale.json()["detail"]
    assert body["code"] == "stale"
    assert body["server"]["content_version"] == 2

    # No version supplied -> unconditional write still works (old clients).
    forced = client.put("/api/workouts/active", headers=headers, json={
        "content": _content(a_weight_exercise, 110, 5),
    })
    assert forced.status_code == 200
    assert forced.json()["content_version"] == 3


def test_active_workout_preserves_exercise_order(client, headers):
    client.post("/api/workouts", headers=headers)
    names = ["Squat", "Bench", "Row", "Curl"]
    content = {"exercises": [
        {"exercise_id": None, "name": n, "tracking_type": "weight_reps",
         "notes": "", "sets": [{"weight": 10, "reps": 5, "done": False}]}
        for n in names
    ]}
    r = client.put("/api/workouts/active", headers=headers,
                   json={"content": content, "content_version": 1})
    assert r.status_code == 200

    got = client.get("/api/workouts/active", headers=headers).json()
    assert [e["name"] for e in got["content"]["exercises"]] == names


def test_put_active_ignores_unknown_entry_keys(client, headers):
    client.post("/api/workouts", headers=headers)
    content = {"exercises": [{
        "exercise_id": None, "name": "Bench", "tracking_type": "weight_reps",
        "notes": "", "done_collapsed": True,          # client-only UI flag
        "sets": [{"weight": 100, "reps": 5, "done": True}],
    }]}
    r = client.put("/api/workouts/active", headers=headers,
                   json={"content": content, "content_version": 1})
    assert r.status_code == 200

    entry = client.get("/api/workouts/active", headers=headers).json()["content"]["exercises"][0]
    assert "done_collapsed" not in entry
    assert entry["name"] == "Bench"


def test_delete_then_restore_from_trash(client, headers):
    w = client.post("/api/workouts", headers=headers).json()
    client.post("/api/workouts/active/finish", headers=headers)

    assert client.delete(f"/api/workouts/{w['id']}", headers=headers).status_code == 204
    assert client.get("/api/workouts", headers=headers).json() == []

    trash = client.get("/api/workouts/trash", headers=headers).json()
    assert [t["id"] for t in trash] == [w["id"]]

    r = client.post(f"/api/workouts/{w['id']}/restore", headers=headers)
    assert r.status_code == 200
    assert len(client.get("/api/workouts", headers=headers).json()) == 1
    assert client.get("/api/workouts/trash", headers=headers).json() == []
