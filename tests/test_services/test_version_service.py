"""Tests for VersionService and GitHub release parsing."""

from unittest.mock import MagicMock, patch

import pytest

from app.models import ApiToken
from app.services.version_service import GithubReleaseData, VersionService, parse_release_object


class TestParseReleaseObject:
    def test_parses_tag_and_fields(self, app):
        with app.app_context():
            r = parse_release_object(
                {
                    "tag_name": "v4.1.0",
                    "body": "Line1\nLine2",
                    "published_at": "2026-04-01T10:00:00Z",
                    "html_url": "https://github.com/DRYTRIX/TimeTracker/releases/tag/v4.1.0",
                }
            )
        assert r is not None
        assert r.latest_version == "4.1.0"
        assert "Line1" in r.release_notes
        assert r.published_at == "2026-04-01T10:00:00Z"
        assert "github.com" in r.release_url

    def test_invalid_tag_returns_none(self, app):
        with app.app_context():
            r = parse_release_object({"tag_name": "not-semver", "body": ""})
        assert r is None


class TestVersionServiceBuildResponse:
    def test_upgrade_when_newer_remote(self, app, admin_user):
        with app.app_context():
            admin_user.dismissed_release_version = None
            with patch.object(VersionService, "get_latest_release") as m:
                m.return_value = GithubReleaseData(
                    latest_version="4.1.0",
                    release_notes="x",
                    published_at="2026-01-01T00:00:00Z",
                    release_url="https://example.com",
                )
                with patch(
                    "app.services.version_service.resolve_current_installed_version",
                    return_value=("4.0.0", "4.0.0"),
                ):
                    out = VersionService.build_check_response(admin_user)
        assert out["update_available"] is True
        assert out["current_version"] == "4.0.0"
        assert out["latest_version"] == "4.1.0"

    def test_respects_dismissed_version(self, app, admin_user):
        with app.app_context():
            admin_user.dismissed_release_version = "4.1.0"
            with patch.object(VersionService, "get_latest_release") as m:
                m.return_value = GithubReleaseData(
                    latest_version="4.1.0",
                    release_notes="",
                    published_at="",
                    release_url="",
                )
                with patch(
                    "app.services.version_service.resolve_current_installed_version",
                    return_value=("4.0.0", "4.0.0"),
                ):
                    out = VersionService.build_check_response(admin_user)
        assert out["update_available"] is False

    def test_no_update_when_current_not_semver(self, app, admin_user):
        with app.app_context():
            with patch.object(VersionService, "get_latest_release") as m:
                m.return_value = GithubReleaseData(
                    latest_version="4.1.0",
                    release_notes="",
                    published_at="",
                    release_url="",
                )
                with patch(
                    "app.services.version_service.resolve_current_installed_version",
                    return_value=(None, "dev-999"),
                ):
                    out = VersionService.build_check_response(admin_user)
        assert out["update_available"] is False
        assert out["current_version"] == "dev-999"


class TestVersionServiceCache:
    def test_uses_hot_cache_without_http_second_call(self, app):
        stored = {
            "latest_version": "5.0.0",
            "release_notes": "cached",
            "published_at": "2026-01-02T00:00:00Z",
            "release_url": "https://u",
        }
        fake = MagicMock()
        fake.get.return_value = stored
        fake.set = MagicMock()

        with app.app_context():
            with patch("app.services.version_service.get_cache", return_value=fake):
                with patch.object(VersionService, "_fetch_from_github_api", return_value=None) as fetch:
                    r1 = VersionService.get_latest_release()
                    r2 = VersionService.get_latest_release()
        assert r1 is not None and r1.latest_version == "5.0.0"
        assert r2 is not None and r2.latest_version == "5.0.0"
        fetch.assert_not_called()


def test_github_fetch_uses_stale_on_failure(app):
    stale = {
        "latest_version": "3.9.0",
        "release_notes": "stale",
        "published_at": "",
        "release_url": "https://stale",
    }
    fake = MagicMock()

    def get_side_effect(key):
        if "stale" in key:
            return stale
        return None

    fake.get.side_effect = get_side_effect
    fake.set = MagicMock()

    with app.app_context():
        with patch("app.services.version_service.get_cache", return_value=fake):
            with patch.object(VersionService, "_fetch_from_github_api", return_value=None):
                r = VersionService.get_latest_release()
    assert r is not None
    assert r.latest_version == "3.9.0"
    assert r.release_notes == "stale"


def test_version_check_bearer_admin(app, client, admin_user):
    with app.app_context():
        _tok, plain = ApiToken.create_token(
            user_id=admin_user.id,
            name="admin token",
            scopes="read:projects",
            expires_days=30,
        )
        from app import db

        db.session.add(_tok)
        db.session.commit()

    payload = {
        "update_available": False,
        "current_version": "1.0.0",
        "latest_version": "1.0.0",
        "release_notes": "",
        "published_at": None,
        "release_url": None,
    }
    with patch.object(VersionService, "build_check_response", return_value=payload):
        r = client.get(
            "/api/version/check",
            headers={"Authorization": f"Bearer {plain}"},
        )
    assert r.status_code == 200
    assert r.get_json() == payload
