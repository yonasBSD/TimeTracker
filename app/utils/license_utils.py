"""
Optional support/license visibility helpers.

Instance-level supporter state is represented by Settings.donate_ui_hidden
(set when a user verifies a license / supporter key). Non-blocking: no paywall
or feature gating; UI treats this as a supporter badge and softer prompts.
"""


def is_license_activated(settings) -> bool:
    """Return True if this instance has an activated supporter / license key."""
    return bool(getattr(settings, "donate_ui_hidden", False))
