from collections.abc import Sequence
from datetime import timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.workflow_comment import WorkflowComment
from app.models.package import Package
from app.services.email_notification_service import EmailNotificationService
from app.services.notification_service import NotificationService
from app.schemas.workflow_comment import (
    WorkflowCommentInput,
    WorkflowCommentsBulkImportResult,
    WorkflowCommentsImportItem,
    WorkflowCommentsImportResultItem,
)


class WorkflowCommentService:
    def __init__(self, db: Session):
        self.db = db

    def list_for_workflow_number(self, workflow_number: str) -> list[WorkflowComment]:
        number = (workflow_number or "").strip()
        if not number:
            return []
        query = (
            select(WorkflowComment)
            .where(WorkflowComment.workflow_number == number)
            .order_by(WorkflowComment.order_index, WorkflowComment.id)
        )
        return list(self.db.scalars(query))

    def list_for_package(self, package) -> list[WorkflowComment]:
        """Return comments for the package's workflow number (not package id/name)."""
        return self.list_for_workflow_number(package.workflow_number or "")

    def replace_for_workflow_number(
        self,
        workflow_number: str,
        comments: list[WorkflowCommentInput],
        *,
        commit: bool = True,
    ) -> list[WorkflowComment]:
        number = workflow_number.strip()
        if not number:
            raise ValueError("workflow_number is required")

        previous = self.list_for_workflow_number(number)
        def utc_timestamp(timestamp):
            if timestamp and timestamp.tzinfo:
                timestamp = timestamp.astimezone(timezone.utc).replace(tzinfo=None)
            return timestamp
        def signature(comment):
            return (comment.external_id, comment.author, comment.body, utc_timestamp(comment.commented_at))
        if [signature(comment) for comment in previous] == [signature(comment) for comment in comments]:
            return previous

        def describe(snapshot):
            return "\n\n".join(f"{comment.author or 'Unknown author'}{f' · {comment.commented_at}' if comment.commented_at else ''}\n{comment.body}" for comment in snapshot) or "(no comments)"
        details = f"Workflow {number} comments updated\n\nPrevious comments:\n{describe(previous)}\n\nCurrent comments:\n{describe(comments)}"

        self.db.execute(
            delete(WorkflowComment).where(WorkflowComment.workflow_number == number)
        )
        items = [
            WorkflowComment(
                workflow_number=number,
                external_id=comment.external_id,
                author=comment.author,
                body=comment.body,
                commented_at=utc_timestamp(comment.commented_at),
                order_index=index,
            )
            for index, comment in enumerate(comments)
        ]
        self.db.add_all(items)
        self.db.flush()
        # A shared workflow may have documents in several projects. Notify each
        # project once, using only the documents visible in that project.
        by_project = {}
        for package in self.db.scalars(select(Package).where(Package.workflow_number == number).order_by(Package.id)):
            by_project.setdefault(package.project_code, []).append(package)
        for project, packages in by_project.items():
            primary = packages[0]
            NotificationService(self.db)._create_update(
                notification_type="workflow_comments", title=f"Workflow comments · {number}",
                package_id=primary.id, workflow_number=number, document_number=primary.document_number,
                message=details, commit=False,
            )
            EmailNotificationService(self.db).enqueue(
                project_code=project, event_types=["workflow_comments"], subject=f"[DocFlow · {project}] Workflow comments · {number}",
                body=f"Documents: {', '.join(package.document_number for package in packages)}\n\n{details}", package_id=primary.id,
            )
        if commit:
            self.db.commit()
            for item in items:
                self.db.refresh(item)
        else:
            self.db.flush()
        return items

    def bulk_import(
        self,
        items: Sequence[WorkflowCommentsImportItem],
    ) -> WorkflowCommentsBulkImportResult:
        """Replace comment snapshots keyed only by workflow number.

        Does not look up packages by document number or package name. A package
        is not required for the row to be stored; any document that later uses
        the same workflow number will see these comments.
        """
        results: list[WorkflowCommentsImportResultItem] = []
        imported = 0

        for item in items:
            saved = self.replace_for_workflow_number(
                item.workflow_number,
                item.comments,
                commit=False,
            )
            imported += 1
            results.append(
                WorkflowCommentsImportResultItem(
                    workflow_number=item.workflow_number.strip(),
                    status="imported",
                    total=len(saved),
                )
            )

        self.db.commit()
        return WorkflowCommentsBulkImportResult(
            imported=imported,
            results=results,
        )
