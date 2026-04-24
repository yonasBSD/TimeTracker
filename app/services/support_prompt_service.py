"""Rules for soft, non-blocking support prompts (session-scoped)."""

from __future__ import annotations

from typing import Any, Dict, Optional


class SupportPromptService:
    """At most one soft prompt per session; respect supporter and donation-click cooldown."""

    SESSION_SOFT_PROMPT_CONSUMED = "support_soft_prompt_consumed"
    SESSION_PROMPT_TRIGGER = "support_prompt_trigger"
    SESSION_SEVEN_DAY_OFFERED = "support_prompt_7d_offered"
    SESSION_ACTIVE_DAY_OFFERED = "support_prompt_active_day_offered"

    VARIANT_AFTER_REPORT = "after_report"
    VARIANT_SEVEN_DAY = "seven_day"
    VARIANT_ACTIVE_TODAY = "active_today"
    VARIANT_LONG_SESSION = "long_session"

    @staticmethod
    def _base_eligible(
        session: Dict[str, Any],
        *,
        ui_show_donate: bool,
        is_supporter: bool,
        support_banner_suppressed: bool,
    ) -> bool:
        if not ui_show_donate:
            return False
        if is_supporter:
            return False
        if support_banner_suppressed:
            return False
        if session.get(SupportPromptService.SESSION_SOFT_PROMPT_CONSUMED):
            return False
        return True

    @staticmethod
    def consume_layout_prompt(
        session: Dict[str, Any],
        *,
        ui_show_donate: bool,
        is_supporter: bool,
        support_banner_suppressed: bool,
    ) -> Optional[Dict[str, str]]:
        """
        If the user just finished a report export, show one after-report toast on next full page load.
        Marks the session as having shown a soft prompt when returning a payload.
        """
        if not SupportPromptService._base_eligible(
            session,
            ui_show_donate=ui_show_donate,
            is_supporter=is_supporter,
            support_banner_suppressed=support_banner_suppressed,
        ):
            return None
        trigger = session.get(SupportPromptService.SESSION_PROMPT_TRIGGER)
        if trigger != SupportPromptService.VARIANT_AFTER_REPORT:
            return None
        session.pop(SupportPromptService.SESSION_PROMPT_TRIGGER, None)
        session[SupportPromptService.SESSION_SOFT_PROMPT_CONSUMED] = True
        return {"variant": SupportPromptService.VARIANT_AFTER_REPORT, "source": "after_report"}

    @staticmethod
    def pick_dashboard_prompt(
        session: Dict[str, Any],
        user_stats: Dict[str, Any],
        *,
        ui_show_donate: bool,
        is_supporter: bool,
        support_banner_suppressed: bool,
        today_hours: float,
    ) -> Optional[Dict[str, str]]:
        """
        Eligible only on dashboard: milestone (7+ days since signup) or active tracking day.
        Does not consume session slot until caller records prompt shown (caller should set consumed).
        """
        if not SupportPromptService._base_eligible(
            session,
            ui_show_donate=ui_show_donate,
            is_supporter=is_supporter,
            support_banner_suppressed=support_banner_suppressed,
        ):
            return None
        # After-report takes priority; leave trigger for layout pass
        if session.get(SupportPromptService.SESSION_PROMPT_TRIGGER) == SupportPromptService.VARIANT_AFTER_REPORT:
            return None

        days = int(user_stats.get("days_since_signup") or 0)
        if days >= 7 and not session.get(SupportPromptService.SESSION_SEVEN_DAY_OFFERED):
            return {"variant": SupportPromptService.VARIANT_SEVEN_DAY, "source": "dashboard"}

        if float(today_hours or 0) >= 4.0 and not session.get(SupportPromptService.SESSION_ACTIVE_DAY_OFFERED):
            return {"variant": SupportPromptService.VARIANT_ACTIVE_TODAY, "source": "dashboard"}

        return None

    @staticmethod
    def mark_prompt_shown(session: Dict[str, Any], variant: str) -> None:
        session[SupportPromptService.SESSION_SOFT_PROMPT_CONSUMED] = True
        if variant == SupportPromptService.VARIANT_SEVEN_DAY:
            session[SupportPromptService.SESSION_SEVEN_DAY_OFFERED] = True
        elif variant == SupportPromptService.VARIANT_ACTIVE_TODAY:
            session[SupportPromptService.SESSION_ACTIVE_DAY_OFFERED] = True
        elif variant == SupportPromptService.VARIANT_LONG_SESSION:
            pass

    @staticmethod
    def long_session_prompt_allowed(
        session: Dict[str, Any],
        *,
        ui_show_donate: bool,
        is_supporter: bool,
        support_banner_suppressed: bool,
    ) -> bool:
        """JSON endpoint: allow long-session nudge only if no prompt consumed yet this session."""
        if not SupportPromptService._base_eligible(
            session,
            ui_show_donate=ui_show_donate,
            is_supporter=is_supporter,
            support_banner_suppressed=support_banner_suppressed,
        ):
            return False
        if session.get(SupportPromptService.SESSION_PROMPT_TRIGGER) == SupportPromptService.VARIANT_AFTER_REPORT:
            return False
        return True
