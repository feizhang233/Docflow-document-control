import pytest

from tests.helpers import login


URL = "/api/settings/me/columns"


def test_personal_columns_require_authentication(anon_client):
    assert anon_client.get(URL, params={"register": "documents"}).status_code == 401
    assert anon_client.put(URL, params={"register": "documents"}, json={"visibility": {"feedback": False}}).status_code == 401


def test_personal_column_choices_survive_sign_out_and_new_login(client, anon_client):
    initial = client.get(URL, params={"register": "documents"})
    assert initial.status_code == 200
    assert initial.json() == {"register": "documents", "visibility": {}, "column_order": []}
    saved = client.put(URL, params={"register": "documents"}, json={"visibility": {"feedback": False, "document_number": True}, "column_order": ["document_title", "document_number"]})
    assert saved.status_code == 200, saved.text
    assert saved.json() == {"register": "documents", "visibility": {"feedback": False, "document_number": True}, "column_order": ["document_title", "document_number"]}
    assert client.post("/api/auth/logout").status_code == 204
    login(anon_client)
    assert anon_client.get(URL, params={"register": "documents"}).json() == saved.json()


def test_personal_choices_are_isolated_by_account_and_allow_read_only_users(client, anon_client):
    created = client.post("/api/iam/users", json={
        "username": "columnreader", "display_name": "Column Reader", "password": "viewer-password",
        "role_slugs": ["viewer"], "all_projects": False,
        "project_codes": ["NFS"], "read_only_projects": ["NFS"],
    })
    assert created.status_code == 201, created.text
    assert client.put(URL, params={"register": "documents"}, json={"visibility": {"feedback": False}, "column_order": ["document_number", "feedback"]}).status_code == 200
    login(anon_client, "columnreader", "viewer-password")
    assert anon_client.get(URL, params={"register": "documents"}).json()["visibility"] == {}
    assert anon_client.get(URL, params={"register": "documents"}).json()["column_order"] == []
    viewer_headers = {"X-Account-ID": str(created.json()["id"])}
    personal = anon_client.put(URL, params={"register": "documents"}, headers=viewer_headers, json={"visibility": {"feedback": True, "discipline": False}, "column_order": ["feedback", "document_number"]})
    assert personal.status_code == 200, personal.text
    assert anon_client.get(URL, params={"register": "documents"}).json()["visibility"] == {"feedback": True, "discipline": False}
    assert client.get(URL, params={"register": "documents"}).json()["visibility"] == {"feedback": False}
    assert client.get(URL, params={"register": "documents"}).json()["column_order"] == ["document_number", "feedback"]
    assert anon_client.get(URL, params={"register": "documents"}, headers=viewer_headers).json()["column_order"] == ["feedback", "document_number"]
    assert anon_client.put("/api/settings/columns/discipline/visibility", params={"register": "workflow"}, json={"is_visible": False}).status_code == 403


def test_sparse_updates_merge_and_registers_remain_independent(client):
    assert client.put(URL, params={"register": "documents"}, json={"visibility": {"feedback": False}}).status_code == 200
    merged = client.put(URL, params={"register": "documents"}, json={"visibility": {"discipline": False}})
    assert merged.json()["visibility"] == {"feedback": False, "discipline": False}
    restored = client.put(URL, params={"register": "documents"}, json={"visibility": {"feedback": True}})
    assert restored.json()["visibility"] == {"feedback": True, "discipline": False}
    assert client.put(URL, params={"register": "workflow"}, json={"visibility": {"discipline": True}}).status_code == 200
    assert client.put(URL, params={"register": "transmittal"}, json={"visibility": {"workflow_number": False}}).status_code == 200
    assert client.get(URL, params={"register": "documents"}).json()["visibility"] == {"feedback": True, "discipline": False}
    assert client.get(URL, params={"register": "workflow"}).json()["visibility"] == {"discipline": True}
    assert client.get(URL, params={"register": "transmittal"}).json()["visibility"] == {"workflow_number": False}
    assert client.put(URL, params={"register": "documents"}, json={"visibility": {}}).json() == restored.json()


