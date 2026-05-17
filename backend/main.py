"""FastAPI entrypoint.

All non-auth endpoints require a valid bearer token via Depends(get_current_user)
and filter every query by user_id. Shelly device passwords are encrypted at rest.
"""

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

import collector
import database
import encryption
from auth import create_access_token, get_current_user, hash_password, verify_password
from models import (
    AddDeviceRequest,
    AlertConfigRequest,
    ModeCommand,
    PowerLimitRequest,
    ScheduleRequest,
    ScriptCodeRequest,
    ScriptCreateRequest,
    SwitchCommand,
    TimerRequest,
    Token,
    UpdateDeviceRequest,
    UserLogin,
    UserRegister,
    UserResponse,
    WebhookRequest,
)

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if ENVIRONMENT != "production":
        await database.init_db()
    await collector.start_collector()
    yield


app = FastAPI(title="Watt Do We Have Here", version="3.0.0", lifespan=lifespan)

# --- Rate limiting ---
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# --- CORS ---
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Security headers ---
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if ENVIRONMENT in ("production", "staging"):
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    return response


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _scrub(d: dict) -> dict:
    out = dict(d)
    out.pop("password", None)
    out.pop("password_hash", None)
    return out


async def _get_owned_device(device_id: int, user_id: int) -> dict:
    d = await database.get_device(device_id, user_id)
    if not d or not d.get("active"):
        raise HTTPException(status_code=403, detail="Device not found or access denied")
    return d


def _proxy_get_sync_to_async():
    """Stub kept for parity — endpoints await collector directly."""
    raise NotImplementedError


async def _proxy(device: dict, method: str, params: dict | None = None) -> dict:
    try:
        return await collector.shelly_rpc(device, method, params or {})
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Shelly RPC {method} failed: {exc}") from exc


async def _proxy_get(device: dict, method: str) -> dict:
    try:
        return await collector.shelly_rpc_get(device, method)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Shelly RPC {method} failed: {exc}") from exc


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@app.post("/api/auth/register", response_model=Token)
@limiter.limit("5/minute")
async def auth_register(request: Request, body: UserRegister):
    existing = await database.get_user_by_email(body.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = await database.create_user(body.email, hash_password(body.password), body.name)
    token = create_access_token({"sub": str(user["id"])})
    return {"access_token": token, "token_type": "bearer"}


@app.post("/api/auth/login", response_model=Token)
@limiter.limit("10/minute")
async def auth_login(request: Request, body: UserLogin):
    user = await database.get_user_by_email(body.email)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token({"sub": str(user["id"])})
    return {"access_token": token, "token_type": "bearer"}


@app.get("/api/auth/me", response_model=UserResponse)
async def auth_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "name": current_user["name"],
        "created_at": current_user.get("created_at"),
    }


@app.post("/api/auth/logout")
async def auth_logout(current_user: dict = Depends(get_current_user)):
    # JWT is client-discarded; this endpoint exists for symmetry + audit hooks.
    return {"ok": True}


# ---------------------------------------------------------------------------
# Devices
# ---------------------------------------------------------------------------

@app.get("/api/devices")
async def list_devices(current_user: dict = Depends(get_current_user)):
    devices = await database.get_devices(current_user["id"])
    statuses = collector.get_all_statuses()
    out = []
    for d in devices:
        item = _scrub(d)
        item["status"] = statuses.get(d["id"], {})
        item["active_alert"] = await database.get_active_alert(d["id"], current_user["id"])
        out.append(item)
    return out


