"""HTTP tests for /api/notifications and dismiss."""

import pytest
from sqlalchemy import update

from app import db
from app.models import User


@pytest.mark.unit
def test_notifications_requires_login(client):
    r = client.get("/api/notifications")
    assert r.status_code in (401, 302)


@pytest.mark.unit
def test_notifications_dismiss_requires_login(client):
    r = client.post("/api/notifications/dismiss", json={"kind": "timer_running_long", "local_date": "2026-06-10"})
    assert r.status_code in (401, 302)


@pytest.mark.unit
def test_notifications_get_json(authenticated_client, user, app):
    with app.app_context():
        db.session.execute(update(User).where(User.id == user.id).values(smart_notifications_enabled=False))
        db.session.commit()

    r = authenticated_client.get("/api/notifications")
    assert r.status_code == 200
    data = r.get_json()
    assert "notifications" in data
    assert "meta" in data
    assert data["meta"].get("enabled") is False


@pytest.mark.unit
def test_notifications_dismiss_invalid_kind(authenticated_client, app, user):
    with app.app_context():
        db.session.execute(update(User).where(User.id == user.id).values(smart_notifications_enabled=True))
        db.session.commit()

    r = authenticated_client.post("/api/notifications/dismiss", json={"kind": "not_a_real_kind"})
    assert r.status_code == 400
