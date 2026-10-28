from datetime import datetime, timedelta, timezone
from contextlib import contextmanager
from email.utils import parsedate_to_datetime
from http.cookies import SimpleCookie

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core import auth, security
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.iam import RefreshToken, User
from app.services import iam_service
from app.services.iam_service import IamService
from tests.helpers import login


@pytest.fixture
def session_clock(monkeypatch):
    class Clock:
        now = datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)

        def advance(self, **parts):
            self.now += timedelta(**parts)

    clock = Clock()

    class ClockType(type):
        def __instancecheck__(cls, value):
            return isinstance(value, datetime)

    class JwtClock(datetime, metaclass=ClockType):
        @classmethod
        def now(cls, tz=None):
            return clock.now.replace(tzinfo=timezone.utc).astimezone(tz) if tz else clock.now

    monkeypatch.setattr(jwt.api_jwt, "datetime", JwtClock)
    for module in (auth, security, iam_service):
        monkeypatch.setattr(module, "utcnow", lambda: clock.now)
    return clock


def claims(token):
    return security.decode_jwt(token)


def cookie_parts(response, name):
    cookies = SimpleCookie()
    for header in response.headers.get_list("set-cookie"):
        cookies.load(header)
    return cookies[name]


def replay(access=None, refresh=None):
    browser = TestClient(app)
    if access:
        browser.cookies.set(security.ACCESS_COOKIE, access)
    if refresh:
        browser.cookies.set(security.REFRESH_COOKIE, refresh)
    return browser


@contextmanager
def database_session():
    provider = app.dependency_overrides[get_db]()
    try:
        yield next(provider)
    finally:
        provider.close()


def test_login_sets_persistent_cookies_and_absolute_24_hour_deadline(session_clock, anon_client):
    response = login(anon_client)
    access = cookie_parts(response, security.ACCESS_COOKIE)
    refresh = cookie_parts(response, security.REFRESH_COOKIE)
    assert int(access["max-age"]) == 1800
    assert int(refresh["max-age"]) == 86400
    for cookie in (access, refresh):
        assert cookie["httponly"] and cookie["samesite"] == "lax" and cookie["path"] == "/"
        assert int(parsedate_to_datetime(cookie["expires"]).timestamp()) == claims(cookie.value)["exp"]
    access_data = claims(access.value)
    refresh_data = claims(refresh.value)
    assert access_data["sid"] == refresh_data["sid"]
    assert refresh_data["exp"] - refresh_data["iat"] == 86400
    assert access_data["exp"] - access_data["iat"] == 1800


def test_rotation_retains_deadline_and_caps_last_access_cookie(session_clock, anon_client):
    login(anon_client)
    original = anon_client.cookies.get(security.REFRESH_COOKIE)
    original_data = claims(original)
    session_clock.advance(minutes=31)
    assert anon_client.get("/api/auth/me").status_code == 401
    renewed = anon_client.post("/api/auth/refresh")
    assert renewed.status_code == 200, renewed.text
    current = cookie_parts(renewed, security.REFRESH_COOKIE)
    assert current.value != original
    assert claims(current.value)["exp"] == original_data["exp"]
    assert int(current["max-age"]) == 86400 - 31 * 60
    session_clock.advance(hours=23, minutes=28, seconds=50)
    last = anon_client.post("/api/auth/refresh")
    assert last.status_code == 200, last.text
    for name in (security.ACCESS_COOKIE, security.REFRESH_COOKIE):
        cookie = cookie_parts(last, name)
        assert int(cookie["max-age"]) == 10
        assert claims(cookie.value)["exp"] == original_data["exp"]
    with database_session() as db:
        stored = db.get(RefreshToken, original_data["sid"])
        assert stored.expires_at == datetime.fromtimestamp(original_data["exp"], timezone.utc).replace(tzinfo=None)
    session_clock.advance(seconds=11)
    assert anon_client.get("/api/auth/me").status_code == 401
    assert anon_client.post("/api/auth/refresh").status_code == 401


def test_reopened_browser_restores_session_from_only_persistent_refresh_cookie(session_clock, anon_client):
    login(anon_client)
    refresh = anon_client.cookies.get(security.REFRESH_COOKIE)
    session_clock.advance(hours=4)
    reopened = replay(refresh=refresh)
    assert reopened.get("/api/auth/me").status_code == 401
    assert reopened.post("/api/auth/refresh").status_code == 200
    assert reopened.get("/api/auth/me").status_code == 200


