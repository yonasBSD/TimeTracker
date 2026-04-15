"""Add users.dismissed_release_version for admin GitHub update popup.

Revision ID: 148_add_user_dismissed_release_version
Revises: 147_add_quote_item_line_kind
Create Date: 2026-04-15
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "148_add_user_dismissed_release_version"
down_revision = "147_add_quote_item_line_kind"
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
    if not _has_column(inspector, "users", "dismissed_release_version"):
        op.add_column("users", sa.Column("dismissed_release_version", sa.String(length=64), nullable=True))


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    if "users" not in inspector.get_table_names():
        return
    if _has_column(inspector, "users", "dismissed_release_version"):
        op.drop_column("users", "dismissed_release_version")
