from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator

SUBMISSION_STEPS = ["Transmittal Preparation","DCO Backup","Workflow Prepare","Email Feedback"]
LEGACY_MERGED_STEPS = ("Signature Process", "Workflow Initiation")
MERGED_SUBMISSION_STEP = "Workflow Prepare"
FEEDBACK_STEPS = ["UTIBER","GDS","Terminate"]
FEEDBACK_STATUS_VALUES = {"A", "B", "C", "P"}
ProjectCode = Literal["NFS", "FST", "FBP"]

def merge_submission_steps(steps: list[str]) -> list[str]:
    cleaned = [str(step).strip() for step in steps]
    if all(name in cleaned for name in LEGACY_MERGED_STEPS):
        index = min(cleaned.index(name) for name in LEGACY_MERGED_STEPS)
        merged = [step for step in cleaned if step not in LEGACY_MERGED_STEPS]
        if MERGED_SUBMISSION_STEP not in merged:
            merged.insert(min(index, len(merged)), MERGED_SUBMISSION_STEP)
        return merged
    if len(cleaned) == 5:
        return [cleaned[0], cleaned[1], MERGED_SUBMISSION_STEP, cleaned[4]]
    return cleaned

def merge_submission_progress(progress: dict[str, bool] | None) -> dict[str, bool]:
    merged = {str(step): bool(done) for step, done in (progress or {}).items()}
    if all(name in merged for name in LEGACY_MERGED_STEPS):
        done = merged[LEGACY_MERGED_STEPS[0]] and merged[LEGACY_MERGED_STEPS[1]]
        for name in LEGACY_MERGED_STEPS:
            merged.pop(name, None)
        merged[MERGED_SUBMISSION_STEP] = bool(merged.get(MERGED_SUBMISSION_STEP, False) or done)
    return merged

class PackageBase(BaseModel):
    project_code: ProjectCode = "NFS"
    document_number: str = Field(default="", max_length=80)
    document_title: str = Field(default="", max_length=255)
    document_date: date = Field(default_factory=date.today)
    document_type: str = Field(default="", max_length=80)
    initiator: str = Field(default="", max_length=120)
    discipline: str = Field(default="", max_length=80)
    number_of_documents: int = Field(default=1, ge=1)
    transmittal_number: str | None = Field(default=None, max_length=80)
    workflow_number: str | None = Field(default=None, max_length=80)
    workflow_terminated: bool = False
    notes: str = Field(default="", max_length=5000)
    has_attachment: bool = False
    is_abandoned: bool = False
    submission_progress: dict[str, bool] = Field(default_factory=lambda: {step: False for step in SUBMISSION_STEPS})
    feedback: dict[str, bool] = Field(default_factory=lambda: {step: False for step in FEEDBACK_STEPS})
    feedback_status: dict[str, str] = Field(default_factory=lambda: {"UTIBER":"P", "GDS":"P"})
    order_index: int = Field(default=0, ge=0)
    @field_validator("submission_progress", mode="before")
    @classmethod
    def validate_progress(cls, value: dict[str,bool]):
        if isinstance(value, dict):
            value = merge_submission_progress(value)
        if len(value) != 4: raise ValueError("submission_progress must contain exactly four workflow steps")
        return value
    @field_validator("feedback", mode="before")
    @classmethod
    def validate_feedback(cls, value: dict[str,bool]):
        if isinstance(value, dict) and "GDD" in value:
            value = {"UTIBER": value.get("UTIBER", False), "GDS": value.get("GDS", value.get("GDD", False)), "Terminate": value.get("Terminate", False)}
        if len(value) != 3 or "Terminate" not in value: raise ValueError("feedback must contain two reviewers and Terminate")
        return value
    @field_validator("feedback_status")
    @classmethod
    def validate_feedback_status(cls, value: dict[str,str]):
        if len(value) != 2 or any(status not in FEEDBACK_STATUS_VALUES for status in value.values()):
            raise ValueError("feedback_status must contain two reviewers using A, B, C, or P")
        return value

class PackageCreate(PackageBase): pass
class PackageUpdate(BaseModel):
    project_code: ProjectCode | None = None
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
    notes: str | None = Field(default=None, max_length=5000)
    has_attachment: bool | None = None
    is_abandoned: bool | None = None
    submission_progress: dict[str, bool] | None = None
    feedback: dict[str, bool] | None = None
    feedback_status: dict[str, str] | None = None
    order_index: int | None = Field(default=None, ge=0)

class PackageRead(PackageBase):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class PackageList(BaseModel):
    items: list[PackageRead]
    total: int
    page: int
    page_size: int
class ReorderRequest(BaseModel):
    package_ids: list[int] = Field(min_length=1)
    start_index: int = Field(default=0, ge=0)
