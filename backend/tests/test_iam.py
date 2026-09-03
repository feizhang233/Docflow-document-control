from app.core.iam_catalog import MIN_PASSWORD_LENGTH
from tests.helpers import ADMIN_USERNAME, GUEST_PASSWORD, GUEST_USERNAME, login


def test_unauthenticated_ui_routes_are_rejected(anon_client):
    assert anon_client.get("/api/packages").status_code == 401
    assert anon_client.get("/api/settings/projects").status_code == 401
    assert anon_client.get("/api/settings/workflow").status_code == 401
    assert anon_client.get("/api/notifications").status_code == 401
    assert anon_client.get("/api/iam/users").status_code == 401
    assert anon_client.get("/api/health").status_code == 200


def test_external_api_key_can_read_workflow_settings(anon_client):
    denied = anon_client.get("/api/external/settings/workflow", headers={"X-API-Key": "wrong"})
    assert denied.status_code == 401
    allowed = anon_client.get("/api/external/settings/workflow", headers={"X-API-Key": "test-external-key"})
    assert allowed.status_code == 200
    assert allowed.json()["feedback_reviewers"] == ["UTIBER", "GDS"]


def test_login_me_and_logout(anon_client):
    failed = anon_client.post("/api/auth/login", json={"username": ADMIN_USERNAME, "password": "wrong-password-1"})
    assert failed.status_code == 401
    login(anon_client)
    me = anon_client.get("/api/auth/me")
    assert me.status_code == 200
    body = me.json()
    assert body["username"] == ADMIN_USERNAME
    assert "iam:write" in body["permissions"]
    assert body["all_projects"] is True
    assert anon_client.post("/api/auth/logout").status_code == 204
    assert anon_client.get("/api/auth/me").status_code == 401


def test_viewer_cannot_mutate_documents(client, anon_client):
    created = client.post("/api/iam/users", json={
        "username": "reader",
        "display_name": "Read Only",
        "password": "viewer-pass-1",
        "role_slugs": ["viewer"],
        "all_projects": True,
    })
    assert created.status_code == 201, created.text
    login(anon_client, "reader", "viewer-pass-1")
    denied = anon_client.post("/api/packages", json={
        "document_number": "DOC-IAM-001",
        "document_title": "Secret",
        "document_date": "2026-08-24",
        "document_type": "Drawing",
        "initiator": "Ana",
        "discipline": "Civil",
        "number_of_documents": 1,
    })
    assert denied.status_code == 403
    listed = anon_client.get("/api/packages", params={"period": "all"})
    assert listed.status_code == 200
    assert anon_client.put("/api/settings/workflow", json={
        "submission_steps": ["Transmittal Preparation","DCO Backup","Workflow Prepare","Email Feedback"],
        "feedback_reviewers": ["UTIBER","GDS"],
        "feedback_status_labels": {"A":"Approved","B":"Approved with comments","C":"Rejected","P":"Pending"},
        "feedback_status_colors": {"A":"#21815d","B":"#9b6816","C":"#b13f4c","P":"#4267bd"},
        "transmittal_prefixes": ["NFS-PCH-TRA-PZI-"],
    }).status_code == 403
    assert anon_client.get("/api/iam/users").status_code == 403


def test_project_scope_hides_other_projects(client, anon_client):
    from tests.test_packages import payload
    client.post("/api/packages", json=payload("NFS-DOC-001"))
    client.post("/api/packages", json=payload("FST-DOC-001") | {"project_code": "FST"})
    created = client.post("/api/iam/users", json={
        "username": "fstonly",
        "display_name": "Fire Station Editor",
        "password": "editor-pass-1",
        "role_slugs": ["editor"],
        "all_projects": False,
        "project_codes": ["FST"],
    })
    assert created.status_code == 201, created.text
    login(anon_client, "fstonly", "editor-pass-1")
    visible = anon_client.get("/api/packages", params={"period": "all"}).json()
    assert visible["total"] == 1
    assert visible["items"][0]["project_code"] == "FST"
    assert anon_client.get("/api/packages", params={"period": "all", "project_code": "NFS"}).status_code == 403
    assert anon_client.get("/api/packages/transmittals", params={"project_code": "NFS"}).status_code == 403
    fst_transmittals = anon_client.get("/api/packages/transmittals", params={"project_code": "FST"})
    assert fst_transmittals.status_code == 200, fst_transmittals.text
    projects = anon_client.get("/api/settings/projects").json()["projects"]
    assert [item["code"] for item in projects] == ["FST"]
    blocked = anon_client.post("/api/packages", json=payload("NFS-DOC-002"))
    assert blocked.status_code == 403
    allowed = anon_client.post("/api/packages", json=payload("FST-DOC-002") | {"project_code": "FST"})
    assert allowed.status_code == 201


