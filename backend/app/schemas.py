from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if len(normalized) > 254:
            raise ValueError("Email must be at most 254 characters.")
        return normalized

    @field_validator("password")
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 UTF-8 bytes.")
        return value


class TodoInput(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=2000)
    dueDate: date
    completed: bool = False

    @field_validator("title")
    @classmethod
    def trim_title(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Title cannot be blank.")
        return trimmed

    @field_validator("description")
    @classmethod
    def trim_description(cls, value: str) -> str:
        return value.strip()

    @field_validator("dueDate", mode="before")
    @classmethod
    def validate_due_date(cls, value: object) -> object:
        if isinstance(value, str) and value.startswith("0000"):
            raise ValueError("Due date is invalid.")
        return value


class UserResponse(BaseModel):
    id: UUID
    email: EmailStr


class TodoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    title: str
    description: str
    due_date: date = Field(serialization_alias="dueDate")
    completed: bool
    created_at: datetime = Field(serialization_alias="createdAt")
    updated_at: datetime = Field(serialization_alias="updatedAt")


class TodoListResponse(BaseModel):
    todos: list[TodoResponse]


class TodoItemResponse(BaseModel):
    todo: TodoResponse
