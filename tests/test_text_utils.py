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


def test_a_to_do_loses_its_wrapper_and_keeps_the_action():
    from text_utils import clean_task_text as c
    cases = {
        "Add a task to remind me about starting workout, at least 10 minutes skipping every day": "Start workout, at least 10 minutes skipping every day",
        "Add a reminder for me to start a daily workout of at least 10 minutes skipping": "Start a daily workout of at least 10 minutes skipping",
        "Add a task to call the bank": "Call the bank",
        "Remind me to call mom": "Call mom",
        "Don't forget to renew the car insurance": "Renew the car insurance",
        "I need to send David the new email id": "Send David the new email id",
        "Need to fix my sleep schedule": "Fix my sleep schedule",
        "Make sure to lock the office": "Lock the office",
        "- Send Priya the deck": "Send Priya the deck",
        "Send Priya the deck": "Send Priya the deck",
        "Task: renew passport": "Renew passport",
        "Add a task": "Add a task",          # nothing left after the wrapper -> unchanged
    }
    for raw, expected in cases.items():
        assert c(raw) == expected, (raw, c(raw))


def test_spoken_fillers_are_removed_but_real_words_are_not():
    from text_utils import remove_fillers as r
    cases = {
        "Uh, I need to... umm, send the deck to Priya.": "I need to send the deck to Priya.",
        "so, um, the meeting went well, uh, she liked the demo": "So, the meeting went well, she liked the demo",
        "Umm... call the bank tomorrow": "Call the bank tomorrow",
        "Hmm, I think we should go with the annual plan.": "I think we should go with the annual plan.",
        "Erm, book the dentist, uhh, by Friday": "Book the dentist, by Friday",
        "Uh, I need to, um, send the deck to Priya by Friday. And, uh, hum, email Sam the notes.": "I need to send the deck to Priya by Friday. And email Sam the notes.",
        "Send the deck. Um, and email Sam.": "Send the deck. And email Sam.",
        # nothing to remove: unchanged
        "Send the deck to Priya by Friday.": "Send the deck to Priya by Friday.",
        # real words that merely contain or resemble a filler sound
        "The umbrella is in the summary, hum along, mum called, error in the humming, ummah": "The umbrella is in the summary, hum along, mum called, error in the humming, ummah",
        "Meeting with Hume and Ahmed": "Meeting with Hume and Ahmed",
    }
    for raw, expected in cases.items():
        assert r(raw) == expected, (raw, r(raw))
    assert r("") == "" and r("   ") == "   " and r(None) is None
    assert r("umm") == "umm"      # a recording of nothing but a filler is left alone rather than emptied


def test_a_summary_is_always_stored_as_bullet_points():
    from text_utils import as_bullets as b
    # already bullets: tidied, not rewritten
    assert b("- Priya liked the demo\n- Worried about the contract") == "- Priya liked the demo\n- Worried about the contract"
    assert b("• Priya liked the demo\n\n* Worried about the contract") == "- Priya liked the demo\n- Worried about the contract"
    # a paragraph becomes one point per sentence
    assert b("Priya liked the demo. She is worried about the contract! Send the deck?") == \
        "- Priya liked the demo.\n- She is worried about the contract!\n- Send the deck?"
    # a single line is one point; empty stays empty; at most four points
    assert b("Idea: weekend trip to Goa") == "- Idea: weekend trip to Goa"
    assert b("") == "" and b(None) == ""
    assert b("One. Two. Three. Four. Five. Six.").count("\n") == 3


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
