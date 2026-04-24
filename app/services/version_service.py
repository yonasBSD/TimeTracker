"""Fetch and compare app version to latest GitHub release (admin update notification)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import requests
from flask import current_app

from app.config.analytics_defaults import get_version_from_setup
from app.models.user import User
from app.schemas.version_check import VersionCheckResponse
from app.utils.cache import get_cache
from app.utils.version_compare import is_upgrade, normalize_version_tag

HOT_CACHE_PREFIX = "version_check:github:"
STALE_CACHE_PREFIX = "version_check:github_stale:"


@dataclass(frozen=True)
class GithubReleaseData:
    latest_version: str
    release_notes: str
    published_at: str
    release_url: str


def _release_to_dict(r: GithubReleaseData) -> dict[str, str]:
    return {
        "latest_version": r.latest_version,
        "release_notes": r.release_notes,
        "published_at": r.published_at,
        "release_url": r.release_url,
    }


def _dict_to_release(d: dict[str, Any]) -> GithubReleaseData | None:
    try:
        lv = d.get("latest_version")
        if not isinstance(lv, str) or not lv:
            return None
        return GithubReleaseData(
            latest_version=lv,
            release_notes=str(d.get("release_notes") or ""),
            published_at=str(d.get("published_at") or ""),
            release_url=str(d.get("release_url") or ""),
        )
    except (TypeError, ValueError):
        return None


def _github_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "TimeTracker-VersionCheck/1.0",
    }
    token = current_app.config.get("GITHUB_RELEASES_TOKEN")
    if token:
        headers["Authorization"] = f"token {token}"
    return headers


def parse_release_object(data: dict[str, Any]) -> GithubReleaseData | None:
    """Parse a single GitHub release JSON object."""
    tag = data.get("tag_name")
    if not isinstance(tag, str):
        current_app.logger.warning("Version check: GitHub release missing tag_name: %r", tag)
        return None
    norm = normalize_version_tag(tag)
    if not norm:
        current_app.logger.warning("Version check: invalid tag_name for semver: %r", tag)
        return None
    body = data.get("body")
    notes = body if isinstance(body, str) else ""
    pub = data.get("published_at")
    published = pub if isinstance(pub, str) else ""
    url = data.get("html_url")
    release_url = url if isinstance(url, str) else ""
    return GithubReleaseData(
        latest_version=norm,
        release_notes=notes,
        published_at=published,
        release_url=release_url,
    )


def resolve_current_installed_version() -> tuple[str | None, str]:
    """
    Returns (normalized_semver_or_none, display_current_version_string).
    Prefer APP_VERSION from config when it normalizes to semver; else setup.py.
    """
    raw = (current_app.config.get("APP_VERSION") or "").strip()
    if raw:
        norm = normalize_version_tag(raw)
        if norm:
            return norm, raw
    raw_setup = get_version_from_setup() or ""
    norm = normalize_version_tag(raw_setup)
    if norm:
        return norm, raw_setup
    current_app.logger.warning(
        "Version check: no comparable semver for current install (APP_VERSION=%r, setup.py=%r)",
        current_app.config.get("APP_VERSION"),
        raw_setup,
    )
    return None, raw or raw_setup or "unknown"


class VersionService:
    """GitHub latest release + caching + semver comparison for admin update prompts."""

    @staticmethod
    def _cache_keys(repo: str) -> tuple[str, str]:
        safe = repo.replace("/", ":")
        return f"{HOT_CACHE_PREFIX}{safe}", f"{STALE_CACHE_PREFIX}{safe}"

    @classmethod
    def _fetch_from_github_api(cls) -> GithubReleaseData | None:
        repo = (current_app.config.get("VERSION_CHECK_GITHUB_REPO") or "DRYTRIX/TimeTracker").strip()
        timeout = int(current_app.config.get("VERSION_CHECK_HTTP_TIMEOUT") or 10)
        include_prerelease = bool(current_app.config.get("ENABLE_PRE_RELEASE_NOTIFICATIONS"))

        if include_prerelease:
            url = f"https://api.github.com/repos/{repo}/releases?per_page=20"
        else:
            url = f"https://api.github.com/repos/{repo}/releases/latest"

        try:
            resp = requests.get(url, headers=_github_headers(), timeout=timeout)
        except requests.RequestException as exc:
            current_app.logger.error("Version check: GitHub request failed: %s", exc)
            return None

        if resp.status_code == 403:
            current_app.logger.warning(
                "Version check: GitHub returned 403 (rate limit or forbidden); body_snippet=%r",
                (resp.text or "")[:200],
            )
            return None
        if resp.status_code >= 500:
            current_app.logger.warning(
                "Version check: GitHub server error %s; body_snippet=%r",
                resp.status_code,
                (resp.text or "")[:200],
            )
            return None
        if resp.status_code != 200:
            current_app.logger.warning(
                "Version check: GitHub unexpected status %s; body_snippet=%r",
                resp.status_code,
                (resp.text or "")[:200],
            )
            return None

        try:
            payload = resp.json()
        except json.JSONDecodeError as exc:
            current_app.logger.error("Version check: invalid JSON from GitHub: %s", exc)
            return None

        if include_prerelease:
            if not isinstance(payload, list):
                current_app.logger.error("Version check: expected JSON list for releases, got %s", type(payload))
                return None
            for item in payload:
                if not isinstance(item, dict):
                    continue
                if item.get("draft"):
                    continue
                parsed = parse_release_object(item)
                if parsed:
                    return parsed
            current_app.logger.warning("Version check: no usable release in GitHub list response")
            return None

        if not isinstance(payload, dict):
            current_app.logger.error("Version check: expected JSON object for latest release, got %s", type(payload))
            return None
        return parse_release_object(payload)

    @classmethod
    def get_latest_release(cls) -> GithubReleaseData | None:
        """Return latest release metadata, using hot cache, then network, then stale cache."""
        repo = (current_app.config.get("VERSION_CHECK_GITHUB_REPO") or "DRYTRIX/TimeTracker").strip()
        hot_key, stale_key = cls._cache_keys(repo)
        hot_ttl = int(current_app.config.get("VERSION_CHECK_GITHUB_CACHE_TTL") or 43200)
        stale_ttl = int(current_app.config.get("VERSION_CHECK_GITHUB_STALE_TTL") or 604800)
        cache = get_cache()

        cached_hot = cache.get(hot_key)
        if isinstance(cached_hot, dict):
            parsed = _dict_to_release(cached_hot)
            if parsed:
                return parsed

        fresh = cls._fetch_from_github_api()
        if fresh:
            as_dict = _release_to_dict(fresh)
            try:
                cache.set(hot_key, as_dict, ttl=hot_ttl)
                cache.set(stale_key, as_dict, ttl=stale_ttl)
            except Exception as exc:
                current_app.logger.warning("Version check: failed to write cache: %s", exc)
            return fresh

        cached_stale = cache.get(stale_key)
        if isinstance(cached_stale, dict):
            parsed = _dict_to_release(cached_stale)
            if parsed:
                current_app.logger.warning("Version check: returning stale cached GitHub release after fetch failure")
                return parsed

        current_app.logger.warning("Version check: no GitHub data and no stale cache available")
        return None

    @classmethod
    def build_check_response(cls, user: User | None) -> VersionCheckResponse:
        current_norm, current_display = resolve_current_installed_version()
        release = cls.get_latest_release()

        latest_version: str | None = None
        release_notes: str | None = None
        published_at: str | None = None
        release_url: str | None = None

        if release:
            latest_version = release.latest_version
            release_notes = release.release_notes or ""
            published_at = release.published_at or None
            release_url = release.release_url or None

        update_available = False
        if current_norm and latest_version:
            update_available = is_upgrade(current_norm, latest_version)

        if update_available and user is not None and user.dismissed_release_version:
            dismissed_norm = normalize_version_tag(user.dismissed_release_version)
            if dismissed_norm and latest_version and dismissed_norm == latest_version:
                update_available = False

        return VersionCheckResponse(
            update_available=update_available,
            current_version=current_display,
            latest_version=latest_version,
            release_notes=release_notes,
            published_at=published_at,
            release_url=release_url,
        )
