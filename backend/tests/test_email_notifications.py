from datetime import timedelta
from unittest.mock import Mock
import smtplib

from sqlalchemy import select

from app.core.config import settings
from app.models.email_notification import EmailDelivery
from app.services.email_notification_service import EmailNotificationService, utcnow
from conftest import TestingSession
from tests.helpers import login
from tests.test_packages import payload

HEADERS = {"X-API-Key": "test-external-key"}


def subscribe(client, project="NFS", events=None, email="reviewer@example.com"):
    response = client.post("/api/email-subscriptions", json={
        "project_code": project, "email": email,
        **({"event_types": events} if events is not None else {}),
    })
    assert response.status_code == 201, response.text
    return response.json()


def deliveries():
    with TestingSession() as db:
        return list(db.scalars(select(EmailDelivery).order_by(EmailDelivery.id)))


def test_subscription_validation_scope_and_duplicate(client, anon_client):
    assert client.post("/api/email-subscriptions", json={"email": "invalid", "project_code": "NFS"}).status_code == 422
    assert client.post("/api/email-subscriptions", json={"email": "a@example.com\r\nBcc: other@example.com", "project_code": "NFS"}).status_code == 422
    assert client.post("/api/email-subscriptions", json={"email": "a@example.com", "project_code": "BAD"}).status_code == 422
    assert client.post("/api/email-subscriptions", json={"email": "a@example.com", "project_code": "NFS", "event_types": []}).status_code == 422
    subscription = subscribe(client, email=" REVIEWER@example.com ")
    assert subscription["email"] == "reviewer@example.com"
    assert client.post("/api/email-subscriptions", json={"email": subscription["email"], "project_code": "NFS"}).status_code == 409
    subscribe(client, project="FST")
    user = client.post("/api/iam/users", json={"username": "scopedmail", "display_name": "Mail controller", "password": "controller-password", "role_slugs": ["document_controller"], "all_projects": False, "project_codes": ["FST"], "must_change_password": False})
    assert user.status_code == 201
    login(anon_client, "scopedmail", "controller-password")
    assert anon_client.get("/api/email-subscriptions").json()["total"] == 0
    assert anon_client.delete(f"/api/email-subscriptions/{subscription['id']}").status_code == 404
    assert anon_client.post("/api/email-subscriptions", json={"email": "a@example.com", "project_code": "NFS"}).status_code == 403
    login(anon_client, "guest", "1234567890")
    assert anon_client.get("/api/email-subscriptions").status_code == 200


def test_changes_only_and_event_filters(client):
    subscribe(client, events=["document"])
    subscribe(client, project="FST")
    created = client.post("/api/packages", json=payload()).json()
    assert len(deliveries()) == 1
    subscribe(client, events=["submission_progress"], email="progress@example.com")
    client.patch(f"/api/packages/{created['id']}", json={"notes": "New issue notes"})
    assert len(deliveries()) == 2
    client.patch(f"/api/packages/{created['id']}", json={"notes": "New issue notes"})
    assert len(deliveries()) == 2
    progress = {**created["submission_progress"], next(iter(created["submission_progress"])): True}
    client.patch(f"/api/packages/{created['id']}", json={"submission_progress": progress})
    assert len(deliveries()) == 4
    assert "New issue notes" in deliveries()[1].body
    assert "No → Yes" in deliveries()[2].body
    client.delete(f"/api/packages/{created['id']}")
    assert "deleted" in deliveries()[-1].subject


