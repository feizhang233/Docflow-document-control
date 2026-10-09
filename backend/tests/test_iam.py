from app.core.iam_catalog import MIN_PASSWORD_LENGTH
from tests.helpers import ADMIN_USERNAME, GUEST_PASSWORD, GUEST_USERNAME, login


def test_unauthenticated_ui_routes_are_rejected(anon_client):
    assert anon_client.get("/api/packages").status_code == 401
    assert anon_client.get("/api/settings/projects").status_code == 401
    assert anon_client.get("/api/settings/workflow").status_code == 401
    assert anon_client.get("/api/notifications").status_code == 401
    assert anon_client.get("/api/iam/users").status_code == 401
    assert anon_client.get("/api/health").status_code == 200


def test_per_project_read_only_limits_every_document_mutation(client, anon_client):
    from tests.test_packages import payload
    nfs = client.post("/api/packages", json=payload("NFS-READ")).json()
    fst = client.post("/api/packages", json=payload("FST-EDIT") | {"project_code": "FST"}).json()
    user = client.post("/api/iam/users", json={
        "username": "mixedscope", "display_name": "Mixed access", "password": "controller-pass",
        "role_slugs": ["document_controller"], "all_projects": False,
        "project_codes": ["NFS", "FST"], "read_only_projects": ["NFS"],
    })
    assert user.status_code == 201, user.text
    assert user.json()["read_only_projects"] == ["NFS"]
    login(anon_client, "mixedscope", "controller-pass")
    assert anon_client.get(f"/api/packages/{nfs['id']}/workflow-comments").status_code == 200
    assert anon_client.patch(f"/api/packages/{nfs['id']}", json={"notes": "blocked"}).status_code == 403
    assert anon_client.delete(f"/api/packages/{nfs['id']}").status_code == 403
    assert anon_client.post(f"/api/packages/{nfs['id']}/duplicate").status_code == 403
    assert anon_client.post("/api/packages", json=payload("NEW-READ")).status_code == 403
    assert anon_client.post("/api/packages/reorder", json={"package_ids": [nfs["id"], fst["id"]]}).status_code == 403
    assert anon_client.patch(f"/api/packages/{fst['id']}", json={"project_code": "NFS"}).status_code == 403
    assert anon_client.patch(f"/api/packages/{fst['id']}", json={"notes": "allowed"}).status_code == 200
    assert anon_client.post("/api/packages", json=payload("NEW-EDIT") | {"project_code": "FST"}).status_code == 201
    assert anon_client.post("/api/settings/columns/reset").status_code == 403
    assert anon_client.post("/api/metadata/import-csv", json={"rows": []}).status_code == 403
    assert anon_client.post("/api/email-subscriptions", json={"project_code": "NFS", "email": "a@example.com"}).status_code == 201


def test_project_override_validation_and_role_cap(client, anon_client):
    request = {"username": "scopevalid", "display_name": "Scope", "password": "viewer-password", "role_slugs": ["viewer"], "all_projects": False, "project_codes": ["NFS"]}
    assert client.post("/api/iam/users", json=request | {"read_only_projects": ["FST"]}).status_code == 422
    assert client.post("/api/iam/users", json=request | {"read_only_projects": ["UNKNOWN"]}).status_code == 422
    result = client.post("/api/iam/users", json=request)
    assert result.status_code == 201
    login(anon_client, "scopevalid", "viewer-password")
    assert anon_client.post("/api/packages", json={}).status_code == 403
    promoted = client.patch(f"/api/iam/users/{result.json()['id']}", json={"role_slugs": ["admin"]})
    assert promoted.status_code == 200
    assert promoted.json()["all_projects"] is True
    assert promoted.json()["read_only_projects"] == []


