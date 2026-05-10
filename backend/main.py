import os
import logging
from datetime import datetime
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

import database
import collector
from models import SwitchCommand, ModeCommand

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SHELLY_IP = os.getenv("SHELLY_IP", "192.168.1.100")

app = FastAPI(title="Watt Do We Have Here", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    database.init_db()
    collector.start_collector()


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------

@app.get("/api/status")
def get_status():
    """Return live status from Shelly (or cached if device unreachable)."""
    try:
        status = collector.fetch_and_store()
        try:
            uptime = collector.fetch_shelly_uptime()
            status["uptime"] = uptime
        except Exception:
            status["uptime"] = None
        return status
    except Exception:
        # Fall back to in-memory cache
        cached = collector.get_latest_status()
        if not cached:
            raise HTTPException(status_code=503, detail="Shelly device unreachable and no cached data")
        cached["uptime"] = None
        return cached


# ---------------------------------------------------------------------------
# Switch control
# ---------------------------------------------------------------------------

@app.post("/api/switch")
def set_switch(cmd: SwitchCommand):
    """Turn the Shelly switch on or off."""
    url = f"http://{SHELLY_IP}/rpc/Switch.Set?id=0&on={'true' if cmd.state else 'false'}"
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get(url)
            resp.raise_for_status()
            return {"ok": True, "state": cmd.state}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach Shelly: {exc}")


# ---------------------------------------------------------------------------
# Readings
# ---------------------------------------------------------------------------

@app.get("/api/readings")
def get_readings(
    from_dt: Optional[datetime] = Query(None, alias="from"),
    to_dt: Optional[datetime] = Query(None, alias="to"),
    mode: Optional[str] = Query(None),
    limit: int = Query(5000, ge=1, le=50000),
):
    rows = database.get_readings(from_dt=from_dt, to_dt=to_dt, mode=mode, limit=limit)
    return rows


# ---------------------------------------------------------------------------
# Insights
# ---------------------------------------------------------------------------

@app.get("/api/insights")
def get_insights(price_per_kwh: float = Query(0.22, ge=0)):
    return database.get_insights(price_per_kwh=price_per_kwh)


# ---------------------------------------------------------------------------
# Mode
# ---------------------------------------------------------------------------

@app.post("/api/mode")
def set_mode(cmd: ModeCommand):
    """Set the current operating mode (ECO or FULL)."""
    if cmd.mode.upper() not in ("ECO", "FULL"):
        raise HTTPException(status_code=400, detail="mode must be 'ECO' or 'FULL'")
    collector.set_current_mode(cmd.mode.upper())
    return {"ok": True, "mode": cmd.mode.upper()}


@app.get("/api/mode")
def get_mode():
    return {"mode": collector.get_current_mode()}
