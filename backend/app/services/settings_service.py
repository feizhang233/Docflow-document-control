from datetime import date, datetime, timezone
from uuid import uuid4
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session
from app.models.column_config import ColumnConfig
from app.models.package import Package
from app.models.workflow_config import WorkflowConfig
from app.schemas.package import merge_submission_progress, merge_submission_steps
from app.schemas.settings import CONFIGURABLE_FIELDS, ColumnConfigUpdate, CsvMetadataImport, MetadataImport, WorkflowConfigUpdate

DEFAULT_WORKFLOW = {
    "submission_steps":["Transmittal Preparation","DCO Backup","Workflow Prepare","Email Feedback"],
    "feedback_reviewers":["UTIBER","GDS"],
    "feedback_status_labels":{"A":"Approved","B":"Approved with comments","C":"Rejected","P":"Pending"},
    "feedback_status_colors":{"A":"#21815d","B":"#9b6816","C":"#b13f4c","P":"#4267bd"},
    "transmittal_prefixes":["NFS-PCH-TRA-PZI-","NFS-PCH-TRA-RFI-","NFS-PCH-TRA-RPT-"],
}

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
        self.db.commit()
        return self.list_configs()
    def get_workflow_config(self):
        item = self.db.get(WorkflowConfig, 1)
        if not item:
            item = WorkflowConfig(id=1, **DEFAULT_WORKFLOW); self.db.add(item); self.db.commit(); self.db.refresh(item)
        return item
    def update_workflow_config(self, data: WorkflowConfigUpdate):
        item = self.get_workflow_config()
        old_steps, old_reviewers = merge_submission_steps(item.submission_steps), item.feedback_reviewers
        for package in self.db.scalars(select(Package)):
            progress = merge_submission_progress(package.submission_progress)
            package.submission_progress = {new: bool(progress.get(old, False)) for old,new in zip(old_steps, data.submission_steps)}
            package.feedback = {new: bool(package.feedback.get(old, False)) for old,new in zip(old_reviewers, data.feedback_reviewers)} | {"Terminate": bool(package.feedback.get("Terminate", False))}
            package.feedback_status = {new: package.feedback_status.get(old, "P") for old,new in zip(old_reviewers, data.feedback_reviewers)}
        item.submission_steps = data.submission_steps
        item.feedback_reviewers = data.feedback_reviewers
        item.feedback_status_labels = data.feedback_status_labels
        item.feedback_status_colors = data.feedback_status_colors
        item.transmittal_prefixes = data.transmittal_prefixes
        self.db.commit(); self.db.refresh(item); return item
    def export(self):
        packages = list(self.db.scalars(select(Package).order_by(Package.order_index, Package.id)))
        return {"format_version":"1.0", "exported_at":datetime.now(timezone.utc), "packages":packages, "column_configs":self.list_configs(), "workflow_config":self.get_workflow_config()}
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
        order_index = (self.db.scalar(select(func.max(Package.order_index))) or -1) + 1
        for row in payload.rows:
            values = row.model_dump(exclude_none=True)
            number = (values.get("document_number") or "").strip()
            if not number:
                number = f"DRAFT-{date.today():%Y%m%d}-{uuid4().hex[:8].upper()}"
            defaults = {
                "project_code":"NFS", "document_number": number, "document_title":"", "document_date": date.today(), "document_type":"", "initiator":"", "discipline":"",
                "number_of_documents":1, "transmittal_number":None, "workflow_number":None, "workflow_terminated":False,
                "notes":"", "has_attachment":False, "is_abandoned":False,
                "submission_progress":{step:False for step in workflow.submission_steps},
                "feedback":{**{reviewer:False for reviewer in workflow.feedback_reviewers}, "Terminate":False},
                "feedback_status":{reviewer:"P" for reviewer in workflow.feedback_reviewers}, "order_index":order_index,
            }
            defaults.update(values)
            defaults["document_number"] = number
            self.db.add(Package(**defaults))
            created += 1
            order_index += 1
        self.db.commit()
        return {"mode":mode,"packages_created":created,"packages_updated":0,"configs_updated":0}
