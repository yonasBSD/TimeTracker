"""Integration tests for /api/version/check and /api/version/dismiss."""

from unittest.mock import patch

import pytest

from app import db
from app.models import User


@pytest.fixture
def version_payload():
    return {
        "update_available": True,
        "current_version": "4.0.0",
        "latest_version": "4.1.0",
        "release_notes": "Fixes",
        "published_at": "2026-04-01T10:00:00Z",
        "release_url": "https://github.com/DRYTRIX/TimeTracker/releases/tag/v4.1.0",
    }


class TestApiVersionCheckAuth:
    def test_unauthenticated_returns_401(self, client):
        r = client.get("/api/version/check")
        assert r.status_code == 401

    def test_regular_user_forbidden(self, client, user):
        client.post(
            "/login",
            data={"username": user.username, "password": "password123"},
            follow_redirects=True,
        )
        r = client.get("/api/version/check")
        assert r.status_code == 403

    def test_admin_ok(self, client, admin_user, version_payload):
        client.post(
            "/login",
            data={"username": admin_user.username, "password": "password123"},
            follow_redirects=True,
        )
        with patch(
            "app.services.version_service.VersionService.build_check_response",
            return_value=version_payload,
        ):
            r = client.get("/api/version/check")
        assert r.status_code == 200
        assert r.get_json() == version_payload


class TestApiVersionDismiss:
    def test_dismiss_persists(self, app, client, admin_user):
        client.post(
            "/login",
            data={"username": admin_user.username, "password": "password123"},
            follow_redirects=True,
        )
        r = client.post(
            "/api/version/dismiss",
            json={"latest_version": "v4.1.0"},
        )
        assert r.status_code == 200
        assert r.get_json().get("ok") is True
        with app.app_context():
            u = db.session.get(User, admin_user.id)
            assert u.dismissed_release_version == "4.1.0"

    def test_dismiss_invalid_version_400(self, client, admin_user):
        client.post(
            "/login",
            data={"username": admin_user.username, "password": "password123"},
            follow_redirects=True,
        )
        r = client.post("/api/version/dismiss", json={"latest_version": "not-a-version"})
        assert r.status_code == 400
