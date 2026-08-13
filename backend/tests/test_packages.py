from datetime import date

from app.repositories.package_repository import period_bounds
from app.schemas.package import FEEDBACK_STEPS, SUBMISSION_STEPS

def test_calendar_period_bounds():
    assert period_bounds("week", date(2024, 1, 2)) == (date(2024, 1, 1), date(2024, 1, 8))
    assert period_bounds("week", date(2024, 1, 5)) == (date(2024, 1, 1), date(2024, 1, 8))
    assert period_bounds("month", date(2024, 2, 20)) == (date(2024, 2, 1), date(2024, 3, 1))
    assert period_bounds("month", date(2024, 12, 20)) == (date(2024, 12, 1), date(2025, 1, 1))
    assert period_bounds("year", date(2024, 7, 1)) == (date(2024, 1, 1), date(2025, 1, 1))

def payload(number="DOC-CIV-001"):
    return {"document_number":number,"document_title":"Foundation layout","document_date":"2026-07-11","document_type":"Drawing","initiator":"Ana Petrović","discipline":"Civil","number_of_documents":4,"transmittal_number":"TR-001","workflow_number":"WF-001","submission_progress":{s:False for s in SUBMISSION_STEPS},"feedback":{s:False for s in FEEDBACK_STEPS},"order_index":0}

def test_package_crud(client):
    created=client.post("/api/packages",json=payload()).json()
    assert created["project_code"] == "NFS"
    assert created["document_number"]=="DOC-CIV-001"
    assert created["document_title"] == "Foundation layout"
    assert created["document_date"]=="2026-07-11"
    assert set(created["feedback"]) == {"UTIBER", "GDS", "Terminate"}
    assert created["feedback_status"] == {"UTIBER":"P", "GDS":"P"}
    response=client.get("/api/packages",params={"period":"all","search":"Foundation layout"})
    assert response.status_code==200 and response.json()["total"]==1
    updated=client.patch(f"/api/packages/{created['id']}",json={"number_of_documents":9})
    assert updated.json()["number_of_documents"]==9
    assert client.delete(f"/api/packages/{created['id']}").status_code==204

def test_project_assignment_and_register_filtering(client):
    nfs = client.post("/api/packages", json=payload("NFS-DOC-001")).json()
    fst_payload = payload("FST-DOC-001") | {"project_code":"FST", "transmittal_number":"FST-PCH-TRA-RPT-001"}
    fbp_payload = payload("FBP-DOC-001") | {"project_code":"FBP", "transmittal_number":"FBP-PCH-TRA-RPT-001"}
    fst = client.post("/api/packages", json=fst_payload).json()
    fbp = client.post("/api/packages", json=fbp_payload).json()

    assert nfs["project_code"] == "NFS"
    assert fst["project_code"] == "FST"
    assert fbp["project_code"] == "FBP"
    assert client.get("/api/packages", params={"period":"all"}).json()["total"] == 3
    fst_items = client.get("/api/packages", params={"period":"all", "project_code":"FST"}).json()
    assert fst_items["total"] == 1
    assert fst_items["items"][0]["document_number"] == "FST-DOC-001"
    assert client.get("/api/packages", params={"period":"all", "project_code":"OTHER"}).status_code == 422

    duplicated = client.post(f"/api/packages/{fst['id']}/duplicate").json()
    assert duplicated["project_code"] == "FST"

def test_duplicate_document_number_allowed_for_revisions(client):
    first = client.post("/api/packages", json=payload()).json()
    second = client.post("/api/packages", json=payload())
    assert second.status_code == 201, second.text
    assert second.json()["document_number"] == first["document_number"]
    assert second.json()["id"] != first["id"]
    items = client.get("/api/packages", params={"period":"all","search":"DOC-CIV-001"}).json()
    assert items["total"] == 2

