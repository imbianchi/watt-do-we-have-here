"""Async multi-device collector.

One asyncio task per active device runs inside the FastAPI event loop and
polls the Shelly device on `POLL_INTERVAL`. Tasks are idempotent — adding a
device starts a task, soft-deleting one stops it.
"""

import asyncio
import logging
import os
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv

import database
import encryption

load_dotenv()
logger = logging.getLogger(__name__)

POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "30"))

_tasks: dict[int, asyncio.Task] = {}
_stops: dict[int, asyncio.Event] = {}
_modes: dict[int, str] = {}
_statuses: dict[int, dict] = {}
_alert_state: dict[int, dict] = {}


# ---------------------------------------------------------------------------
# In-memory state accessors
# ---------------------------------------------------------------------------

def get_device_mode(device_id: int) -> str:
    return _modes.get(device_id, "FULL")


def set_device_mode(device_id: int, mode: str) -> None:
    _modes[device_id] = mode.upper()


def get_device_status(device_id: int) -> dict:
    return dict(_statuses.get(device_id, {}))


def get_all_statuses() -> dict[int, dict]:
    return {did: dict(s) for did, s in _statuses.items()}


# ---------------------------------------------------------------------------
# Shelly RPC helpers (async)
# ---------------------------------------------------------------------------

def _auth(password: str | None) -> httpx.DigestAuth:
    return httpx.DigestAuth("admin", password or "")


async def _shelly_get(ip: str, password: str | None, path: str) -> dict:
    async with httpx.AsyncClient(timeout=10, auth=_auth(password)) as c:
        r = await c.get(f"http://{ip}{path}")
        r.raise_for_status()
        return r.json() if r.content else {}


async def _shelly_post(ip: str, password: str | None, method: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=10, auth=_auth(password)) as c:
        r = await c.post(f"http://{ip}/rpc/{method}", json=params or {})
        r.raise_for_status()
        return r.json() if r.content else {}


def _device_creds(device: dict) -> tuple[str, str]:
    return device["ip"], encryption.device_password(device)


async def fetch_shelly_status(ip: str, password: str | None) -> dict:
    return await _shelly_get(ip, password, "/rpc/Switch.GetStatus?id=0")


async def fetch_shelly_uptime(ip: str, password: str | None) -> int:
    data = await _shelly_get(ip, password, "/rpc/Sys.GetStatus")
    return data.get("uptime", 0)


async def fetch_shelly_info(ip: str, password: str | None) -> dict:
    try:
        return await _shelly_get(ip, password, "/rpc/Shelly.GetDeviceInfo")
    except Exception:
        return {}


async def shelly_switch_set(device: dict, state: bool, toggle_after: int | None = None) -> dict:
    ip, pw = _device_creds(device)
    qs = f"id=0&on={'true' if state else 'false'}"
    if toggle_after is not None and toggle_after > 0:
        qs += f"&toggle_after={toggle_after}"
    return await _shelly_get(ip, pw, f"/rpc/Switch.Set?{qs}")


async def shelly_rpc(device: dict, method: str, params: dict | None = None) -> dict:
    ip, pw = _device_creds(device)
    return await _shelly_post(ip, pw, method, params or {})


async def shelly_rpc_get(device: dict, method: str) -> dict:
    ip, pw = _device_creds(device)
    return await _shelly_get(ip, pw, f"/rpc/{method}")


# ---------------------------------------------------------------------------
# Polling
# ---------------------------------------------------------------------------

async def fetch_and_store(device: dict) -> dict:
    ip, pw = _device_creds(device)
    raw = await fetch_shelly_status(ip, pw)
    aenergy = raw.get("aenergy", {}) or {}
    apower = raw.get("apower", 0.0) or 0.0
    voltage = raw.get("voltage", 0.0) or 0.0
    current = raw.get("current", 0.0) or 0.0
    total_kwh = (aenergy.get("total", 0.0) or 0.0) / 1000.0
    switch_state = bool(raw.get("output", False))
    temperature = ((raw.get("temperature") or {}).get("tC"))
    mode = get_device_mode(device["id"])

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    await database.insert_reading(
        user_id=device["user_id"], device_id=device["id"],
        timestamp=now, power_watts=apower, voltage=voltage,
        current_amps=current, total_kwh=total_kwh,
        switch_state=switch_state, mode=mode,
    )

    status = {
        "device_id": device["id"], "name": device["name"],
        "power_watts": apower, "voltage": voltage,
        "current_amps": current, "total_kwh": total_kwh,
        "switch_state": switch_state, "mode": mode,
        "temperature_c": temperature,
        "timer_started_at": raw.get("timer_started_at"),
        "timer_duration": raw.get("timer_duration"),
        "last_updated": now.isoformat(),
    }
    _statuses[device["id"]] = status

    await _check_alerts(device, apower, now)
    return status


