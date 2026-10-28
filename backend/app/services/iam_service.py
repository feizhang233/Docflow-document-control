from __future__ import annotations

import json
import re
import secrets
from datetime import datetime, timedelta
from fastapi import HTTPException
from jwt import InvalidTokenError
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.iam_catalog import (
    ADMIN_ROLE_SLUG,
    GUEST_DISPLAY_NAME,
    GUEST_PASSWORD,
    GUEST_ROLE_SLUG,
    GUEST_USERNAME,
    MIN_PASSWORD_LENGTH,
    PERMISSIONS,
    ROLES,
    USERNAME_PATTERN,
)
from app.core.security import (
    access_token,
    decode_session_token,
    hash_password,
    hash_token,
    refresh_token as encode_refresh_token,
    utcnow,
    verify_password,
)
from app.models.iam import AuditEvent, Permission, RefreshToken, Role, User, UserProject
from app.schemas.iam import UserCreate, UserUpdate

MAX_FAILED_LOGINS = 8
LOCK_MINUTES = 15
REFRESH_RETRY_GRACE_SECONDS = 10


def user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "display_name": user.display_name,
        "is_active": user.is_active,
        "must_change_password": user.must_change_password,
        "password_locked": user.password_locked,
        "all_projects": user.all_projects,
        "read_only_projects": user.read_only_projects or [],
        "project_codes": [] if user.all_projects else [link.project_code for link in user.project_links],
        "roles": [
            {
                "id": role.id,
                "slug": role.slug,
                "name": role.name,
                "description": role.description,
                "is_system": role.is_system,
                "permissions": [permission.code for permission in role.permissions],
            }
            for role in user.roles
        ],
        "permissions": sorted(user.permission_codes()),
        "last_login_at": user.last_login_at,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
    }


