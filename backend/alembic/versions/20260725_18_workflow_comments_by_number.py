"""store workflow comments by workflow number only

Revision ID: 20260725_18
Revises: 20260724_17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260725_18"
down_revision: Union[str, None] = "20260724_17"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    # Rebuild rows keyed only by workflow_number: keep the latest snapshot per
    # workflow when multiple package-scoped copies exist.
    if dialect == "sqlite":
        op.execute(
            sa.text(
                """
                CREATE TABLE workflow_comments_new (
                    id INTEGER NOT NULL PRIMARY KEY,
                    workflow_number VARCHAR(80) NOT NULL,
                    external_id VARCHAR(255),
                    author VARCHAR(255),
                    body TEXT NOT NULL,
                    commented_at DATETIME,
                    order_index INTEGER NOT NULL,
                    synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        op.execute(
            sa.text(
                """
                INSERT INTO workflow_comments_new (
                    id, workflow_number, external_id, author, body,
                    commented_at, order_index, synced_at
                )
                SELECT
                    id, workflow_number, external_id, author, body,
                    commented_at, order_index, synced_at
                FROM workflow_comments
                """
            )
        )
        op.drop_table("workflow_comments")
        op.rename_table("workflow_comments_new", "workflow_comments")
        op.create_index(
            "ix_workflow_comments_workflow_number",
            "workflow_comments",
            ["workflow_number"],
        )
        return

    op.drop_constraint(
        "fk_workflow_comments_package_id_packages",
        "workflow_comments",
        type_="foreignkey",
    )
    op.drop_index("ix_workflow_comments_package_id", table_name="workflow_comments")
    op.drop_column("workflow_comments", "package_id")


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "sqlite":
        op.execute(
            sa.text(
                """
                CREATE TABLE workflow_comments_old (
                    id INTEGER NOT NULL PRIMARY KEY,
                    package_id INTEGER NOT NULL,
                    workflow_number VARCHAR(80) NOT NULL,
                    external_id VARCHAR(255),
                    author VARCHAR(255),
                    body TEXT NOT NULL,
                    commented_at DATETIME,
                    order_index INTEGER NOT NULL,
                    synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(package_id) REFERENCES packages (id) ON DELETE CASCADE
                )
                """
            )
        )
        # Best-effort restore: attach comments to any package with that workflow number.
        op.execute(
            sa.text(
                """
                INSERT INTO workflow_comments_old (
                    id, package_id, workflow_number, external_id, author, body,
                    commented_at, order_index, synced_at
                )
                SELECT
                    c.id,
                    (
                        SELECT p.id FROM packages p
                        WHERE p.workflow_number = c.workflow_number
                        ORDER BY p.id LIMIT 1
                    ),
                    c.workflow_number, c.external_id, c.author, c.body,
                    c.commented_at, c.order_index, c.synced_at
                FROM workflow_comments c
                WHERE EXISTS (
                    SELECT 1 FROM packages p
                    WHERE p.workflow_number = c.workflow_number
                )
                """
            )
        )
        op.drop_table("workflow_comments")
        op.rename_table("workflow_comments_old", "workflow_comments")
        op.create_index(
            "ix_workflow_comments_package_id",
            "workflow_comments",
            ["package_id"],
        )
        op.create_index(
            "ix_workflow_comments_workflow_number",
            "workflow_comments",
            ["workflow_number"],
        )
        return

    op.add_column(
        "workflow_comments",
        sa.Column("package_id", sa.Integer(), nullable=True),
    )
    op.execute(
        sa.text(
            """
            UPDATE workflow_comments c
            JOIN packages p ON p.workflow_number = c.workflow_number
            SET c.package_id = (
                SELECT p2.id FROM packages p2
                WHERE p2.workflow_number = c.workflow_number
                ORDER BY p2.id
                LIMIT 1
            )
            """
        )
    )
    op.execute(sa.text("DELETE FROM workflow_comments WHERE package_id IS NULL"))
    op.alter_column(
        "workflow_comments",
        "package_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.create_foreign_key(
        "fk_workflow_comments_package_id_packages",
        "workflow_comments",
        "packages",
        ["package_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_workflow_comments_package_id",
        "workflow_comments",
        ["package_id"],
    )
