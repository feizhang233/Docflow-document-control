"""Scope notification email subscriptions to their account owner.

Revision ID: 20261009_27
Revises: 20261009_26
"""
from alembic import op

revision = "20261009_27"
down_revision = "20261009_26"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("email_subscriptions") as batch:
        batch.drop_constraint("uq_email_subscription_project_email", type_="unique")
        batch.create_unique_constraint("uq_email_subscription_owner_project_email", ["created_by_id", "project_code", "email"])


def downgrade():
    # A downgrade requires resolving any shared project/email pairs first.
    # Preserve subscriptions instead of silently deleting another owner's data.
    with op.batch_alter_table("email_subscriptions") as batch:
        batch.drop_constraint("uq_email_subscription_owner_project_email", type_="unique")
        batch.create_unique_constraint("uq_email_subscription_project_email", ["project_code", "email"])