def test_preferences_do_not_change_shared_defaults_or_metadata_backup(client):
    before = client.get("/api/settings/columns").json()
    saved = client.put(URL, params={"register": "documents"}, json={"visibility": {"feedback": False}, "column_order": ["feedback", "document_title"]})
    assert saved.status_code == 200
    assert client.get("/api/settings/columns").json() == before
    backup = client.get("/api/metadata/export").json()
    assert "user_column_preferences" not in backup
    assert all("visibility" not in column for column in backup["column_configs"])
    assert client.post("/api/settings/columns/reset").status_code == 200
    assert client.get(URL, params={"register": "documents"}).json() == saved.json()


@pytest.mark.parametrize("visibility", [
    {"unknown": False}, {"number_of_documents": False}, {"project_code": False},
    {"feedback": "false"}, {"feedback": 0}, {"feedback": None}, [], None,
])
def test_invalid_column_preference_payloads_are_rejected(client, visibility):
    response = client.put(URL, params={"register": "documents"}, json={"visibility": visibility})
    assert response.status_code == 422, response.text
    assert client.get(URL, params={"register": "documents"}).json()["visibility"] == {}


def test_client_cannot_choose_another_account(client):
    response = client.put(URL, params={"register": "documents"}, json={"visibility": {"feedback": False}, "user_id": 999})
    assert response.status_code == 422
    assert client.get(URL, params={"register": "documents"}).json()["visibility"] == {}


def test_expected_account_guard_rejects_stale_reads_and_writes(client):
    account_id = client.get("/api/auth/me").json()["id"]
    matching = {"X-Account-ID": str(account_id)}
    mismatched = {"X-Account-ID": str(account_id + 100)}
    original = client.put(URL, params={"register": "documents"}, headers=matching, json={"visibility": {"feedback": False}, "column_order": ["document_title", "feedback"]})
    assert original.status_code == 200, original.text
    rejected_read = client.get(URL, params={"register": "documents"}, headers=mismatched)
    assert rejected_read.status_code == 409
    assert "Reload this page" in rejected_read.json()["detail"]
    assert "visibility" not in rejected_read.json() and "column_order" not in rejected_read.json()
    rejected_write = client.put(URL, params={"register": "documents"}, headers=mismatched, json={"visibility": {"feedback": True}, "column_order": []})
    assert rejected_write.status_code == 409
    assert client.get(URL, params={"register": "documents"}, headers=matching).json() == original.json()


@pytest.mark.parametrize("account_id", ["other-account", "1.5"])
def test_expected_account_header_requires_an_integer(client, account_id):
    headers = {"X-Account-ID": account_id}
    assert client.get(URL, params={"register": "documents"}, headers=headers).status_code == 422
    assert client.put(URL, params={"register": "documents"}, headers=headers, json={"column_order": ["feedback"]}).status_code == 422
    assert client.get(URL, params={"register": "documents"}).json() == {"register": "documents", "visibility": {}, "column_order": []}


@pytest.mark.parametrize("register", ["invalid", "", "Documents"])
def test_invalid_registers_are_rejected(client, register):
    assert client.get(URL, params={"register": register}).status_code == 422
    assert client.put(URL, params={"register": register}, json={"visibility": {"feedback": False}}).status_code == 422


def test_register_is_required(client):
    assert client.get(URL).status_code == 422
    assert client.put(URL, json={"visibility": {"feedback": False}}).status_code == 422


