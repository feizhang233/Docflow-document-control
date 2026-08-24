from __future__ import annotations

import json
import re
import secrets
from datetime import timedelta
from fastapi import HTTPException
from jwt import InvalidTokenError
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.iam_catalog import ADMIN_ROLE_SLUG, MIN_PASSWORD_LENGTH, PERMISSIONS, ROLES, USERNAME_PATTERN
from app.core.security import (
    access_token,
    decode_jwt,
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


def user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "display_name": user.display_name,
        "is_active": user.is_active,
        "must_change_password": user.must_change_password,
        "all_projects": user.all_projects,
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
        if (self.db.scalar(select(func.count()).select_from(User)) or 0) > 0:
            return None
        username = (settings.bootstrap_admin_username or "admin").strip()
        if not re.fullmatch(USERNAME_PATTERN, username):
            username = "admin"
        password = settings.bootstrap_admin_password
        generated = False
        if not password or len(password) < MIN_PASSWORD_LENGTH:
            password = secrets.token_urlsafe(18)
            generated = True
        email = settings.bootstrap_admin_email.strip().lower() or None
        user = self._create_user(
            username=username,
            display_name=(settings.bootstrap_admin_name or "Administrator").strip() or "Administrator",
            email=email,
            password=password,
            role_slugs=[ADMIN_ROLE_SLUG],
            all_projects=True,
            project_codes=[],
            must_change_password=True,
        )
        self.audit(None, "iam.bootstrap_admin", "user", str(user.id), {"username": user.username, "generated_password": generated}, None)
        self.db.commit()
        self.db.refresh(user)
        if generated:
            print(f"DocFlow bootstrap admin created: username={user.username} password={password}", flush=True)
        else:
            print(f"DocFlow bootstrap admin created: username={user.username}", flush=True)
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
        access, refresh = self._issue_session(user, ip=ip, user_agent=user_agent)
        self.audit(user, "auth.login", "user", str(user.id), {}, ip)
        self.db.commit()
        self.db.refresh(user)
        return user, access, refresh

    def rotate_refresh(self, token: str, *, ip: str | None, user_agent: str | None) -> tuple[User, str, str]:
        try:
            payload = decode_jwt(token)
        except InvalidTokenError:
            raise HTTPException(status_code=401, detail="Not authenticated")
        if payload.get("typ") != "refresh":
            raise HTTPException(status_code=401, detail="Not authenticated")
        stored = self.db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(token)))
        now = utcnow()
        if not stored or stored.revoked_at or stored.expires_at <= now:
            raise HTTPException(status_code=401, detail="Not authenticated")
        user = self.db.get(User, stored.user_id)
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="Not authenticated")
        stored.revoked_at = now
        access, refresh = self._issue_session(user, ip=ip, user_agent=user_agent)
        self.db.commit()
        self.db.refresh(user)
        return user, access, refresh

    def logout(self, token: str | None, user: User | None, *, ip: str | None) -> None:
        if token:
            stored = self.db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(token)))
            if stored and not stored.revoked_at:
                stored.revoked_at = utcnow()
        if user:
            self.audit(user, "auth.logout", "user", str(user.id), {}, ip)
        self.db.commit()

    def change_password(self, user: User, current_password: str, new_password: str, *, ip: str | None) -> None:
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
            if user.is_admin() and ADMIN_ROLE_SLUG not in values["role_slugs"]:
                self._protect_last_admin(user)
            user.roles = self._roles_from_slugs(values["role_slugs"])
        if "all_projects" in values or "project_codes" in values:
            all_projects = values.get("all_projects", user.all_projects)
            project_codes = values.get("project_codes", [link.project_code for link in user.project_links])
            if ADMIN_ROLE_SLUG in user.role_slugs():
                all_projects = True
                project_codes = []
            if not all_projects and not project_codes:
                raise HTTPException(status_code=400, detail="Assign at least one project, or grant access to all projects")
            user.all_projects = all_projects
            self._replace_projects(user, [] if all_projects else project_codes)
        self.audit(actor, "iam.user_updated", "user", str(user.id), values, ip)
        self.db.commit()
        self.db.refresh(user)
        return user

    def reset_password(self, user_id: int, password: str, must_change: bool, actor: User, *, ip: str | None) -> User:
        user = self.get_user(user_id)
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

    def _create_user(self, *, username: str, display_name: str, email: str | None, password: str, role_slugs: list[str], all_projects: bool, project_codes: list[str], must_change_password: bool) -> User:
        roles = self._roles_from_slugs(role_slugs)
        if any(role.slug == ADMIN_ROLE_SLUG for role in roles):
            all_projects = True
            project_codes = []
        if not all_projects and not project_codes:
            raise HTTPException(status_code=400, detail="Assign at least one project, or grant access to all projects")
        user = User(
            username=username,
            email=email,
            display_name=display_name,
            password_hash=hash_password(password),
            is_active=True,
            must_change_password=must_change_password,
            all_projects=all_projects,
        )
        user.roles = roles
        self.db.add(user)
        self.db.flush()
        self._replace_projects(user, [] if all_projects else project_codes)
        return user

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
        return self._issue_session(user, ip=ip, user_agent=user_agent)

    def _issue_session(self, user: User, *, ip: str | None, user_agent: str | None) -> tuple[str, str]:
        token_id = secrets.token_urlsafe(16)
        refresh = encode_refresh_token(user.id, token_id)
        self.db.add(
            RefreshToken(
                user_id=user.id,
                token_hash=hash_token(refresh),
                expires_at=utcnow() + timedelta(days=settings.auth_refresh_days),
                user_agent=(user_agent or "")[:255] or None,
                ip_address=ip,
            )
        )
        return access_token(user.id, user.session_version), refresh

    def _revoke_all_sessions(self, user_id: int) -> None:
        now = utcnow()
        tokens = self.db.scalars(select(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)))
        for token in tokens:
            token.revoked_at = now
