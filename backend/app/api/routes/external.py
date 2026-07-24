import secrets
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.session import get_db
from app.repositories.package_repository import PackageRepository
from app.schemas.notification import ExternalWorkflowUpdate
from app.schemas.package import PackageRead
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

def verify_api_key(x_api_key: str = Header(..., alias="X-API-Key")):
    if not secrets.compare_digest(x_api_key, settings.external_api_key):
        raise HTTPException(status_code=401, detail="Invalid API key")

@router.patch("/workflows/{workflow_number}", response_model=PackageRead, dependencies=[Depends(verify_api_key)])
def update_workflow(workflow_number: str, data: ExternalWorkflowUpdate, db: Session = Depends(get_db)):
    repo = PackageRepository(db)
    item = repo.get_by_workflow_number(workflow_number)
    if not item: raise HTTPException(status_code=404, detail="Workflow not found")
    config = SettingsService(db).get_workflow_config()
    if data.submission_progress is not None and not set(data.submission_progress).issubset(config.submission_steps): raise HTTPException(status_code=422, detail="Unknown submission progress step")
    allowed_feedback = set(config.feedback_reviewers) | {"Terminate"}
    if data.feedback is not None and not set(data.feedback).issubset(allowed_feedback): raise HTTPException(status_code=422, detail="Unknown feedback reviewer")
    if data.feedback_status is not None and not set(data.feedback_status).issubset(config.feedback_reviewers): raise HTTPException(status_code=422, detail="Unknown feedback status reviewer")
    values = {}
    if data.submission_progress is not None: values["submission_progress"] = {**item.submission_progress, **data.submission_progress}
    if data.feedback is not None: values["feedback"] = {**item.feedback, **data.feedback}
    if data.feedback_status is not None:
        statuses = {**item.feedback_status, **data.feedback_status}
        values["feedback_status"] = statuses
        values["feedback"] = {**values.get("feedback", item.feedback), **{reviewer: status != "P" for reviewer, status in data.feedback_status.items()}}
    if data.terminate_workflow is not None: values["workflow_terminated"] = data.terminate_workflow
    if not values: raise HTTPException(status_code=400, detail="No workflow status fields supplied")
    item = repo.update(item, values)
    notifications = NotificationService(db)
    if data.submission_progress is not None:
        notifications.create_submission_progress_update(
            package_id=item.id,
            workflow_number=workflow_number, document_number=item.document_number,
            message=combine_update_message(data.message, describe_submission_progress(data.submission_progress)),
        )
    if data.feedback is not None or data.feedback_status is not None or data.terminate_workflow is not None:
        notifications.create_workflow_feedback_update(
            package_id=item.id,
            workflow_number=workflow_number, document_number=item.document_number,
            message=combine_update_message(data.message, describe_workflow_update(
                feedback_status=data.feedback_status,
                feedback=data.feedback,
                terminate_workflow=data.terminate_workflow,
                status_labels=config.feedback_status_labels,
            )),
        )
    return item


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
