"""Contract checks: curated HTTP paths exist on the Flask url map; OpenAPI version matches app version."""

import pytest
from werkzeug.exceptions import MethodNotAllowed, NotFound

pytestmark = [pytest.mark.api, pytest.mark.integration]

# Paths exercised by tests after drift cleanup; extend when adding stable API coverage.
CONTRACT_ROUTES = (
    ("/api/v1/info", "GET"),
    ("/api/v1/health", "GET"),
    ("/api/timer/status", "GET"),
    ("/api/timer/stop", "POST"),
    ("/api/openapi.json", "GET"),
    ("/api/analytics/hours-by-day", "GET"),
    ("/api/analytics/hours-by-project", "GET"),
    ("/api/tasks/create", "POST"),
    ("/projects/create", "GET"),
    ("/api/reports/scheduled", "GET"),
)


def test_contract_routes_registered(app):
    """Each curated path must resolve against the application's url map."""
    server_name = app.config.get("SERVER_NAME") or "localhost"
    adapter = app.url_map.bind(server_name)
    for path, method in CONTRACT_ROUTES:
        try:
            adapter.match(path, method=method)
        except NotFound:
            pytest.fail(f"No route registered for {method} {path!r}")
        except MethodNotAllowed as exc:
            pytest.fail(f"Method not allowed for {method} {path!r}: {exc!s}")


def test_openapi_info_version_matches_app_version(app, client):
    """OpenAPI info.version must follow setup.py / env (same as get_version_from_setup)."""
    from app.config.analytics_defaults import get_version_from_setup

    expected = get_version_from_setup()
    if expected == "unknown":
        expected = app.config.get("APP_VERSION", "1.0.0")

    response = client.get("/api/openapi.json")
    assert response.status_code == 200
    data = response.get_json()
    assert data.get("info", {}).get("version") == expected