async def _check_alerts(device: dict, power_watts: float, now: datetime) -> None:
    cfg = await database.get_alert_config_internal(device["id"])
    if not cfg or not cfg.get("enabled"):
        return
    threshold = cfg["threshold_watts"]
    duration_min = cfg["duration_minutes"]
    state = _alert_state.setdefault(device["id"], {"over_since": None, "active_alert_id": None})

    if power_watts >= threshold:
        if state["over_since"] is None:
            state["over_since"] = now
        elif state["active_alert_id"] is None:
            elapsed_min = (now - state["over_since"]).total_seconds() / 60.0
            if elapsed_min >= duration_min:
                aid = await database.add_alert(
                    user_id=device["user_id"], device_id=device["id"],
                    threshold_watts=threshold, duration_minutes=duration_min,
                    triggered_at=state["over_since"],
                )
                state["active_alert_id"] = aid
                logger.info("Alert: device %s over %sW for %.1f min", device["id"], threshold, elapsed_min)
    else:
        state["over_since"] = None
        if state["active_alert_id"] is not None:
            await database.resolve_alert(state["active_alert_id"], now)
            state["active_alert_id"] = None


async def _poll_loop(device_id: int, stop_event: asyncio.Event) -> None:
    logger.info("Collector started for device %s", device_id)
    while not stop_event.is_set():
        try:
            device = await database.get_device_internal(device_id)
            if not device or not device.get("active"):
                logger.info("Device %s no longer active, stopping", device_id)
                break
            status = await fetch_and_store(device)
            try:
                ip, pw = _device_creds(device)
                status["uptime"] = await fetch_shelly_uptime(ip, pw)
                _statuses[device_id]["uptime"] = status["uptime"]
            except Exception:
                pass
        except Exception as exc:
            logger.warning("Collector error (device %s): %s", device_id, exc)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=POLL_INTERVAL)
        except asyncio.TimeoutError:
            pass


def start_device_thread(device_id: int) -> None:
    """Idempotent — start an asyncio task to poll this device."""
    existing = _tasks.get(device_id)
    if existing and not existing.done():
        return
    if device_id not in _modes:
        _modes[device_id] = "FULL"
    stop = asyncio.Event()
    _stops[device_id] = stop
    _tasks[device_id] = asyncio.create_task(_poll_loop(device_id, stop), name=f"collector-{device_id}")


def stop_device_thread(device_id: int) -> None:
    stop = _stops.pop(device_id, None)
    if stop:
        stop.set()
    _tasks.pop(device_id, None)
    _statuses.pop(device_id, None)
    _alert_state.pop(device_id, None)


async def _backfill_device_meta(device: dict) -> None:
    if device.get("shelly_model"):
        return
    try:
        ip, pw = _device_creds(device)
        info = await fetch_shelly_info(ip, pw)
    except Exception:
        return
    fields = {}
    if info.get("gen") is not None:
        fields["shelly_gen"] = info["gen"]
    if info.get("model"):
        fields["shelly_model"] = info["model"]
    if fields:
        await database.update_device_internal(device["id"], **fields)


async def start_collector() -> None:
    """FastAPI startup hook — spawn one task per active device."""
    devices = await database.get_all_active_devices()
    for d in devices:
        await _backfill_device_meta(d)
        # Initialize mode from last known reading
        if d["id"] not in _modes:
            last = await database.get_latest_reading(d["user_id"], d["id"])
            _modes[d["id"]] = (last["mode"] if last else "FULL")
        start_device_thread(d["id"])
