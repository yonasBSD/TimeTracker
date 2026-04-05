"""Tests for bulk time entry actions."""

from unittest.mock import MagicMock, patch

import pytest

pytestmark = [pytest.mark.unit]


@patch("app.services.time_entry_bulk_service.safe_commit")
@patch("app.services.time_entry_bulk_service.db")
def test_bulk_all_active_entries_returns_400(mock_db, mock_safe_commit):
    from app.services.time_entry_bulk_service import apply_bulk_time_entry_actions

    e = MagicMock()
    e.user_id = 1
    e.is_active = True

    mock_q = MagicMock()
    mock_q.all.return_value = [e]

    with patch("app.services.time_entry_bulk_service.TimeEntry") as TE:
        TE.query.filter.return_value = mock_q
        result = apply_bulk_time_entry_actions(
            [99],
            "set_billable",
            True,
            user_id=1,
            is_admin=False,
        )

    assert result["success"] is False
    assert result["http_status"] == 400
    assert "active" in result["error"].lower()
    mock_db.session.rollback.assert_called()
    mock_safe_commit.assert_not_called()