def test_refresh_retry_grace_returns_exact_same_successor_and_rejects_old_token_after_grace(session_clock, anon_client):
    login(anon_client)
    original = anon_client.cookies.get(security.REFRESH_COOKIE)
    session_clock.advance(minutes=31)
    first = replay(refresh=original).post("/api/auth/refresh")
    assert first.status_code == 200
    successor = cookie_parts(first, security.REFRESH_COOKIE).value
    session_clock.advance(seconds=4)
    duplicate = replay(refresh=original).post("/api/auth/refresh")
    assert duplicate.status_code == 200
    assert cookie_parts(duplicate, security.REFRESH_COOKIE).value == successor
    current_retry = replay(refresh=successor).post("/api/auth/refresh")
    assert current_retry.status_code == 200
    assert cookie_parts(current_retry, security.REFRESH_COOKIE).value == successor
    session_clock.advance(seconds=7)
    assert replay(refresh=original).post("/api/auth/refresh").status_code == 401
    assert replay(refresh=successor).post("/api/auth/refresh").status_code == 200


def test_fractional_rotation_time_keeps_same_successor_for_entire_retry_window(session_clock, anon_client):
    login(anon_client)
    original = anon_client.cookies.get(security.REFRESH_COOKIE)
    session_clock.advance(minutes=31, microseconds=900_000)
    first = replay(refresh=original).post("/api/auth/refresh")
    assert first.status_code == 200
    successor = cookie_parts(first, security.REFRESH_COOKIE).value
    session_clock.advance(seconds=9, microseconds=200_000)
    current_retry = replay(refresh=successor).post("/api/auth/refresh")
    assert current_retry.status_code == 200
    assert cookie_parts(current_retry, security.REFRESH_COOKIE).value == successor
    previous_retry = replay(refresh=original).post("/api/auth/refresh")
    assert previous_retry.status_code == 200
    assert cookie_parts(previous_retry, security.REFRESH_COOKIE).value == successor


