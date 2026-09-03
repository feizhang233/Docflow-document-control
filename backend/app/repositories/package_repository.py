from __future__ import annotations

from datetime import date, timedelta
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.orm import Session
from app.models.package import Package

SORTABLE_FIELDS = {"project_code","document_number","document_title","document_date","document_type","initiator","discipline","number_of_documents","transmittal_number","workflow_number","workflow_terminated","is_abandoned","has_attachment","order_index","created_at","updated_at"}

def period_bounds(period: str, today: date | None = None) -> tuple[date, date]:
    """Return an inclusive start and exclusive end for the current calendar period."""
    current = today or date.today()
    if period == "week":
        start = current - timedelta(days=current.weekday())
        return start, start + timedelta(days=7)
    if period == "month":
        start = current.replace(day=1)
        end = date(start.year + (start.month == 12), start.month % 12 + 1, 1)
        return start, end
    if period == "year":
        return date(current.year, 1, 1), date(current.year + 1, 1, 1)
    raise ValueError(f"Unsupported period: {period}")

class PackageRepository:
    def __init__(self, db: Session): self.db = db
    def list(self, *, period: str, project_code: str | None, search: str | None, discipline: str | None, document_type: str | None, transmittal_prefix: str | None, sort_by: str, sort_order: str, page: int, page_size: int, allowed_projects: list[str] | None = None):
        query = select(Package)
        if allowed_projects is not None:
            if not allowed_projects:
                return [], 0
            query = query.where(Package.project_code.in_(allowed_projects))
        if project_code: query = query.where(Package.project_code == project_code)
        if period != "all":
            start, end = period_bounds(period)
            query = query.where(Package.document_date >= start, Package.document_date < end)
        if search:
            term = f"%{search}%"
            query = query.where(or_(Package.document_number.like(term), Package.document_title.like(term), Package.workflow_number.like(term), Package.transmittal_number.like(term), Package.initiator.like(term), Package.discipline.like(term)))
        if discipline: query = query.where(Package.discipline == discipline)
        if document_type: query = query.where(Package.document_type == document_type)
        if transmittal_prefix: query = query.where(Package.transmittal_number.startswith(transmittal_prefix))
        count = self.db.scalar(select(func.count()).select_from(query.subquery())) or 0
        field = getattr(Package, sort_by if sort_by in SORTABLE_FIELDS else "order_index")
        order = asc(field) if sort_order == "asc" else desc(field)
        items = list(self.db.scalars(query.order_by(order, Package.id).offset((page-1)*page_size).limit(page_size)))
        return items, count
    def list_transmittals(self, *, project_code: str, allowed_projects: list[str] | None = None):
        query = select(Package.id, Package.document_number, Package.transmittal_number).where(
            Package.project_code == project_code,
            Package.transmittal_number.is_not(None),
            Package.transmittal_number != "",
        )
        if allowed_projects is not None:
            if not allowed_projects:
                return []
            query = query.where(Package.project_code.in_(allowed_projects))
        return [
            {"package_id": package_id, "document_number": document_number, "transmittal_number": transmittal_number}
            for package_id, document_number, transmittal_number in self.db.execute(query.order_by(Package.id)).all()
            if transmittal_number
        ]
    def get(self, package_id: int): return self.db.get(Package, package_id)
    def get_by_workflow_number(self, number: str): return self.db.scalars(select(Package).where(Package.workflow_number == number).order_by(Package.id)).first()
    def list_by_workflow_number(self, number: str) -> list[Package]:
        """Return every package that shares a workflow number (revisions/duplicates)."""
        return list(
            self.db.scalars(
                select(Package).where(Package.workflow_number == number).order_by(Package.id)
            )
        )
    def create(self, values: dict):
        item = Package(**values); self.db.add(item); self.db.commit(); self.db.refresh(item); return item
    def update(self, item: Package, values: dict):
        for key, value in values.items(): setattr(item, key, value)
        self.db.commit(); self.db.refresh(item); return item
    def delete(self, item: Package): self.db.delete(item); self.db.commit()
    def reorder(self, ids: list[int], start_index: int = 0):
        items = {p.id:p for p in self.db.scalars(select(Package).where(Package.id.in_(ids)))}
        if len(items) != len(set(ids)): return False
        for index, item_id in enumerate(ids, start=start_index): items[item_id].order_index = index
        self.db.commit(); return True
