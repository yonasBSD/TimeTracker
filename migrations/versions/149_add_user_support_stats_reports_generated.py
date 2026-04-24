"""Add users.support_stats_reports_generated for support modal stats.

Revision ID: 149_add_user_support_stats_reports_generated
Revises: 148_add_user_dismissed_release_version
Create Date: 2026-04-15
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "149_add_user_support_stats_reports_generated"
down_revision = "148_add_user_dismissed_release_version"
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
    if "users" not in inspector.get_table_names():
        return
    if not _has_column(inspector, "users", "support_stats_reports_generated"):
        op.add_column(
            "users",
            sa.Column("support_stats_reports_generated", sa.Integer(), nullable=False, server_default="0"),
        )


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    if "users" not in inspector.get_table_names():
        return
    if _has_column(inspector, "users", "support_stats_reports_generated"):
        op.drop_column("users", "support_stats_reports_generated")
