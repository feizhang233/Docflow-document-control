from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
from app.core.auth import assert_project_access, project_scope, require_permission
from app.db.session import get_db
from app.models.iam import User
from app.repositories.package_repository import PackageRepository
from app.schemas.package import PackageCreate, PackageList, PackageRead, PackageUpdate, ReorderRequest, TransmittalSuggestions
from app.schemas.workflow_comment import WorkflowCommentList
from app.services.package_service import PackageService
from app.services.settings_service import SettingsService
from app.services.workflow_comment_service import WorkflowCommentService

router = APIRouter(prefix="/packages", tags=["packages"])

def _visible_package(package_id: int, db: Session, user: User):
    item = PackageService(db).require(package_id)
    assert_project_access(user, item.project_code)
    return item

@router.get("", response_model=PackageList)
def list_packages(period: Literal["week","month","year","all"]="week", project_code: str|None=Query(default=None,max_length=16), search: str|None=None, discipline: str|None=None, document_type: str|None=None, transmittal_prefix: str|None=Query(default=None,max_length=80), sort_by: str="order_index", sort_order: Literal["asc","desc"]="asc", page: int=Query(1,ge=1), page_size: int=Query(50,ge=1,le=200), db: Session=Depends(get_db), user: User=Depends(require_permission("packages:read"))):
    allowed = project_scope(user)
    if project_code:
        project_code = SettingsService(db).require_project_code(project_code)
        assert_project_access(user, project_code)
    items,total = PackageRepository(db).list(period=period,project_code=project_code,search=search,discipline=discipline,document_type=document_type,transmittal_prefix=transmittal_prefix,sort_by=sort_by,sort_order=sort_order,page=page,page_size=page_size,allowed_projects=allowed)
    return PackageList(items=items,total=total,page=page,page_size=page_size)

@router.get("/transmittals", response_model=TransmittalSuggestions)
def transmittal_suggestions(project_code: str = Query(..., min_length=2, max_length=16), db: Session = Depends(get_db), user: User = Depends(require_permission("packages:read"))):
    project_code = SettingsService(db).require_project_code(project_code)
    assert_project_access(user, project_code)
    return PackageService(db).transmittal_suggestions(project_code, allowed_projects=project_scope(user))

@router.get("/{package_id}", response_model=PackageRead)
def get_package(package_id:int, db:Session=Depends(get_db), user: User=Depends(require_permission("packages:read"))):
    return _visible_package(package_id, db, user)
@router.get("/{package_id}/workflow-comments", response_model=WorkflowCommentList)
def list_workflow_comments(package_id:int, db:Session=Depends(get_db), user: User=Depends(require_permission("packages:read"))):
    package = _visible_package(package_id, db, user)
    items = WorkflowCommentService(db).list_for_package(package)
    return WorkflowCommentList(items=items, total=len(items))
@router.post("", response_model=PackageRead, status_code=status.HTTP_201_CREATED)
def create_package(data:PackageCreate, db:Session=Depends(get_db), user: User=Depends(require_permission("packages:write"))):
    assert_project_access(user, data.project_code)
    return PackageService(db).create(data)
@router.post("/{package_id}/duplicate", response_model=PackageRead, status_code=status.HTTP_201_CREATED)
def duplicate_package(package_id:int, db:Session=Depends(get_db), user: User=Depends(require_permission("packages:write"))):
    _visible_package(package_id, db, user)
    return PackageService(db).duplicate(package_id)
@router.patch("/{package_id}", response_model=PackageRead)
def update_package(package_id:int,data:PackageUpdate,db:Session=Depends(get_db), user: User=Depends(require_permission("packages:write"))):
    item = _visible_package(package_id, db, user)
    if data.project_code:
        assert_project_access(user, data.project_code)
    return PackageService(db).update(item.id, data)
@router.delete("/{package_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_package(package_id:int,db:Session=Depends(get_db), user: User=Depends(require_permission("packages:delete"))):
    item=_visible_package(package_id, db, user); PackageService(db).repo.delete(item); return Response(status_code=204)
@router.post("/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_packages(data:ReorderRequest,db:Session=Depends(get_db), user: User=Depends(require_permission("packages:write"))):
    repo = PackageRepository(db)
    items = {item.id: item for item in (repo.get(package_id) for package_id in data.package_ids) if item}
    if len(items) != len(set(data.package_ids)):
        raise HTTPException(status_code=400,detail="One or more package IDs do not exist")
    for item in items.values():
        assert_project_access(user, item.project_code)
    if not repo.reorder(data.package_ids, data.start_index): raise HTTPException(status_code=400,detail="One or more package IDs do not exist")
    return Response(status_code=204)
