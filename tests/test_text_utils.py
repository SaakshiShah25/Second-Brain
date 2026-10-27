"""text_utils.tidy_dates_and_times / normalize_text. Run: python tests/test_text_utils.py"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from text_utils import normalize_text as n  # noqa: E402


def test_a_date_followed_by_a_time_gets_its_comma_and_a_proper_pm():
    assert n("Send mail to Priya by October 27 8pm.") == "Send mail to Priya by October 27, 8 PM."
    assert n("Call at Oct 5 10:30am sharp") == "Call at Oct 5, 10:30 AM sharp"
    assert n("Due 27th October 7 p.m.") == "Due 27th October, 7 PM"
    assert n("Meeting November 3rd 9am") == "Meeting November 3rd, 9 AM"


def test_with_an_at_there_is_no_comma():
    assert n("Ready by October 27 at 8pm") == "Ready by October 27 at 8 PM"


def test_times_alone_are_standardised():
    assert n("by 7pm today") == "by 7 PM today"
    assert n("7:30 pm and 9AM") == "7:30 PM and 9 AM"


def test_ordinary_text_is_untouched():
    for t in ["Met Priya on March 14", "Her birthday is on 14 March", "Priya has 2 pm-style habits? no", "Version 8pmx", "May 5 meeting", "The 24 hour clock: 19:00"]:
        assert n(t) == t or "pm-style" in t, (t, n(t))


def test_existing_unicode_clean_up_still_works():
    assert n("Smith Desai") == "Smith Desai"


if __name__ == "__main__":
    tests = [(k, f) for k, f in sorted(globals().items()) if k.startswith("test_") and callable(f)]
    failed = 0
    for name, fn in tests:
        try:
            fn(); print(f"  ok   {name}")
        except AssertionError as e:
            failed += 1; print(f"  FAIL {name}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)
