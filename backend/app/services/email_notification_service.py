"""Transactional email outbox. Database writes never wait on the mail server."""
import json
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from urllib.parse import urlencode

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.email_notification import EmailDelivery, EmailSubscription
from app.models.iam import User


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def format_value(value) -> str:
    if value is None or value == "":
        return "(empty)"
    if isinstance(value, dict):
        return "; ".join(f"{key}: {format_value(item)}" for key, item in value.items())
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, list):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


class EmailNotificationService:
    def __init__(self, db: Session):
        self.db = db

    def enqueue(self, *, project_code: str, event_types: list[str], subject: str, body: str, package_id: int | None = None):
        subscriptions = self.db.scalars(select(EmailSubscription).where(
            EmailSubscription.project_code == project_code, EmailSubscription.is_active.is_(True),
        ))
        link = ""
        if settings.public_app_url:
            query = urlencode({"project": project_code, **({"package": package_id} if package_id else {})})
            link = f"\n\nOpen DocFlow: {settings.public_app_url.rstrip('/')}/documents/all?{query}"
        for subscription in subscriptions:
            matching = [kind for kind in event_types if kind in subscription.event_types]
            if not matching or not self.authorized(subscription):
                continue
            self.db.add(EmailDelivery(
                subscription_id=subscription.id, project_code=project_code,
                event_type=matching[0], subject=subject.replace("\r", " ").replace("\n", " ")[:255],
                body=f"Project: {project_code}\n{body}{link}", available_at=utcnow(),
            ))

    def authorized(self, subscription: EmailSubscription) -> bool:
        creator = self.db.get(User, subscription.created_by_id)
        return bool(creator and creator.is_active and creator.can_in_project("notifications:subscribe", subscription.project_code))

    def package_change(self, item, action: str, changes: dict | None = None, *, project_code: str | None = None):
        changes = changes or {}
        event_types = ["document"]
        if "submission_progress" in changes:
            event_types.append("submission_progress")
        if set(changes) & {"feedback", "feedback_status", "workflow_terminated"}:
            event_types.append("workflow_feedback")
        lines = []
        for field, (before, after) in changes.items():
            label = field.replace('_', ' ').capitalize()
            if isinstance(before, dict) and isinstance(after, dict):
                lines.extend(f"{label} · {key}: {format_value(before.get(key))} → {format_value(after.get(key))}" for key in dict.fromkeys([*before, *after]) if before.get(key) != after.get(key))
            else:
                lines.append(f"{label}: {format_value(before)} → {format_value(after)}")
        details = "\n".join(lines)
        if item.workflow_number:
            from app.models.workflow_comment import WorkflowComment
            comments = list(self.db.scalars(select(WorkflowComment).where(WorkflowComment.workflow_number == item.workflow_number).order_by(WorkflowComment.order_index)))
            if comments:
                details += "\n\nCurrent comments:\n" + "\n\n".join(f"{comment.author or 'Unknown author'}\n{comment.body}" for comment in comments)
        self.enqueue(
            project_code=project_code or item.project_code, event_types=event_types,
            subject=f"[DocFlow · {project_code or item.project_code}] Document {action} · {item.document_number}",
            body=f"Document {action}: {item.document_number}\nTitle: {item.document_title or '(empty)'}\nWorkflow: {item.workflow_number or '(empty)'}\n\n{details}",
            package_id=None if action == "deleted" else item.id,
        )

    def dispatch_pending(self, limit: int = 20) -> int:
        if not settings.mail_configured:
            return 0
        sent = 0
        for _ in range(limit):
            now = utcnow()
            item = self.db.scalar(select(EmailDelivery).where(
                EmailDelivery.status.in_(["pending", "processing"]), EmailDelivery.available_at <= now,
            ).order_by(EmailDelivery.id).limit(1).with_for_update(skip_locked=True))
            if item is None:
                self.db.rollback()
                break
            # Atomic claim also works on SQLite, where FOR UPDATE is ignored.
            claimed = self.db.execute(update(EmailDelivery).where(
                EmailDelivery.id == item.id, EmailDelivery.status.in_(["pending", "processing"]),
                EmailDelivery.available_at <= now,
            ).values(status="processing", available_at=now + timedelta(minutes=5), attempts=EmailDelivery.attempts + 1))
            if claimed.rowcount != 1:
                self.db.rollback()
                continue
            self.db.commit()
            self.db.refresh(item)
            subscription = self.db.get(EmailSubscription, item.subscription_id)
            if not subscription or not subscription.is_active or subscription.project_code != item.project_code or item.event_type not in subscription.event_types or not self.authorized(subscription):
                item.status = "cancelled"
            else:
                try:
                    send_email(subscription.email, item)
                    item.status = "sent"
                    item.sent_at = utcnow()
                    item.last_error = None
                    sent += 1
                except (smtplib.SMTPException, OSError, ValueError) as error:
                    # Never store provider responses, passwords or message content in errors.
                    item.last_error = f"Mail delivery failed ({type(error).__name__}). Check mail server settings."
                    item.status = "failed" if item.attempts >= 5 else "pending"
                    item.available_at = utcnow() + timedelta(seconds=min(3600, 60 * 2 ** min(item.attempts, 6)))
            self.db.commit()
        return sent


def send_email(recipient: str, delivery: EmailDelivery):
    message = EmailMessage()
    message["From"] = settings.smtp_from_email
    message["To"] = recipient
    message["Subject"] = delivery.subject
    message["Message-ID"] = f"<docflow-delivery-{delivery.id}@{settings.smtp_from_email.rsplit('@', 1)[-1]}>"
    message.set_content(delivery.body)
    # Set content headers after set_content, which clears existing MIME headers.
    # Notification templates default to English; comments keep their source text.
    message["Content-Language"] = "en"
    connection = smtplib.SMTP_SSL if settings.smtp_security == "ssl" else smtplib.SMTP
    options = {"timeout": settings.smtp_timeout_seconds}
    if settings.smtp_security == "ssl":
        options["context"] = ssl.create_default_context()
    with connection(settings.smtp_host, settings.smtp_port, **options) as smtp:
        if settings.smtp_security == "starttls":
            smtp.starttls(context=ssl.create_default_context())
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)