def test_order_and_visibility_can_be_saved_independently_and_reset(client):
    visibility = {"feedback": False, "discipline": False}
    first = client.put(URL, params={"register": "documents"}, json={"visibility": visibility})
    assert first.status_code == 200
    ordered = client.put(URL, params={"register": "documents"}, json={"column_order": ["feedback", "document_title"]})
    assert ordered.status_code == 200, ordered.text
    assert ordered.json() == {"register": "documents", "visibility": visibility, "column_order": ["feedback", "document_title"]}
    updated = client.put(URL, params={"register": "documents"}, json={"visibility": {"feedback": True}})
    assert updated.status_code == 200
    assert updated.json()["column_order"] == ["feedback", "document_title"]
    assert updated.json()["visibility"] == {"feedback": True, "discipline": False}
    reset = client.put(URL, params={"register": "documents"}, json={"column_order": []})
    assert reset.status_code == 200
    assert reset.json()["column_order"] == []
    assert reset.json()["visibility"] == updated.json()["visibility"]


def test_order_is_independent_for_each_register(client):
    for register, order in [
        ("documents", ["document_title", "document_number"]),
        ("workflow", ["feedback", "workflow_number"]),
        ("transmittal", ["transmittal_number", "document_title"]),
    ]:
        response = client.put(URL, params={"register": register}, json={"column_order": order})
        assert response.status_code == 200, response.text
        assert response.json() == {"register": register, "visibility": {}, "column_order": order}
    assert client.get(URL, params={"register": "documents"}).json()["column_order"] == ["document_title", "document_number"]
    assert client.get(URL, params={"register": "workflow"}).json()["column_order"] == ["feedback", "workflow_number"]
    assert client.get(URL, params={"register": "transmittal"}).json()["column_order"] == ["transmittal_number", "document_title"]


@pytest.mark.parametrize("order", [
    ["feedback", "feedback"], ["unknown"], ["number_of_documents"], ["project_code"],
    ["feedback"] * 11, [1], [True], "feedback", {}, None,
])
def test_invalid_column_orders_are_rejected_without_changing_preferences(client, order):
    expected = client.put(URL, params={"register": "documents"}, json={"visibility": {"feedback": False}, "column_order": ["discipline"]}).json()
    response = client.put(URL, params={"register": "documents"}, json={"column_order": order, "visibility": {"feedback": True}})
    assert response.status_code == 422, response.text
    assert client.get(URL, params={"register": "documents"}).json() == expected


@pytest.mark.parametrize("patch", [{}, {"visibility": None, "column_order": []}, {"visibility": {}, "column_order": None}])
def test_sparse_patch_requires_a_non_null_setting(client, patch):
    assert client.put(URL, params={"register": "documents"}, json=patch).status_code == 422


def test_simultaneous_sparse_patches_preserve_all_columns(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    from app.db.base import Base
    from app.models.iam import User
    from app.schemas.column_preferences import ColumnPreferencesUpdate
    from app.services.column_preferences_service import ColumnPreferencesService

    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'column-preferences.db'}")
    Base.metadata.create_all(engine)
    try:
        with Session(engine) as db:
            user = User(username="concurrent", display_name="Concurrent", password_hash="unused")
            db.add(user)
            db.commit()
            user_id = user.id

        fields = ["feedback", "document_number", "discipline", "workflow_number"]
        for visibility, order in [(False, ["document_number", "feedback"]), (True, ["feedback", "document_number"])]:
            patches = [{"visibility": {field: visibility}} for field in fields] + [{"column_order": order}]
            ready = Barrier(len(patches))

            def save(patch):
                with Session(engine) as db:
                    ready.wait(timeout=5)
                    return ColumnPreferencesService(db).update(user_id, "documents", ColumnPreferencesUpdate(**patch))

            with ThreadPoolExecutor(max_workers=len(patches)) as workers:
                list(workers.map(save, patches))
            with Session(engine) as db:
                saved = ColumnPreferencesService(db).read(user_id, "documents")
                assert saved["visibility"] == dict.fromkeys(fields, visibility)
                assert saved["column_order"] == order
    finally:
        engine.dispose()
