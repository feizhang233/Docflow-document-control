from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import assert_project_permission, require_permission
from app.core.config import settings
from app.db.session import get_db
from app.models.email_notification import EmailDelivery, EmailSubscription
from app.models.iam import User
from app.schemas.email_notification import EmailSubscriptionCreate, EmailSubscriptionList, EmailSubscriptionRead, EmailSubscriptionUpdate
from app.services.iam_service import IamService
from app.services.email_notification_service import utcnow
from app.services.settings_service import SettingsService

router = APIRouter(prefix="/email-subscriptions", tags=["email notifications"])


def scoped_query(user: User):
    # Addresses are personal. Keep revoked project subscriptions removable,
    # while enqueue/dispatch independently enforce current project access.
    return select(EmailSubscription).where(EmailSubscription.created_by_id == user.id)


def require_subscription(db: Session, user: User, subscription_id: int):
    item = db.scalar(scoped_query(user).where(EmailSubscription.id == subscription_id))
    if not item:
        raise HTTPException(status_code=404, detail="Email subscription not found")
    return item


@router.get("", response_model=EmailSubscriptionList)
def list_subscriptions(offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100), db: Session = Depends(get_db), user: User = Depends(require_permission("notifications:subscribe"))):
    query = scoped_query(user)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    subscriptions = list(db.scalars(query.order_by(EmailSubscription.id.desc()).offset(offset).limit(limit)))
    ids = [item.id for item in subscriptions]
    latest_ids = select(func.max(EmailDelivery.id)).where(EmailDelivery.subscription_id.in_(ids)).group_by(EmailDelivery.subscription_id)
    latest_by_subscription = {item.subscription_id: item for item in db.scalars(select(EmailDelivery).where(EmailDelivery.id.in_(latest_ids)))} if ids else {}
    counts = {(subscription_id, status): count for subscription_id, status, count in db.execute(select(EmailDelivery.subscription_id, EmailDelivery.status, func.count()).where(EmailDelivery.subscription_id.in_(ids)).group_by(EmailDelivery.subscription_id, EmailDelivery.status))} if ids else {}
    items = []
    for subscription in subscriptions:
        result = EmailSubscriptionRead.model_validate(subscription)
        result.failed_count = counts.get((subscription.id, "failed"), 0)
        result.pending_count = counts.get((subscription.id, "pending"), 0) + counts.get((subscription.id, "processing"), 0)
        latest = latest_by_subscription.get(subscription.id)
        if latest:
            result.last_delivery_status = latest.status
            result.last_delivery_at = latest.sent_at or latest.created_at
            result.last_error = latest.last_error
        items.append(result)
    address_count = db.scalar(select(func.count(func.distinct(EmailSubscription.email))).where(EmailSubscription.created_by_id == user.id)) or 0
    return EmailSubscriptionList(items=items, total=total, address_count=address_count, mail_configured=settings.mail_configured)


@router.post("", response_model=EmailSubscriptionRead, status_code=201)
def create_subscription(data: EmailSubscriptionCreate, db: Session = Depends(get_db), user: User = Depends(require_permission("notifications:subscribe"))):
    project = SettingsService(db).require_project_code(data.project_code)
    assert_project_permission(user, project, "notifications:subscribe")
    # Serialize additions for this account, including the first address. Use
    # locking reads so MySQL repeatable-read sees the previous writer's rows.
    db.scalar(select(User.id).where(User.id == user.id).with_for_update())
    owned = list(db.scalars(scoped_query(user).with_for_update()))
    if any(item.project_code == project and item.email == data.email for item in owned):
        raise HTTPException(status_code=409, detail="This email is already subscribed to this project")
    addresses = {item.email for item in owned}
    if data.email not in addresses and len(addresses) >= 5:
        raise HTTPException(status_code=422, detail="Each account can have at most 5 notification email addresses. Remove an address before adding another.")
    item = EmailSubscription(project_code=project, email=data.email, event_types=list(dict.fromkeys(data.event_types)), created_by_id=user.id)
    db.add(item)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="This email is already subscribed to this project")
    IamService(db).audit(user, "notifications.subscription_created", "email_subscription", str(item.id), {"project": project, "email": data.email, "event_types": item.event_types})
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{subscription_id}", response_model=EmailSubscriptionRead)
def update_subscription(subscription_id: int, data: EmailSubscriptionUpdate, db: Session = Depends(get_db), user: User = Depends(require_permission("notifications:subscribe"))):
    item = require_subscription(db, user, subscription_id)
    if data.is_active:
        assert_project_permission(user, item.project_code, "notifications:subscribe")
    item.is_active = data.is_active
    if not data.is_active:
        db.execute(update(EmailDelivery).where(EmailDelivery.subscription_id == item.id, EmailDelivery.status.in_(["pending", "processing"])).values(status="cancelled"))
    IamService(db).audit(user, "notifications.subscription_updated", "email_subscription", str(item.id), {"is_active": data.is_active})
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{subscription_id}", status_code=204)
def delete_subscription(subscription_id: int, db: Session = Depends(get_db), user: User = Depends(require_permission("notifications:subscribe"))):
    item = require_subscription(db, user, subscription_id)
    # Explicit cleanup also works with SQLite test databases without FK cascades.
    from sqlalchemy import delete
    db.execute(delete(EmailDelivery).where(EmailDelivery.subscription_id == item.id))
    IamService(db).audit(user, "notifications.subscription_deleted", "email_subscription", str(item.id), {"project": item.project_code})
    db.delete(item)
    db.commit()
    return Response(status_code=204)


@router.post("/{subscription_id}/retry", status_code=204)
def retry_delivery(subscription_id: int, db: Session = Depends(get_db), user: User = Depends(require_permission("notifications:subscribe"))):
    item = require_subscription(db, user, subscription_id)
    assert_project_permission(user, item.project_code, "notifications:subscribe")
    if not item.is_active:
        raise HTTPException(status_code=400, detail="Resume this subscription before retrying")
    db.execute(update(EmailDelivery).where(EmailDelivery.subscription_id == item.id, EmailDelivery.status == "failed").values(status="pending", attempts=0, available_at=utcnow(), last_error=None))
    IamService(db).audit(user, "notifications.delivery_retried", "email_subscription", str(item.id), {})
    db.commit()
    return Response(status_code=204)