def test_reorder(client):
    first=client.post("/api/packages",json=payload("DOC-001")).json()
    second=client.post("/api/packages",json=payload("DOC-002")).json()
    assert client.post("/api/packages/reorder",json={"package_ids":[second["id"],first["id"]]}).status_code==204
    items=client.get("/api/packages",params={"period":"all"}).json()["items"]
    assert [i["id"] for i in items]==[second["id"],first["id"]]

def test_register_sorting_and_transmittal_prefix_filter(client):
    older = payload("DOC-OLDER")
    older.update({"document_date":"2026-07-01", "workflow_number":"WF-002", "transmittal_number":"NFS-PCH-TRA-RFI-002"})
    newer = payload("DOC-NEWER")
    newer.update({"document_date":"2026-07-12", "workflow_number":"WF-001", "transmittal_number":"NFS-PCH-TRA-PZI-001"})
    client.post("/api/packages", json=older)
    client.post("/api/packages", json=newer)

    documents = client.get("/api/packages", params={"period":"all", "sort_by":"document_date", "sort_order":"desc"}).json()["items"]
    workflows = client.get("/api/packages", params={"period":"all", "sort_by":"workflow_number", "sort_order":"asc"}).json()["items"]
    filtered = client.get("/api/packages", params={"period":"all", "transmittal_prefix":"NFS-PCH-TRA-RFI-"}).json()

    assert [item["document_number"] for item in documents] == ["DOC-NEWER", "DOC-OLDER"]
    assert [item["workflow_number"] for item in workflows] == ["WF-001", "WF-002"]
    assert filtered["total"] == 1 and filtered["items"][0]["document_number"] == "DOC-OLDER"

def test_duplicate_and_lifecycle_metadata(client):
    created=client.post("/api/packages",json=payload()).json()
    duplicate=client.post(f"/api/packages/{created['id']}/duplicate")
    assert duplicate.status_code==201
    assert duplicate.json()["document_number"]=="DOC-CIV-001-COPY"
    assert duplicate.json()["project_code"]=="NFS"
    assert duplicate.json()["workflow_number"] is None
    updated=client.patch(f"/api/packages/{created['id']}",json={"notes":"Stopped by client instruction.","has_attachment":True,"is_abandoned":True,"workflow_terminated":True})
    assert updated.status_code==200
    assert updated.json()["has_attachment"] is True and updated.json()["is_abandoned"] is True

def test_column_config_and_metadata_backup(client):
    client.post("/api/packages", json=payload())
    configs = client.get("/api/settings/columns").json()
    assert len(configs) == 0  # migrations seed production defaults; test creates one below

    from app.models.column_config import ColumnConfig
    from conftest import TestingSession
    with TestingSession() as db:
        db.add(ColumnConfig(field_name="discipline", display_name="Discipline", input_type="text", options=[])); db.commit()
    changed = client.put("/api/settings/columns/discipline", json={"input_type":"select","options":["Civil","Civil","Rail"]})
    assert changed.status_code == 200 and changed.json()["options"] == ["Civil","Rail"]
    layout = client.put("/api/settings/columns/discipline", json={
        "display_name":"Trade", "is_visible":False, "column_width":180,
        "input_type":"select", "options":["Civil","Rail"],
    })
    assert layout.status_code == 200
    assert layout.json()["display_name"] == "Trade"
    assert layout.json()["is_visible"] is False and layout.json()["column_width"] == 180
    workflow_visibility = client.put("/api/settings/columns/discipline/visibility?register=workflow", json={"is_visible":False})
    transmittal_visibility = client.put("/api/settings/columns/discipline/visibility?register=transmittal", json={"is_visible":False})
    assert workflow_visibility.status_code == 200 and workflow_visibility.json()["is_visible_workflow"] is False
    assert transmittal_visibility.status_code == 200 and transmittal_visibility.json()["is_visible_transmittal"] is False
    assert transmittal_visibility.json()["display_name"] == "Trade"  # Visibility-only endpoint does not edit labels.
    # Column drag can submit fractional widths; API must round instead of 422.
    fractional = client.put("/api/settings/columns/discipline", json={
        "display_name":"Trade", "is_visible":False, "column_width":183.5,
        "input_type":"select", "options":["Civil","Rail"],
    })
    assert fractional.status_code == 200, fractional.text
    assert fractional.json()["column_width"] == 184
    reset = client.post("/api/settings/columns/reset")
    assert reset.status_code == 200 and len(reset.json()) == 11
    discipline = next(item for item in reset.json() if item["field_name"] == "discipline")
    assert discipline["display_name"] == "Discipline"
    assert discipline["is_visible"] is True and discipline["column_width"] == 110
    assert discipline["is_visible_workflow"] is True and discipline["is_visible_transmittal"] is True
    document_type = next(item for item in reset.json() if item["field_name"] == "document_type")
    assert document_type["option_colors"]["Drawing"] == "#3164ce"
    backup = client.get("/api/metadata/export")
    assert backup.status_code == 200 and backup.json()["packages"][0]["document_number"] == "DOC-CIV-001"
    assert backup.json()["packages"][0]["project_code"] == "NFS"
    result = client.post("/api/metadata/import?mode=replace", json=backup.json())
    assert result.status_code == 200 and result.json()["packages_created"] == 1

