"""Smart in-app notifications: user columns + dismissal table.

Revision ID: 150_add_smart_notifications
Revises: 149_add_user_support_stats_reports_generated
Create Date: 2026-04-15
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "150_add_smart_notifications"
down_revision = "149_add_user_support_stats_reports_generated"
branch_labels = None
depends_on = None


def _has_column(inspector, table_name: str, column_name: str) -> bool:
    try:
        return column_name in {c["name"] for c in inspector.get_columns(table_name)}
    except Exception:
        return False


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    if "users" in inspector.get_table_names():
        if not _has_column(inspector, "users", "smart_notifications_enabled"):
            op.add_column(
                "users",
                sa.Column("smart_notifications_enabled", sa.Boolean(), nullable=False, server_default="0"),
            )
        if not _has_column(inspector, "users", "smart_notify_no_tracking"):
            op.add_column(
                "users",
                sa.Column("smart_notify_no_tracking", sa.Boolean(), nullable=False, server_default="1"),
            )
        if not _has_column(inspector, "users", "smart_notify_long_timer"):
            op.add_column(
                "users",
                sa.Column("smart_notify_long_timer", sa.Boolean(), nullable=False, server_default="1"),
            )
        if not _has_column(inspector, "users", "smart_notify_daily_summary"):
            op.add_column(
                "users",
                sa.Column("smart_notify_daily_summary", sa.Boolean(), nullable=False, server_default="1"),
            )
        if not _has_column(inspector, "users", "smart_notify_browser"):
            op.add_column(
                "users",
                sa.Column("smart_notify_browser", sa.Boolean(), nullable=False, server_default="0"),
            )
        if not _has_column(inspector, "users", "smart_notify_no_tracking_after"):
            op.add_column("users", sa.Column("smart_notify_no_tracking_after", sa.String(length=5), nullable=True))
        if not _has_column(inspector, "users", "smart_notify_summary_at"):
            op.add_column("users", sa.Column("smart_notify_summary_at", sa.String(length=5), nullable=True))

    if "user_smart_notification_dismissals" not in inspector.get_table_names():
        op.create_table(
            "user_smart_notification_dismissals",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("local_date", sa.String(length=10), nullable=False),
            sa.Column("kind", sa.String(length=32), nullable=False),
            sa.Column("dismissed_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "local_date", "kind", name="uq_user_smart_notif_dismissal"),
        )
        op.create_index(
            "ix_user_smart_notification_dismissals_user_id",
            "user_smart_notification_dismissals",
            ["user_id"],
            unique=False,
        )


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    if "user_smart_notification_dismissals" in inspector.get_table_names():
        op.drop_index("ix_user_smart_notification_dismissals_user_id", table_name="user_smart_notification_dismissals")
        op.drop_table("user_smart_notification_dismissals")

    if "users" not in inspector.get_table_names():
        return
    for name in (
        "smart_notify_summary_at",
        "smart_notify_no_tracking_after",
        "smart_notify_browser",
        "smart_notify_daily_summary",
        "smart_notify_long_timer",
        "smart_notify_no_tracking",
        "smart_notifications_enabled",
    ):
        if _has_column(inspector, "users", name):
            op.drop_column("users", name)
