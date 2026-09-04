from datetime import date
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.repositories.package_repository import PackageRepository
from app.schemas.package import PackageCreate, PackageUpdate, TransmittalSeries, TransmittalSuggestions, TransmittalUse, merge_submission_progress
from app.services.notification_service import NotificationService, describe_submission_progress, describe_workflow_update
from app.services.settings_service import SettingsService, remap_submission_progress
from app.services.transmittal import suggestions_for_project

class PackageService:
    def __init__(self, db: Session): self.repo = PackageRepository(db)
    def create(self, data: PackageCreate):
        values = data.model_dump()
        settings = SettingsService(self.repo.db)
        values["project_code"] = settings.require_project_code(values.get("project_code"))
        if not values["document_number"].strip():
            values["document_number"] = f"DRAFT-{date.today():%Y%m%d}-{uuid4().hex[:8].upper()}"
        values["submission_progress"] = self._progress_for_project(values["project_code"], values.get("submission_progress"))
        values["feedback"], values["feedback_status"] = self._feedback_for_workflow(
            settings.get_workflow_config(), values.get("feedback"), values.get("feedback_status"),
        )
        return self.repo.create(values)
    def update(self, package_id: int, data: PackageUpdate):
        item = self.require(package_id)
        values = data.model_dump(exclude_unset=True)
        settings = SettingsService(self.repo.db)
        if "project_code" in values:
            values["project_code"] = settings.require_project_code(values.get("project_code"))
        target_project = values.get("project_code", item.project_code)
        newly_assigned_workflow = (
            "workflow_number" in values
            and bool(str(values.get("workflow_number") or "").strip())
            and not str(item.workflow_number or "").strip()
        )
        if newly_assigned_workflow and "submission_progress" not in values:
            values["submission_progress"] = {step: True for step in settings.submission_steps_for(target_project)}
        elif "project_code" in values and values["project_code"] != item.project_code and "submission_progress" not in values:
            values["submission_progress"] = remap_submission_progress(
                item.submission_progress,
                settings.submission_steps_for(item.project_code),
                settings.submission_steps_for(values["project_code"]),
            )
        if "submission_progress" in values:
            values["submission_progress"] = self._progress_for_project(target_project, values.get("submission_progress"))
        if values.get("document_number") is not None and not values["document_number"].strip():
            values["document_number"] = f"DRAFT-{date.today():%Y%m%d}-{uuid4().hex[:8].upper()}"
        previous_submission = dict(item.submission_progress)
        previous_feedback = dict(item.feedback)
        previous_feedback_status = dict(item.feedback_status)
        previous_terminated = item.workflow_terminated
        tracked = [key for key in ("workflow_terminated", "submission_progress", "feedback", "feedback_status") if key in values and values[key] != getattr(item, key)]
        updated = self.repo.update(item, values)
        notifications = NotificationService(self.repo.db)
        if "submission_progress" in tracked:
            progress_changes = {step:completed for step,completed in updated.submission_progress.items() if previous_submission.get(step) != completed}
            notifications.create_submission_progress_update(
                package_id=updated.id,
                workflow_number=updated.workflow_number, document_number=updated.document_number,
                message=describe_submission_progress(progress_changes),
            )
        feedback_changes = [key for key in ("workflow_terminated", "feedback", "feedback_status") if key in tracked]
        if feedback_changes:
            changed_statuses = {reviewer:code for reviewer,code in updated.feedback_status.items() if previous_feedback_status.get(reviewer) != code}
            changed_feedback = {reviewer:received for reviewer,received in updated.feedback.items() if previous_feedback.get(reviewer) != received and reviewer not in changed_statuses}
            status_labels = SettingsService(self.repo.db).get_workflow_config().feedback_status_labels
            notifications.create_workflow_feedback_update(
                package_id=updated.id,
                workflow_number=updated.workflow_number, document_number=updated.document_number,
                message=describe_workflow_update(
                    feedback_status=changed_statuses,
                    feedback=changed_feedback,
                    terminate_workflow=updated.workflow_terminated if previous_terminated != updated.workflow_terminated else None,
                    status_labels=status_labels,
                ),
            )
        return updated
    def _feedback_for_workflow(self, workflow, feedback: dict | None, feedback_status: dict | None):
        reviewers = list(workflow.feedback_reviewers)
        current_feedback = dict(feedback or {})
        current_status = dict(feedback_status or {})
        previous = [key for key in current_feedback if key != "Terminate"]
        mapped_feedback = {
            reviewer: bool(current_feedback.get(previous[index] if index < len(previous) else reviewer, False))
            for index, reviewer in enumerate(reviewers)
        }
        mapped_feedback["Terminate"] = bool(current_feedback.get("Terminate", False))
        mapped_status = {
            reviewer: current_status.get(previous[index] if index < len(previous) else reviewer, current_status.get(reviewer, "P"))
            for index, reviewer in enumerate(reviewers)
        }
        return mapped_feedback, mapped_status
    def _progress_for_project(self, project_code: str, progress: dict | None):
        steps = SettingsService(self.repo.db).submission_steps_for(project_code)
        current = merge_submission_progress(progress)
        if all(step in current for step in steps):
            return {step: bool(current.get(step, False)) for step in steps}
        return remap_submission_progress(current, list(current.keys()), steps)
    def transmittal_suggestions(self, project_code: str, allowed_projects: list[str] | None = None):
        used = self.repo.list_transmittals(project_code=project_code, allowed_projects=allowed_projects)
        numbers = [row["transmittal_number"] for row in used]
        return TransmittalSuggestions(
            project_code=project_code,
            series=[TransmittalSeries(**entry) for entry in suggestions_for_project(project_code, numbers)],
            used=[TransmittalUse(**row) for row in used],
        )
    def require(self, package_id: int):
        item = self.repo.get(package_id)
        if not item: raise HTTPException(status_code=404, detail="Package not found")
        return item
    def duplicate(self, package_id: int):
        item = self.require(package_id)
        # Revisions may share a number; -COPY marks the cloned register row.
        number = f"{item.document_number}-COPY"
        values = {
            "project_code": item.project_code, "document_number": number, "document_title": item.document_title, "document_date": item.document_date, "document_type": item.document_type,
            "initiator": item.initiator, "discipline": item.discipline, "number_of_documents": item.number_of_documents,
            "transmittal_number": None, "workflow_number": None, "workflow_terminated": False,
            "notes": item.notes, "has_attachment": item.has_attachment, "is_abandoned": False,
            "submission_progress": {step: False for step in item.submission_progress},
            "feedback": {step: False for step in item.feedback}, "feedback_status": {reviewer:"P" for reviewer in item.feedback_status},
            "order_index": item.order_index + 1,
        }
        return self.repo.create(values)