def test_csv_import_appends_and_replaces_documents(client):
    original = client.post("/api/packages", json=payload()).json()
    merged = client.post("/api/metadata/import-csv?mode=merge", json={"rows":[
        {"document_number":"DOC-CIV-001","initiator":"CSV owner","has_attachment":True},
        {"document_number":"DOC-CSV-002","document_title":"CSV title","document_date":"2026-07-12","document_type":"Drawing","discipline":"Civil","number_of_documents":2,"notes":"Imported from CSV"},
    ]})
    assert merged.status_code == 200, merged.text
    assert merged.json()["packages_created"] == 2 and merged.json()["packages_updated"] == 0
    # Original row is unchanged; merge always appends (revisions may share document numbers).
    original_after = client.get(f"/api/packages/{original['id']}").json()
    assert original_after["initiator"] == "Ana Petrović"
    assert client.get("/api/packages", params={"period":"all"}).json()["total"] == 3
    imported = client.get("/api/packages", params={"period":"all","search":"DOC-CSV-002"}).json()["items"][0]
    assert imported["document_title"] == "CSV title"
    assert imported["notes"] == "Imported from CSV" and not any(imported["submission_progress"].values())
    replaced = client.post("/api/metadata/import-csv?mode=replace", json={"rows":[{"document_number":"DOC-REPLACED","number_of_documents":1}]})
    assert replaced.status_code == 200 and replaced.json()["packages_created"] == 1
    assert client.get("/api/packages", params={"period":"all"}).json()["total"] == 1

def test_csv_import_accepts_empty_and_slash_dates(client):
    result = client.post("/api/metadata/import-csv?mode=merge", json={"rows":[
        {"document_number":"DOC-EMPTY-DATE","document_date":"","document_type":"Drawing","initiator":"","discipline":""},
        {"document_number":"DOC-SLASH-DATE","document_date":"12/07/2026","document_type":"Report"},
    ]})
    assert result.status_code == 200, result.text
    assert result.json()["packages_created"] == 2
    empty = client.get("/api/packages", params={"period":"all","search":"DOC-EMPTY-DATE"}).json()["items"][0]
    slash = client.get("/api/packages", params={"period":"all","search":"DOC-SLASH-DATE"}).json()["items"][0]
    assert empty["document_type"] == "Drawing"
    assert slash["document_date"] == "2026-07-12"

def test_csv_import_supports_projects_and_defaults_to_nfs(client):
    result = client.post("/api/metadata/import-csv?mode=replace", json={"rows":[
        {"document_number":"FST-CSV-001", "project_code":"FST"},
        {"document_number":"LEGACY-CSV-001"},
    ]})
    assert result.status_code == 200, result.text
    items = client.get("/api/packages", params={"period":"all", "sort_by":"document_number"}).json()["items"]
    assert {item["document_number"]:item["project_code"] for item in items} == {
        "FST-CSV-001":"FST",
        "LEGACY-CSV-001":"NFS",
    }

