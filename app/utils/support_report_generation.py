"""Hook successful report exports/views for support stats and soft prompts."""

from __future__ import annotations


def record_report_generation_for_current_user() -> None:
    """Increment per-user report counter and queue a one-shot support prompt trigger."""
    from flask import session
    from flask_login import current_user

    from app.services.usage_stats_service import UsageStatsService

    if not getattr(current_user, "is_authenticated", False):
        return
    UsageStatsService.increment_reports_generated(current_user.id)
    session["support_prompt_trigger"] = "after_report"
