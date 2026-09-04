from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from app.core.auth import project_scope, require_permission
from app.db.session import get_db
from app.models.iam import User
from app.schemas.notification import NotificationList, NotificationRead
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.get("", response_model=NotificationList)
def list_notifications(
    limit: int = Query(30, ge=1, le=100),
    package_id: int | None = Query(default=None, ge=1),
    notification_type: Literal["submission_progress", "workflow_feedback"] | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("notifications:read")),
):
    items, unread = NotificationService(db).list(limit, package_id, notification_type, allowed_projects=project_scope(user))
    return NotificationList(items=items, unread_count=unread)

@router.patch("/read-all", status_code=204)
def mark_all_read(db: Session = Depends(get_db), user: User = Depends(require_permission("notifications:read"))):
    NotificationService(db).mark_all_read(allowed_projects=project_scope(user)); return Response(status_code=204)

@router.delete("", status_code=204)
def clear_notifications(db: Session = Depends(get_db), user: User = Depends(require_permission("notifications:write"))):
    NotificationService(db).clear_all(allowed_projects=project_scope(user)); return Response(status_code=204)

@router.patch("/{notification_id}/read", response_model=NotificationRead)
def mark_read(notification_id: int, db: Session = Depends(get_db), user: User = Depends(require_permission("notifications:read"))):
    item = NotificationService(db).mark_read(notification_id, allowed_projects=project_scope(user))
    if not item: raise HTTPException(status_code=404, detail="Notification not found")
    return item
