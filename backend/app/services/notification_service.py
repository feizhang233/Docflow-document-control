from __future__ import annotations

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.orm import Session
from app.models.notification import Notification
from app.models.package import Package

DEFAULT_STATUS_LABELS = {"A":"Approved", "B":"Approved with comments", "C":"Rejected", "P":"Pending"}

def describe_submission_progress(changes: dict[str, bool]) -> str:
    details = [f"{step} {'completed' if completed else 'reopened'}" for step, completed in changes.items()]
    return " · ".join(details) or "Submission progress updated"

def describe_workflow_update(*, feedback_status: dict[str, str] | None = None, feedback: dict[str, bool] | None = None, terminate_workflow: bool | None = None, status_labels: dict[str, str] | None = None) -> str:
    labels = status_labels or DEFAULT_STATUS_LABELS
    status_updates = feedback_status or {}
    details = [f"{reviewer} approval: {code} – {labels.get(code, code)}" for reviewer, code in status_updates.items()]
    for reviewer, received in (feedback or {}).items():
        if reviewer in status_updates: continue
        if reviewer.lower() == "terminate": details.append("Workflow terminated" if received else "Workflow reopened")
        else: details.append(f"{reviewer} feedback {'received' if received else 'reopened'}")
    if terminate_workflow is not None: details.append("Workflow terminated" if terminate_workflow else "Workflow reopened")
    return " · ".join(dict.fromkeys(details)) or "Workflow feedback updated"

def combine_update_message(custom_message: str | None, details: str) -> str:
    message = f"{custom_message.strip()} · {details}" if custom_message and custom_message.strip() else details
    return message

class NotificationService:
    def __init__(self, db: Session): self.db = db
    def _create_update(self, *, notification_type: str, title: str, package_id: int, workflow_number: str | None, document_number: str, message: str):
        item = Notification(
            package_id=package_id,
            notification_type=notification_type,
            title=title,
            message=message,
            workflow_number=workflow_number,
            document_number=document_number,
        )
        self.db.add(item); self.db.commit(); self.db.refresh(item); return item
    def create_submission_progress_update(self, *, package_id: int, workflow_number: str | None, document_number: str, message: str):
        return self._create_update(
            notification_type="submission_progress",
            title=f"Submission progress · {document_number}",
            package_id=package_id, workflow_number=workflow_number, document_number=document_number, message=message,
        )
    def create_workflow_feedback_update(self, *, package_id: int, workflow_number: str | None, document_number: str, message: str):
        return self._create_update(
            notification_type="workflow_feedback",
            title=f"Workflow feedback · {workflow_number or document_number}",
            package_id=package_id, workflow_number=workflow_number, document_number=document_number, message=message,
        )
    def _project_filter(self, allowed_projects: list[str] | None):
        if allowed_projects is None:
            return None
        return or_(Notification.package_id.is_(None), Package.project_code.in_(allowed_projects or ["__none__"]))
    def _scoped(self, query, allowed_projects: list[str] | None):
        project_filter = self._project_filter(allowed_projects)
        if project_filter is None:
            return query
        return query.outerjoin(Package, Package.id == Notification.package_id).where(project_filter)
    def list(self, limit: int = 30, package_id: int | None = None, notification_type: str | None = None, allowed_projects: list[str] | None = None):
        filters = []
        if package_id is not None: filters.append(Notification.package_id == package_id)
        if notification_type is not None: filters.append(Notification.notification_type == notification_type)
        items_query = self._scoped(select(Notification), allowed_projects)
        unread_query = self._scoped(select(func.count()).select_from(Notification), allowed_projects)
        unread_query = unread_query.where(Notification.is_read.is_(False), *filters)
        if filters:
            items_query = items_query.where(*filters)
        items_query = items_query.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit)
        items = list(self.db.scalars(items_query))
        unread = self.db.scalar(unread_query) or 0
        return items, unread
    def mark_read(self, notification_id: int, allowed_projects: list[str] | None = None):
        item = self.db.scalar(self._scoped(select(Notification).where(Notification.id == notification_id), allowed_projects))
        if not item: return None
        item.is_read = True; self.db.commit(); self.db.refresh(item); return item
    def mark_all_read(self, allowed_projects: list[str] | None = None):
        ids = list(self.db.scalars(self._scoped(select(Notification.id).where(Notification.is_read.is_(False)), allowed_projects)))
        if ids:
            self.db.execute(update(Notification).where(Notification.id.in_(ids)).values(is_read=True))
        self.db.commit()
    def clear_all(self, allowed_projects: list[str] | None = None):
        ids = list(self.db.scalars(self._scoped(select(Notification.id), allowed_projects)))
        if ids:
            self.db.execute(delete(Notification).where(Notification.id.in_(ids)))
        self.db.commit()
