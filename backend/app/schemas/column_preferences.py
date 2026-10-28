from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator, model_validator


ColumnRegister = Literal["documents", "workflow", "transmittal"]
VisibleColumnField = Literal[
    "document_number", "document_title", "document_date", "document_type", "initiator", "discipline",
    "transmittal_number", "workflow_number", "submission_progress", "feedback",
]


class ColumnPreferencesUpdate(BaseModel):
    visibility: dict[VisibleColumnField, StrictBool] | None = Field(default=None, max_length=10)
    column_order: list[VisibleColumnField] | None = Field(default=None, max_length=10)
    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def validate_patch(cls, value):
        if isinstance(value, dict):
            fields = {"visibility", "column_order"}.intersection(value)
            if not fields:
                raise ValueError("Supply visibility or column_order")
            if any(value[field] is None for field in fields):
                raise ValueError("Column preference values must not be null")
        return value

    @field_validator("column_order")
    @classmethod
    def unique_column_order(cls, value):
        if value is not None and len(value) != len(set(value)):
            raise ValueError("Column order must not contain duplicate fields")
        return value


class ColumnPreferencesRead(BaseModel):
    register_name: ColumnRegister = Field(alias="register")
    visibility: dict[VisibleColumnField, bool]
    column_order: list[VisibleColumnField]
