from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.package import Package
from app.models.workflow_comment import WorkflowComment
from app.schemas.workflow_comment import WorkflowCommentInput


class WorkflowCommentService:
    def __init__(self, db: Session):
        self.db = db

    def list_for_package(self, package_id: int) -> list[WorkflowComment]:
        query = (
            select(WorkflowComment)
            .where(WorkflowComment.package_id == package_id)
            .order_by(WorkflowComment.order_index, WorkflowComment.id)
        )
        return list(self.db.scalars(query))

    def replace_for_package(
        self,
        package: Package,
        comments: list[WorkflowCommentInput],
    ) -> list[WorkflowComment]:
        self.db.execute(
            delete(WorkflowComment).where(
                WorkflowComment.package_id == package.id
            )
        )
        items = [
            WorkflowComment(
                package_id=package.id,
                workflow_number=package.workflow_number or "",
                external_id=comment.external_id,
                author=comment.author,
                body=comment.body,
                commented_at=comment.commented_at,
                order_index=index,
            )
            for index, comment in enumerate(comments)
        ]
        self.db.add_all(items)
        self.db.commit()
        for item in items:
            self.db.refresh(item)
        return items
