from fastapi import Cookie, Depends, Header, HTTPException, Request
from jwt import InvalidTokenError
from sqlalchemy.orm import Session
from app.core.security import ACCESS_COOKIE, decode_session_token, utcnow
from app.db.session import get_db
from app.models.iam import RefreshToken, User


def client_ip(request: Request) -> str | None:
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
        payload, user_id, session_id = decode_session_token(token, "access")
        if session_id is None:
            raise InvalidTokenError("Missing session ID")
        session_version = int(payload.get("sv") or 0)
    except (InvalidTokenError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if session_version != user.session_version:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = db.get(RefreshToken, session_id)
    if not session or session.user_id != user_id or session.revoked_at or session.expires_at <= utcnow():
        raise HTTPException(status_code=401, detail="Not authenticated")
    request.state.user = user
    request.state.client_ip = client_ip(request)
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


def assert_project_permission(user: User, project_code: str, code: str):
    assert_project_access(user, project_code)
    if not user.can_in_project(code, project_code):
        raise HTTPException(status_code=403, detail="This project is read-only for your account")


def require_workspace_write(code: str):
    def dependency(user: User = Depends(require_permission(code))) -> User:
        if user.read_only_projects:
            raise HTTPException(status_code=403, detail="Workspace changes are unavailable while any project is read-only")
        return user
    return dependency