def test_comments_include_before_after_and_deduplicate_shared_projects(client):
    subscribe(client, events=["workflow_comments"])
    subscribe(client, project="FST", events=["workflow_comments"])
    nfs = client.post("/api/packages", json=payload("NFS-1")).json()
    client.post("/api/packages", json=payload("NFS-2"))
    client.post("/api/packages", json=payload("FST-1") | {"project_code": "FST"})
    endpoint = "/api/external/workflows/WF-001/comments"
    snapshot = {"comments": [{"external_id": "mail-1", "author": "Reviewer", "body": "Revise cover depth.", "commented_at": "2026-10-09T10:00:00Z"}]}
    assert client.put(endpoint, headers=HEADERS, json=snapshot).status_code == 200
    assert len(deliveries()) == 2
    assert "Revise cover depth." in deliveries()[0].body
    assert "NFS-1, NFS-2" in deliveries()[0].body
    assert "FST-1" not in deliveries()[0].body
    assert client.put(endpoint, headers=HEADERS, json=snapshot).status_code == 200
    assert len(deliveries()) == 2
    snapshot["comments"][0]["commented_at"] = "2026-10-09T12:00:00+02:00"
    assert client.put(endpoint, headers=HEADERS, json=snapshot).status_code == 200
    assert len(deliveries()) == 2
    assert client.put(endpoint, headers=HEADERS, json={"comments": []}).status_code == 200
    assert len(deliveries()) == 4
    assert "Previous comments:\nReviewer" in deliveries()[-1].body
    assert "Current comments:\n(no comments)" in deliveries()[-1].body
    notes = client.get("/api/notifications", params={"notification_type": "workflow_comments", "package_id": nfs["id"]}).json()
    assert len(notes["items"]) == 2


def test_bulk_comment_import_and_orphan_then_assignment(client):
    subscribe(client, events=["workflow_comments", "document"])
    client.post("/api/packages", json=payload())
    before = len(deliveries())
    snapshot = {"items": [{"workflow_number": "WF-001", "comments": [{"body": "Bulk comment"}]}, {"workflow_number": "WF-ORPHAN", "comments": [{"body": "Orphan comment"}]}]}
    assert client.put("/api/external/workflow-comments", headers=HEADERS, json=snapshot).status_code == 200
    assert len(deliveries()) == before + 1
    assert client.put("/api/external/workflow-comments", headers=HEADERS, json=snapshot).status_code == 200
    assert len(deliveries()) == before + 1
    client.post("/api/packages", json=payload("ORPHAN-DOC") | {"workflow_number": "WF-ORPHAN"})
    assert "Orphan comment" in deliveries()[-1].body


def test_external_status_sync_is_idempotent(client):
    subscribe(client, events=["workflow_feedback"])
    client.post("/api/packages", json=payload())
    update = {"feedback_status": {"GDS": "B"}}
    for _ in range(2):
        assert client.patch("/api/external/workflows/WF-001", headers=HEADERS, json=update).status_code == 200
    assert len(deliveries()) == 1
    assert "GDS: P → B" in deliveries()[0].body


def test_pause_resume_delete_cancel_pending(client):
    subscription = subscribe(client)
    client.post("/api/packages", json=payload())
    assert client.patch(f"/api/email-subscriptions/{subscription['id']}", json={"is_active": False}).status_code == 200
    assert deliveries()[0].status == "cancelled"
    client.post("/api/packages", json=payload("PAUSED"))
    assert len(deliveries()) == 1
    assert client.patch(f"/api/email-subscriptions/{subscription['id']}", json={"is_active": True}).status_code == 200
    client.post("/api/packages", json=payload("RESUMED"))
    assert len(deliveries()) == 2
    assert client.delete(f"/api/email-subscriptions/{subscription['id']}").status_code == 204
    assert deliveries() == []


def test_register_import_sends_one_summary_per_project(client):
    subscribe(client)
    subscribe(client, project="FST")
    response = client.post("/api/metadata/import-csv", json={"rows": [
        {"document_number": "NFS-IMPORT-1", "project_code": "NFS"},
        {"document_number": "NFS-IMPORT-2", "project_code": "NFS"},
        {"document_number": "FST-IMPORT-1", "project_code": "FST"},
    ]})
    assert response.status_code == 200, response.text
    queued = deliveries()
    assert len(queued) == 2
    nfs = next(item for item in queued if item.project_code == "NFS")
    assert "NFS-IMPORT-1" in nfs.body and "NFS-IMPORT-2" in nfs.body
    assert "FST-IMPORT-1" not in nfs.body
    response = client.post("/api/metadata/import-csv", params={"mode": "replace"}, json={"rows": [{"document_number": "REPLACED", "project_code": "NFS"}]})
    assert response.status_code == 200, response.text
    assert len(deliveries()) == 4


