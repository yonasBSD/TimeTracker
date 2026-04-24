"""Tests for StatsService value dashboard aggregation."""

from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest

from app import db
from app.models import Project, TimeEntry
from app.services.stats_service import StatsService, compute_value_dashboard_for_tests


def _add_entry(user_id, project_id, start, end, duration_seconds):
    e = TimeEntry(
        user_id=user_id,
        project_id=project_id,
        start_time=start,
        end_time=end,
        duration_seconds=duration_seconds,
        notes="stats test",
        source="manual",
        billable=True,
    )
    db.session.add(e)
    db.session.commit()
    return e


@pytest.mark.unit
def test_value_dashboard_basic_math(app, user, project):
    frozen = datetime(2026, 6, 10, 12, 0, 0)
    with patch("app.services.stats_service.local_now", return_value=frozen):
        _add_entry(user.id, project.id, frozen, frozen + timedelta(hours=1), 3600)
        _add_entry(user.id, project.id, frozen, frozen + timedelta(hours=2), 3600)
        out = compute_value_dashboard_for_tests(user)
    assert out["entries_count"] == 2
    assert out["total_hours"] == 2.0
    assert out["avg_session_length"] == 1.0
    assert out["active_days"] == 1


@pytest.mark.unit
def test_value_dashboard_active_days_two_dates(app, user, project):
    frozen = datetime(2026, 6, 10, 12, 0, 0)
    d1 = datetime(2026, 6, 9, 10, 0, 0)
    d2 = datetime(2026, 6, 10, 10, 0, 0)
    with patch("app.services.stats_service.local_now", return_value=frozen):
        _add_entry(user.id, project.id, d1, d1 + timedelta(hours=1), 3600)
        _add_entry(user.id, project.id, d2, d2 + timedelta(hours=1), 3600)
        out = compute_value_dashboard_for_tests(user)
    assert out["active_days"] == 2


@pytest.mark.unit
def test_value_dashboard_week_and_month_windows(app, user, project):
    """Week starts Monday 2026-01-13; frozen Wednesday 2026-01-15."""
    frozen = datetime(2026, 1, 15, 12, 0, 0)
    with patch("app.services.stats_service.local_now", return_value=frozen):
        # Before current week (week start Jan 13)
        _add_entry(
            user.id,
            project.id,
            datetime(2026, 1, 5, 9, 0, 0),
            datetime(2026, 1, 5, 10, 0, 0),
            3600,
        )
        # In week, in month
        _add_entry(
            user.id,
            project.id,
            datetime(2026, 1, 14, 9, 0, 0),
            datetime(2026, 1, 14, 11, 0, 0),
            7200,
        )
        # In month, not in week (Jan 1)
        _add_entry(
            user.id,
            project.id,
            datetime(2026, 1, 1, 9, 0, 0),
            datetime(2026, 1, 1, 9, 30, 0),
            1800,
        )
        # Previous month
        _add_entry(
            user.id,
            project.id,
            datetime(2025, 12, 20, 9, 0, 0),
            datetime(2025, 12, 20, 19, 0, 0),
            36000,
        )
        out = compute_value_dashboard_for_tests(user)
    assert out["this_week_hours"] == 2.0
    assert out["this_month_hours"] == 3.5
    assert out["total_hours"] == 13.5


@pytest.mark.unit
def test_value_dashboard_last_7_days_shape_and_sum(app, user, project):
    frozen = datetime(2026, 1, 15, 12, 0, 0)
    with patch("app.services.stats_service.local_now", return_value=frozen):
        _add_entry(
            user.id,
            project.id,
            datetime(2026, 1, 10, 9, 0, 0),
            datetime(2026, 1, 10, 11, 0, 0),
            7200,
        )
        _add_entry(
            user.id,
            project.id,
            datetime(2026, 1, 14, 9, 0, 0),
            datetime(2026, 1, 14, 10, 0, 0),
            3600,
        )
        out = compute_value_dashboard_for_tests(user)
    days = out["last_7_days"]
    assert len(days) == 7
    assert days[0]["date"] == "2026-01-09"
    assert days[-1]["date"] == "2026-01-15"
    total_chart = sum(d["hours"] for d in days)
    assert total_chart == 3.0


