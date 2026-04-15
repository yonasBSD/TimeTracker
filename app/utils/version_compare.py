"""Semantic version helpers for release / update checks (uses packaging.version)."""

from __future__ import annotations

from packaging.version import InvalidVersion, Version


def normalize_version_tag(raw: str | None) -> str | None:
    """Strip whitespace and leading 'v'; return a normalized string if parseable as a Version, else None."""
    if raw is None:
        return None
    s = raw.strip()
    if not s:
        return None
    if s.lower().startswith("v"):
        s = s[1:].strip()
        if not s:
            return None
    try:
        return str(Version(s))
    except InvalidVersion:
        return None


def is_upgrade(current: str | None, latest: str | None) -> bool:
    """True iff both are valid versions and latest is strictly greater than current."""
    if not current or not latest:
        return False
    try:
        vc = Version(current)
        vl = Version(latest)
    except InvalidVersion:
        return False
    return vl > vc
