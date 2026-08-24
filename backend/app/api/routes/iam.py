from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session
from app.core.auth import require_permission
from app.db.session import get_db
from app.models.iam import User
from app.schemas.iam import (
    AuditEventList,
    PasswordResetRequest,
    PermissionRead,
    RoleRead,
    UserCreate,
    UserList,
    UserRead,
    UserUpdate,
)
from app.services.iam_service import IamService, user_to_dict

router = APIRouter(prefix="/iam", tags=["iam"])


def _ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return request.client.host if request.client else None


@router.get("/users", response_model=UserList)
def list_users(db: Session = Depends(get_db), _: User = Depends(require_permission("iam:read"))):
    items = IamService(db).list_users()
    return UserList(items=[UserRead.model_validate(user_to_dict(item)) for item in items], total=len(items))


@router.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(data: UserCreate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_permission("iam:write"))):
    return user_to_dict(IamService(db).create_user(data, actor, ip=_ip(request)))


@router.get("/users/{user_id}", response_model=UserRead)
def get_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_permission("iam:read"))):
    return user_to_dict(IamService(db).get_user(user_id))


@router.patch("/users/{user_id}", response_model=UserRead)
def update_user(user_id: int, data: UserUpdate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_permission("iam:write"))):
    return user_to_dict(IamService(db).update_user(user_id, data, actor, ip=_ip(request)))


@router.post("/users/{user_id}/reset-password", response_model=UserRead)
def reset_password(user_id: int, data: PasswordResetRequest, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_permission("iam:write"))):
    return user_to_dict(IamService(db).reset_password(user_id, data.password, data.must_change_password, actor, ip=_ip(request)))


@router.get("/roles", response_model=list[RoleRead])
def list_roles(db: Session = Depends(get_db), _: User = Depends(require_permission("iam:read"))):
    roles = IamService(db).list_roles()
    return [
        RoleRead(
            id=role.id,
            slug=role.slug,
            name=role.name,
            description=role.description,
            is_system=role.is_system,
            permissions=[permission.code for permission in role.permissions],
        )
        for role in roles
    ]


@router.get("/permissions", response_model=list[PermissionRead])
def list_permissions(db: Session = Depends(get_db), _: User = Depends(require_permission("iam:read"))):
    return IamService(db).list_permissions()


@router.get("/audit", response_model=AuditEventList)
def list_audit(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("iam:read")),
):
    items, total = IamService(db).list_audit(limit=limit, offset=offset)
    return AuditEventList(items=items, total=total)