def test_csv_import_keeps_duplicate_document_numbers_as_separate_rows(client):
    """Same document_number in one CSV = separate revisions, not collapsed."""
    result = client.post("/api/metadata/import-csv?mode=replace", json={"rows":[
        {"document_number":"NFS-PCH-MST-MEP-PB-002","document_date":"2026-02-10","document_type":"MS","initiator":"First","discipline":"Plumbing","notes":"first revision","workflow_number":"WF-000704"},
        {"document_number":"NFS-PCH-MST-MEP-PB-002","document_date":"2026-02-10","document_type":"MS","initiator":"王亮","discipline":"Plumbing","notes":"second revision","has_attachment":True,"workflow_number":"WF-000705"},
        {"document_number":"DOC-OTHER-001","document_type":"Drawing"},
    ]})
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["packages_created"] == 3
    assert body["packages_updated"] == 0
    items = client.get("/api/packages", params={"period":"all"}).json()
    assert items["total"] == 3
    revisions = client.get("/api/packages", params={"period":"all","search":"NFS-PCH-MST-MEP-PB-002"}).json()["items"]
    assert len(revisions) == 2
    notes = {row["notes"] for row in revisions}
    assert notes == {"first revision", "second revision"}
    workflows = {row["workflow_number"] for row in revisions}
    assert workflows == {"WF-000704", "WF-000705"}

def test_workflow_configuration_reorders_and_remaps_existing_data(client):
    data = payload()
    data["submission_progress"][SUBMISSION_STEPS[0]] = True
    data["feedback"]["UTIBER"] = True
    data["feedback_status"] = {"UTIBER":"A", "GDS":"P"}
    created = client.post("/api/packages", json=data).json()
    current = client.get("/api/settings/workflow")
    assert current.status_code == 200
    assert current.json()["submission_steps"][1] == "DCO Backup"
    assert current.json()["transmittal_prefixes"] == ["NFS-PCH-TRA-PZI-", "NFS-PCH-TRA-RFI-", "NFS-PCH-TRA-RPT-"]
    changed = client.put("/api/settings/workflow", json={
        "submission_steps":["Preparation","Backup","Workflow Prepare","Email"],
        "feedback_reviewers":["Reviewer One","Reviewer Two"],
        "feedback_status_labels":{"A":"Accepted","B":"Accepted with comments","C":"Rejected","P":"Pending"},
        "feedback_status_colors":{"A":"#15803d","B":"#a16207","C":"#b91c1c","P":"#1d4ed8"},
        "transmittal_prefixes":["CUSTOM-TRA-", "CUSTOM-RFI-"],
    })
    assert changed.status_code == 200
    assert changed.json()["feedback_status_colors"]["A"] == "#15803d"
    assert changed.json()["transmittal_prefixes"] == ["CUSTOM-TRA-", "CUSTOM-RFI-"]
    updated = client.get(f"/api/packages/{created['id']}").json()
    assert updated["submission_progress"]["Preparation"] is True
    assert updated["submission_progress"]["Backup"] is False
    assert updated["feedback"]["Reviewer One"] is True
    assert updated["feedback_status"]["Reviewer One"] == "A"
    duplicated = client.post(f"/api/packages/{created['id']}/duplicate").json()
    assert duplicated["feedback_status"] == {"Reviewer One":"P", "Reviewer Two":"P"}

