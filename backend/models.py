from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class Reading(BaseModel):
    id: Optional[int] = None
    timestamp: datetime
    power_watts: float
    voltage: float
    current_amps: float
    total_kwh: float
    switch_state: bool
    mode: str  # "ECO" or "FULL"

    class Config:
        from_attributes = True


class SwitchCommand(BaseModel):
    state: bool


class ModeCommand(BaseModel):
    mode: str  # "ECO" or "FULL"


class InsightsResponse(BaseModel):
    avg_power_eco: Optional[float]
    avg_power_full: Optional[float]
    total_kwh: float
    total_kwh_today: float
    total_kwh_month: float
    estimated_monthly_cost: float
    peak_hours: list
    co2_kg: float


class StatusResponse(BaseModel):
    power_watts: float
    voltage: float
    current_amps: float
    total_kwh: float
    switch_state: bool
    mode: str
    uptime: Optional[int] = None