def test_project_rename_keeps_access_and_subscriptions(client, anon_client):
    from tests.test_packages import payload
    user = client.post("/api/iam/users", json={"username": "renameuser", "display_name": "Rename", "password": "viewer-password", "role_slugs": ["viewer"], "all_projects": False, "project_codes": ["NFS"], "read_only_projects": ["NFS"]}).json()
    client.post("/api/packages", json=payload())
    subscription = client.post("/api/email-subscriptions", json={"project_code": "NFS", "email": "a@example.com"}).json()
    projects = client.get("/api/settings/projects").json()["projects"]
    changed = [{"id": item["id"], "code": "MAIN" if item["code"] == "NFS" else item["code"], "name": item["name"]} for item in projects]
    assert client.put("/api/settings/projects", json={"projects": changed}).status_code == 200
    saved = next(item for item in client.get("/api/iam/users").json()["items"] if item["id"] == user["id"])
    assert saved["project_codes"] == ["MAIN"] and saved["read_only_projects"] == ["MAIN"]
    assert next(item for item in client.get("/api/email-subscriptions").json()["items"] if item["id"] == subscription["id"])["project_code"] == "MAIN"
    login(anon_client, "renameuser", "viewer-password")
    assert anon_client.get("/api/packages", params={"period": "all"}).json()["total"] == 1


def test_project_code_swap_preserves_project_membership(client):
    from tests.test_packages import payload
    nfs = client.post("/api/packages", json=payload("NFS-SWAP")).json()
    fst = client.post("/api/packages", json=payload("FST-SWAP") | {"project_code": "FST"}).json()
    first = client.post("/api/email-subscriptions", json={"project_code": "NFS", "email": "same@example.com"}).json()
    second = client.post("/api/email-subscriptions", json={"project_code": "FST", "email": "same@example.com"}).json()
    projects = client.get("/api/settings/projects").json()["projects"]
    swapped = [{"id": item["id"], "code": {"NFS": "FST", "FST": "NFS"}.get(item["code"], item["code"]), "name": item["name"]} for item in projects]
    result = client.put("/api/settings/projects", json={"projects": swapped})
    assert result.status_code == 200, result.text
    assert client.get(f"/api/packages/{nfs['id']}").json()["project_code"] == "FST"
    assert client.get(f"/api/packages/{fst['id']}").json()["project_code"] == "NFS"
    subscriptions = {item["id"]: item for item in client.get("/api/email-subscriptions").json()["items"]}
    assert subscriptions[first["id"]]["project_code"] == "FST"
    assert subscriptions[second["id"]]["project_code"] == "NFS"


def test_external_api_key_can_read_workflow_settings(anon_client):
    denied = anon_client.get("/api/external/settings/workflow", headers={"X-API-Key": "wrong"})
    assert denied.status_code == 401
    allowed = anon_client.get("/api/external/settings/workflow", headers={"X-API-Key": "test-external-key"})
    assert allowed.status_code == 200
    assert allowed.json()["feedback_reviewers"] == ["UTIBER", "GDS"]


def test_login_accepts_long_email(client, anon_client):
    email = "document.controller.long.name@example-project.example"
    assert len(email) > 32
    created = client.post("/api/iam/users", json={
        "username": "longmail",
        "display_name": "Long Email",
        "email": email,
        "password": "viewer-pass-1",
        "role_slugs": ["viewer"],
        "all_projects": True,
    })
    assert created.status_code == 201, created.text
    login(anon_client, email, "viewer-pass-1")
    me = anon_client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["username"] == "longmail"


def test_project_scoped_user_cannot_clear_other_project_notifications(client, anon_client):
    from tests.test_packages import payload
    nfs = client.post("/api/packages", json=payload("NFS-NOTE-001")).json()
    client.patch(f"/api/packages/{nfs['id']}", json={"workflow_terminated": True})
    created = client.post("/api/iam/users", json={
        "username": "fstnotify",
        "display_name": "FST Notify",
        "password": "editor-pass-1",
        "role_slugs": ["editor"],
        "all_projects": False,
        "project_codes": ["FST"],
    })
    assert created.status_code == 201, created.text
    login(anon_client, "fstnotify", "editor-pass-1")
    assert anon_client.get("/api/notifications").json()["items"] == []
    assert anon_client.delete("/api/notifications").status_code == 204
    remaining = client.get("/api/notifications").json()
    assert remaining["items"]
    assert remaining["items"][0]["package_id"] == nfs["id"]


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
