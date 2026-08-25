import secrets
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.session import get_db
from app.repositories.package_repository import PackageRepository
from app.schemas.notification import ExternalWorkflowUpdate
from app.schemas.package import PackageRead
from app.schemas.settings import WorkflowConfigRead
from app.schemas.workflow_comment import (
    WorkflowCommentList,
    WorkflowCommentsBulkImport,
    WorkflowCommentsBulkImportResult,
    WorkflowCommentsWrite,
)
from app.services.notification_service import NotificationService, combine_update_message, describe_submission_progress, describe_workflow_update
from app.services.settings_service import SettingsService
from app.services.workflow_comment_service import WorkflowCommentService

router = APIRouter(prefix="/external", tags=["external automation"])

# Final Aconex review codes must not be silently downgraded to Pending by a
# partial/stale automation payload (merge would otherwise overwrite C→P).
_FINAL_FEEDBACK_CODES = frozenset({"A", "B", "C"})


def verify_api_key(x_api_key: str = Header(..., alias="X-API-Key")):
    if not secrets.compare_digest(x_api_key, settings.external_api_key):
        raise HTTPException(status_code=401, detail="Invalid API key")


def merge_feedback_status(existing: dict[str, str], incoming: dict[str, str]) -> dict[str, str]:
    """Merge automation feedback codes without downgrading A/B/C back to P."""
    merged = {str(key): str(value) for key, value in (existing or {}).items()}
    for reviewer, code in (incoming or {}).items():
        next_code = str(code or "P").strip().upper() or "P"
        previous = str(merged.get(reviewer) or "P").strip().upper() or "P"
        if next_code == "P" and previous in _FINAL_FEEDBACK_CODES:
            continue
        merged[str(reviewer)] = next_code
    return merged


def _values_for_package(item, data: ExternalWorkflowUpdate) -> dict:
    values: dict = {}
    if data.submission_progress is not None:
        values["submission_progress"] = {**item.submission_progress, **data.submission_progress}
    if data.feedback is not None:
        values["feedback"] = {**item.feedback, **data.feedback}
    if data.feedback_status is not None:
        statuses = merge_feedback_status(item.feedback_status, data.feedback_status)
        values["feedback_status"] = statuses
        # Derive stage completion from the *merged* statuses so a rejected
        # downgrade of GDS→P cannot clear an already-completed GDS stage.
        derived = {reviewer: status != "P" for reviewer, status in statuses.items()}
        values["feedback"] = {**values.get("feedback", item.feedback), **derived}
    if data.terminate_workflow is not None:
        values["workflow_terminated"] = data.terminate_workflow
    return values


@router.get(
    "/settings/workflow",
    response_model=WorkflowConfigRead,
    dependencies=[Depends(verify_api_key)],
)
def get_workflow_settings(db: Session = Depends(get_db)):
    """Return reviewer names and workflow labels for unattended Aconex sync.

    The UI route ``GET /api/settings/workflow`` requires a logged-in user.
    Automation authenticates with ``X-API-Key`` and must use this endpoint.
    """
    return SettingsService(db).get_workflow_config()


@router.patch("/workflows/{workflow_number}", response_model=PackageRead, dependencies=[Depends(verify_api_key)])
def update_workflow(workflow_number: str, data: ExternalWorkflowUpdate, db: Session = Depends(get_db)):
    repo = PackageRepository(db)
    items = repo.list_by_workflow_number(workflow_number)
    if not items:
        raise HTTPException(status_code=404, detail="Workflow not found")
    settings_service = SettingsService(db)
    config = settings_service.get_workflow_config()
    allowed_feedback = set(config.feedback_reviewers) | {"Terminate"}
    if data.feedback is not None and not set(data.feedback).issubset(allowed_feedback):
        raise HTTPException(status_code=422, detail="Unknown feedback reviewer")
    if data.feedback_status is not None and not set(data.feedback_status).issubset(config.feedback_reviewers):
        raise HTTPException(status_code=422, detail="Unknown feedback status reviewer")

    updated_items = []
    for item in items:
        if data.submission_progress is not None and not set(data.submission_progress).issubset(settings_service.submission_steps_for(item.project_code)):
            raise HTTPException(status_code=422, detail="Unknown submission progress step")
        values = _values_for_package(item, data)
        if not values:
            continue
        updated_items.append(repo.update(item, values))
    if not updated_items:
        raise HTTPException(status_code=400, detail="No workflow status fields supplied")

    # One notification on the primary (lowest-id) package is enough for the register bell.
    primary = updated_items[0]
    notifications = NotificationService(db)
    if data.submission_progress is not None:
        notifications.create_submission_progress_update(
            package_id=primary.id,
            workflow_number=workflow_number,
            document_number=primary.document_number,
            message=combine_update_message(data.message, describe_submission_progress(data.submission_progress)),
        )
    if data.feedback is not None or data.feedback_status is not None or data.terminate_workflow is not None:
        notifications.create_workflow_feedback_update(
            package_id=primary.id,
            workflow_number=workflow_number,
            document_number=primary.document_number,
            message=combine_update_message(
                data.message,
                describe_workflow_update(
                    feedback_status=data.feedback_status,
                    feedback=data.feedback,
                    terminate_workflow=data.terminate_workflow,
                    status_labels=config.feedback_status_labels,
                ),
            ),
        )
    return primary


@router.put(
    "/workflows/{workflow_number}/comments",
    response_model=WorkflowCommentList,
    dependencies=[Depends(verify_api_key)],
)
def replace_workflow_comments(
    workflow_number: str,
    data: WorkflowCommentsWrite,
    db: Session = Depends(get_db),
):
    """Replace the comment snapshot for a workflow number.

    Matching is by workflow number only. A package/document does not need to
    exist first; any package that uses this workflow number will see the
    comments.
    """
    items = WorkflowCommentService(db).replace_for_workflow_number(
        workflow_number,
        data.comments,
    )
    return WorkflowCommentList(items=items, total=len(items))


@router.put(
    "/workflow-comments",
    response_model=WorkflowCommentsBulkImportResult,
    dependencies=[Depends(verify_api_key)],
)
def import_workflow_comments(
    data: WorkflowCommentsBulkImport,
    db: Session = Depends(get_db),
):
    """Import complete Final Mail comment snapshots for many workflows.

    Each item atomically replaces the stored comments for that workflow number.
    Matching is by workflow number only — never by document number or package
    name. Packages are not required; comments are stored under the workflow
    number so every document that uses it can read them.
    """
    return WorkflowCommentService(db).bulk_import(data.items)
