"""Deadline phrases the extraction model returns must become real dates."""

from datetime import date

import pytest

import date_utils

WED = date(2026, 10, 28)


@pytest.mark.parametrize("phrase,expected", [
    ("Friday", "2026-10-30"), ("by Friday", "2026-10-30"), ("before Friday", "2026-10-30"),
    ("on Friday", "2026-10-30"), ("by EOD Friday", "2026-10-30"), ("end of day Friday", "2026-10-30"),
    ("by tomorrow", "2026-10-29"), ("by next Monday", "2026-11-02"), ("by 2026-11-05", "2026-11-05"),
    ("next Monday", "2026-11-02"), ("this Friday", "2026-10-30"), ("Sunday", "2026-11-01"),
])
def test_deadline_wording_is_resolved(phrase, expected):
    """Regression (evals): the model sometimes keeps 'by ...' and the task lost its due date."""
    assert date_utils.resolve_relative_phrase(phrase, WED) == expected


@pytest.mark.parametrize("junk", ["by the way", "soon", "", None, "by", "EOD"])
def test_non_dates_stay_unresolved(junk):
    assert date_utils.resolve_relative_phrase(junk, WED) is None
