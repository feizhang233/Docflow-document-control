from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.core.iam_catalog import MIN_PASSWORD_LENGTH, USERNAME_PATTERN
import re


def _clean_username(value: str) -> str:
    username = value.strip()
    if not re.fullmatch(USERNAME_PATTERN, username):
        raise ValueError("Username must be 3–32 characters: letters, numbers, dot, underscore, or hyphen")
    return username


def _clean_password(value: str) -> str:
    if len(value) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
    return value


class PermissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    category: str


class RoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    slug: str
    name: str
    description: str
    is_system: bool
    permissions: list[str] = []

    @field_validator("permissions", mode="before")
    @classmethod
    def permission_codes(cls, value):
        if not value:
            return []
        if isinstance(value, list) and value and hasattr(value[0], "code"):
            return [item.code for item in value]
        return value


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    email: str | None
    display_name: str
    is_active: bool
    must_change_password: bool
    password_locked: bool = False
    all_projects: bool
    project_codes: list[str] = []
    roles: list[RoleRead] = []
    permissions: list[str] = []
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime


class UserMe(UserRead):
    pass


class UserList(BaseModel):
    items: list[UserRead]
    total: int


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=1, max_length=200)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=200)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        return _clean_password(value)


class UserCreate(BaseModel):
    username: str
    display_name: str = Field(min_length=1, max_length=120)
    email: str | None = Field(default=None, max_length=255)
    password: str
    role_slugs: list[str] = Field(min_length=1)
    all_projects: bool = True
    project_codes: list[str] = []
    must_change_password: bool = True

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        return _clean_username(value)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return _clean_password(value)

    @field_validator("email", mode="before")
    @classmethod
    def empty_email(cls, value):
        if value is None:
            return None
        cleaned = str(value).strip().lower()
        return cleaned or None

    @field_validator("display_name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Display name is required")
        return cleaned

    @field_validator("project_codes", mode="before")
    @classmethod
    def normalize_projects(cls, value):
        return [str(code).strip().upper() for code in (value or []) if str(code).strip()]


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    email: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None
    role_slugs: list[str] | None = None
    all_projects: bool | None = None
    project_codes: list[str] | None = None

    @field_validator("display_name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Display name is required")
        return cleaned

    @field_validator("email", mode="before")
    @classmethod
    def empty_email(cls, value):
        if value is None:
            return None
        cleaned = str(value).strip().lower()
        return cleaned or None

    @field_validator("project_codes", mode="before")
    @classmethod
    def normalize_projects(cls, value):
        if value is None:
            return None
        return [str(code).strip().upper() for code in value if str(code).strip()]


class PasswordResetRequest(BaseModel):
    password: str
    must_change_password: bool = True

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return _clean_password(value)


class AuditEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    actor_user_id: int | None
    actor_username: str | None
    action: str
    target_type: str | None
    target_id: str | None
    detail: str
    ip_address: str | None
    created_at: datetime


class AuditEventList(BaseModel):
    items: list[AuditEventRead]
    total: int
