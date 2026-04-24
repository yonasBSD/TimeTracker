"""Tests for app.utils.version_compare."""

import pytest

from app.utils.version_compare import is_upgrade, normalize_version_tag


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("v4.1.0", "4.1.0"),
        ("  4.1.0  ", "4.1.0"),
        ("4.0.0-beta.1", "4.0.0b1"),  # canonical form from packaging
        (None, None),
        ("", None),
        ("   ", None),
        ("v", None),
        ("not-a-version", None),
    ],
)
def test_normalize_version_tag(raw, expected):
    got = normalize_version_tag(raw)
    if expected is None:
        assert got is None
    else:
        assert got == expected


def test_normalize_version_tag_strips_v_only():
    assert normalize_version_tag("v1.2.3") == "1.2.3"


@pytest.mark.parametrize(
    "current,latest,expect",
    [
        ("4.0.0", "4.1.0", True),
        ("4.0.0", "4.0.0", False),
        ("4.1.0", "4.0.0", False),
        ("4.0.0", None, False),
        (None, "4.0.0", False),
        ("dev-1", "4.0.0", False),
    ],
)
def test_is_upgrade(current, latest, expect):
    assert is_upgrade(current, latest) is expect
