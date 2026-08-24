from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session
from app.core.auth import get_current_user
from app.core.security import ACCESS_COOKIE, REFRESH_COOKIE, clear_auth_cookies, set_auth_cookies
from app.db.session import get_db
from app.models.iam import User
from app.schemas.iam import ChangePasswordRequest, LoginRequest, UserMe
from app.services.iam_service import IamService, user_to_dict

router = APIRouter(prefix="/auth", tags=["auth"])


def _ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return request.client.host if request.client else None


def _proto(request: Request) -> str | None:
    return request.headers.get("x-forwarded-proto") or request.url.scheme


@router.post("/login", response_model=UserMe)
def login(data: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    service = IamService(db)
    user, access, refresh = service.authenticate(
        data.username,
        data.password,
        ip=_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    set_auth_cookies(response, access=access, refresh=refresh, forwarded_proto=_proto(request))
    return user_to_dict(user)


@router.post("/refresh", response_model=UserMe)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Not authenticated")
    user, access, refresh_value = IamService(db).rotate_refresh(
        token,
        ip=_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    set_auth_cookies(response, access=access, refresh=refresh_value, forwarded_proto=_proto(request))
    return user_to_dict(user)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    from jwt import InvalidTokenError
    from app.core.security import decode_jwt
    from app.models.iam import User as IamUser
    token = request.cookies.get(REFRESH_COOKIE)
    user = None
    access = request.cookies.get(ACCESS_COOKIE)
    if access:
        try:
            payload = decode_jwt(access)
            user = db.get(IamUser, int(payload.get("sub")))
        except (InvalidTokenError, TypeError, ValueError):
            user = None
    IamService(db).logout(token, user, ip=_ip(request))
    clear_auth_cookies(response, _proto(request))
    response.status_code = 204


@router.get("/me", response_model=UserMe)
def me(user: User = Depends(get_current_user)):
    return user_to_dict(user)


@router.post("/change-password", response_model=UserMe)
def change_password(data: ChangePasswordRequest, request: Request, response: Response, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    service = IamService(db)
    service.change_password(user, data.current_password, data.new_password, ip=_ip(request))
    access, refresh_value = service.issue_session(user, ip=_ip(request), user_agent=request.headers.get("user-agent"))
    service.db.commit()
    set_auth_cookies(response, access=access, refresh=refresh_value, forwarded_proto=_proto(request))
    db.refresh(user)
    return user_to_dict(user)
