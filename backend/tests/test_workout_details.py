import csv
import io
import uuid


def _start(client, headers):
    r = client.post("/api/workouts", headers=headers)
    assert r.status_code == 201
    return r.json()


def _finish(client, headers):
    r = client.post("/api/workouts/active/finish", headers=headers)
    assert r.status_code == 200
    return r.json()


def _details(client, headers, workout_id, **body):
    return client.patch(f"/api/workouts/{workout_id}/details", headers=headers, json=body)


def test_details_on_active_workout_leave_content_version_alone(client, headers):
    w = _start(client, headers)

    r = _details(client, headers, w["id"], avg_hr=142, calories=520)
    assert r.status_code == 200, r.text
    assert (r.json()["avg_hr"], r.json()["calories"]) == (142, 520)

    active = client.get("/api/workouts/active", headers=headers).json()
    assert (active["avg_hr"], active["calories"]) == (142, 520)
    assert active["content_version"] == w["content_version"]


def test_details_on_finished_workout_show_in_history(client, headers):
    w = _start(client, headers)
    _finish(client, headers)

    assert _details(client, headers, w["id"], avg_hr=130, calories=300).status_code == 200
    row = client.get("/api/workouts", headers=headers).json()[0]
    assert (row["avg_hr"], row["calories"]) == (130, 300)

    # null clears a value
    assert _details(client, headers, w["id"], avg_hr=None, calories=300).status_code == 200
    assert client.get(f"/api/workouts/{w['id']}", headers=headers).json()["avg_hr"] is None


def test_details_validated(client, headers):
    w = _start(client, headers)
    assert _details(client, headers, w["id"], avg_hr=400).status_code == 422
    assert _details(client, headers, w["id"], calories=-5).status_code == 422


def test_details_on_someone_elses_workout_is_404(client, make_user):
    alice = make_user(email="alice@example.com")
    bob = make_user(email="bob@example.com")
    w = _start(client, alice)
    assert _details(client, bob, w["id"], avg_hr=140).status_code == 404


def test_csv_export_includes_workout_details(client, headers, a_weight_exercise):
    w = _start(client, headers)
    client.put("/api/workouts/active", headers=headers, json={"content": {"exercises": [{
        "exercise_id": a_weight_exercise, "name": "Bench", "tracking_type": "weight_reps",
        "notes": "", "sets": [{"weight": 100, "reps": 5, "done": True}],
    }]}})
    _details(client, headers, w["id"], avg_hr=125, calories=280)
    _finish(client, headers)

    text = client.get("/api/workouts/export.csv", headers=headers).text
    rows = list(csv.DictReader(io.StringIO(text)))
    assert (rows[0]["workout_avg_hr"], rows[0]["workout_calories"]) == ("125", "280")


def test_export_import_round_trips_details(client, make_user):
    alice = make_user(email="alice@example.com")
    w = _start(client, alice)
    _details(client, alice, w["id"], avg_hr=150, calories=610)
    _finish(client, alice)

    doc = client.get("/api/data/export", headers=alice).json()
    assert (doc["workouts"][0]["avg_hr"], doc["workouts"][0]["calories"]) == (150, 610)
    # Import merges by id, so give the copy a fresh id for a second account.
    doc["workouts"][0]["id"] = str(uuid.uuid4())

    bob = make_user(email="bob@example.com")
    assert client.post("/api/data/import", headers=bob, json=doc).status_code == 200
    row = client.get("/api/workouts", headers=bob).json()[0]
    assert (row["avg_hr"], row["calories"]) == (150, 610)
