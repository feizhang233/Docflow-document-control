from collections.abc import Sequence

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.workflow_comment import WorkflowComment
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

        self.db.execute(
            delete(WorkflowComment).where(WorkflowComment.workflow_number == number)
        )
        items = [
            WorkflowComment(
                workflow_number=number,
                external_id=comment.external_id,
                author=comment.author,
                body=comment.body,
                commented_at=comment.commented_at,
                order_index=index,
            )
            for index, comment in enumerate(comments)
        ]
        self.db.add_all(items)
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
