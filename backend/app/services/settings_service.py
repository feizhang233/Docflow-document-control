from datetime import date, datetime, timezone
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session
from app.models.column_config import ColumnConfig
from app.models.package import Package
from app.models.project_config import ProjectConfig
from app.models.workflow_config import WorkflowConfig
from app.schemas.package import DEFAULT_PROJECT_CODE, merge_submission_progress, merge_submission_steps
from app.schemas.settings import CONFIGURABLE_FIELDS, POOL_FIELDS, ColumnConfigUpdate, CsvMetadataImport, MetadataImport, ProjectConfigUpdate, WorkflowConfigUpdate

DEFAULT_PROJECTS = [
    {"id": 1, "code": "NFS", "name": "NFS Main Project"},
    {"id": 2, "code": "FST", "name": "Fire Station"},
    {"id": 3, "code": "FBP", "name": "Footbridge"},
]

DEFAULT_WORKFLOW = {
    "submission_steps":["Transmittal Preparation","DCO Backup","Workflow Prepare","Email Feedback"],
    "project_submission_steps": {},
    "feedback_reviewers":["UTIBER","GDS"],
    "feedback_status_labels":{"A":"Approved","B":"Approved with comments","C":"Rejected","P":"Pending"},
    "feedback_status_colors":{"A":"#21815d","B":"#9b6816","C":"#b13f4c","P":"#4267bd"},
    "transmittal_prefixes":["NFS-PCH-TRA-PZI-","NFS-PCH-TRA-RFI-","NFS-PCH-TRA-RPT-"],
}

def remap_submission_progress(progress: dict | None, old_steps: list[str], new_steps: list[str]) -> dict[str, bool]:
    current = merge_submission_progress(progress)
    mapped: dict[str, bool] = {}
    for index, new in enumerate(new_steps):
        if index < len(old_steps):
            mapped[new] = bool(current.get(old_steps[index], False))
        else:
            mapped[new] = False
    return mapped

DEFAULT_COLUMN_CONFIGS = {
    "document_number": ("Document Number", 165, "text", [], {}),
    "document_title": ("Document Title", 220, "text", [], {}),
    "document_date": ("Date", 110, "text", [], {}),
    "document_type": ("Document Type", 135, "select", ["Drawing", "Technical Report", "Method Statement", "Specification", "Calculation"], {"Drawing":"#3164ce","Technical Report":"#7453be","Method Statement":"#b06a1d","Specification":"#21815d","Calculation":"#9b4d80"}),
    "initiator": ("Initiator", 135, "text", [], {}),
    "discipline": ("Discipline", 110, "select", ["Civil", "Structural", "Architectural", "Electrical", "Mechanical", "Geotechnical"], {}),
    "number_of_documents": ("Docs", 72, "text", [], {}),
    "transmittal_number": ("Transmittal No.", 165, "text", [], {}),
    "workflow_number": ("Workflow No.", 135, "text", [], {}),
    "submission_progress": ("Submission Progress", 180, "text", [], {}),
    "feedback": ("Feedback", 220, "text", [], {}),
}