def test_refresh_survives_server_restart_and_parallel_requests(session_clock, tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    url = f"sqlite+pysqlite:///{tmp_path / 'sessions.db'}"
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        user = User(username="persistent", display_name="Persistent", password_hash="unused")
        db.add(user)
        db.flush()
        _access, original = IamService(db).issue_session(user, ip=None, user_agent="test")
        db.commit()
    original_data = claims(original)
    engine.dispose()
    session_clock.advance(hours=2)
    restarted_engine = create_engine(url)
    ready = Barrier(4)

    def refresh(_index):
        with Session(restarted_engine) as db:
            ready.wait(timeout=5)
            return IamService(db).rotate_refresh(original, ip=None, user_agent="test")[2]

    try:
        with ThreadPoolExecutor(max_workers=4) as workers:
            successors = list(workers.map(refresh, range(4)))
        assert len(set(successors)) == 1
        successor = successors[0]
        assert claims(successor)["exp"] == original_data["exp"]
        with Session(restarted_engine) as db:
            stored = list(db.scalars(select(RefreshToken)))
            assert len(stored) == 1
            assert stored[0].token_hash == security.hash_token(successor)
            assert stored[0].previous_token_hash == security.hash_token(original)
        restarted_engine.dispose()
        restarted_engine = create_engine(url)
        with Session(restarted_engine) as db:
            assert IamService(db).rotate_refresh(original, ip=None, user_agent="test")[2] == successor
    finally:
        restarted_engine.dispose()


def test_logout_revokes_access_and_refresh_without_revoking_other_session(session_clock, anon_client):
    login(anon_client)
    old_access = anon_client.cookies.get(security.ACCESS_COOKIE)
    old_refresh = anon_client.cookies.get(security.REFRESH_COOKIE)
    other = replay()
    login(other)
    assert anon_client.post("/api/auth/logout").status_code == 204
    assert replay(access=old_access).get("/api/auth/me").status_code == 401
    assert replay(refresh=old_refresh).post("/api/auth/refresh").status_code == 401
    assert other.get("/api/auth/me").status_code == 200


def test_logout_with_previous_refresh_revokes_rotated_session_even_during_grace(session_clock, anon_client):
    login(anon_client)
    original = anon_client.cookies.get(security.REFRESH_COOKIE)
    session_clock.advance(minutes=31)
    response = anon_client.post("/api/auth/refresh")
    access = cookie_parts(response, security.ACCESS_COOKIE).value
    current = cookie_parts(response, security.REFRESH_COOKIE).value
    assert replay(refresh=original).post("/api/auth/logout").status_code == 204
    assert replay(access=access).get("/api/auth/me").status_code == 401
    assert replay(refresh=current).post("/api/auth/refresh").status_code == 401
    assert replay(refresh=original).post("/api/auth/refresh").status_code == 401


@pytest.mark.parametrize("action", ["reset", "disable"])
def test_admin_revocation_rejects_access_and_both_refresh_generations(session_clock, client, anon_client, action):
    created = client.post("/api/iam/users", json={"username": "sessionreader", "display_name": "Session Reader", "password": "viewer-password", "role_slugs": ["viewer"]})
    assert created.status_code == 201
    login(anon_client, "sessionreader", "viewer-password")
    original = anon_client.cookies.get(security.REFRESH_COOKIE)
    session_clock.advance(seconds=11)
    rotated = anon_client.post("/api/auth/refresh")
    assert rotated.status_code == 200
    access = cookie_parts(rotated, security.ACCESS_COOKIE).value
    current = cookie_parts(rotated, security.REFRESH_COOKIE).value
    if action == "reset":
        response = client.post(f"/api/iam/users/{created.json()['id']}/reset-password", json={"password": "reset-password", "must_change_password": True})
    else:
        response = client.patch(f"/api/iam/users/{created.json()['id']}", json={"is_active": False})
    assert response.status_code == 200
    assert replay(access=access).get("/api/auth/me").status_code == 401
    assert replay(refresh=current).post("/api/auth/refresh").status_code == 401
    assert replay(refresh=original).post("/api/auth/refresh").status_code == 401


def test_password_change_revokes_old_session_and_starts_new_24_hour_session(session_clock, client, anon_client):
    created = client.post("/api/iam/users", json={"username": "passwordreader", "display_name": "Password Reader", "password": "viewer-password", "role_slugs": ["viewer"]})
    assert created.status_code == 201
    login(anon_client, "passwordreader", "viewer-password")
    old_access = anon_client.cookies.get(security.ACCESS_COOKIE)
    old_refresh = anon_client.cookies.get(security.REFRESH_COOKIE)
    session_clock.advance(minutes=5)
    changed = anon_client.post("/api/auth/change-password", json={"current_password": "viewer-password", "new_password": "new-viewer-password"})
    assert changed.status_code == 200
    assert replay(access=old_access).get("/api/auth/me").status_code == 401
    assert replay(refresh=old_refresh).post("/api/auth/refresh").status_code == 401
    assert anon_client.get("/api/auth/me").status_code == 200
    refresh = cookie_parts(changed, security.REFRESH_COOKIE)
    assert int(refresh["max-age"]) == 86400
    assert claims(refresh.value)["sid"] != claims(old_refresh)["sid"]


def test_database_session_expiration_and_owner_are_enforced_for_access(session_clock, anon_client):
    response = login(anon_client)
    access = anon_client.cookies.get(security.ACCESS_COOKIE)
    refresh = anon_client.cookies.get(security.REFRESH_COOKIE)
    data = claims(access)
    mismatched = security.encode_jwt({**data, "sub": str(response.json()["id"] + 100)}, timedelta(minutes=30))
    assert replay(access=mismatched).get("/api/auth/me").status_code == 401
    with database_session() as db:
        db.get(RefreshToken, data["sid"]).expires_at = session_clock.now - timedelta(seconds=1)
        db.commit()
    assert replay(access=access).get("/api/auth/me").status_code == 401
    assert replay(refresh=refresh).post("/api/auth/refresh").status_code == 401


@pytest.mark.parametrize("age_hours", [2, 25])
def test_legacy_sessions_only_migrate_within_original_24_hours(session_clock, client, age_hours):
    user_id = client.get("/api/auth/me").json()["id"]
    issued_at = session_clock.now - timedelta(hours=age_hours)
    legacy_refresh = security.encode_jwt({"sub": str(user_id), "typ": "refresh", "jti": "legacy"}, timedelta(days=7), issued_at=issued_at)
    legacy_access = security.encode_jwt({"sub": str(user_id), "typ": "access", "sv": 0}, timedelta(minutes=30))
    with database_session() as db:
        stored = RefreshToken(user_id=user_id, token_hash=security.hash_token(legacy_refresh), created_at=issued_at, expires_at=issued_at + timedelta(days=7))
        db.add(stored)
        db.commit()
        session_id = stored.id
    browser = replay(access=legacy_access, refresh=legacy_refresh)
    assert browser.get("/api/auth/me").status_code == 401
    response = browser.post("/api/auth/refresh")
    if age_hours > 24:
        assert response.status_code == 401
    else:
        assert response.status_code == 200, response.text
        updated = cookie_parts(response, security.REFRESH_COOKIE)
        assert int(updated["max-age"]) == (24 - age_hours) * 3600
        assert claims(updated.value)["sid"] == session_id
        assert browser.get("/api/auth/me").status_code == 200
