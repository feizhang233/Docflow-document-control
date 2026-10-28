"""Add account-specific column ordering without resetting visibility.

Revision ID: 20261028_29
Revises: 20261028_28
"""
from alembic import op
import sqlalchemy as sa


revision = "20261028_29"
down_revision = "20261028_28"
branch_labels = None
depends_on = None


def upgrade():
    # Backfill before enforcing NOT NULL; JSON defaults differ between MySQL
    # versions, and existing account visibility must remain untouched.
    op.add_column("user_column_preferences", sa.Column("column_order", sa.JSON(), nullable=True))
    op.execute("UPDATE user_column_preferences SET column_order = '[]' WHERE column_order IS NULL")
    with op.batch_alter_table("user_column_preferences") as batch:
        batch.alter_column("column_order", existing_type=sa.JSON(), nullable=False)


def downgrade():
    with op.batch_alter_table("user_column_preferences") as batch:
        batch.drop_column("column_order")
