from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.core.auth import assert_project_permission, project_scope, require_permission
from app.db.session import get_db
from app.models.iam import User
from app.models.package import Package
from app.schemas.notification import NotificationList, NotificationRead
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.get("", response_model=NotificationList)
def list_notifications(
    limit: int = Query(30, ge=1, le=100),
    package_id: int | None = Query(default=None, ge=1),
    notification_type: Literal["submission_progress", "workflow_feedback", "workflow_comments"] | None = None,
    project_code: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("notifications:read")),
):
    allowed = project_scope(user)
    if project_code:
        from app.services.settings_service import SettingsService
        project_code = SettingsService(db).require_project_code(project_code)
        assert_project_permission(user, project_code, "notifications:read")
        allowed = [project_code]
    items, unread = NotificationService(db).list(limit, package_id, notification_type, allowed_projects=allowed)
    package_ids = [item.package_id for item in items if item.package_id]
    projects = dict(db.execute(select(Package.id, Package.project_code).where(Package.id.in_(package_ids))).all()) if package_ids else {}
    results = [NotificationRead.model_validate(item).model_copy(update={"project_code": projects.get(item.package_id)}) for item in items]
    return NotificationList(items=results, unread_count=unread)

@router.patch("/read-all", status_code=204)
def mark_all_read(db: Session = Depends(get_db), user: User = Depends(require_permission("notifications:read"))):
    NotificationService(db).mark_all_read(allowed_projects=project_scope(user)); return Response(status_code=204)

@router.delete("", status_code=204)
def clear_notifications(db: Session = Depends(get_db), user: User = Depends(require_permission("notifications:write"))):
    allowed = project_scope(user)
    if user.read_only_projects:
        from app.services.settings_service import SettingsService
        allowed = [code for code in (allowed if allowed is not None else SettingsService(db).project_codes()) if code not in user.read_only_projects]
    NotificationService(db).clear_all(allowed_projects=allowed); return Response(status_code=204)

@router.patch("/{notification_id}/read", response_model=NotificationRead)
def mark_read(notification_id: int, db: Session = Depends(get_db), user: User = Depends(require_permission("notifications:read"))):
    item = NotificationService(db).mark_read(notification_id, allowed_projects=project_scope(user))
    if not item: raise HTTPException(status_code=404, detail="Notification not found")
    return item