def test_legacy_signature_and_initiation_merge_into_workflow_prepare(client):
    data = payload()
    data["submission_progress"] = {
        "Transmittal Preparation": True,
        "DCO Backup": False,
        "Signature Process": True,
        "Workflow Initiation": True,
        "Email Feedback": False,
    }
    created = client.post("/api/packages", json=data).json()
    assert created["submission_progress"] == {
        "Transmittal Preparation": True,
        "DCO Backup": False,
        "Workflow Prepare": True,
        "Email Feedback": False,
    }
    current = client.get("/api/settings/workflow").json()
    assert current["submission_steps"] == ["Transmittal Preparation", "DCO Backup", "Workflow Prepare", "Email Feedback"]
    remapped = client.put("/api/settings/workflow", json={
        "submission_steps": ["Transmittal Preparation", "DCO Backup", "Signature Process", "Workflow Initiation", "Email Feedback"],
        "feedback_reviewers": current["feedback_reviewers"],
        "feedback_status_labels": current["feedback_status_labels"],
        "feedback_status_colors": current["feedback_status_colors"],
        "transmittal_prefixes": current["transmittal_prefixes"],
    })
    assert remapped.status_code == 200
    assert remapped.json()["submission_steps"] == ["Transmittal Preparation", "DCO Backup", "Workflow Prepare", "Email Feedback"]

def test_blank_document_number_creates_draft(client):
    data = payload("")
    data.update({"document_type":"", "initiator":"", "discipline":""})
    response = client.post("/api/packages", json=data)
    assert response.status_code == 201
    assert response.json()["document_number"].startswith("DRAFT-")

def test_external_workflow_update_creates_notification(client):
    created = client.post("/api/packages", json=payload()).json()
    denied = client.patch("/api/external/workflows/WF-001", headers={"X-API-Key":"wrong"}, json={"status":"Completed"})
    assert denied.status_code == 401
    updated = client.patch(
        "/api/external/workflows/WF-001",
        headers={"X-API-Key":"test-external-key"},
        json={"feedback":{"Terminate":True}, "feedback_status":{"UTIBER":"B", "GDS":"P"}, "message":"Daily sync completed the workflow."},
    )
    assert updated.status_code == 200
    assert updated.json()["feedback"]["Terminate"] is True
    assert updated.json()["feedback"]["UTIBER"] is True
    assert updated.json()["feedback_status"] == {"UTIBER":"B", "GDS":"P"}
    assert not any(updated.json()["submission_progress"].values())
    notifications = client.get("/api/notifications").json()
    assert notifications["unread_count"] == 1
    assert notifications["items"][0]["notification_type"] == "workflow_feedback"
    assert notifications["items"][0]["workflow_number"] == "WF-001"
    assert "UTIBER approval: B – Approved with comments" in notifications["items"][0]["message"]
    progress = dict(updated.json()["submission_progress"])
    progress[SUBMISSION_STEPS[0]] = True
    assert client.patch(f"/api/packages/{created['id']}", json={"submission_progress":progress}).status_code == 200
    feedback = client.get("/api/notifications", params={
        "package_id":created["id"],
        "notification_type":"workflow_feedback",
    })
    assert feedback.status_code == 200
    assert len(feedback.json()["items"]) == 1
    assert feedback.json()["items"][0]["message"].startswith("Daily sync completed the workflow.")
    assert client.patch("/api/notifications/read-all").status_code == 204
    assert client.get("/api/notifications").json()["unread_count"] == 0
    assert client.delete("/api/notifications").status_code == 204
    assert client.get("/api/notifications").json()["items"] == []


