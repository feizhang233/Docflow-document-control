"""merge Signature Process and Workflow Initiation into Workflow Prepare

Revision ID: 20260812_19
Revises: 20260725_18
"""
from typing import Sequence, Union
import json

from alembic import op
import sqlalchemy as sa

revision: str = "20260812_19"
down_revision: Union[str, None] = "20260725_18"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

LEGACY_STEPS = ("Signature Process", "Workflow Initiation")
MERGED_STEP = "Workflow Prepare"
DEFAULT_STEPS = ["Transmittal Preparation", "DCO Backup", MERGED_STEP, "Email Feedback"]


def _json(value):
    return json.loads(value) if isinstance(value, str) else (value or {})


def _merge_steps(steps):
    cleaned = [str(step).strip() for step in (steps or []) if str(step).strip()]
    if all(name in cleaned for name in LEGACY_STEPS):
        index = min(cleaned.index(name) for name in LEGACY_STEPS)
        merged = [step for step in cleaned if step not in LEGACY_STEPS]
        if MERGED_STEP not in merged:
            merged.insert(min(index, len(merged)), MERGED_STEP)
        return merged
    if len(cleaned) == 5:
        return [cleaned[0], cleaned[1], MERGED_STEP, cleaned[4]]
    return cleaned or DEFAULT_STEPS


def _merge_progress(progress, old_steps, new_steps):
    values = _json(progress)
    if all(name in values for name in LEGACY_STEPS):
        done = bool(values.get(LEGACY_STEPS[0]) and values.get(LEGACY_STEPS[1]))
    elif len(old_steps) == 5:
        done = bool(values.get(old_steps[2]) and values.get(old_steps[3]))
    else:
        done = bool(values.get(MERGED_STEP, False))
    migrated = {}
    for step in new_steps:
        if step == MERGED_STEP:
            migrated[step] = done or bool(values.get(MERGED_STEP, False))
        else:
            migrated[step] = bool(values.get(step, False))
    return migrated


def upgrade() -> None:
    bind = op.get_bind()
    configured_steps = DEFAULT_STEPS
    old_steps_by_config = DEFAULT_STEPS
    for row in bind.execute(sa.text("SELECT id, submission_steps FROM workflow_configs")).mappings():
        old_steps = [str(step).strip() for step in _json(row["submission_steps"]) if str(step).strip()]
        steps = _merge_steps(old_steps)
        configured_steps = steps
        old_steps_by_config = old_steps or DEFAULT_STEPS
        bind.execute(
            sa.text("UPDATE workflow_configs SET submission_steps = :steps WHERE id = :id"),
            {"steps": json.dumps(steps), "id": row["id"]},
        )
    for row in bind.execute(sa.text("SELECT id, submission_progress FROM packages")).mappings():
        migrated = _merge_progress(row["submission_progress"], old_steps_by_config, configured_steps)
        bind.execute(
            sa.text("UPDATE packages SET submission_progress = :progress WHERE id = :id"),
            {"progress": json.dumps(migrated), "id": row["id"]},
        )


def downgrade() -> None:
    bind = op.get_bind()
    for row in bind.execute(sa.text("SELECT id, submission_steps FROM workflow_configs")).mappings():
        steps = list(_json(row["submission_steps"]))
        if MERGED_STEP in steps:
            index = steps.index(MERGED_STEP)
            steps[index:index + 1] = list(LEGACY_STEPS)
        bind.execute(
            sa.text("UPDATE workflow_configs SET submission_steps = :steps WHERE id = :id"),
            {"steps": json.dumps(steps), "id": row["id"]},
        )
    for row in bind.execute(sa.text("SELECT id, submission_progress FROM packages")).mappings():
        progress = dict(_json(row["submission_progress"]))
        done = bool(progress.pop(MERGED_STEP, False))
        progress.setdefault(LEGACY_STEPS[0], done)
        progress.setdefault(LEGACY_STEPS[1], done)
        bind.execute(
            sa.text("UPDATE packages SET submission_progress = :progress WHERE id = :id"),
            {"progress": json.dumps(progress), "id": row["id"]},
        )
