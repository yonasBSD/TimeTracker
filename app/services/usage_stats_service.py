"""Aggregated usage stats for support modal, dashboard widget, and prompts."""

from __future__ import annotations

from typing import Any, Dict, Optional

from app import db


class UsageStatsService:
    """Read/write lightweight counters and engagement metrics for support UI."""

    @staticmethod
    def get_for_user(user_id: int, month_hours: Optional[float] = None) -> Dict[str, Any]:
        from app.models import DonationInteraction, User

        base = DonationInteraction.get_user_engagement_metrics(user_id) or {}
        reports_count = 0
        try:
            u = db.session.get(User, user_id)
            if u is not None:
                reports_count = int(getattr(u, "support_stats_reports_generated", 0) or 0)
        except Exception:
            reports_count = 0

        out = {
            "total_hours": float(base.get("total_hours") or 0.0),
            "time_entries_count": int(base.get("time_entries_count") or 0),
            "days_since_signup": int(base.get("days_since_signup") or 0),
            "reports_generated_count": reports_count,
        }
        if month_hours is not None:
            out["month_hours"] = float(month_hours)
        return out

    @staticmethod
    def increment_reports_generated(user_id: int) -> None:
        """Persist +1 report generation (export or custom report view). Never raises."""
        if not user_id:
            return
        try:
            from sqlalchemy import text

            db.session.execute(
                text(
                    "UPDATE users SET support_stats_reports_generated = "
                    "COALESCE(support_stats_reports_generated, 0) + 1 WHERE id = :uid"
                ),
                {"uid": user_id},
            )
            db.session.commit()
        except Exception:
            try:
                db.session.rollback()
            except Exception:
                pass
