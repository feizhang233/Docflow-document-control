from fastapi import Cookie, Depends, Header, HTTPException, Request
from jwt import InvalidTokenError
from sqlalchemy.orm import Session
from app.core.security import ACCESS_COOKIE, decode_jwt
from app.db.session import get_db
from app.models.iam import User


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return request.client.host if request.client else None


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    access_cookie: str | None = Cookie(default=None, alias=ACCESS_COOKIE),
    authorization: str | None = Header(default=None),
) -> User:
    token = access_cookie
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_jwt(token)
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if payload.get("typ") != "access":
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if int(payload.get("sv") or 0) != user.session_version:
        raise HTTPException(status_code=401, detail="Not authenticated")
    request.state.user = user
    request.state.client_ip = _client_ip(request)
    return user


def require_permission(*codes: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        missing = [code for code in codes if not user.has_permission(code)]
        if missing:
            raise HTTPException(status_code=403, detail=f"Missing permission: {missing[0]}")
        return user
    return dependency


def assert_project_access(user: User, project_code: str | None):
    if not project_code:
        return
    allowed = user.allowed_projects()
    if allowed is not None and project_code not in allowed:
        raise HTTPException(status_code=403, detail="You do not have access to this project")


def project_scope(user: User) -> list[str] | None:
    return user.allowed_projects()
