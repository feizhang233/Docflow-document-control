from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.core.auth import get_current_user, require_permission
from app.db.session import get_db
from app.models.iam import User
from app.schemas.settings import ColumnConfigRead, ColumnConfigUpdate, ColumnVisibilityUpdate, CsvMetadataImport, MetadataExport, MetadataImport, MetadataImportResult, ProjectConfigRead, ProjectConfigUpdate, WorkflowConfigRead, WorkflowConfigUpdate
from app.services.settings_service import SettingsService

router = APIRouter(tags=["settings"])

def _require_all_projects(user: User):
    if user.allowed_projects() is not None:
        raise HTTPException(status_code=403, detail="Metadata backup is limited to users with access to all projects")

@router.get("/settings/columns", response_model=list[ColumnConfigRead])
def list_column_configs(db: Session = Depends(get_db), _: User = Depends(get_current_user)): return SettingsService(db).list_configs()

@router.put("/settings/columns/{field_name}", response_model=ColumnConfigRead)
def update_column_config(field_name: str, data: ColumnConfigUpdate, db: Session = Depends(get_db), _: User = Depends(require_permission("settings:write"))):
    item = SettingsService(db).update_config(field_name, data)
    if not item: raise HTTPException(status_code=404, detail="Configurable column not found")
    return item

@router.put("/settings/columns/{field_name}/visibility", response_model=ColumnConfigRead)
def update_register_column_visibility(field_name: str, data: ColumnVisibilityUpdate, register: Literal["workflow","transmittal"] = Query(...), db: Session = Depends(get_db), _: User = Depends(require_permission("settings:write"))):
    item = SettingsService(db).update_register_visibility(field_name, register, data.is_visible)
    if not item: raise HTTPException(status_code=404, detail="Configurable register column not found")
    return item

@router.post("/settings/columns/reset", response_model=list[ColumnConfigRead])
def reset_column_configs(db: Session = Depends(get_db), _: User = Depends(require_permission("settings:write"))): return SettingsService(db).reset_configs()

@router.get("/settings/workflow", response_model=WorkflowConfigRead)
def get_workflow_config(db: Session = Depends(get_db), _: User = Depends(get_current_user)): return SettingsService(db).get_workflow_config()

@router.put("/settings/workflow", response_model=WorkflowConfigRead)
def update_workflow_config(data: WorkflowConfigUpdate, db: Session = Depends(get_db), _: User = Depends(require_permission("settings:write"))): return SettingsService(db).update_workflow_config(data)

@router.get("/settings/projects", response_model=ProjectConfigRead)
def get_project_config(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    payload = SettingsService(db).project_config_payload()
    allowed = user.allowed_projects()
    if allowed is not None:
        payload["projects"] = [project for project in payload["projects"] if project["code"] in allowed]
    return payload

@router.put("/settings/projects", response_model=ProjectConfigRead)
def update_project_config(data: ProjectConfigUpdate, db: Session = Depends(get_db), _: User = Depends(require_permission("settings:write"))): return SettingsService(db).update_project_config(data)

@router.get("/metadata/export", response_model=MetadataExport)
def export_metadata(db: Session = Depends(get_db), user: User = Depends(require_permission("metadata:export"))):
    _require_all_projects(user)
    return SettingsService(db).export()

@router.post("/metadata/import", response_model=MetadataImportResult)
def import_metadata(data: MetadataImport, mode: Literal["merge","replace"] = Query("merge"), db: Session = Depends(get_db), user: User = Depends(require_permission("metadata:import"))):
    _require_all_projects(user)
    return SettingsService(db).import_metadata(data, mode)

@router.post("/metadata/import-csv", response_model=MetadataImportResult)
def import_csv_metadata(data: CsvMetadataImport, mode: Literal["merge","replace"] = Query("merge"), db: Session = Depends(get_db), user: User = Depends(require_permission("metadata:import"))):
    _require_all_projects(user)
    return SettingsService(db).import_csv(data, mode)
