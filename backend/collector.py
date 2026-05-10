"""
Background collector — polls the Shelly 1PM Mini Gen3 every 30 seconds
and stores readings in SQLite.
"""

import os
import threading
import time
import logging
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv

from database import init_db, insert_reading

load_dotenv()

logger = logging.getLogger(__name__)

SHELLY_IP = os.getenv("SHELLY_IP", "192.168.1.100")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "30"))

# Shared mutable state (protected by a lock)
_lock = threading.Lock()
_current_mode: str = "FULL"
_latest_status: dict = {}


def get_current_mode() -> str:
    with _lock:
        return _current_mode


def set_current_mode(mode: str) -> None:
    with _lock:
        global _current_mode
        _current_mode = mode.upper()


def get_latest_status() -> dict:
    with _lock:
        return dict(_latest_status)


def _fetch_shelly_status() -> dict:
    """Fetch live status from the Shelly device."""
    url = f"http://{SHELLY_IP}/rpc/Switch.GetStatus?id=0"
    with httpx.Client(timeout=10) as client:
        resp = client.get(url)
        resp.raise_for_status()
        return resp.json()


def _fetch_shelly_uptime() -> int:
    """Fetch device uptime (seconds) from Shelly."""
    url = f"http://{SHELLY_IP}/rpc/Sys.GetStatus"
    with httpx.Client(timeout=10) as client:
        resp = client.get(url)
        resp.raise_for_status()
        data = resp.json()
        return data.get("uptime", 0)


def fetch_shelly_uptime() -> int:
    """Fetch device uptime (seconds) from Shelly (public wrapper)."""
    return _fetch_shelly_uptime()


def fetch_and_store() -> dict:
    """
    Fetch current Shelly data, persist to DB, update in-memory cache,
    and return the parsed status dict.
    """
    raw = _fetch_shelly_status()

    aenergy = raw.get("aenergy", {})
    apower = raw.get("apower", 0.0)
    voltage = raw.get("voltage", 0.0)
    current = raw.get("current", 0.0)
    total_kwh = aenergy.get("total", 0.0) / 1000.0  # Shelly returns Wh
    switch_state = raw.get("output", False)
    mode = get_current_mode()

    now = datetime.now(timezone.utc)
    insert_reading(
        timestamp=now,
        power_watts=apower,
        voltage=voltage,
        current_amps=current,
        total_kwh=total_kwh,
        switch_state=switch_state,
        mode=mode,
    )

    status = {
        "power_watts": apower,
        "voltage": voltage,
        "current_amps": current,
        "total_kwh": total_kwh,
        "switch_state": switch_state,
        "mode": mode,
    }

    with _lock:
        _latest_status.update(status)

    return status


def _poll_loop() -> None:
    """Main background polling loop."""
    init_db()
    logger.info("Collector started — polling %s every %ss", SHELLY_IP, POLL_INTERVAL)
    while True:
        try:
            fetch_and_store()
            logger.debug("Reading stored OK")
        except Exception as exc:
            logger.warning("Collector error: %s", exc)
        time.sleep(POLL_INTERVAL)


def start_collector() -> threading.Thread:
    """Start the background collector thread (daemon so it exits with the process)."""
    t = threading.Thread(target=_poll_loop, daemon=True, name="shelly-collector")
    t.start()
    return t