@app.post("/api/devices/test")
async def test_device(body: AddDeviceRequest, current_user: dict = Depends(get_current_user)):
    try:
        raw = await collector.fetch_shelly_status(body.ip, body.password or "")
        info = await collector.fetch_shelly_info(body.ip, body.password or "")
        return {
            "ok": True,
            "voltage": raw.get("voltage"),
            "switch_state": raw.get("output"),
            "gen": info.get("gen"),
            "model": info.get("model"),
            "app": info.get("app"),
            "fw": info.get("ver"),
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not reach device: {exc}") from exc


@app.post("/api/devices")
async def create_device(body: AddDeviceRequest, current_user: dict = Depends(get_current_user)):
    try:
        await collector.fetch_shelly_status(body.ip, body.password or "")
        info = await collector.fetch_shelly_info(body.ip, body.password or "")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not reach device: {exc}") from exc
    encrypted_password = encryption.encrypt_password(body.password) if body.password else None
    try:
        device_id = await database.add_device(
            user_id=current_user["id"], name=body.name, ip=body.ip,
            password=encrypted_password, location=body.location,
            equipment=body.equipment, icon=body.icon or "plug",
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not add device: {exc}") from exc
    meta: dict = {}
    if info.get("gen") is not None:
        meta["shelly_gen"] = info["gen"]
    if info.get("model"):
        meta["shelly_model"] = info["model"]
    if meta:
        await database.update_device(device_id, current_user["id"], **meta)
    collector.start_device_thread(device_id)
    d = await database.get_device(device_id, current_user["id"])
    return _scrub(d)


@app.put("/api/devices/{device_id}")
async def update_device(device_id: int, body: UpdateDeviceRequest, current_user: dict = Depends(get_current_user)):
    await _get_owned_device(device_id, current_user["id"])
    fields = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "password" in fields and fields["password"]:
        fields["password"] = encryption.encrypt_password(fields["password"])
    if fields:
        await database.update_device(device_id, current_user["id"], **fields)
    return _scrub(await database.get_device(device_id, current_user["id"]))


@app.delete("/api/devices/{device_id}")
async def delete_device(device_id: int, current_user: dict = Depends(get_current_user)):
    await _get_owned_device(device_id, current_user["id"])
    await database.delete_device(device_id, current_user["id"])
    collector.stop_device_thread(device_id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Per-device endpoints
# ---------------------------------------------------------------------------

@app.get("/api/devices/{device_id}/status")
async def device_status(device_id: int, current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    try:
        status = await collector.fetch_and_store(d)
        try:
            ip = d["ip"]
            pw = encryption.device_password(d)
            status["uptime"] = await collector.fetch_shelly_uptime(ip, pw)
        except Exception:
            status["uptime"] = None
        return status
    except Exception:
        cached = collector.get_device_status(device_id)
        if not cached:
            raise HTTPException(status_code=503, detail="Device unreachable and no cached data") from None
        return cached


@app.post("/api/devices/{device_id}/switch")
async def device_switch(device_id: int, body: SwitchCommand, current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    try:
        await collector.shelly_switch_set(d, body.state)
        return {"ok": True, "state": body.state}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach Shelly: {exc}") from exc


@app.post("/api/devices/{device_id}/mode")
async def device_mode_set(device_id: int, body: ModeCommand, current_user: dict = Depends(get_current_user)):
    await _get_owned_device(device_id, current_user["id"])
    if body.mode.upper() not in ("ECO", "FULL"):
        raise HTTPException(status_code=400, detail="mode must be 'ECO' or 'FULL'")
    collector.set_device_mode(device_id, body.mode.upper())
    return {"ok": True, "mode": body.mode.upper()}


@app.get("/api/devices/{device_id}/mode")
async def device_mode_get(device_id: int, current_user: dict = Depends(get_current_user)):
    await _get_owned_device(device_id, current_user["id"])
    return {"mode": collector.get_device_mode(device_id)}


@app.get("/api/devices/{device_id}/readings")
async def device_readings(
    device_id: int,
    from_dt: datetime | None = Query(None, alias="from"),
    to_dt: datetime | None = Query(None, alias="to"),
    mode: str | None = Query(None),
    limit: int = Query(5000, ge=1, le=50000),
    current_user: dict = Depends(get_current_user),
):
    await _get_owned_device(device_id, current_user["id"])
    return await database.get_readings(
        user_id=current_user["id"], device_id=device_id,
        from_dt=from_dt, to_dt=to_dt, mode=mode, limit=limit,
    )


@app.get("/api/devices/{device_id}/insights")
async def device_insights(
    device_id: int,
    price_per_kwh: float = Query(0.22, ge=0.01, le=10.0),
    current_user: dict = Depends(get_current_user),
):
    await _get_owned_device(device_id, current_user["id"])
    return await database.get_insights(
        user_id=current_user["id"], price_per_kwh=price_per_kwh, device_id=device_id,
    )


@app.get("/api/devices/{device_id}/info")
async def device_info(device_id: int, current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    return await collector.fetch_shelly_info(d["ip"], encryption.device_password(d))


# ---------------------------------------------------------------------------
# Alerts config / log
# ---------------------------------------------------------------------------

@app.get("/api/devices/{device_id}/alert-config")
async def get_alert_config(device_id: int, current_user: dict = Depends(get_current_user)):
    await _get_owned_device(device_id, current_user["id"])
    return await database.get_alert_config(device_id, current_user["id"]) or {}


@app.put("/api/devices/{device_id}/alert-config")
async def set_alert_config(device_id: int, body: AlertConfigRequest, current_user: dict = Depends(get_current_user)):
    await _get_owned_device(device_id, current_user["id"])
    return await database.upsert_alert_config(
        device_id, current_user["id"], body.threshold_watts, body.duration_minutes, body.enabled,
    )


@app.get("/api/devices/{device_id}/alerts")
async def device_alerts(device_id: int, limit: int = Query(100, ge=1, le=1000),
                        current_user: dict = Depends(get_current_user)):
    await _get_owned_device(device_id, current_user["id"])
    return await database.get_alerts(current_user["id"], device_id=device_id, limit=limit)


@app.get("/api/alerts")
async def all_alerts(limit: int = Query(100, ge=1, le=1000),
                     current_user: dict = Depends(get_current_user)):
    return await database.get_alerts(current_user["id"], device_id=None, limit=limit)


# ---------------------------------------------------------------------------
# Aggregate
# ---------------------------------------------------------------------------

@app.get("/api/aggregate/status")
async def aggregate_status(current_user: dict = Depends(get_current_user)):
    statuses = collector.get_all_statuses()
    devices = await database.get_devices(current_user["id"])
    items, total_w, on_count = [], 0.0, 0
    for d in devices:
        s = statuses.get(d["id"], {})
        items.append({**_scrub(d), "status": s})
        total_w += s.get("power_watts") or 0
        if s.get("switch_state"):
            on_count += 1
    return {
        "total_power_watts": total_w,
        "device_count": len(devices),
        "devices_on": on_count,
        "devices": items,
    }


@app.get("/api/aggregate/insights")
async def aggregate_insights(
    price_per_kwh: float = Query(0.22, ge=0.01, le=10.0),
    current_user: dict = Depends(get_current_user),
):
    return await database.get_insights(current_user["id"], price_per_kwh=price_per_kwh, device_id=None)


@app.get("/api/aggregate/readings")
async def aggregate_readings(
    from_dt: datetime | None = Query(None, alias="from"),
    to_dt: datetime | None = Query(None, alias="to"),
    mode: str | None = Query(None),
    limit: int = Query(5000, ge=1, le=50000),
    current_user: dict = Depends(get_current_user),
):
    return await database.get_readings(
        user_id=current_user["id"], from_dt=from_dt, to_dt=to_dt,
        mode=mode, limit=limit, device_id=None,
    )


# ---------------------------------------------------------------------------
# Native Shelly — timer
# ---------------------------------------------------------------------------

@app.post("/api/devices/{device_id}/shelly/timer")
async def shelly_timer_set(device_id: int, body: TimerRequest,
                           current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    try:
        await collector.shelly_switch_set(d, body.on, toggle_after=body.duration_minutes * 60)
        return {"ok": True, "on": body.on, "duration_seconds": body.duration_minutes * 60}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not set timer: {exc}") from exc


@app.delete("/api/devices/{device_id}/shelly/timer")
async def shelly_timer_cancel(device_id: int, current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    try:
        ip = d["ip"]
        pw = encryption.device_password(d)
        raw = await collector.fetch_shelly_status(ip, pw)
        on = bool(raw.get("output", False))
        await collector.shelly_switch_set(d, on)
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not cancel timer: {exc}") from exc


# ---------------------------------------------------------------------------
# Native Shelly — schedules
# ---------------------------------------------------------------------------

_DAY_MAP = {"sun": 0, "mon": 1, "tue": 2, "wed": 3, "thu": 4, "fri": 5, "sat": 6}
_REV_DAY = {v: k for k, v in _DAY_MAP.items()}


def _to_timespec(time_str: str, days: list[str]) -> str:
    try:
        hh, mm = time_str.split(":")
        hh, mm = int(hh), int(mm)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="time must be HH:MM") from exc
    if not (0 <= hh < 24 and 0 <= mm < 60):
        raise HTTPException(status_code=400, detail="time out of range")
    try:
        day_nums = sorted({_DAY_MAP[d.lower()] for d in days}) if days else []
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"unknown day: {e}") from e
    dow = ",".join(str(d) for d in day_nums) if day_nums else "*"
    return f"0 {mm} {hh} * * {dow}"


def _from_timespec(timespec: str) -> dict | None:
    parts = (timespec or "").split()
    if len(parts) != 6:
        return None
    try:
        _, mn, hr, _, _, dow = parts
        hh = int(hr)
        mm = int(mn)
    except Exception:
        return None
    if dow == "*":
        days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
    else:
        days = []
        for token in dow.split(","):
            token = token.strip()
            if not token:
                continue
            if token.isdigit() and int(token) in _REV_DAY:
                days.append(_REV_DAY[int(token)])
            elif token.lower()[:3] in _DAY_MAP:
                days.append(token.lower()[:3])
    return {"time": f"{hh:02d}:{mm:02d}", "days": days}


def _calls_for_action(action: str) -> list[dict]:
    return [{"method": "Switch.Set", "params": {"id": 0, "on": (action or "").lower() == "on"}}]


def _parse_action(calls: list[dict]) -> str:
    if not calls:
        return "on"
    p = calls[0].get("params") or {}
    return "on" if p.get("on") else "off"


@app.get("/api/devices/{device_id}/shelly/schedules")
async def shelly_schedules_list(device_id: int, current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    cache = {c["shelly_job_id"]: c for c in await database.get_schedules_cache(device_id, current_user["id"])}
    try:
        res = await collector.shelly_rpc_get(d, "Schedule.List")
        jobs = res.get("jobs", []) or []
        out = []
        for j in jobs:
            jid = j.get("id")
            friendly = _from_timespec(j.get("timespec", "")) or {}
            action = _parse_action(j.get("calls", []) or [])
            label = cache[jid]["label"] if jid in cache else None
            out.append({
                "id": jid, "source": "device", "enabled": j.get("enable"),
                "timespec": j.get("timespec"), "action": action,
                "time": friendly.get("time"), "days": friendly.get("days"),
                "label": label,
            })
        return out
    except Exception:
        return [
            {
                "id": c["shelly_job_id"], "source": "device",
                "enabled": bool(c["enabled"]), "timespec": c["timespec"],
                "action": c["action"], "label": c["label"], "stale": True,
                **(_from_timespec(c["timespec"]) or {}),
            }
            for c in cache.values()
        ]


@app.post("/api/devices/{device_id}/shelly/schedules")
async def shelly_schedules_create(device_id: int, body: ScheduleRequest,
                                  current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    timespec = _to_timespec(body.time, body.days)
    res = await _proxy(d, "Schedule.Create", {
        "enable": body.enabled, "timespec": timespec,
        "calls": _calls_for_action(body.action),
    })
    job_id = res.get("id")
    if job_id is not None:
        await database.upsert_schedule_cache(
            device_id, current_user["id"], job_id,
            body.label, timespec, body.action.lower(), body.enabled,
        )
    return {"id": job_id}


@app.put("/api/devices/{device_id}/shelly/schedules/{job_id}")
async def shelly_schedules_update(device_id: int, job_id: int, body: ScheduleRequest,
                                  current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    timespec = _to_timespec(body.time, body.days)
    await _proxy(d, "Schedule.Update", {
        "id": job_id, "enable": body.enabled, "timespec": timespec,
        "calls": _calls_for_action(body.action),
    })
    await database.upsert_schedule_cache(
        device_id, current_user["id"], job_id,
        body.label, timespec, body.action.lower(), body.enabled,
    )
    return {"ok": True}


@app.delete("/api/devices/{device_id}/shelly/schedules/{job_id}")
async def shelly_schedules_delete(device_id: int, job_id: int,
                                  current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    await _proxy(d, "Schedule.Delete", {"id": job_id})
    await database.delete_schedule_cache(device_id, current_user["id"], job_id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Native Shelly — webhooks
# ---------------------------------------------------------------------------

@app.get("/api/devices/{device_id}/shelly/webhooks")
async def shelly_webhooks_list(device_id: int, current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    res = await _proxy_get(d, "Webhook.List")
    return res.get("hooks", []) if isinstance(res, dict) else []


@app.post("/api/devices/{device_id}/shelly/webhooks")
async def shelly_webhook_create(device_id: int, body: WebhookRequest,
                                current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    payload = {"cid": 0, "event": body.event, "urls": body.urls, "enable": body.enable}
    if body.name:
        payload["name"] = body.name
    return await _proxy(d, "Webhook.Create", payload)


@app.delete("/api/devices/{device_id}/shelly/webhooks/{hook_id}")
async def shelly_webhook_delete(device_id: int, hook_id: int,
                                current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    await _proxy(d, "Webhook.Delete", {"id": hook_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Native Shelly — scripts
# ---------------------------------------------------------------------------

async def _put_script_chunked(d: dict, script_id: int, code: str) -> None:
    CHUNK = 1024
    if not code:
        await _proxy(d, "Script.PutCode", {"id": script_id, "code": "", "append": False})
        return
    pos, first = 0, True
    while pos < len(code):
        await _proxy(d, "Script.PutCode", {"id": script_id, "code": code[pos:pos + CHUNK], "append": not first})
        first = False
        pos += CHUNK


@app.get("/api/devices/{device_id}/shelly/scripts")
async def shelly_scripts_list(device_id: int, current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    res = await _proxy_get(d, "Script.List")
    return res.get("scripts", []) if isinstance(res, dict) else []


@app.post("/api/devices/{device_id}/shelly/scripts")
async def shelly_script_create(device_id: int, body: ScriptCreateRequest,
                               current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    return await _proxy(d, "Script.Create", {"name": body.name})


@app.get("/api/devices/{device_id}/shelly/scripts/{script_id}")
async def shelly_script_get_code(device_id: int, script_id: int,
                                 current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    code, offset = "", 0
    while True:
        res = await _proxy(d, "Script.GetCode", {"id": script_id, "offset": offset, "len": 1024})
        chunk = res.get("data", "") or ""
        code += chunk
        offset += len(chunk)
        if not res.get("left") or not chunk:
            break
    return {"code": code}


@app.put("/api/devices/{device_id}/shelly/scripts/{script_id}")
async def shelly_script_put_code(device_id: int, script_id: int, body: ScriptCodeRequest,
                                 current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    await _put_script_chunked(d, script_id, body.code)
    return {"ok": True}


@app.delete("/api/devices/{device_id}/shelly/scripts/{script_id}")
async def shelly_script_delete(device_id: int, script_id: int,
                               current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    await _proxy(d, "Script.Delete", {"id": script_id})
    return {"ok": True}


@app.post("/api/devices/{device_id}/shelly/scripts/{script_id}/run")
async def shelly_script_run(device_id: int, script_id: int,
                            current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    return await _proxy(d, "Script.Start", {"id": script_id})


@app.post("/api/devices/{device_id}/shelly/scripts/{script_id}/stop")
async def shelly_script_stop(device_id: int, script_id: int,
                             current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    return await _proxy(d, "Script.Stop", {"id": script_id})


# ---------------------------------------------------------------------------
# Native Shelly — settings & diagnostics
# ---------------------------------------------------------------------------

@app.get("/api/devices/{device_id}/shelly/config")
async def shelly_config(device_id: int, current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    sys_cfg = await collector.shelly_rpc_get(d, "Sys.GetConfig") if True else {}
    switch_cfg = {}
    try:
        switch_cfg = await collector.shelly_rpc_get(d, "Switch.GetConfig?id=0")
    except Exception:
        pass
    return {"sys": sys_cfg, "switch": switch_cfg}


@app.get("/api/devices/{device_id}/shelly/wifi")
async def shelly_wifi(device_id: int, current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    return await _proxy_get(d, "Wifi.GetStatus")


@app.post("/api/devices/{device_id}/shelly/reboot")
async def shelly_reboot(device_id: int, current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    return await _proxy(d, "Shelly.Reboot", {})


@app.get("/api/devices/{device_id}/shelly/info")
async def shelly_info(device_id: int, current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    return await _proxy_get(d, "Shelly.GetDeviceInfo")


@app.post("/api/devices/{device_id}/shelly/power-limit")
async def shelly_power_limit(device_id: int, body: PowerLimitRequest,
                             current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    return await _proxy(d, "Switch.SetConfig", {
        "id": 0,
        "config": {
            "power_limit": body.power_limit,
            "autorecover_voltage_errors": body.auto_recover,
        },
    })


@app.post("/api/devices/{device_id}/shelly/factory-reset")
async def shelly_factory_reset(device_id: int, current_user: dict = Depends(get_current_user)):
    d = await _get_owned_device(device_id, current_user["id"])
    return await _proxy(d, "Shelly.FactoryReset", {})


@app.get("/api/health")
async def health():
    return {"ok": True, "env": ENVIRONMENT}
