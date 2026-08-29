PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="


def test_measurement_crud_and_trash(client, headers):
    r = client.post("/api/measurements", headers=headers, json={
        "measured_on": "2026-08-01",
        "values": {"bodyweight": 80.0, "waist": 84.0},
        "photos": [PNG],
    })
    assert r.status_code == 201, r.text
    entry = r.json()
    assert entry["photo_count"] == 1

    # List omits the photo blobs but keeps the count.
    lst = client.get("/api/measurements", headers=headers).json()
    assert len(lst) == 1
    assert "photos" not in lst[0]
    assert lst[0]["photo_count"] == 1

    # Full GET returns the photos.
    full = client.get(f"/api/measurements/{entry['id']}", headers=headers).json()
    assert full["photos"] == [PNG]

    # PUT replaces values + photos wholesale.
    r = client.put(f"/api/measurements/{entry['id']}", headers=headers, json={
        "measured_on": "2026-08-01", "values": {"bodyweight": 79.0}, "photos": [],
    })
    assert r.status_code == 200
    assert r.json()["values"] == {"bodyweight": 79.0}
    assert r.json()["photo_count"] == 0

    # Delete is soft + restorable from Trash.
    assert client.delete(f"/api/measurements/{entry['id']}", headers=headers).status_code == 204
    assert client.get("/api/measurements", headers=headers).json() == []

    trash = client.get("/api/measurements/trash", headers=headers).json()
    assert [t["id"] for t in trash] == [entry["id"]]

    assert client.post(f"/api/measurements/{entry['id']}/restore", headers=headers).status_code == 200
    assert len(client.get("/api/measurements", headers=headers).json()) == 1