class IamService:
    def __init__(self, db: Session):
        self.db = db

    def bootstrap(self) -> User | None:
        self.ensure_catalog()
        created_admin = None
        if (self.db.scalar(select(func.count()).select_from(User)) or 0) == 0:
            username = (settings.bootstrap_admin_username or "admin").strip()
            if not re.fullmatch(USERNAME_PATTERN, username) or username == GUEST_USERNAME:
                username = "admin"
            password = settings.bootstrap_admin_password
            generated = False
            if not password or len(password) < MIN_PASSWORD_LENGTH:
                password = secrets.token_urlsafe(18)
                generated = True
            email = settings.bootstrap_admin_email.strip().lower() or None
            created_admin = self._create_user(
                username=username,
                display_name=(settings.bootstrap_admin_name or "Administrator").strip() or "Administrator",
                email=email,
                password=password,
                role_slugs=[ADMIN_ROLE_SLUG],
                all_projects=True,
                project_codes=[],
                must_change_password=True,
            )
            self.audit(None, "iam.bootstrap_admin", "user", str(created_admin.id), {"username": created_admin.username, "generated_password": generated}, None)
            self.db.commit()
            self.db.refresh(created_admin)
            if generated:
                print(f"DocFlow bootstrap admin created: username={created_admin.username} password={password}", flush=True)
            else:
                print(f"DocFlow bootstrap admin created: username={created_admin.username}", flush=True)
        self.ensure_guest()
        return created_admin

    def ensure_guest(self) -> User:
        existing = self.db.scalar(select(User).where(User.username == GUEST_USERNAME))
        if existing:
            changed = False
            if not existing.password_locked:
                existing.password_locked = True
                changed = True
            if existing.must_change_password:
                existing.must_change_password = False
                changed = True
            if changed:
                self.db.commit()
            return existing
        user = self._create_user(
            username=GUEST_USERNAME,
            display_name=GUEST_DISPLAY_NAME,
            email=None,
            password=GUEST_PASSWORD,
            role_slugs=[GUEST_ROLE_SLUG],
            all_projects=True,
            project_codes=[],
            must_change_password=False,
            password_locked=True,
        )
        self.audit(None, "iam.bootstrap_guest", "user", str(user.id), {"username": user.username, "roles": [GUEST_ROLE_SLUG]}, None)
        self.db.commit()
        self.db.refresh(user)
        print("DocFlow guest account ready: username=guest (read-only, password locked)", flush=True)
        return user

    def ensure_catalog(self) -> None:
        permissions = {item.code: item for item in self.db.scalars(select(Permission))}
        for code, name, category in PERMISSIONS:
            item = permissions.get(code)
            if not item:
                item = Permission(code=code, name=name, category=category)
                self.db.add(item)
                permissions[code] = item
            else:
                item.name = name
                item.category = category
        self.db.flush()
        roles = {item.slug: item for item in self.db.scalars(select(Role))}
        for slug, spec in ROLES.items():
            role = roles.get(slug)
            if not role:
                role = Role(slug=slug, name=spec["name"], description=spec["description"], is_system=True)
                self.db.add(role)
                self.db.flush()
                roles[slug] = role
            else:
                role.name = spec["name"]
                role.description = spec["description"]
                role.is_system = True
            role.permissions = [permissions[code] for code in spec["permissions"] if code in permissions]
        self.db.commit()

    def authenticate(self, username: str, password: str, *, ip: str | None, user_agent: str | None) -> tuple[User, str, str]:
        identifier = username.strip()
        user = self.db.scalar(
            select(User).where(or_(User.username == identifier, func.lower(User.email) == identifier.lower()))
        )
        now = utcnow()
        if user and user.locked_until and user.locked_until > now:
            self.audit(user, "auth.login_locked", "user", str(user.id), {}, ip)
            self.db.commit()
            raise HTTPException(status_code=401, detail="Account is temporarily locked. Try again later.")
        if not user or not verify_password(password, user.password_hash):
            if user:
                user.failed_login_count += 1
                if user.failed_login_count >= MAX_FAILED_LOGINS:
                    user.locked_until = now + timedelta(minutes=LOCK_MINUTES)
                    user.failed_login_count = 0
                self.audit(user, "auth.login_failed", "user", str(user.id), {}, ip)
                self.db.commit()
            else:
                self.audit(None, "auth.login_failed", "user", identifier, {}, ip)
                self.db.commit()
            raise HTTPException(status_code=401, detail="Invalid username or password")
        if not user.is_active:
            self.audit(user, "auth.login_inactive", "user", str(user.id), {}, ip)
            self.db.commit()
            raise HTTPException(status_code=401, detail="This account is disabled")
        user.failed_login_count = 0
        user.locked_until = None
        user.last_login_at = now
        access, refresh = self.issue_session(user, ip=ip, user_agent=user_agent)
        self.audit(user, "auth.login", "user", str(user.id), {}, ip)
        self.db.commit()
        self.db.refresh(user)
        return user, access, refresh

    def rotate_refresh(self, token: str, *, ip: str | None, user_agent: str | None) -> tuple[User, str, str]:
        try:
            payload, user_id, session_id = decode_session_token(token, "refresh")
        except InvalidTokenError:
            raise HTTPException(status_code=401, detail="Not authenticated")
        supplied_hash = hash_token(token)
        for _attempt in range(2):
            query = select(RefreshToken).where(
                RefreshToken.id == session_id if session_id is not None else or_(
                    RefreshToken.token_hash == supplied_hash,
                    RefreshToken.previous_token_hash == supplied_hash,
                )
            ).with_for_update().execution_options(populate_existing=True)
            stored = self.db.scalar(query)
            now = utcnow()
            if not stored or stored.user_id != user_id or stored.revoked_at:
                raise HTTPException(status_code=401, detail="Not authenticated")
            user = self.db.get(User, user_id)
            if not user or not user.is_active or ("sv" in payload and payload["sv"] != user.session_version):
                raise HTTPException(status_code=401, detail="Not authenticated")
            legacy = stored.refresh_nonce is None or stored.rotated_at is None
            deadline = stored.expires_at
            if legacy:
                # Old seven-day tokens migrate only while their original row
                # is less than 24 hours old. They never receive a new clock.
                deadline = min(deadline, stored.created_at + timedelta(hours=settings.auth_session_hours))
            if deadline <= now:
                raise HTTPException(status_code=401, detail="Not authenticated")
            if stored.token_hash != supplied_hash:
                if legacy or stored.previous_token_hash != supplied_hash or not stored.previous_valid_until or stored.previous_valid_until <= now:
                    raise HTTPException(status_code=401, detail="Not authenticated")
                refresh = self._stored_refresh(user, stored)
                return self._refreshed_session(user, stored.id, deadline, refresh)
            retry_until = stored.previous_valid_until or (stored.rotated_at + timedelta(seconds=REFRESH_RETRY_GRACE_SECONDS) if stored.rotated_at else now)
            if not legacy and retry_until > now:
                # Do not create another generation during a retry window: all
                # overlapping tabs receive the same persisted successor.
                refresh = self._stored_refresh(user, stored)
                return self._refreshed_session(user, stored.id, deadline, refresh)
            nonce = secrets.token_urlsafe(24)
            issued_at = now.replace(microsecond=0)
            refresh = encode_refresh_token(user.id, nonce, session_id=stored.id, session_version=user.session_version, expires_at=deadline, issued_at=issued_at)
            # The compare-and-swap also serializes SQLite, where FOR UPDATE is
            # ignored. A losing concurrent refresh retries the saved successor.
            result = self.db.execute(update(RefreshToken).where(
                RefreshToken.id == stored.id,
                RefreshToken.token_hash == supplied_hash,
                RefreshToken.revoked_at.is_(None),
                RefreshToken.expires_at > now,
            ).values(
                token_hash=hash_token(refresh),
                refresh_nonce=nonce,
                rotated_at=issued_at,
                previous_token_hash=supplied_hash,
                previous_valid_until=min(now + timedelta(seconds=REFRESH_RETRY_GRACE_SECONDS), deadline),
                expires_at=deadline,
                user_agent=(user_agent or "")[:255] or None,
                ip_address=ip,
            ), execution_options={"synchronize_session": False})
            if result.rowcount == 1:
                return self._refreshed_session(user, stored.id, deadline, refresh)
            self.db.rollback()
        raise HTTPException(status_code=401, detail="Not authenticated")

    def _stored_refresh(self, user: User, stored: RefreshToken) -> str:
        refresh = encode_refresh_token(user.id, stored.refresh_nonce, session_id=stored.id, session_version=user.session_version, expires_at=stored.expires_at, issued_at=stored.rotated_at)
        if hash_token(refresh) != stored.token_hash:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return refresh

    def _refreshed_session(self, user: User, session_id: int, deadline: datetime, refresh: str) -> tuple[User, str, str]:
        access = access_token(user.id, user.session_version, session_id=session_id, expires_at=deadline)
        self.db.commit()
        self.db.refresh(user)
        return user, access, refresh

    def logout(self, token: str | None, user: User | None, *, ip: str | None, session_id: int | None = None) -> None:
        if token:
            try:
                _, owner_id, refresh_session_id = decode_session_token(token, "refresh")
                stored = self.db.get(RefreshToken, refresh_session_id) if refresh_session_id is not None else self.db.scalar(select(RefreshToken).where(or_(RefreshToken.token_hash == hash_token(token), RefreshToken.previous_token_hash == hash_token(token))))
                if stored and stored.user_id == owner_id:
                    stored.revoked_at = utcnow()
                    if user is None:
                        user = self.db.get(User, owner_id)
            except InvalidTokenError:
                pass
        if user and session_id is not None:
            stored = self.db.get(RefreshToken, session_id)
            if stored and stored.user_id == user.id:
                stored.revoked_at = utcnow()
        if user:
            self.audit(user, "auth.logout", "user", str(user.id), {}, ip)
        self.db.commit()

    def change_password(self, user: User, current_password: str, new_password: str, *, ip: str | None) -> None:
        self._assert_password_mutable(user)
        if not verify_password(current_password, user.password_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        if current_password == new_password:
            raise HTTPException(status_code=400, detail="New password must be different")
        user.password_hash = hash_password(new_password)
        user.must_change_password = False
        user.session_version += 1
        self._revoke_all_sessions(user.id)
        self.audit(user, "auth.password_changed", "user", str(user.id), {}, ip)
        self.db.flush()

    def list_users(self) -> list[User]:
        return list(self.db.scalars(select(User).order_by(User.display_name, User.id)))

    def get_user(self, user_id: int) -> User:
        user = self.db.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user

    def list_roles(self) -> list[Role]:
        return list(self.db.scalars(select(Role).order_by(Role.id)))

    def list_permissions(self) -> list[Permission]:
        return list(self.db.scalars(select(Permission).order_by(Permission.category, Permission.code)))

    def create_user(self, data: UserCreate, actor: User, *, ip: str | None) -> User:
        self._assert_unique(data.username, data.email)
        user = self._create_user(
            username=data.username,
            display_name=data.display_name,
            email=data.email,
            password=data.password,
            role_slugs=data.role_slugs,
            all_projects=data.all_projects,
            project_codes=data.project_codes,
            must_change_password=data.must_change_password,
            read_only_projects=data.read_only_projects,
        )
        self.audit(actor, "iam.user_created", "user", str(user.id), {"username": user.username, "roles": data.role_slugs}, ip)
        self.db.commit()
        self.db.refresh(user)
        return user

    def update_user(self, user_id: int, data: UserUpdate, actor: User, *, ip: str | None) -> User:
        user = self.get_user(user_id)
        values = data.model_dump(exclude_unset=True)
        if "email" in values:
            self._assert_unique(None, values["email"], exclude_id=user.id)
        if "display_name" in values:
            user.display_name = values["display_name"]
        if "email" in values:
            user.email = values["email"]
        if "is_active" in values:
            if user.is_active and values["is_active"] is False:
                self._protect_last_admin(user)
                user.session_version += 1
                self._revoke_all_sessions(user.id)
            user.is_active = values["is_active"]
        if "role_slugs" in values:
            if user.username == GUEST_USERNAME and set(values["role_slugs"]) != {GUEST_ROLE_SLUG}:
                raise HTTPException(status_code=400, detail="Guest account roles cannot be changed")
            if user.is_admin() and ADMIN_ROLE_SLUG not in values["role_slugs"]:
                self._protect_last_admin(user)
            user.roles = self._roles_from_slugs(values["role_slugs"])
        if "all_projects" in values or "project_codes" in values or "read_only_projects" in values or user.is_admin():
            all_projects = values.get("all_projects", user.all_projects)
            project_codes = values.get("project_codes", [link.project_code for link in user.project_links])
            if ADMIN_ROLE_SLUG in user.role_slugs():
                all_projects = True
                project_codes = []
            if not all_projects and not project_codes:
                raise HTTPException(status_code=400, detail="Assign at least one project, or grant access to all projects")
            user.all_projects = all_projects
            self._replace_projects(user, [] if all_projects else project_codes)
        read_only = values.get("read_only_projects", user.read_only_projects) or []
        if user.is_admin():
            read_only = []
        self._validate_projects(user.all_projects, [link.project_code for link in user.project_links], read_only)
        user.read_only_projects = list(dict.fromkeys(read_only))
        self.audit(actor, "iam.user_updated", "user", str(user.id), values, ip)
        self.db.commit()
        self.db.refresh(user)
        return user

    def reset_password(self, user_id: int, password: str, must_change: bool, actor: User, *, ip: str | None) -> User:
        user = self.get_user(user_id)
        self._assert_password_mutable(user)
        user.password_hash = hash_password(password)
        user.must_change_password = must_change
        user.failed_login_count = 0
        user.locked_until = None
        user.session_version += 1
        self._revoke_all_sessions(user.id)
        self.audit(actor, "iam.password_reset", "user", str(user.id), {"must_change_password": must_change}, ip)
        self.db.commit()
        self.db.refresh(user)
        return user

    def list_audit(self, limit: int = 50, offset: int = 0) -> tuple[list[AuditEvent], int]:
        total = self.db.scalar(select(func.count()).select_from(AuditEvent)) or 0
        items = list(
            self.db.scalars(
                select(AuditEvent).order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc()).offset(offset).limit(limit)
            )
        )
        return items, total

    def audit(self, actor: User | None, action: str, target_type: str | None, target_id: str | None, detail: dict, ip: str | None = None) -> None:
        self.db.add(
            AuditEvent(
                actor_user_id=actor.id if actor else None,
                actor_username=actor.username if actor else None,
                action=action,
                target_type=target_type,
                target_id=target_id,
                detail=json.dumps(detail, default=str) if detail else "",
                ip_address=ip,
            )
        )

    def _create_user(self, *, username: str, display_name: str, email: str | None, password: str, role_slugs: list[str], all_projects: bool, project_codes: list[str], must_change_password: bool, password_locked: bool = False, read_only_projects: list[str] | None = None) -> User:
        roles = self._roles_from_slugs(role_slugs)
        if any(role.slug == ADMIN_ROLE_SLUG for role in roles):
            all_projects = True
            project_codes = []
            read_only_projects = []
        if not all_projects and not project_codes:
            raise HTTPException(status_code=400, detail="Assign at least one project, or grant access to all projects")
        self._validate_projects(all_projects, project_codes, read_only_projects or [])
        user = User(
            username=username,
            email=email,
            display_name=display_name,
            password_hash=hash_password(password),
            is_active=True,
            must_change_password=must_change_password,
            password_locked=password_locked,
            all_projects=all_projects,
            read_only_projects=list(dict.fromkeys(read_only_projects or [])),
        )
        user.roles = roles
        self.db.add(user)
        self.db.flush()
        self._replace_projects(user, [] if all_projects else project_codes)
        return user

    def _validate_projects(self, all_projects: bool, codes: list[str], read_only: list[str]) -> None:
        from app.services.settings_service import SettingsService
        known = set(SettingsService(self.db).project_codes())
        if not set(codes + read_only).issubset(known):
            raise HTTPException(status_code=422, detail="Unknown project code in access assignment")
        if not all_projects and not set(read_only).issubset(codes):
            raise HTTPException(status_code=422, detail="Read-only projects must be assigned to this account")

    def _roles_from_slugs(self, slugs: list[str]) -> list[Role]:
        wanted = list(dict.fromkeys(slugs))
        if not wanted:
            raise HTTPException(status_code=400, detail="Assign at least one role")
        roles = list(self.db.scalars(select(Role).where(Role.slug.in_(wanted))))
        found = {role.slug for role in roles}
        missing = [slug for slug in wanted if slug not in found]
        if missing:
            raise HTTPException(status_code=400, detail=f"Unknown role: {missing[0]}")
        return roles

    def _replace_projects(self, user: User, project_codes: list[str]) -> None:
        user.project_links.clear()
        self.db.flush()
        for code in dict.fromkeys(project_codes):
            user.project_links.append(UserProject(user_id=user.id, project_code=code))

    def _assert_unique(self, username: str | None, email: str | None, exclude_id: int | None = None) -> None:
        if username:
            query = select(User).where(User.username == username)
            if exclude_id is not None:
                query = query.where(User.id != exclude_id)
            if self.db.scalar(query):
                raise HTTPException(status_code=409, detail="Username is already in use")
        if email:
            query = select(User).where(func.lower(User.email) == email.lower())
            if exclude_id is not None:
                query = query.where(User.id != exclude_id)
            if self.db.scalar(query):
                raise HTTPException(status_code=409, detail="Email is already in use")

    def _assert_password_mutable(self, user: User) -> None:
        if user.password_locked:
            raise HTTPException(status_code=400, detail="This account's password cannot be changed")

    def _protect_last_admin(self, user: User) -> None:
        if not user.is_admin():
            return
        active_admins = 0
        for item in self.db.scalars(select(User).where(User.is_active.is_(True))):
            if item.id != user.id and item.is_admin():
                active_admins += 1
        if active_admins == 0:
            raise HTTPException(status_code=400, detail="Cannot remove the last active administrator")

    def issue_session(self, user: User, *, ip: str | None, user_agent: str | None) -> tuple[str, str]:
        now = utcnow().replace(microsecond=0)
        stored = RefreshToken(
            user_id=user.id,
            token_hash=hash_token(secrets.token_urlsafe(32)),
            refresh_nonce=secrets.token_urlsafe(24),
            rotated_at=now,
            expires_at=now + timedelta(hours=settings.auth_session_hours),
            created_at=now,
            user_agent=(user_agent or "")[:255] or None,
            ip_address=ip,
        )
        self.db.add(stored)
        self.db.flush()
        refresh = encode_refresh_token(user.id, stored.refresh_nonce, session_id=stored.id, session_version=user.session_version, expires_at=stored.expires_at, issued_at=now)
        stored.token_hash = hash_token(refresh)
        return access_token(user.id, user.session_version, session_id=stored.id, expires_at=stored.expires_at), refresh

    def _revoke_all_sessions(self, user_id: int) -> None:
        now = utcnow()
        tokens = self.db.scalars(select(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)))
        for token in tokens:
            token.revoked_at = now
