"""Pydantic request/response models + shared validators."""

import re
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


IP_RE = re.compile(
    r"^(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\."
    r"(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\."
    r"(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\."
    r"(?:25[0-5]|2[0-4]\d|[01]?\d?\d)$"
)
HTML_TAG_RE = re.compile(r"<[^>]*>")


def _strip_html(v: str) -> str:
    return HTML_TAG_RE.sub("", v).strip()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=100)

    @field_validator("password")
    @classmethod
    def password_must_have_number(cls, v: str) -> str:
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number")
        return v

    @field_validator("name")
    @classmethod
    def name_strip_html(cls, v: str) -> str:
        out = _strip_html(v)
        if not out:
            raise ValueError("Name must contain non-empty text")
        return out


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    created_at: Optional[str] = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------------------------------------------------------------------------
# Devices / control
# ---------------------------------------------------------------------------

class SwitchCommand(BaseModel):
    state: bool


class ModeCommand(BaseModel):
    mode: str = Field(min_length=1, max_length=10)


class AddDeviceRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    ip: str
    password: Optional[str] = Field(default=None, max_length=128)
    location: Optional[str] = Field(default=None, max_length=100)
    equipment: Optional[str] = Field(default=None, max_length=100)
    icon: Optional[str] = Field(default="plug", max_length=50)

    @field_validator("ip")
    @classmethod
    def ip_format(cls, v: str) -> str:
        if not IP_RE.match(v.strip()):
            raise ValueError("Invalid IPv4 address")
        return v.strip()

    @field_validator("name", "location", "equipment")
    @classmethod
    def strip_html(cls, v):
        if v is None:
            return v
        return _strip_html(v) or None


class UpdateDeviceRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    ip: Optional[str] = None
    password: Optional[str] = Field(default=None, max_length=128)
    location: Optional[str] = Field(default=None, max_length=100)
    equipment: Optional[str] = Field(default=None, max_length=100)
    icon: Optional[str] = Field(default=None, max_length=50)
    active: Optional[bool] = None

    @field_validator("ip")
    @classmethod
    def ip_format(cls, v):
        if v is None:
            return v
        if not IP_RE.match(v.strip()):
            raise ValueError("Invalid IPv4 address")
        return v.strip()


class AlertConfigRequest(BaseModel):
    threshold_watts: float = Field(gt=0, le=100_000)
    duration_minutes: int = Field(gt=0, le=10_080)
    enabled: bool = True


class ScheduleRequest(BaseModel):
    label: Optional[str] = Field(default=None, max_length=100)
    action: str = Field(min_length=1, max_length=10)
    time: str = Field(pattern=r"^\d{1,2}:\d{2}$")
    days: list[str]
    enabled: bool = True


class TimerRequest(BaseModel):
    on: bool
    duration_minutes: int = Field(gt=0, le=1440)


class WebhookRequest(BaseModel):
    event: str = Field(min_length=1, max_length=64)
    urls: list[str] = Field(min_length=1, max_length=5)
    name: Optional[str] = Field(default=None, max_length=100)
    enable: bool = True


class ScriptCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class ScriptCodeRequest(BaseModel):
    code: str = Field(max_length=64_000)


class PowerLimitRequest(BaseModel):
    power_limit: float = Field(ge=0, le=100_000)
    auto_recover: bool = True
