from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.schemas.package import PackageCreate, merge_submission_steps

CONFIGURABLE_FIELDS = {
    "document_number", "document_title", "document_date", "document_type", "initiator", "discipline",
    "number_of_documents", "transmittal_number", "workflow_number", "submission_progress", "feedback",
}

class WorkflowConfigUpdate(BaseModel):
    submission_steps: list[str] = Field(min_length=4, max_length=4)
    feedback_reviewers: list[str] = Field(min_length=2, max_length=2)
    feedback_status_labels: dict[Literal["A","B","C","P"], str]
    feedback_status_colors: dict[Literal["A","B","C","P"], str] = Field(default_factory=lambda:{"A":"#21815d","B":"#9b6816","C":"#b13f4c","P":"#4267bd"})
    transmittal_prefixes: list[str] = Field(
        default_factory=lambda: ["NFS-PCH-TRA-PZI-", "NFS-PCH-TRA-RFI-", "NFS-PCH-TRA-RPT-"],
        min_length=1,
        max_length=20,
    )
    @field_validator("submission_steps", mode="before")
    @classmethod
    def merge_legacy_submission_steps(cls, value: list[str]):
        return merge_submission_steps(value) if isinstance(value, list) else value
    @field_validator("submission_steps", "feedback_reviewers")
    @classmethod
    def validate_unique_names(cls, value: list[str]):
        cleaned = [item.strip() for item in value]
        if any(not item for item in cleaned) or len(set(cleaned)) != len(cleaned): raise ValueError("Workflow names must be non-empty and unique")
        return cleaned
    @field_validator("transmittal_prefixes")
    @classmethod
    def validate_transmittal_prefixes(cls, value: list[str]):
        cleaned = list(dict.fromkeys(item.strip() for item in value if item.strip()))
        if not cleaned: raise ValueError("At least one transmittal prefix is required")
        if any(len(item) > 80 for item in cleaned): raise ValueError("Transmittal prefixes must be 80 characters or fewer")
        return cleaned
    @field_validator("feedback_status_labels")
    @classmethod
    def validate_status_labels(cls, value: dict[str, str]):
        cleaned = {code: label.strip() for code, label in value.items()}
        if any(not label for label in cleaned.values()): raise ValueError("Feedback status labels must not be empty")
        return cleaned
    @field_validator("feedback_status_colors")
    @classmethod
    def validate_status_colors(cls, value: dict[str, str]):
        if set(value) != {"A","B","C","P"} or any(not _is_hex_color(color) for color in value.values()):
            raise ValueError("Feedback colors must contain A, B, C, and P as hex colors")
        return value

class WorkflowConfigRead(WorkflowConfigUpdate):
    id: int
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ColumnConfigRead(BaseModel):
    id: int
    field_name: str
    display_name: str
    is_visible: bool = True
    is_visible_workflow: bool = True
    is_visible_transmittal: bool = True
    column_width: int = 140
    input_type: Literal["text", "select"]
    options: list[str]
    option_colors: dict[str,str] = Field(default_factory=dict)
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ColumnConfigUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    is_visible: bool | None = None
    column_width: int | None = Field(default=None, ge=72, le=500)
    input_type: Literal["text", "select"]
    options: list[str] = Field(default_factory=list, max_length=100)
    option_colors: dict[str,str] = Field(default_factory=dict)
    @field_validator("column_width", mode="before")
    @classmethod
    def coerce_column_width(cls, value):
        # Mouse-drag resize often yields floats (183.5); accept and round to int.
        if value is None or isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return int(round(value))
        if isinstance(value, str) and value.strip():
            return int(round(float(value)))
        return value
    @field_validator("options")
    @classmethod
    def clean_options(cls, value: list[str]):
        return list(dict.fromkeys(v.strip() for v in value if v.strip()))
    @field_validator("display_name")
    @classmethod
    def clean_display_name(cls, value: str | None):
        return value.strip() if value is not None else None
    @field_validator("option_colors")
    @classmethod
    def validate_option_colors(cls, value: dict[str,str]):
        if any(not _is_hex_color(color) for color in value.values()):
            raise ValueError("Option colors must use #RRGGBB format")
        return value

class ColumnVisibilityUpdate(BaseModel):
    is_visible: bool

def _is_hex_color(value: str) -> bool:
    return len(value) == 7 and value.startswith("#") and all(character in "0123456789abcdefABCDEF" for character in value[1:])

class MetadataPackage(PackageCreate):
    created_at: datetime | None = None
    updated_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)

class MetadataExport(BaseModel):
    format_version: Literal["1.0"] = "1.0"
    exported_at: datetime
    packages: list[MetadataPackage]
    column_configs: list[ColumnConfigRead]
    workflow_config: WorkflowConfigRead

class MetadataImport(BaseModel):
    format_version: Literal["1.0"]
    packages: list[MetadataPackage] = Field(default_factory=list, max_length=10000)
    column_configs: list[ColumnConfigRead] = Field(default_factory=list)
    workflow_config: WorkflowConfigUpdate | None = None

class MetadataImportResult(BaseModel):
    mode: Literal["merge", "replace"]
    packages_created: int
    packages_updated: int
    configs_updated: int

class CsvImportRow(BaseModel):
    document_number: str | None = Field(default=None, max_length=80)
    document_title: str | None = Field(default=None, max_length=255)
    document_date: date | None = None
    document_type: str | None = Field(default=None, max_length=80)
    initiator: str | None = Field(default=None, max_length=120)
    discipline: str | None = Field(default=None, max_length=80)
    number_of_documents: int | None = Field(default=None, ge=1)
    transmittal_number: str | None = Field(default=None, max_length=80)
    workflow_number: str | None = Field(default=None, max_length=80)
    workflow_terminated: bool | None = None
    has_attachment: bool | None = None
    is_abandoned: bool | None = None
    notes: str | None = Field(default=None, max_length=5000)

    @field_validator(
        "document_number", "document_title", "document_type", "initiator", "discipline",
        "transmittal_number", "workflow_number", "notes",
        mode="before",
    )
    @classmethod
    def empty_string_to_none(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("document_date", mode="before")
    @classmethod
    def normalize_document_date(cls, value):
        if value is None:
            return None
        if isinstance(value, date) and not isinstance(value, datetime):
            return value
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, str):
            text = value.strip()
            if not text:
                return None
            for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d.%m.%Y", "%Y/%m/%d"):
                try:
                    return datetime.strptime(text, fmt).date()
                except ValueError:
                    continue
            raise ValueError("document_date must be a valid date (YYYY-MM-DD preferred)")
        return value

class CsvMetadataImport(BaseModel):
    rows: list[CsvImportRow] = Field(min_length=1, max_length=10000)
