"""Quote visibility helpers — align list/detail scope with edit capability."""

from __future__ import annotations

from typing import Any, Optional


def quote_list_scope_user_id(user: Any) -> Optional[int]:
    """Return user id to scope Quote queries, or None if the user may see all quotes.

    Non-admins normally see only quotes they created. Users with ``edit_quotes`` may
    edit any draft quote via URL; they must also see those quotes on list/detail views.
    """
    if getattr(user, "is_admin", False):
        return None
    hp = getattr(user, "has_permission", None)
    if callable(hp) and hp("edit_quotes"):
        return None
    return getattr(user, "id", None)