def test_mail_transport_encodes_comments_and_uses_tls(client, monkeypatch):
    from app.services.email_notification_service import send_email
    subscribe(client)
    client.post("/api/packages", json=payload())
    configure_mail(monkeypatch)
    monkeypatch.setattr(settings, "smtp_security", "starttls")
    monkeypatch.setattr(settings, "smtp_username", "mail-user")
    monkeypatch.setattr(settings, "smtp_password", "test-only-mail-secret")
    connection = Mock()
    smtp = Mock()
    connection.__enter__ = Mock(return_value=smtp)
    connection.__exit__ = Mock(return_value=False)
    factory = Mock(return_value=connection)
    monkeypatch.setattr("app.services.email_notification_service.smtplib.SMTP", factory)
    item = deliveries()[0]
    item.body += "\nReviewer comments: 钢筋保护层 · Čelična armatura"
    send_email("reviewer@example.com", item)
    smtp.starttls.assert_called_once()
    smtp.login.assert_called_once_with("mail-user", "test-only-mail-secret")
    message = smtp.send_message.call_args.args[0]
    assert message["To"] == "reviewer@example.com"
    assert message["Content-Language"] == "en"
    assert str(message["Subject"]).startswith("[DocFlow · NFS] Document created")
    assert "Project: NFS\nDocument created:" in message.get_content()
    assert "钢筋保护层" in message.get_content()
    assert "test-only-mail-secret" not in str(message)


