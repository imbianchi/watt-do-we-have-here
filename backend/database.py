"""Async database layer — SQLAlchemy with asyncpg (Postgres) or aiosqlite (tests/dev).

All public functions are async and take `user_id` for tenant isolation, except
collector-internal helpers (`get_all_active_devices`, `get_device_internal`)
that operate across users.
"""

import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional, Any

from sqlalchemy import and_, delete, distinct, func, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from models_db import Alert, AlertConfig, Base, Device, Reading, ShellyScheduleCache, User

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./energy.db")

engine = create_async_engine(DATABASE_URL, echo=False, future=True)
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@asynccontextmanager
async def session_scope():
    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Create all tables — used in tests and dev when not running alembic."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


def _device_dict(d: Device) -> dict:
    return {
        "id": d.id, "user_id": d.user_id, "name": d.name, "ip": d.ip,
        "password": d.password, "location": d.location, "equipment": d.equipment,
        "icon": d.icon, "active": d.active, "shelly_gen": d.shelly_gen,
        "shelly_model": d.shelly_model,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


def _reading_dict(r: Reading) -> dict:
    return {
        "id": r.id, "user_id": r.user_id, "device_id": r.device_id,
        "timestamp": r.timestamp.isoformat() if r.timestamp else None,
        "power_watts": r.power_watts, "voltage": r.voltage,
        "current_amps": r.current_amps, "total_kwh": r.total_kwh,
        "switch_state": r.switch_state, "mode": r.mode,
    }


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

async def get_user_by_email(email: str) -> Optional[dict]:
    async with session_scope() as s:
        row = (await s.execute(select(User).where(User.email == email.lower()))).scalar_one_or_none()
        return _user_dict(row) if row else None


async def get_user_by_id(user_id: int) -> Optional[dict]:
    async with session_scope() as s:
        row = (await s.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        return _user_dict(row) if row else None


async def create_user(email: str, password_hash: str, name: str) -> dict:
    async with session_scope() as s:
        u = User(email=email.lower(), password_hash=password_hash, name=name)
        s.add(u)
        await s.commit()
        await s.refresh(u)
        return _user_dict(u)


def _user_dict(u: User) -> dict:
    return {
        "id": u.id, "email": u.email, "password_hash": u.password_hash,
        "name": u.name,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


# ---------------------------------------------------------------------------
# Devices
# ---------------------------------------------------------------------------

async def add_device(user_id: int, name: str, ip: str, password: Optional[str] = None,
                     location: Optional[str] = None, equipment: Optional[str] = None,
                     icon: str = "plug") -> int:
    async with session_scope() as s:
        d = Device(user_id=user_id, name=name, ip=ip, password=password,
                   location=location, equipment=equipment, icon=icon or "plug")
        s.add(d)
        await s.commit()
        await s.refresh(d)
        return d.id


async def get_devices(user_id: int, include_inactive: bool = False) -> list[dict]:
    async with session_scope() as s:
        q = select(Device).where(Device.user_id == user_id)
        if not include_inactive:
            q = q.where(Device.active == True)  # noqa: E712
        q = q.order_by(Device.id)
        rows = (await s.execute(q)).scalars().all()
        return [_device_dict(d) for d in rows]


async def get_device(device_id: int, user_id: int) -> Optional[dict]:
    async with session_scope() as s:
        row = (await s.execute(
            select(Device).where(Device.id == device_id, Device.user_id == user_id)
        )).scalar_one_or_none()
        return _device_dict(row) if row else None


async def get_device_internal(device_id: int) -> Optional[dict]:
    """For background tasks — no user scope check."""
    async with session_scope() as s:
        row = (await s.execute(select(Device).where(Device.id == device_id))).scalar_one_or_none()
        return _device_dict(row) if row else None


async def get_all_active_devices() -> list[dict]:
    """For collector startup — across users."""
    async with session_scope() as s:
        rows = (await s.execute(select(Device).where(Device.active == True))).scalars().all()  # noqa: E712
        return [_device_dict(d) for d in rows]


async def update_device(device_id: int, user_id: int, **fields) -> None:
    if not fields:
        return
    async with session_scope() as s:
        await s.execute(
            update(Device).where(Device.id == device_id, Device.user_id == user_id).values(**fields)
        )
        await s.commit()


async def update_device_internal(device_id: int, **fields) -> None:
    """For collector backfill — no user scope."""
    if not fields:
        return
    async with session_scope() as s:
        await s.execute(update(Device).where(Device.id == device_id).values(**fields))
        await s.commit()


async def delete_device(device_id: int, user_id: int) -> None:
    """Soft delete — set active=False."""
    async with session_scope() as s:
        await s.execute(
            update(Device).where(Device.id == device_id, Device.user_id == user_id).values(active=False)
        )
        await s.commit()


# ---------------------------------------------------------------------------
# Readings
# ---------------------------------------------------------------------------

async def insert_reading(user_id: int, device_id: Optional[int], timestamp: datetime,
                         power_watts: float, voltage: float, current_amps: float,
                         total_kwh: float, switch_state: bool, mode: str) -> None:
    async with session_scope() as s:
        s.add(Reading(
            user_id=user_id, device_id=device_id, timestamp=timestamp,
            power_watts=power_watts, voltage=voltage, current_amps=current_amps,
            total_kwh=total_kwh, switch_state=switch_state, mode=mode,
        ))
        await s.commit()


async def get_readings(user_id: int, from_dt: Optional[datetime] = None,
                       to_dt: Optional[datetime] = None, mode: Optional[str] = None,
                       limit: int = 5000, device_id: Optional[int] = None) -> list[dict]:
    async with session_scope() as s:
        q = select(Reading).where(Reading.user_id == user_id)
        if device_id is not None:
            q = q.where(Reading.device_id == device_id)
        if from_dt:
            q = q.where(Reading.timestamp >= from_dt)
        if to_dt:
            q = q.where(Reading.timestamp <= to_dt)
        if mode and mode.upper() != "ALL":
            q = q.where(Reading.mode == mode.upper())
        q = q.order_by(Reading.timestamp.asc()).limit(limit)
        rows = (await s.execute(q)).scalars().all()
        return [_reading_dict(r) for r in rows]


async def get_latest_reading(user_id: int, device_id: Optional[int] = None) -> Optional[dict]:
    async with session_scope() as s:
        q = select(Reading).where(Reading.user_id == user_id)
        if device_id is not None:
            q = q.where(Reading.device_id == device_id)
        q = q.order_by(Reading.timestamp.desc()).limit(1)
        row = (await s.execute(q)).scalar_one_or_none()
        return _reading_dict(row) if row else None


async def get_insights(user_id: int, price_per_kwh: float = 0.22,
                       device_id: Optional[int] = None) -> dict:
    """Aggregate insights — uses raw SQL for the complex grouping queries."""

    def _filter(extra: str = "") -> tuple[str, dict]:
        clauses = ["user_id = :uid"]
        params: dict[str, Any] = {"uid": user_id}
        if device_id is not None:
            clauses.append("device_id = :did")
            params["did"] = device_id
        if extra:
            clauses.append(extra)
        return " AND ".join(clauses), params

    async with session_scope() as s:
        # ECO/FULL averages
        where_base, p_base = _filter()
        avg_rows = (await s.execute(text(
            f"SELECT mode, AVG(power_watts) as avg_pw FROM readings WHERE {where_base} GROUP BY mode"
        ), p_base)).all()
        avg_by_mode = {r[0]: r[1] for r in avg_rows}

        # Total kWh
        total_row = (await s.execute(text(
            f"SELECT MAX(total_kwh) - MIN(total_kwh) FROM readings WHERE {where_base}"
        ), p_base)).first()
        total_kwh = (total_row[0] if total_row else 0.0) or 0.0

        # Date helpers — formatted as ISO strings so they work in SQLite + Postgres
        today_str = datetime.now(timezone.utc).date().isoformat()
        month_str = datetime.now(timezone.utc).strftime("%Y-%m")

        # Today kWh
        today_where, today_params = _filter("DATE(timestamp) = :day")
        today_params["day"] = today_str
        today_row = (await s.execute(text(
            f"SELECT MAX(total_kwh) - MIN(total_kwh) FROM readings WHERE {today_where}"
        ), today_params)).first()
        total_kwh_today = (today_row[0] if today_row else 0.0) or 0.0

        # This month kWh
        month_where, month_params = _filter("strftime('%Y-%m', timestamp) = :ym"
                                             if "sqlite" in DATABASE_URL else
                                             "to_char(timestamp, 'YYYY-MM') = :ym")
        month_params["ym"] = month_str
        month_row = (await s.execute(text(
            f"SELECT MAX(total_kwh) - MIN(total_kwh) FROM readings WHERE {month_where}"
        ), month_params)).first()
        total_kwh_month = (month_row[0] if month_row else 0.0) or 0.0

        # Peak hours heatmap
        if "sqlite" in DATABASE_URL:
            peak_sql = f"""SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour,
                                  CAST(strftime('%w', timestamp) AS INTEGER) as weekday,
                                  AVG(power_watts) as avg_power
                           FROM readings WHERE {where_base}
                           GROUP BY hour, weekday ORDER BY hour, weekday"""
        else:
            peak_sql = f"""SELECT CAST(EXTRACT(HOUR FROM timestamp) AS INTEGER) as hour,
                                  CAST(EXTRACT(DOW FROM timestamp) AS INTEGER) as weekday,
                                  AVG(power_watts) as avg_power
                           FROM readings WHERE {where_base}
                           GROUP BY hour, weekday ORDER BY hour, weekday"""
        peak_rows = (await s.execute(text(peak_sql), p_base)).all()
        peak_hours = [{"hour": r[0], "weekday": r[1], "avg_power": r[2]} for r in peak_rows]

        # Daily kWh — last 30 days
        if "sqlite" in DATABASE_URL:
            daily_sql = f"""SELECT DATE(timestamp) as day, MAX(total_kwh) - MIN(total_kwh) as d
                            FROM readings
                            WHERE {where_base} AND DATE(timestamp) >= DATE('now', '-30 days')
                            GROUP BY day ORDER BY day"""
        else:
            daily_sql = f"""SELECT DATE(timestamp) as day, MAX(total_kwh) - MIN(total_kwh) as d
                            FROM readings
                            WHERE {where_base} AND timestamp >= (NOW() - INTERVAL '30 days')
                            GROUP BY day ORDER BY day"""
        daily_rows = (await s.execute(text(daily_sql), p_base)).all()
        daily_kwh = [{"day": str(r[0]), "kwh": r[1] or 0.0} for r in daily_rows]

        # Today min/max/avg watts
        avg_today_row = (await s.execute(text(
            f"SELECT MIN(power_watts), MAX(power_watts), AVG(power_watts) FROM readings WHERE {today_where}"
        ), today_params)).first()
        today_min = avg_today_row[0] if avg_today_row else None
        today_max = avg_today_row[1] if avg_today_row else None
        today_avg = avg_today_row[2] if avg_today_row else None

        # Monthly kWh — last 12 months
        if "sqlite" in DATABASE_URL:
            monthly_sql = f"""SELECT strftime('%Y-%m', timestamp) as month,
                                     MAX(total_kwh) - MIN(total_kwh) as kwh
                              FROM readings
                              WHERE {where_base} AND DATE(timestamp) >= DATE('now', '-12 months')
                              GROUP BY month ORDER BY month"""
        else:
            monthly_sql = f"""SELECT to_char(timestamp, 'YYYY-MM') as month,
                                     MAX(total_kwh) - MIN(total_kwh) as kwh
                              FROM readings
                              WHERE {where_base} AND timestamp >= (NOW() - INTERVAL '12 months')
                              GROUP BY month ORDER BY month"""
        monthly_rows = (await s.execute(text(monthly_sql), p_base)).all()
        monthly_kwh = [{"month": r[0], "kwh": r[1] or 0.0} for r in monthly_rows]

        # Best / worst day
        if "sqlite" in DATABASE_URL:
            best_sql = f"""SELECT DATE(timestamp) as day, MAX(total_kwh) - MIN(total_kwh) as kwh
                           FROM readings WHERE {where_base}
                           GROUP BY day HAVING kwh > 0 ORDER BY kwh ASC LIMIT 1"""
            worst_sql = best_sql.replace("ASC", "DESC")
        else:
            best_sql = f"""SELECT DATE(timestamp) as day, MAX(total_kwh) - MIN(total_kwh) as kwh
                           FROM readings WHERE {where_base}
                           GROUP BY DATE(timestamp) HAVING MAX(total_kwh) - MIN(total_kwh) > 0
                           ORDER BY kwh ASC LIMIT 1"""
            worst_sql = best_sql.replace("ASC", "DESC")
        best = (await s.execute(text(best_sql), p_base)).first()
        worst = (await s.execute(text(worst_sql), p_base)).first()
        best_day = {"day": str(best[0]), "kwh": best[1]} if best else None
        worst_day = {"day": str(worst[0]), "kwh": worst[1]} if worst else None

        # Days of data
        days_row = (await s.execute(text(
            f"SELECT COUNT(DISTINCT DATE(timestamp)) FROM readings WHERE {where_base}"
        ), p_base)).first()
        days_of_data = days_row[0] if days_row else 0

        # Same period last month
        today_d = datetime.now(timezone.utc).date()
        first_this = today_d.replace(day=1)
        last_prev = first_this - timedelta(days=1)
        same_dom = last_prev.replace(day=min(today_d.day, last_prev.day))
        last_month_start = same_dom.replace(day=1)

        tklm_where, tklm_params = _filter("DATE(timestamp) = :day")
        tklm_params["day"] = same_dom.isoformat()
        tklm_row = (await s.execute(text(
            f"SELECT MAX(total_kwh) - MIN(total_kwh) FROM readings WHERE {tklm_where}"
        ), tklm_params)).first()
        today_kwh_last_month = (tklm_row[0] if tklm_row else 0.0) or 0.0

        mtd_where, mtd_params = _filter("DATE(timestamp) >= :d1 AND DATE(timestamp) <= :d2")
        mtd_params["d1"] = last_month_start.isoformat()
        mtd_params["d2"] = same_dom.isoformat()
        mtd_row = (await s.execute(text(
            f"SELECT MAX(total_kwh) - MIN(total_kwh) FROM readings WHERE {mtd_where}"
        ), mtd_params)).first()
        month_to_date_kwh_last_month = (mtd_row[0] if mtd_row else 0.0) or 0.0

    return {
        "avg_power_eco": avg_by_mode.get("ECO"),
        "avg_power_full": avg_by_mode.get("FULL"),
        "total_kwh": total_kwh,
        "total_kwh_today": total_kwh_today,
        "total_kwh_month": total_kwh_month,
        "estimated_monthly_cost": total_kwh_month * price_per_kwh,
        "peak_hours": peak_hours,
        "co2_kg": total_kwh_month * 0.25,
        "daily_kwh": daily_kwh,
        "price_per_kwh": price_per_kwh,
        "today_min_watts": today_min,
        "today_max_watts": today_max,
        "today_avg_watts": today_avg,
        "monthly_kwh": monthly_kwh,
        "best_day": best_day,
        "worst_day": worst_day,
        "days_of_data": days_of_data,
        "today_kwh_last_month": today_kwh_last_month,
        "month_to_date_kwh_last_month": month_to_date_kwh_last_month,
    }


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

async def get_alert_config(device_id: int, user_id: int) -> Optional[dict]:
    async with session_scope() as s:
        row = (await s.execute(
            select(AlertConfig).where(AlertConfig.device_id == device_id, AlertConfig.user_id == user_id)
        )).scalar_one_or_none()
        if not row:
            return None
        return {"device_id": row.device_id, "user_id": row.user_id,
                "threshold_watts": row.threshold_watts,
                "duration_minutes": row.duration_minutes,
                "enabled": row.enabled}


async def get_alert_config_internal(device_id: int) -> Optional[dict]:
    """For collector — no user scope."""
    async with session_scope() as s:
        row = (await s.execute(
            select(AlertConfig).where(AlertConfig.device_id == device_id)
        )).scalar_one_or_none()
        if not row:
            return None
        return {"device_id": row.device_id, "user_id": row.user_id,
                "threshold_watts": row.threshold_watts,
                "duration_minutes": row.duration_minutes,
                "enabled": row.enabled}


async def upsert_alert_config(device_id: int, user_id: int, threshold_watts: float,
                              duration_minutes: int, enabled: bool) -> dict:
    async with session_scope() as s:
        existing = (await s.execute(
            select(AlertConfig).where(AlertConfig.device_id == device_id, AlertConfig.user_id == user_id)
        )).scalar_one_or_none()
        if existing:
            existing.threshold_watts = threshold_watts
            existing.duration_minutes = duration_minutes
            existing.enabled = enabled
        else:
            s.add(AlertConfig(device_id=device_id, user_id=user_id,
                              threshold_watts=threshold_watts,
                              duration_minutes=duration_minutes, enabled=enabled))
        await s.commit()
    return await get_alert_config(device_id, user_id)


async def add_alert(user_id: int, device_id: int, threshold_watts: float,
                    duration_minutes: int, triggered_at: datetime) -> int:
    async with session_scope() as s:
        a = Alert(user_id=user_id, device_id=device_id, threshold_watts=threshold_watts,
                  duration_minutes=duration_minutes, triggered_at=triggered_at)
        s.add(a)
        await s.commit()
        await s.refresh(a)
        return a.id


async def resolve_alert(alert_id: int, resolved_at: datetime) -> None:
    async with session_scope() as s:
        await s.execute(
            update(Alert).where(Alert.id == alert_id, Alert.resolved_at.is_(None))
            .values(resolved_at=resolved_at)
        )
        await s.commit()


async def get_alerts(user_id: int, device_id: Optional[int] = None, limit: int = 100) -> list[dict]:
    async with session_scope() as s:
        q = select(Alert).where(Alert.user_id == user_id)
        if device_id is not None:
            q = q.where(Alert.device_id == device_id)
        q = q.order_by(Alert.triggered_at.desc()).limit(limit)
        rows = (await s.execute(q)).scalars().all()
        return [{
            "id": a.id, "device_id": a.device_id, "user_id": a.user_id,
            "threshold_watts": a.threshold_watts,
            "duration_minutes": a.duration_minutes,
            "triggered_at": a.triggered_at.isoformat() if a.triggered_at else None,
            "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
        } for a in rows]


async def get_active_alert(device_id: int, user_id: int) -> Optional[dict]:
    async with session_scope() as s:
        row = (await s.execute(
            select(Alert).where(Alert.device_id == device_id, Alert.user_id == user_id,
                                Alert.resolved_at.is_(None))
            .order_by(Alert.triggered_at.desc()).limit(1)
        )).scalar_one_or_none()
        if not row:
            return None
        return {"id": row.id, "device_id": row.device_id,
                "threshold_watts": row.threshold_watts,
                "duration_minutes": row.duration_minutes,
                "triggered_at": row.triggered_at.isoformat() if row.triggered_at else None}


# ---------------------------------------------------------------------------
# Shelly schedules cache
# ---------------------------------------------------------------------------

async def get_schedules_cache(device_id: int, user_id: int) -> list[dict]:
    async with session_scope() as s:
        rows = (await s.execute(
            select(ShellyScheduleCache).where(
                ShellyScheduleCache.device_id == device_id,
                ShellyScheduleCache.user_id == user_id,
            )
        )).scalars().all()
        return [{"id": r.id, "device_id": r.device_id, "shelly_job_id": r.shelly_job_id,
                 "label": r.label, "timespec": r.timespec, "action": r.action,
                 "enabled": r.enabled,
                 "synced_at": r.synced_at.isoformat() if r.synced_at else None}
                for r in rows]


async def upsert_schedule_cache(device_id: int, user_id: int, shelly_job_id: int,
                                label: Optional[str], timespec: str, action: str,
                                enabled: bool) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    async with session_scope() as s:
        existing = (await s.execute(
            select(ShellyScheduleCache).where(
                ShellyScheduleCache.device_id == device_id,
                ShellyScheduleCache.user_id == user_id,
                ShellyScheduleCache.shelly_job_id == shelly_job_id,
            )
        )).scalar_one_or_none()
        if existing:
            existing.label = label
            existing.timespec = timespec
            existing.action = action
            existing.enabled = enabled
            existing.synced_at = now
        else:
            s.add(ShellyScheduleCache(
                user_id=user_id, device_id=device_id, shelly_job_id=shelly_job_id,
                label=label, timespec=timespec, action=action, enabled=enabled,
                synced_at=now,
            ))
        await s.commit()


async def delete_schedule_cache(device_id: int, user_id: int, shelly_job_id: int) -> None:
    async with session_scope() as s:
        await s.execute(delete(ShellyScheduleCache).where(
            ShellyScheduleCache.device_id == device_id,
            ShellyScheduleCache.user_id == user_id,
            ShellyScheduleCache.shelly_job_id == shelly_job_id,
        ))
        await s.commit()