def test_external_workflow_update_all_packages_and_rejects_status_downgrade(client):
    first = client.post("/api/packages", json=payload("DOC-REV-1")).json()
    second_payload = payload("DOC-REV-2")
    second_payload["workflow_number"] = "WF-001"
    second = client.post("/api/packages", json=second_payload).json()
    assert first["id"] != second["id"]

    applied = client.patch(
        "/api/external/workflows/WF-001",
        headers={"X-API-Key": "test-external-key"},
        json={"feedback_status": {"UTIBER": "C", "GDS": "C"}},
    )
    assert applied.status_code == 200
    assert applied.json()["feedback_status"] == {"UTIBER": "C", "GDS": "C"}
    assert applied.json()["feedback"]["GDS"] is True

    for package_id in (first["id"], second["id"]):
        row = client.get(f"/api/packages/{package_id}").json()
        assert row["feedback_status"] == {"UTIBER": "C", "GDS": "C"}
        assert row["feedback"]["UTIBER"] is True
        assert row["feedback"]["GDS"] is True

    # Stale automation that only knows step 1 must not wipe completed GDS.
    stale = client.patch(
        "/api/external/workflows/WF-001",
        headers={"X-API-Key": "test-external-key"},
        json={"feedback_status": {"UTIBER": "C", "GDS": "P"}},
    )
    assert stale.status_code == 200
    assert stale.json()["feedback_status"] == {"UTIBER": "C", "GDS": "C"}
    assert stale.json()["feedback"]["GDS"] is True
    for package_id in (first["id"], second["id"]):
        row = client.get(f"/api/packages/{package_id}").json()
        assert row["feedback_status"]["GDS"] == "C"
        assert row["feedback"]["GDS"] is True


def test_external_workflow_update_preserves_long_message(client):
    client.post("/api/packages", json=payload())
    long_message = "Complete workflow response: " + ("technical comment " * 80)
    response = client.patch(
        "/api/external/workflows/WF-001",
        headers={"X-API-Key":"test-external-key"},
        json={"feedback_status":{"UTIBER":"B"}, "message":long_message},
    )
    assert response.status_code == 200
    notification = client.get("/api/notifications").json()["items"][0]
    assert notification["message"].startswith(long_message)
    assert len(notification["message"]) > 500


def test_replace_and_read_complete_workflow_comments(client):
    created = client.post("/api/packages", json=payload()).json()
    endpoint = "/api/external/workflows/WF-001/comments"
    long_body = "Full comment:\n" + ("The complete technical response remains visible. " * 20)
    comments = {
        "comments": [
            {
                "external_id": "comment-001",
                "author": "GDS reviewer",
                "body": long_body,
                "commented_at": "2026-07-24T14:47:00",
            },
            {
                "external_id": "comment-002",
                "author": "UTIBER reviewer",
                "body": "Second comment without truncation.",
                "commented_at": "2026-07-24T15:02:00",
            },
        ]
    }
    denied = client.put(
        endpoint,
        headers={"X-API-Key":"wrong"},
        json=comments,
    )
    assert denied.status_code == 401
    written = client.put(
        endpoint,
        headers={"X-API-Key":"test-external-key"},
        json=comments,
    )
    assert written.status_code == 200
    assert written.json()["total"] == 2
    assert written.json()["items"][0]["body"] == long_body
    assert len(written.json()["items"][0]["body"]) > 500
    assert written.json()["items"][1]["order_index"] == 1
    assert written.json()["items"][0]["workflow_number"] == "WF-001"
    assert "package_id" not in written.json()["items"][0]

    read = client.get(
        f"/api/packages/{created['id']}/workflow-comments"
    )
    assert read.status_code == 200
    assert read.json()["items"] == written.json()["items"]

    # Second package with the same workflow number shares the comments.
    sibling_payload = payload("DOC-CIV-002")
    sibling_payload["workflow_number"] = "WF-001"
    sibling = client.post("/api/packages", json=sibling_payload).json()
    sibling_read = client.get(f"/api/packages/{sibling['id']}/workflow-comments")
    assert sibling_read.status_code == 200
    assert sibling_read.json()["total"] == 2

    replacement = client.put(
        endpoint,
        headers={"X-API-Key":"test-external-key"},
        json={"comments":[{"body":"Latest complete snapshot."}]},
    )
    assert replacement.status_code == 200
    assert replacement.json()["total"] == 1
    assert replacement.json()["items"][0]["body"] == "Latest complete snapshot."
    assert client.get(
        f"/api/packages/{created['id']}/workflow-comments"
    ).json()["total"] == 1

    cleared = client.put(
        endpoint,
        headers={"X-API-Key":"test-external-key"},
        json={"comments":[]},
    )
    assert cleared.status_code == 200
    assert cleared.json() == {"items":[], "total":0}


