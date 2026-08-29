def _log_session(client, headers, exercise_id, sets):
    """Start a workout, log `sets` (list of (weight, reps)) as done, finish."""
    client.post("/api/workouts", headers=headers)
    content = {"exercises": [{
        "exercise_id": exercise_id,
        "name": "Squat",
        "tracking_type": "weight_reps",
        "notes": "",
        "sets": [{"weight": w, "reps": r, "done": True} for (w, r) in sets],
    }]}
    r = client.put("/api/workouts/active", headers=headers, json={"content": content})
    assert r.status_code == 200
    assert client.post("/api/workouts/active/finish", headers=headers).status_code == 200


def test_previous_and_stats_math(client, headers, a_weight_exercise):
    eid = a_weight_exercise
    _log_session(client, headers, eid, [(100, 5), (110, 3)])
    _log_session(client, headers, eid, [(120, 2), (90, 8)])

    prev = client.get(f"/api/workouts/previous?exercise_ids={eid}", headers=headers).json()
    p = prev[eid]
    assert p["best_weight"] == 120
    # best Epley 1RM across all sessions: 90 * (1 + 8/30) = 114.0
    assert p["best_1rm"] == 114.0
    assert len(p["last_sets"]) == 2          # last session's two done sets

    stats = client.get(f"/api/exercises/{eid}/stats", headers=headers).json()
    assert stats["tracking_type"] == "weight_reps"
    assert stats["performed_count"] == 2
    assert stats["heaviest_weight"] == 120
    assert stats["total_volume"] == 100*5 + 110*3 + 120*2 + 90*8
    assert len(stats["sessions"]) == 2


def test_stats_empty_for_unused_exercise(client, headers, a_weight_exercise):
    stats = client.get(f"/api/exercises/{a_weight_exercise}/stats", headers=headers).json()
    assert stats["performed_count"] == 0
    assert stats["sessions"] == []