def test_cannot_remove_last_admin(client):
    me = client.get("/api/auth/me").json()
    response = client.patch(f"/api/iam/users/{me['id']}", json={"role_slugs": ["viewer"]})
    assert response.status_code == 400
    assert "last active administrator" in response.json()["detail"]


def test_password_change_and_reset(client, anon_client):
    created = client.post("/api/iam/users", json={
        "username": "changeme",
        "display_name": "Change Me",
        "password": "initial-pass-1",
        "role_slugs": ["viewer"],
        "must_change_password": True,
    }).json()
    assert created["must_change_password"] is True
    login(anon_client, "changeme", "initial-pass-1")
    changed = anon_client.post("/api/auth/change-password", json={
        "current_password": "initial-pass-1",
        "new_password": "rotated-pass-1",
    })
    assert changed.status_code == 200
    assert changed.json()["must_change_password"] is False
    reset = client.post(f"/api/iam/users/{created['id']}/reset-password", json={"password": "reset-pass-12", "must_change_password": True})
    assert reset.status_code == 200
    assert anon_client.get("/api/auth/me").status_code == 401
    login(anon_client, "changeme", "reset-pass-12")
    assert anon_client.get("/api/auth/me").json()["must_change_password"] is True


def test_guest_is_read_only_and_password_locked(client, anon_client):
    login(anon_client, GUEST_USERNAME, GUEST_PASSWORD)
    me = anon_client.get("/api/auth/me")
    assert me.status_code == 200
    body = me.json()
    assert body["username"] == GUEST_USERNAME
    assert body["display_name"] == "Guest"
    assert body["password_locked"] is True
    assert body["must_change_password"] is False
    assert body["all_projects"] is True
    assert "packages:read" in body["permissions"]
    assert "notifications:read" in body["permissions"]
    assert "packages:write" not in body["permissions"]
    assert "iam:read" not in body["permissions"]
    assert "iam:write" not in body["permissions"]
    assert [role["slug"] for role in body["roles"]] == ["viewer"]
    listed = anon_client.get("/api/packages", params={"period": "all"})
    assert listed.status_code == 200
    denied_write = anon_client.post("/api/packages", json={
        "document_number": "DOC-GUEST-001",
        "document_title": "Guest write",
        "document_date": "2026-09-03",
        "document_type": "Drawing",
        "initiator": "Ana",
        "discipline": "Civil",
        "number_of_documents": 1,
    })
    assert denied_write.status_code == 403
    assert anon_client.get("/api/iam/users").status_code == 403
    denied_password = anon_client.post("/api/auth/change-password", json={
        "current_password": GUEST_PASSWORD,
        "new_password": "guest-new-password",
    })
    assert denied_password.status_code == 400
    assert "cannot be changed" in denied_password.json()["detail"]
    reset = client.post(f"/api/iam/users/{body['id']}/reset-password", json={"password": "reset-pass-12", "must_change_password": True})
    assert reset.status_code == 400
    assert "cannot be changed" in reset.json()["detail"]
    promoted = client.patch(f"/api/iam/users/{body['id']}", json={"role_slugs": ["admin"]})
    assert promoted.status_code == 400
    assert "Guest account roles cannot be changed" in promoted.json()["detail"]
    login(anon_client, GUEST_USERNAME, GUEST_PASSWORD)
    still_guest = anon_client.get("/api/auth/me").json()
    assert still_guest["password_locked"] is True
    assert [role["slug"] for role in still_guest["roles"]] == ["viewer"]


def test_short_password_rejected(client):
    response = client.post("/api/iam/users", json={
        "username": "shortpw",
        "display_name": "Short",
        "password": "short",
        "role_slugs": ["viewer"],
    })
    assert response.status_code == 422
    assert MIN_PASSWORD_LENGTH >= 10