def test_bulk_import_workflow_comments_by_workflow_number_only(client):
    first = client.post("/api/packages", json=payload("DOC-BULK-1")).json()
    second_payload = payload("DOC-BULK-2")
    second_payload["workflow_number"] = "WF-002"
    second = client.post("/api/packages", json=second_payload).json()
    endpoint = "/api/external/workflow-comments"
    body = {
        "items": [
            {
                "workflow_number": "WF-001",
                "comments": [
                    {
                        "external_id": "mail-100",
                        "author": "Mr Reviewer",
                        "body": "Complete Final Mail comment for WF-001.",
                        "commented_at": "2026-07-24T10:00:00Z",
                    }
                ],
            },
            {
                "workflow_number": "WF-002",
                "comments": [
                    {"body": "First comment on WF-002."},
                    {"body": "Second comment on WF-002."},
                ],
            },
            {
                # No package exists for this workflow number; still imported.
                "workflow_number": "WF-ORPHAN",
                "comments": [{"body": "Stored by workflow number only."}],
            },
        ]
    }

    denied = client.put(endpoint, headers={"X-API-Key": "wrong"}, json=body)
    assert denied.status_code == 401

    response = client.put(
        endpoint,
        headers={"X-API-Key": "test-external-key"},
        json=body,
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["imported"] == 3
    assert "not_found" not in result
    assert result["results"] == [
        {"workflow_number": "WF-001", "status": "imported", "total": 1},
        {"workflow_number": "WF-002", "status": "imported", "total": 2},
        {"workflow_number": "WF-ORPHAN", "status": "imported", "total": 1},
    ]

    first_comments = client.get(
        f"/api/packages/{first['id']}/workflow-comments"
    ).json()
    assert first_comments["total"] == 1
    assert first_comments["items"][0]["body"] == "Complete Final Mail comment for WF-001."
    assert first_comments["items"][0]["external_id"] == "mail-100"
    assert first_comments["items"][0]["author"] == "Mr Reviewer"
    assert first_comments["items"][0]["workflow_number"] == "WF-001"

    second_comments = client.get(
        f"/api/packages/{second['id']}/workflow-comments"
    ).json()
    assert second_comments["total"] == 2
    assert [item["body"] for item in second_comments["items"]] == [
        "First comment on WF-002.",
        "Second comment on WF-002.",
    ]

    # Orphan workflow comments are stored and returned by the single-workflow API.
    orphan = client.put(
        "/api/external/workflows/WF-ORPHAN/comments",
        headers={"X-API-Key": "test-external-key"},
        json={"comments": [{"body": "Updated orphan comment."}]},
    )
    assert orphan.status_code == 200
    assert orphan.json()["total"] == 1
    assert orphan.json()["items"][0]["body"] == "Updated orphan comment."


def test_submission_and_feedback_updates_create_separate_notification_categories(client):
    created = client.post("/api/packages", json=payload()).json()
    progress = dict(created["submission_progress"])
    progress[SUBMISSION_STEPS[0]] = True
    response = client.patch(f"/api/packages/{created['id']}", json={
        "submission_progress":progress,
        "feedback":{"UTIBER":True,"GDS":False,"Terminate":False},
        "feedback_status":{"UTIBER":"A","GDS":"P"},
    })
    assert response.status_code == 200
    notifications = client.get("/api/notifications").json()
    assert notifications["unread_count"] == 2
    assert {item["notification_type"] for item in notifications["items"]} == {"submission_progress", "workflow_feedback"}
    assert {item["package_id"] for item in notifications["items"]} == {created["id"]}
    feedback_notification = next(item for item in notifications["items"] if item["notification_type"] == "workflow_feedback")
    assert "UTIBER approval: A – Approved" in feedback_notification["message"]
