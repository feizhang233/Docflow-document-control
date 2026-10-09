"""Project read-only overrides and durable project email subscriptions.

Revision ID: 20261009_26
Revises: 20260903_25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mysql import LONGTEXT

revision = "20261009_26"
down_revision = "20260903_25"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("read_only_projects", sa.JSON(), nullable=True))
    users = sa.table("users", sa.column("read_only_projects", sa.JSON()))
    op.execute(users.update().values(read_only_projects=[]))
    with op.batch_alter_table("users") as batch:
        batch.alter_column("read_only_projects", existing_type=sa.JSON(), nullable=False)
    op.create_table(
        "email_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_code", sa.String(16), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("event_types", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("project_code", "email", name="uq_email_subscription_project_email"),
    )
    op.create_index("ix_email_subscriptions_project_code", "email_subscriptions", ["project_code"])
    op.create_table(
        "email_deliveries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("subscription_id", sa.Integer(), sa.ForeignKey("email_subscriptions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_code", sa.String(16), nullable=False),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("body", sa.Text().with_variant(LONGTEXT(), "mysql"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("available_at", sa.DateTime(), nullable=False),
        sa.Column("last_error", sa.String(255)),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("sent_at", sa.DateTime()),
    )
    for field in ("subscription_id", "status", "available_at"):
        op.create_index(f"ix_email_deliveries_{field}", "email_deliveries", [field])


def downgrade():
    op.drop_table("email_deliveries")
    op.drop_table("email_subscriptions")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("read_only_projects")
