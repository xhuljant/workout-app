import csv
import io

import pytest


@pytest.fixture
def a_cardio_exercise(client, headers):
    """A seeded exercise id that tracks distance + time."""
    for ex in client.get("/api/exercises", headers=headers).json():
        if ex["tracking_type"] == "distance_time":
            return ex["id"]
    raise AssertionError("no distance_time exercise in the seeded library")


def _content(exercise_id, **set_fields):
    return {"exercises": [{
        "exercise_id": exercise_id,
        "name": "Running",
        "tracking_type": "distance_time",
        "notes": "",
        "sets": [{"distance": 3.1, "seconds": 1500, "done": True, **set_fields}],
    }]}


def _log(client, headers, exercise_id, **set_fields):
    client.post("/api/workouts", headers=headers)
    r = client.put("/api/workouts/active", headers=headers,
                   json={"content": _content(exercise_id, **set_fields)})
    assert r.status_code == 200, r.text
    r = client.post("/api/workouts/active/finish", headers=headers)
    assert r.status_code == 200
    return r.json()["id"]


def test_cardio_details_round_trip(client, headers, a_cardio_exercise):
    client.post("/api/workouts", headers=headers)
    r = client.put("/api/workouts/active", headers=headers, json={
        "content": _content(a_cardio_exercise, avg_hr=152, max_hr=171, calories=420),
    })
    assert r.status_code == 200, r.text

    s = client.get("/api/workouts/active", headers=headers).json()["content"]["exercises"][0]["sets"][0]
    assert (s["avg_hr"], s["max_hr"], s["calories"]) == (152, 171, 420)
    assert (s["distance"], s["seconds"]) == (3.1, 1500)


def test_cardio_details_validated(client, headers, a_cardio_exercise):
    client.post("/api/workouts", headers=headers)
    r = client.put("/api/workouts/active", headers=headers, json={
        "content": _content(a_cardio_exercise, avg_hr=400),
    })
    assert r.status_code == 422


def test_repeat_keeps_distance_drops_cardio_details(client, headers, a_cardio_exercise):
    wid = _log(client, headers, a_cardio_exercise, avg_hr=150, max_hr=170, calories=400)

    r = client.post("/api/workouts", headers=headers, json={"from_workout_id": wid})
    assert r.status_code == 201, r.text
    s = r.json()["content"]["exercises"][0]["sets"][0]
    assert (s["distance"], s["seconds"]) == (3.1, 1500)
    assert s["avg_hr"] is None and s["max_hr"] is None and s["calories"] is None


def test_csv_export_includes_cardio_details(client, headers, a_cardio_exercise):
    _log(client, headers, a_cardio_exercise, avg_hr=150, max_hr=170, calories=400)

    r = client.get("/api/workouts/export.csv", headers=headers)
    rows = list(csv.DictReader(io.StringIO(r.text)))
    assert len(rows) == 1
    assert (rows[0]["avg_hr"], rows[0]["max_hr"], rows[0]["calories"]) == ("150", "170", "400")


def test_stats_aggregate_cardio_details(client, headers, a_cardio_exercise):
    _log(client, headers, a_cardio_exercise, avg_hr=150, calories=400)
    _log(client, headers, a_cardio_exercise, calories=300)

    stats = client.get(f"/api/exercises/{a_cardio_exercise}/stats", headers=headers).json()
    assert stats["total_calories"] == 700
    assert [s["avg_hr"] for s in stats["sessions"]] == [150, None]
    assert [s["calories"] for s in stats["sessions"]] == [400, 300]