@pytest.mark.unit
def test_value_dashboard_most_productive_day(app, user, project):
    frozen = datetime(2026, 1, 15, 12, 0, 0)
    # 2026-01-13 is Tuesday — more hours than Monday 12th
    with patch("app.services.stats_service.local_now", return_value=frozen):
        _add_entry(
            user.id,
            project.id,
            datetime(2026, 1, 12, 9, 0, 0),
            datetime(2026, 1, 12, 10, 0, 0),
            3600,
        )
        _add_entry(
            user.id,
            project.id,
            datetime(2026, 1, 13, 9, 0, 0),
            datetime(2026, 1, 13, 14, 0, 0),
            18000,
        )
        out = compute_value_dashboard_for_tests(user)
    assert out["most_productive_day"] == "Tuesday"


@pytest.mark.unit
def test_value_dashboard_estimated_value(app, user, project):
    project.hourly_rate = Decimal("50.00")
    db.session.commit()
    frozen = datetime(2026, 3, 1, 10, 0, 0)
    with patch("app.services.stats_service.local_now", return_value=frozen):
        _add_entry(
            user.id,
            project.id,
            frozen,
            frozen + timedelta(hours=2),
            7200,
        )
        out = compute_value_dashboard_for_tests(user)
    assert out["estimated_value_tracked"] == 100.0
    assert out["estimated_value_currency"]


@pytest.mark.unit
def test_value_dashboard_excludes_active_timer(app, user, project):
    frozen = datetime(2026, 4, 1, 10, 0, 0)
    with patch("app.services.stats_service.local_now", return_value=frozen):
        _add_entry(
            user.id,
            project.id,
            frozen,
            frozen + timedelta(hours=1),
            3600,
        )
        active = TimeEntry(
            user_id=user.id,
            project_id=project.id,
            start_time=frozen,
            end_time=None,
            notes="running",
            source="manual",
            billable=True,
        )
        db.session.add(active)
        db.session.commit()
        out = compute_value_dashboard_for_tests(user)
    assert out["entries_count"] == 1
    assert out["total_hours"] == 1.0


@pytest.mark.unit
def test_value_dashboard_no_entries(app, user):
    with patch("app.services.stats_service.local_now", return_value=datetime(2026, 5, 1, 10, 0, 0)):
        out = compute_value_dashboard_for_tests(user)
    assert out["entries_count"] == 0
    assert out["total_hours"] == 0.0
    assert out["most_productive_day"] is None
    assert out["estimated_value_tracked"] is None
    assert len(out["last_7_days"]) == 7
    assert all(d["hours"] == 0.0 for d in out["last_7_days"])


@pytest.mark.unit
def test_value_dashboard_cache_read_through(app, user, project, monkeypatch):
    """Second call hits in-memory fake cache (only one compute + set_cache)."""
    store = {}
    sets = {"n": 0}

    def fake_get(key, default=None):
        return store.get(key, default)

    def fake_set(key, value, ttl=3600):
        store[key] = value
        sets["n"] += 1
        return True

    monkeypatch.setattr("app.services.stats_service.get_cache", fake_get)
    monkeypatch.setattr("app.services.stats_service.set_cache", fake_set)

    frozen = datetime(2026, 7, 1, 10, 0, 0)
    with patch("app.services.stats_service.local_now", return_value=frozen):
        _add_entry(user.id, project.id, frozen, frozen + timedelta(hours=1), 3600)
        StatsService.get_value_dashboard(user)
        StatsService.get_value_dashboard(user)
    assert sets["n"] == 1