class SettingsService:
    def __init__(self, db: Session): self.db = db
    def list_configs(self):
        items = list(self.db.scalars(select(ColumnConfig)))
        order = {field_name:index for index,field_name in enumerate(DEFAULT_COLUMN_CONFIGS)}
        return sorted(items, key=lambda item:(order.get(item.field_name, len(order)), item.id))
    def update_config(self, field_name: str, data: ColumnConfigUpdate):
        if field_name not in CONFIGURABLE_FIELDS: return None
        item = self.db.scalar(select(ColumnConfig).where(ColumnConfig.field_name == field_name))
        if not item: return None
        if data.display_name is not None: item.display_name = data.display_name
        if data.is_visible is not None: item.is_visible = data.is_visible
        if data.column_width is not None: item.column_width = data.column_width
        item.input_type = data.input_type
        item.options = data.options if data.input_type == "select" else []
        item.option_colors = {option:color for option,color in data.option_colors.items() if option in item.options}
        if field_name in POOL_FIELDS:
            allowed = set(self.project_codes())
            if data.share_options is not None:
                item.share_options = data.share_options
            if data.project_options is not None:
                unknown = [code for code in data.project_options if code not in allowed]
                if unknown:
                    raise HTTPException(status_code=422, detail=f"Unknown project code in option pool: {unknown[0]}")
                item.project_options = {code: options for code, options in data.project_options.items() if code in allowed}
            if data.project_option_colors is not None:
                item.project_option_colors = {
                    code: {option: color for option, color in colors.items() if option in (item.project_options or {}).get(code, [])}
                    for code, colors in data.project_option_colors.items() if code in allowed
                }
        else:
            item.share_options = True
            item.project_options = {}
            item.project_option_colors = {}
        self.db.commit(); self.db.refresh(item); return item
    def update_register_visibility(self, field_name: str, register: str, is_visible: bool):
        if field_name not in CONFIGURABLE_FIELDS or register not in {"workflow", "transmittal"}: return None
        item = self.db.scalar(select(ColumnConfig).where(ColumnConfig.field_name == field_name))
        if not item: return None
        setattr(item, f"is_visible_{register}", is_visible)
        self.db.commit(); self.db.refresh(item); return item
    def reset_configs(self):
        existing = {item.field_name:item for item in self.db.scalars(select(ColumnConfig))}
        for field_name, (display_name, width, input_type, options, option_colors) in DEFAULT_COLUMN_CONFIGS.items():
            item = existing.get(field_name)
            if not item:
                item = ColumnConfig(field_name=field_name); self.db.add(item)
            item.display_name = display_name
            item.is_visible = True
            item.is_visible_workflow = True
            item.is_visible_transmittal = True
            item.column_width = width
            item.input_type = input_type
            item.options = options
            item.option_colors = option_colors
            item.share_options = True
            item.project_options = {}
            item.project_option_colors = {}
        self.db.commit()
        return self.list_configs()
    def get_project_config(self):
        item = self.db.get(ProjectConfig, 1)
        if not item:
            item = ProjectConfig(id=1, projects=[dict(project) for project in DEFAULT_PROJECTS])
            self.db.add(item)
            self.db.commit()
            self.db.refresh(item)
        return item
    def project_codes(self) -> list[str]:
        return [str(project["code"]) for project in self.get_project_config().projects]
    def default_project_code(self) -> str:
        codes = self.project_codes()
        return codes[0] if codes else DEFAULT_PROJECT_CODE
    def require_project_code(self, code: str | None) -> str:
        allowed = self.project_codes()
        cleaned = (code or "").strip().upper()
        if not cleaned:
            return allowed[0] if allowed else DEFAULT_PROJECT_CODE
        if cleaned not in allowed:
            raise HTTPException(status_code=422, detail=f"project_code must be one of: {', '.join(allowed)}")
        return cleaned
    def project_config_payload(self):
        item = self.get_project_config()
        counts = dict(self.db.execute(select(Package.project_code, func.count()).group_by(Package.project_code)).all())
        return {
            "id": item.id,
            "projects": [{**project, "document_count": int(counts.get(project["code"], 0))} for project in item.projects],
            "updated_at": item.updated_at,
        }
    def update_project_config(self, data: ProjectConfigUpdate):
        item = self.get_project_config()
        old_by_id = {int(project["id"]): project for project in item.projects if project.get("id") is not None}
        used_ids: set[int] = set()
        next_id = max([int(project.get("id") or 0) for project in item.projects] + [int(project.id or 0) for project in data.projects], default=0) + 1
        incoming: list[dict] = []
        remaps: list[tuple[str, str]] = []
        for project in data.projects:
            project_id = project.id
            if project_id and project_id in old_by_id and project_id not in used_ids:
                previous = old_by_id[project_id]
                if previous["code"] != project.code:
                    remaps.append((previous["code"], project.code))
                used_ids.add(project_id)
            else:
                project_id = next_id
                next_id += 1
            incoming.append({"id": project_id, "code": project.code, "name": project.name})
        remaining_old_codes = {old_by_id[project_id]["code"] for project_id in old_by_id if project_id not in used_ids}
        for old_code, new_code in remaps:
            remaining_old_codes.discard(old_code)
            for package in self.db.scalars(select(Package).where(Package.project_code == old_code)):
                package.project_code = new_code
        leftover = remaining_old_codes - {project["code"] for project in incoming}
        if leftover:
            counts = dict(self.db.execute(select(Package.project_code, func.count()).where(Package.project_code.in_(leftover)).group_by(Package.project_code)).all())
            blocking = [code for code in leftover if counts.get(code)]
            if blocking:
                raise HTTPException(status_code=400, detail=f"Cannot remove project(s) still used by documents: {', '.join(sorted(blocking))}")
        item.projects = incoming
        workflow = self.db.get(WorkflowConfig, 1)
        if workflow:
            overrides = dict(workflow.project_submission_steps or {})
            for old_code, new_code in remaps:
                if old_code in overrides:
                    overrides[new_code] = overrides.pop(old_code)
            for code in leftover:
                overrides.pop(code, None)
            workflow.project_submission_steps = overrides
        for column in self.db.scalars(select(ColumnConfig)):
            options = dict(column.project_options or {})
            colors = dict(column.project_option_colors or {})
            for old_code, new_code in remaps:
                if old_code in options:
                    options[new_code] = options.pop(old_code)
                if old_code in colors:
                    colors[new_code] = colors.pop(old_code)
            for code in leftover:
                options.pop(code, None)
                colors.pop(code, None)
            column.project_options = options
            column.project_option_colors = colors
        self.db.commit()
        self.db.refresh(item)
        return self.project_config_payload()
    def ensure_project_codes(self, codes: list[str]):
        item = self.get_project_config()
        existing = {str(project["code"]) for project in item.projects}
        next_id = max((int(project.get("id") or 0) for project in item.projects), default=0) + 1
        added = False
        for code in codes:
            cleaned = (code or "").strip().upper()
            if cleaned and cleaned not in existing:
                item.projects = [*item.projects, {"id": next_id, "code": cleaned, "name": cleaned}]
                existing.add(cleaned)
                next_id += 1
                added = True
        if added:
            self.db.add(item)
            self.db.flush()
    def get_workflow_config(self):
        item = self.db.get(WorkflowConfig, 1)
        if not item:
            item = WorkflowConfig(id=1, **DEFAULT_WORKFLOW); self.db.add(item); self.db.commit(); self.db.refresh(item)
        if item.project_submission_steps is None:
            item.project_submission_steps = {}
        return item
    def submission_steps_for(self, project_code: str | None = None) -> list[str]:
        config = self.get_workflow_config()
        code = (project_code or "").strip().upper()
        override = (config.project_submission_steps or {}).get(code) if code else None
        if override:
            return list(override)
        return list(config.submission_steps)
    def update_workflow_config(self, data: WorkflowConfigUpdate):
        item = self.get_workflow_config()
        old_default = merge_submission_steps(item.submission_steps)
        old_overrides = {str(code).upper(): list(steps) for code, steps in (item.project_submission_steps or {}).items() if steps}
        new_default = list(data.submission_steps)
        new_overrides = {str(code).upper(): list(steps) for code, steps in (data.project_submission_steps or {}).items() if steps}
        allowed_projects = set(self.project_codes())
        unknown = [code for code in new_overrides if code not in allowed_projects]
        if unknown:
            raise HTTPException(status_code=422, detail=f"Unknown project code in Submission Progress overrides: {unknown[0]}")
        old_reviewers = item.feedback_reviewers
        for package in self.db.scalars(select(Package)):
            old_steps = old_overrides.get(package.project_code) or old_default
            new_steps = new_overrides.get(package.project_code) or new_default
            if old_steps != new_steps:
                package.submission_progress = remap_submission_progress(package.submission_progress, old_steps, new_steps)
            package.feedback = {new: bool(package.feedback.get(old, False)) for old,new in zip(old_reviewers, data.feedback_reviewers)} | {"Terminate": bool(package.feedback.get("Terminate", False))}
            package.feedback_status = {new: package.feedback_status.get(old, "P") for old,new in zip(old_reviewers, data.feedback_reviewers)}
        item.submission_steps = new_default
        item.project_submission_steps = new_overrides
        item.feedback_reviewers = data.feedback_reviewers
        item.feedback_status_labels = data.feedback_status_labels
        item.feedback_status_colors = data.feedback_status_colors
        item.transmittal_prefixes = data.transmittal_prefixes
        self.db.commit(); self.db.refresh(item); return item
    def export(self):
        packages = list(self.db.scalars(select(Package).order_by(Package.order_index, Package.id)))
        return {"format_version":"1.0", "exported_at":datetime.now(timezone.utc), "packages":packages, "column_configs":self.list_configs(), "workflow_config":self.get_workflow_config(), "project_config":self.project_config_payload()}
    def import_metadata(self, payload: MetadataImport, mode: str):
        """Import full metadata backup.

        Document numbers are not unique (revisions may share a number), so merge
        always appends packages rather than matching on document_number.
        """
        created = configs_updated = 0
        if mode == "replace":
            self.db.execute(delete(Package)); self.db.flush()
        if payload.workflow_config:
            self.update_workflow_config(payload.workflow_config)
        if payload.project_config:
            self.update_project_config(payload.project_config)
        for row in payload.packages:
            values = row.model_dump(exclude={"created_at","updated_at"})
            number = (row.document_number or "").strip()
            if not number:
                number = f"DRAFT-{date.today():%Y%m%d}-{uuid4().hex[:8].upper()}"
            values["document_number"] = number
            item = Package(**values)
            if row.created_at:
                item.created_at = row.created_at.replace(tzinfo=None)
            if row.updated_at:
                item.updated_at = row.updated_at.replace(tzinfo=None)
            self.db.add(item)
            created += 1
        self.ensure_project_codes([row.project_code for row in payload.packages])
        for incoming in payload.column_configs:
            if incoming.field_name not in CONFIGURABLE_FIELDS: continue
            config = self.db.scalar(select(ColumnConfig).where(ColumnConfig.field_name == incoming.field_name))
            if config:
                config.display_name = incoming.display_name
                config.is_visible = incoming.is_visible
                config.is_visible_workflow = incoming.is_visible_workflow
                config.is_visible_transmittal = incoming.is_visible_transmittal
                config.column_width = incoming.column_width
                config.input_type = incoming.input_type
                config.options = incoming.options if incoming.input_type == "select" else []
                config.option_colors = {option:color for option,color in incoming.option_colors.items() if option in config.options}
                config.share_options = incoming.share_options if incoming.field_name in POOL_FIELDS else True
                config.project_options = incoming.project_options if incoming.field_name in POOL_FIELDS else {}
                config.project_option_colors = incoming.project_option_colors if incoming.field_name in POOL_FIELDS else {}
                configs_updated += 1
        self.db.commit()
        return {"mode":mode,"packages_created":created,"packages_updated":0,"configs_updated":configs_updated}
    def import_csv(self, payload: CsvMetadataImport, mode: str):
        """Import package rows from CSV.

        Each CSV row becomes its own register entry. The same document_number may
        appear multiple times (different revisions / submissions) and is always
        inserted as a new row. Merge appends; replace clears the table first.
        """
        created = 0
        if mode == "replace":
            self.db.execute(delete(Package)); self.db.flush()
        workflow = self.get_workflow_config()
        default_project = self.default_project_code()
        order_index = (self.db.scalar(select(func.max(Package.order_index))) or -1) + 1
        for row in payload.rows:
            values = row.model_dump(exclude_none=True)
            number = (values.get("document_number") or "").strip()
            if not number:
                number = f"DRAFT-{date.today():%Y%m%d}-{uuid4().hex[:8].upper()}"
            defaults = {
                "project_code":default_project, "document_number": number, "document_title":"", "document_date": date.today(), "document_type":"", "initiator":"", "discipline":"",
                "number_of_documents":1, "transmittal_number":None, "workflow_number":None, "workflow_terminated":False,
                "notes":"", "has_attachment":False, "is_abandoned":False,
                "submission_progress":{step:False for step in self.submission_steps_for(values.get("project_code") or default_project)},
                "feedback":{**{reviewer:False for reviewer in workflow.feedback_reviewers}, "Terminate":False},
                "feedback_status":{reviewer:"P" for reviewer in workflow.feedback_reviewers}, "order_index":order_index,
            }
            defaults.update(values)
            defaults["document_number"] = number
            self.db.add(Package(**defaults))
            created += 1
            order_index += 1
        self.ensure_project_codes([row.project_code for row in payload.rows if row.project_code])
        self.db.commit()
        return {"mode":mode,"packages_created":created,"packages_updated":0,"configs_updated":0}
