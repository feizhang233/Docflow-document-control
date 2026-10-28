"""Persist stable login sessions and tolerate overlapping refresh requests.

Revision ID: 20261028_30
Revises: 20261028_29
"""
from alembic import op
import sqlalchemy as sa


revision = "20261028_30"
down_revision = "20261028_29"
branch_labels = None
depends_on = None


def upgrade():
    # Nullable fields preserve legacy tokens for a bounded first refresh.
    op.add_column("refresh_tokens", sa.Column("refresh_nonce", sa.String(64), nullable=True))
    op.add_column("refresh_tokens", sa.Column("rotated_at", sa.DateTime(), nullable=True))
    op.add_column("refresh_tokens", sa.Column("previous_token_hash", sa.String(64), nullable=True))
    op.add_column("refresh_tokens", sa.Column("previous_valid_until", sa.DateTime(), nullable=True))
    op.create_index("ix_refresh_tokens_previous_token_hash", "refresh_tokens", ["previous_token_hash"])


def downgrade():
    op.drop_index("ix_refresh_tokens_previous_token_hash", table_name="refresh_tokens")
    with op.batch_alter_table("refresh_tokens") as batch:
        batch.drop_column("previous_valid_until")
        batch.drop_column("previous_token_hash")
        batch.drop_column("rotated_at")
        batch.drop_column("refresh_nonce")
