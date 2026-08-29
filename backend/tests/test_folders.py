def test_default_folder_created_once(client, headers):
    first = client.get("/api/folders", headers=headers).json()
    defaults = [f for f in first if f["is_default"]]
    assert len(defaults) == 1
    assert defaults[0]["name"] == "My Routines"

    # Calling again must not create a second default.
    again = client.get("/api/folders", headers=headers).json()
    assert len([f for f in again if f["is_default"]]) == 1
    assert defaults[0]["id"] == [f for f in again if f["is_default"]][0]["id"]


def test_new_routine_lands_in_default_folder(client, headers):
    folders = client.get("/api/folders", headers=headers).json()
    default_id = next(f["id"] for f in folders if f["is_default"])

    r = client.post("/api/routines", headers=headers, json={
        "name": "Push day", "content": {"exercises": []},
    })
    assert r.status_code == 201
    assert r.json()["folder_id"] == default_id
