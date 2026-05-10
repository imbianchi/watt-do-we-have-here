import sqlite3
import os
from datetime import datetime, timezone
from typing import Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "energy.db")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS readings (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp   DATETIME NOT NULL,
                power_watts REAL NOT NULL,
                voltage     REAL NOT NULL,
                current_amps REAL NOT NULL,
                total_kwh   REAL NOT NULL,
                switch_state BOOLEAN NOT NULL,
                mode        TEXT NOT NULL DEFAULT 'FULL'
            )
            """
        )
        conn.commit()


def insert_reading(
    timestamp: datetime,
    power_watts: float,
    voltage: float,
    current_amps: float,
    total_kwh: float,
    switch_state: bool,
    mode: str,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO readings
                (timestamp, power_watts, voltage, current_amps, total_kwh, switch_state, mode)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                timestamp.isoformat(),
                power_watts,
                voltage,
                current_amps,
                total_kwh,
                1 if switch_state else 0,
                mode,
            ),
        )
        conn.commit()


def get_readings(
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
    mode: Optional[str] = None,
    limit: int = 5000,
) -> list[dict]:
    conditions = []
    params: list = []

    if from_dt:
        conditions.append("timestamp >= ?")
        params.append(from_dt.isoformat())
    if to_dt:
        conditions.append("timestamp <= ?")
        params.append(to_dt.isoformat())
    if mode and mode.upper() != "ALL":
        conditions.append("mode = ?")
        params.append(mode.upper())

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    params.append(limit)

    with get_connection() as conn:
        rows = conn.execute(
            f"SELECT * FROM readings {where} ORDER BY timestamp ASC LIMIT ?",
            params,
        ).fetchall()
    return [dict(r) for r in rows]


def get_latest_reading() -> Optional[dict]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM readings ORDER BY timestamp DESC LIMIT 1"
        ).fetchone()
    return dict(row) if row else None


def get_insights(price_per_kwh: float = 0.22) -> dict:
    with get_connection() as conn:
        # Average power by mode
        avg_rows = conn.execute(
            "SELECT mode, AVG(power_watts) as avg_pw FROM readings GROUP BY mode"
        ).fetchall()
        avg_by_mode = {r["mode"]: r["avg_pw"] for r in avg_rows}

        # Total kWh (all-time)
        total_kwh_row = conn.execute(
            "SELECT MAX(total_kwh) - MIN(total_kwh) as delta FROM readings"
        ).fetchone()
        total_kwh = total_kwh_row["delta"] if total_kwh_row and total_kwh_row["delta"] else 0.0

        # kWh today
        today_str = datetime.now(timezone.utc).date().isoformat()
        total_kwh_today_row = conn.execute(
            "SELECT MAX(total_kwh) - MIN(total_kwh) as delta FROM readings WHERE date(timestamp) = ?",
            (today_str,),
        ).fetchone()
        total_kwh_today = (
            total_kwh_today_row["delta"]
            if total_kwh_today_row and total_kwh_today_row["delta"]
            else 0.0
        )

        # kWh this month
        month_str = datetime.now(timezone.utc).strftime("%Y-%m")
        total_kwh_month_row = conn.execute(
            "SELECT MAX(total_kwh) - MIN(total_kwh) as delta FROM readings WHERE strftime('%Y-%m', timestamp) = ?",
            (month_str,),
        ).fetchone()
        total_kwh_month = (
            total_kwh_month_row["delta"]
            if total_kwh_month_row and total_kwh_month_row["delta"]
            else 0.0
        )

        # Peak hours heatmap — avg power grouped by (hour, weekday)
        peak_rows = conn.execute(
            """
            SELECT
                CAST(strftime('%H', timestamp) AS INTEGER) as hour,
                CAST(strftime('%w', timestamp) AS INTEGER) as weekday,
                AVG(power_watts) as avg_power
            FROM readings
            GROUP BY hour, weekday
            ORDER BY hour, weekday
            """
        ).fetchall()
        peak_hours = [
            {"hour": r["hour"], "weekday": r["weekday"], "avg_power": r["avg_power"]}
            for r in peak_rows
        ]

    estimated_monthly_cost = total_kwh_month * price_per_kwh
    co2_kg = total_kwh_month * 0.25  # Portuguese grid carbon intensity

    return {
        "avg_power_eco": avg_by_mode.get("ECO"),
        "avg_power_full": avg_by_mode.get("FULL"),
        "total_kwh": total_kwh,
        "total_kwh_today": total_kwh_today,
        "total_kwh_month": total_kwh_month,
        "estimated_monthly_cost": estimated_monthly_cost,
        "peak_hours": peak_hours,
        "co2_kg": co2_kg,
    }
