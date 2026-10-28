from fastapi import APIRouter, Depends, HTTPException, Request, Response
from jwt import InvalidTokenError
from sqlalchemy.orm import Session
from app.core.auth import client_ip, get_current_user
from app.core.security import ACCESS_COOKIE, REFRESH_COOKIE, clear_auth_cookies, decode_session_token, set_auth_cookies
from app.db.session import get_db
from app.models.iam import User
from app.schemas.iam import ChangePasswordRequest, LoginRequest, UserRead
from app.services.iam_service import IamService, user_to_dict

router = APIRouter(prefix="/auth", tags=["auth"])


def _proto(request: Request) -> str | None:
    return request.headers.get("x-forwarded-proto") or request.url.scheme


@router.post("/login", response_model=UserRead)
def login(data: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    service = IamService(db)
    user, access, refresh = service.authenticate(
        data.username,
        data.password,
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    set_auth_cookies(response, access=access, refresh=refresh, forwarded_proto=_proto(request))
    return user_to_dict(user)


@router.post("/refresh", response_model=UserRead)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user, access, refresh_value = IamService(db).rotate_refresh(
        token,
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    set_auth_cookies(response, access=access, refresh=refresh_value, forwarded_proto=_proto(request))
    return user_to_dict(user)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(REFRESH_COOKIE)
    user = None
    session_id = None
    access = request.cookies.get(ACCESS_COOKIE)
    if access:
        try:
            _, user_id, session_id = decode_session_token(access, "access")
            user = db.get(User, user_id)
        except InvalidTokenError:
            user = None
    IamService(db).logout(token, user, ip=client_ip(request), session_id=session_id)
    clear_auth_cookies(response, _proto(request))


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)):
    return user_to_dict(user)


@router.post("/change-password", response_model=UserRead)
def change_password(data: ChangePasswordRequest, request: Request, response: Response, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    service = IamService(db)
    service.change_password(user, data.current_password, data.new_password, ip=client_ip(request))
    access, refresh_value = service.issue_session(user, ip=client_ip(request), user_agent=request.headers.get("user-agent"))
    service.db.commit()
    set_auth_cookies(response, access=access, refresh=refresh_value, forwarded_proto=_proto(request))
    db.refresh(user)
    return user_to_dict(user)
