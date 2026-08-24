from datetime import datetime, timedelta, timezone
from hashlib import sha256
from typing import Any
import bcrypt
import jwt
from fastapi import Response
from app.core.config import settings

ACCESS_COOKIE = "docflow_access"
REFRESH_COOKIE = "docflow_refresh"
JWT_ALGORITHM = "HS256"


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=settings.auth_bcrypt_rounds)).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except ValueError:
        return False


def hash_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


def encode_jwt(payload: dict[str, Any], expires_delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    data = {**payload, "iat": now, "exp": now + expires_delta}
    return jwt.encode(data, settings.auth_secret, algorithm=JWT_ALGORITHM)


def decode_jwt(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.auth_secret, algorithms=[JWT_ALGORITHM])


def access_token(user_id: int, session_version: int = 0) -> str:
    return encode_jwt({"sub": str(user_id), "typ": "access", "sv": session_version}, timedelta(minutes=settings.auth_access_minutes))


def refresh_token(user_id: int, token_id: str) -> str:
    return encode_jwt(
        {"sub": str(user_id), "typ": "refresh", "jti": token_id},
        timedelta(days=settings.auth_refresh_days),
    )


def cookie_secure(forwarded_proto: str | None) -> bool:
    if settings.auth_cookie_secure is True:
        return True
    if settings.auth_cookie_secure is False:
        return False
    proto = (forwarded_proto or "").split(",")[0].strip().lower()
    return proto == "https"


def set_auth_cookies(response: Response, *, access: str, refresh: str, forwarded_proto: str | None) -> None:
    secure = cookie_secure(forwarded_proto)
    common = {
        "httponly": True,
        "secure": secure,
        "samesite": settings.auth_cookie_samesite,
        "path": "/",
    }
    response.set_cookie(ACCESS_COOKIE, access, max_age=settings.auth_access_minutes * 60, **common)
    response.set_cookie(REFRESH_COOKIE, refresh, max_age=settings.auth_refresh_days * 86400, **common)


def clear_auth_cookies(response: Response, forwarded_proto: str | None = None) -> None:
    secure = cookie_secure(forwarded_proto)
    common = {
        "httponly": True,
        "secure": secure,
        "samesite": settings.auth_cookie_samesite,
        "path": "/",
        "max_age": 0,
    }
    response.set_cookie(ACCESS_COOKIE, "", **common)
    response.set_cookie(REFRESH_COOKIE, "", **common)
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path="/")
