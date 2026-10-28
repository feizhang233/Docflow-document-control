from datetime import datetime, timedelta, timezone
from hashlib import sha256
from math import ceil
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


def encode_jwt(payload: dict[str, Any], expires_delta: timedelta, *, expires_at: datetime | None = None, issued_at: datetime | None = None) -> str:
    now = issued_at or utcnow()
    deadline = min(now + expires_delta, expires_at) if expires_at is not None else now + expires_delta
    data = {**payload, "iat": now, "exp": deadline}
    return jwt.encode(data, settings.auth_secret, algorithm=JWT_ALGORITHM)


def decode_jwt(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.auth_secret, algorithms=[JWT_ALGORITHM])


def decode_session_token(token: str, expected_type: str) -> tuple[dict[str, Any], int, int | None]:
    payload = decode_jwt(token)
    try:
        if payload.get("typ") != expected_type:
            raise jwt.InvalidTokenError("Unexpected token type")
        return payload, int(payload["sub"]), int(payload["sid"]) if "sid" in payload else None
    except (KeyError, TypeError, ValueError) as exc:
        raise jwt.InvalidTokenError("Invalid session claims") from exc


def access_token(user_id: int, session_version: int = 0, *, session_id: int, expires_at: datetime) -> str:
    return encode_jwt({"sub": str(user_id), "typ": "access", "sv": session_version, "sid": session_id}, timedelta(minutes=settings.auth_access_minutes), expires_at=expires_at)


def refresh_token(user_id: int, token_id: str, *, session_id: int, session_version: int, expires_at: datetime, issued_at: datetime) -> str:
    return encode_jwt(
        {"sub": str(user_id), "typ": "refresh", "jti": token_id, "sid": session_id, "sv": session_version},
        timedelta(hours=settings.auth_session_hours),
        expires_at=expires_at,
        issued_at=issued_at,
    )


def cookie_secure(forwarded_proto: str | None) -> bool:
    if settings.auth_cookie_secure is not None:
        return settings.auth_cookie_secure
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
    for name, token in ((ACCESS_COOKIE, access), (REFRESH_COOKIE, refresh)):
        # Both cookies persist across browser restarts and expire at their JWT's
        # deadline; rotating a refresh never restarts the original 24-hour clock.
        payload = jwt.decode(token, settings.auth_secret, algorithms=[JWT_ALGORITHM], options={"verify_exp": False, "verify_iat": False})
        expires = datetime.fromtimestamp(payload["exp"], timezone.utc)
        max_age = max(0, ceil((expires.replace(tzinfo=None) - utcnow()).total_seconds()))
        response.set_cookie(name, token, max_age=max_age, expires=expires, **common)


def clear_auth_cookies(response: Response, forwarded_proto: str | None = None) -> None:
    secure = cookie_secure(forwarded_proto)
    common = {
        "httponly": True,
        "secure": secure,
        "samesite": settings.auth_cookie_samesite,
        "path": "/",
    }
    for name in (ACCESS_COOKIE, REFRESH_COOKIE):
        response.delete_cookie(name, **common)
