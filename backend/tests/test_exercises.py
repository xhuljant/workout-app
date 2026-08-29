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