def configure_mail(monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", "test.invalid")
    monkeypatch.setattr(settings, "smtp_from_email", "docflow@example.com")


def test_queue_success_failure_retry_and_no_real_email(client, monkeypatch):
    subscription = subscribe(client)
    client.post("/api/packages", json=payload())
    sender = Mock(side_effect=smtplib.SMTPException("secret-provider-response"))
    monkeypatch.setattr("app.services.email_notification_service.send_email", sender)
    configure_mail(monkeypatch)
    with TestingSession() as db:
        service = EmailNotificationService(db)
        for attempt in range(5):
            item = db.scalar(select(EmailDelivery))
            item.available_at = utcnow() - timedelta(seconds=1)
            db.commit()
            assert service.dispatch_pending() == 0
        assert item.status == "failed" and item.attempts == 5
        assert "secret-provider-response" not in item.last_error
    assert client.get("/api/email-subscriptions").json()["items"][0]["failed_count"] == 1
    assert client.post(f"/api/email-subscriptions/{subscription['id']}/retry").status_code == 204
    sender.side_effect = None
    with TestingSession() as db:
        assert EmailNotificationService(db).dispatch_pending() == 1
        assert EmailNotificationService(db).dispatch_pending() == 0
        item = db.scalar(select(EmailDelivery))
        assert item.status == "sent" and item.sent_at and item.last_error is None
    assert sender.call_count == 6
    assert client.get("/api/email-subscriptions").json()["items"][0]["failed_count"] == 0


def test_lease_and_unconfigured_mail(client, monkeypatch):
    subscribe(client)
    client.post("/api/packages", json=payload())
    sender = Mock()
    monkeypatch.setattr("app.services.email_notification_service.send_email", sender)
    monkeypatch.setattr(settings, "smtp_host", "")
    with TestingSession() as db:
        assert EmailNotificationService(db).dispatch_pending() == 0
        configure_mail(monkeypatch)
        item = db.scalar(select(EmailDelivery))
        item.status = "processing"
        item.available_at = utcnow() + timedelta(minutes=1)
        db.commit()
        assert EmailNotificationService(db).dispatch_pending() == 0
        item.available_at = utcnow() - timedelta(seconds=1)
        db.commit()
        assert EmailNotificationService(db).dispatch_pending() == 1
    sender.assert_called_once()


def test_scope_revoked_before_dispatch_cancels_email(client, anon_client, monkeypatch):
    user = client.post("/api/iam/users", json={"username": "mailowner", "display_name": "Mail owner", "password": "controller-password", "role_slugs": ["document_controller"], "all_projects": False, "project_codes": ["NFS"], "must_change_password": False}).json()
    login(anon_client, "mailowner", "controller-password")
    subscribe(anon_client)
    client.post("/api/packages", json=payload())
    assert client.patch(f"/api/iam/users/{user['id']}", json={"project_codes": ["FST"]}).status_code == 200
    configure_mail(monkeypatch)
    sender = Mock()
    monkeypatch.setattr("app.services.email_notification_service.send_email", sender)
    with TestingSession() as db:
        assert EmailNotificationService(db).dispatch_pending() == 0
    assert deliveries()[0].status == "cancelled"
    sender.assert_not_called()


def test_background_worker_dispatches_on_startup(client, monkeypatch):
    import threading
    from fastapi.testclient import TestClient
    from app.main import app
    subscribe(client)
    client.post("/api/packages", json=payload())
    delivered = threading.Event()
    configure_mail(monkeypatch)
    monkeypatch.setattr("app.main.SessionLocal", TestingSession)
    monkeypatch.setattr("app.services.email_notification_service.send_email", lambda *_args: delivered.set())
    with TestClient(app) as running:
        assert running.get("/api/health").status_code == 200
        assert delivered.wait(timeout=2)
    assert deliveries()[0].status == "sent"


def test_personal_addresses_are_isolated_even_for_same_email_and_project(client, anon_client):
    admin_subscription = subscribe(client)
    login(anon_client, "guest", "1234567890")
    assert anon_client.get("/api/email-subscriptions").json()["items"] == []
    viewer_subscription = subscribe(anon_client)
    assert viewer_subscription["id"] != admin_subscription["id"]
    for reader, other in [(client, viewer_subscription), (anon_client, admin_subscription)]:
        assert reader.get("/api/email-subscriptions").json()["total"] == 1
        assert reader.patch(f"/api/email-subscriptions/{other['id']}", json={"is_active": False}).status_code == 404
        assert reader.delete(f"/api/email-subscriptions/{other['id']}").status_code == 404
        assert reader.post(f"/api/email-subscriptions/{other['id']}/retry").status_code == 404


def test_five_distinct_addresses_per_account_including_paused_subscriptions(client, anon_client):
    addresses = [subscribe(client, email=f"recipient{i}@example.com") for i in range(5)]
    assert client.patch(f"/api/email-subscriptions/{addresses[0]['id']}", json={"is_active": False}).status_code == 200
    sixth = {"project_code": "NFS", "email": "sixth@example.com"}
    assert client.post("/api/email-subscriptions", json=sixth).status_code == 422
    # Reusing a saved address for another project does not consume a slot.
    shared = subscribe(client, project="FST", email=" RECIPIENT0@example.com ")
    saved = client.get("/api/email-subscriptions").json()
    assert saved["address_count"] == saved["address_limit"] == 5
    assert saved["total"] == 6
    assert client.delete(f"/api/email-subscriptions/{addresses[0]['id']}").status_code == 204
    assert client.post("/api/email-subscriptions", json=sixth).status_code == 422
    assert client.delete(f"/api/email-subscriptions/{shared['id']}").status_code == 204
    subscribe(client, email="sixth@example.com")
    assert client.get("/api/email-subscriptions").json()["address_count"] == 5
    login(anon_client, "guest", "1234567890")
    subscribe(anon_client, email="sixth@example.com")
    assert anon_client.get("/api/email-subscriptions").json()["address_count"] == 1


def test_view_only_project_subscriber_receives_comments_and_keeps_document_read_only(client, anon_client, monkeypatch):
    owner = client.post("/api/iam/users", json={"username": "readonlymail", "display_name": "Project reader", "password": "reader-password", "role_slugs": ["editor"], "all_projects": False, "project_codes": ["NFS", "FST"], "read_only_projects": ["NFS", "FST"], "must_change_password": False}).json()
    login(anon_client, "readonlymail", "reader-password")
    subscribe(anon_client, events=["workflow_comments"])
    assert anon_client.post("/api/email-subscriptions", json={"project_code": "FBP", "email": "a@example.com"}).status_code == 403
    package = client.post("/api/packages", json=payload()).json()
    assert anon_client.patch(f"/api/packages/{package['id']}", json={"notes": "not allowed"}).status_code == 403
    assert client.put("/api/external/workflows/WF-001/comments", headers=HEADERS, json={"comments": [{"author": "Reviewer", "body": "Viewer should receive this comment"}]}).status_code == 200
    queued = deliveries()
    assert len(queued) == 1 and "Viewer should receive this comment" in queued[0].body
    sender = Mock()
    configure_mail(monkeypatch)
    monkeypatch.setattr("app.services.email_notification_service.send_email", sender)
    with TestingSession() as db:
        assert EmailNotificationService(db).dispatch_pending() == 1
    sender.assert_called_once()
    assert client.patch(f"/api/iam/users/{owner['id']}", json={"is_active": False}).status_code == 200
    assert client.put("/api/external/workflows/WF-001/comments", headers=HEADERS, json={"comments": [{"body": "No delivery to disabled account"}]}).status_code == 200
    assert len(deliveries()) == 1


def test_revoked_project_subscriptions_can_be_removed_but_not_resumed_or_retried(client, anon_client):
    owner = client.post("/api/iam/users", json={"username": "revokedmail", "display_name": "Project reader", "password": "reader-password", "role_slugs": ["viewer"], "all_projects": False, "project_codes": ["NFS"], "must_change_password": False}).json()
    login(anon_client, "revokedmail", "reader-password")
    subscription = subscribe(anon_client)
    assert client.patch(f"/api/iam/users/{owner['id']}", json={"project_codes": ["FST"]}).status_code == 200
    assert anon_client.get("/api/email-subscriptions").json()["address_count"] == 1
    assert anon_client.patch(f"/api/email-subscriptions/{subscription['id']}", json={"is_active": False}).status_code == 200
    assert anon_client.patch(f"/api/email-subscriptions/{subscription['id']}", json={"is_active": True}).status_code == 403
    assert anon_client.post(f"/api/email-subscriptions/{subscription['id']}/retry").status_code == 403
    client.post("/api/packages", json=payload())
    assert deliveries() == []
    assert anon_client.delete(f"/api/email-subscriptions/{subscription['id']}").status_code == 204
    assert anon_client.get("/api/email-subscriptions").json()["address_count"] == 0


def test_project_notification_feed_scope_includes_project_for_browsing_links(client, anon_client):
    for project in ["NFS", "FST"]:
        item = client.post("/api/packages", json=payload(f"{project}-DOC") | {"project_code": project}).json()
        progress = {**item["submission_progress"], next(iter(item["submission_progress"])): True}
        assert client.patch(f"/api/packages/{item['id']}", json={"submission_progress": progress}).status_code == 200
    scoped = client.get("/api/notifications", params={"project_code": "NFS"}).json()
    assert len(scoped["items"]) == scoped["unread_count"] == 1
    assert scoped["items"][0]["project_code"] == "NFS"
    assert client.get("/api/notifications", params={"project_code": "UNKNOWN"}).status_code == 422
    client.post("/api/iam/users", json={"username": "feedreader", "display_name": "Reader", "password": "reader-password", "role_slugs": ["viewer"], "all_projects": False, "project_codes": ["NFS"], "must_change_password": False})
    login(anon_client, "feedreader", "reader-password")
    assert anon_client.get("/api/notifications", params={"project_code": "FST"}).status_code == 403
    assert anon_client.get("/api/notifications").json()["items"][0]["project_code"] == "NFS"
