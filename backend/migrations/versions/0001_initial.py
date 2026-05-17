"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "devices",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("ip", sa.String(45), nullable=False),
        sa.Column("password", sa.String(500)),
        sa.Column("location", sa.String(100)),
        sa.Column("equipment", sa.String(100)),
        sa.Column("icon", sa.String(50), nullable=False, server_default="plug"),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("shelly_gen", sa.Integer, nullable=False, server_default="3"),
        sa.Column("shelly_model", sa.String(100)),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "ip", name="uq_devices_user_ip"),
    )
    op.create_index("ix_devices_user_id", "devices", ["user_id"])

    op.create_table(
        "readings",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("device_id", sa.Integer, sa.ForeignKey("devices.id", ondelete="CASCADE")),
        sa.Column("timestamp", sa.DateTime, nullable=False),
        sa.Column("power_watts", sa.Float, nullable=False),
        sa.Column("voltage", sa.Float, nullable=False),
        sa.Column("current_amps", sa.Float, nullable=False),
        sa.Column("total_kwh", sa.Float, nullable=False),
        sa.Column("switch_state", sa.Boolean, nullable=False),
        sa.Column("mode", sa.String(10), nullable=False, server_default="FULL"),
    )
    op.create_index("ix_readings_user_id", "readings", ["user_id"])
    op.create_index("ix_readings_device_id", "readings", ["device_id"])
    op.create_index("ix_readings_timestamp", "readings", ["timestamp"])
    op.create_index("ix_readings_device_ts", "readings", ["device_id", "timestamp"])

    op.create_table(
        "alert_configs",
        sa.Column("device_id", sa.Integer, sa.ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("threshold_watts", sa.Float, nullable=False),
        sa.Column("duration_minutes", sa.Integer, nullable=False),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.text("true")),
    )
    op.create_index("ix_alert_configs_user_id", "alert_configs", ["user_id"])

    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("device_id", sa.Integer, sa.ForeignKey("devices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("threshold_watts", sa.Float, nullable=False),
        sa.Column("duration_minutes", sa.Integer, nullable=False),
        sa.Column("triggered_at", sa.DateTime, nullable=False),
        sa.Column("resolved_at", sa.DateTime),
    )
    op.create_index("ix_alerts_user_id", "alerts", ["user_id"])
    op.create_index("ix_alerts_device_id", "alerts", ["device_id"])

    op.create_table(
        "shelly_schedules_cache",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("device_id", sa.Integer, sa.ForeignKey("devices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("shelly_job_id", sa.Integer, nullable=False),
        sa.Column("label", sa.String(100)),
        sa.Column("timespec", sa.String(50)),
        sa.Column("action", sa.String(10)),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("synced_at", sa.DateTime),
    )
    op.create_index("ix_shelly_schedules_user_id", "shelly_schedules_cache", ["user_id"])
    op.create_index("ix_shelly_schedules_device_id", "shelly_schedules_cache", ["device_id"])


def downgrade() -> None:
    op.drop_table("shelly_schedules_cache")
    op.drop_table("alerts")
    op.drop_table("alert_configs")
    op.drop_table("readings")
    op.drop_table("devices")
    op.drop_table("users")
