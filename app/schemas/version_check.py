"""Typed response for GET /api/version/check."""

from typing import TypedDict


class VersionCheckResponse(TypedDict):
    update_available: bool
    current_version: str
    latest_version: str | None
    release_notes: str | None
    published_at: str | None
    release_url: str | None
