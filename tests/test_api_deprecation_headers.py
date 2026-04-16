"""Session /api routes that overlap v1 should expose deprecation headers."""

import pytest

pytestmark = [pytest.mark.api, pytest.mark.integration]


def test_legacy_health_deprecation_header(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.headers.get("X-API-Deprecated") == "true"
    assert "successor-version" in (r.headers.get("Link") or "")
    assert "/api/v1/health" in (r.headers.get("Link") or "")


def test_legacy_search_deprecation_header(authenticated_client, project):
    r = authenticated_client.get("/api/search", query_string={"q": project.name[:3]})
    assert r.status_code == 200
    assert r.headers.get("X-API-Deprecated") == "true"
    link = r.headers.get("Link") or ""
    assert "successor-version" in link
    assert "/api/v1/search" in link


def test_legacy_timer_status_deprecation_header(authenticated_client):
    r = authenticated_client.get("/api/timer/status")
    assert r.status_code == 200
    assert r.headers.get("X-API-Deprecated") == "true"
    assert "/api/v1/timer/status" in (r.headers.get("Link") or "")


def test_legacy_projects_list_deprecation_header(authenticated_client):
    r = authenticated_client.get("/api/projects")
    assert r.status_code == 200
    assert r.headers.get("X-API-Deprecated") == "true"
    assert "/api/v1/projects" in (r.headers.get("Link") or "")
