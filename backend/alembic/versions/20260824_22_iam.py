"""identity and access management

Revision ID: 20260824_22
Revises: 20260813_21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260824_22"
down_revision: Union[str, None] = "20260813_21"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes(table: str) -> set[str]:
    return {item["name"] for item in sa.inspect(op.get_bind()).get_indexes(table) if item.get("name")}


def _ensure_index(table: str, name: str, columns: list[str]) -> None:
    if name not in _indexes(table):
        op.create_index(name, table, columns)


def upgrade() -> None:
    existing = _tables()
    if "permissions" not in existing:
        op.create_table(
            "permissions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("code", sa.String(length=80), nullable=False),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("category", sa.String(length=40), nullable=False),
            sa.UniqueConstraint("code", name="uq_permissions_code"),
        )
    _ensure_index("permissions", "ix_permissions_code", ["code"])

    if "roles" not in existing:
        op.create_table(
            "roles",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("slug", sa.String(length=40), nullable=False),
            sa.Column("name", sa.String(length=80), nullable=False),
            sa.Column("description", sa.String(length=255), nullable=False, server_default=""),
            sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.UniqueConstraint("slug", name="uq_roles_slug"),
        )
    _ensure_index("roles", "ix_roles_slug", ["slug"])

    if "users" not in existing:
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("username", sa.String(length=32), nullable=False),
            sa.Column("email", sa.String(length=255), nullable=True),
            sa.Column("display_name", sa.String(length=120), nullable=False),
            sa.Column("password_hash", sa.String(length=255), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("all_projects", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("session_version", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("failed_login_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("locked_until", sa.DateTime(), nullable=True),
            sa.Column("last_login_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("username", name="uq_users_username"),
            sa.UniqueConstraint("email", name="uq_users_email"),
        )
    _ensure_index("users", "ix_users_username", ["username"])

    if "user_roles" not in existing:
        op.create_table(
            "user_roles",
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("role_id", sa.Integer(), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        )
    if "role_permissions" not in existing:
        op.create_table(
            "role_permissions",
            sa.Column("role_id", sa.Integer(), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("permission_id", sa.Integer(), sa.ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
        )
    if "user_projects" not in existing:
        op.create_table(
            "user_projects",
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("project_code", sa.String(length=16), primary_key=True),
        )
    if "refresh_tokens" not in existing:
        op.create_table(
            "refresh_tokens",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("token_hash", sa.String(length=64), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.Column("user_agent", sa.String(length=255), nullable=True),
            sa.Column("ip_address", sa.String(length=64), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),
        )
    _ensure_index("refresh_tokens", "ix_refresh_tokens_user_id", ["user_id"])
    _ensure_index("refresh_tokens", "ix_refresh_tokens_expires_at", ["expires_at"])
    if "audit_events" not in existing:
        op.create_table(
            "audit_events",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("actor_user_id", sa.Integer(), nullable=True),
            sa.Column("actor_username", sa.String(length=32), nullable=True),
            sa.Column("action", sa.String(length=80), nullable=False),
            sa.Column("target_type", sa.String(length=40), nullable=True),
            sa.Column("target_id", sa.String(length=40), nullable=True),
            sa.Column("detail", sa.Text(), nullable=False),
            sa.Column("ip_address", sa.String(length=64), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
    _ensure_index("audit_events", "ix_audit_events_actor_user_id", ["actor_user_id"])
    _ensure_index("audit_events", "ix_audit_events_action", ["action"])
    _ensure_index("audit_events", "ix_audit_events_created_at", ["created_at"])


def downgrade() -> None:
    existing = _tables()
    for table in ("audit_events", "refresh_tokens", "user_projects", "role_permissions", "user_roles", "users", "roles", "permissions"):
        if table in existing:
            op.drop_table(table)
