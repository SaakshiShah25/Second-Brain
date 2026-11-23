"""An answer must read like a person wrote it: no database numbers, refs or null values."""
import agent


def test_spoken_database_numbers_are_dropped():
    out = agent._strip_refs("The note about leave is note 3231 dated 2026-11-16. See task #17 and the note 12.")
    assert "3231" not in out and "#17" not in out and "12" not in out
    assert "the note dated 2026-11-16" in out


def test_internal_refs_and_null_values_are_dropped():
    out = agent._strip_refs("It is in Work (note:3231). It has no location (location is null).")
    assert "note:" not in out and "null" not in out and "3231" not in out
    assert out.startswith("It is in Work.")


def test_ordinary_numbers_stay():
    text = "You have 3 tasks due on 12 November and a 2026 plan."
    assert agent._strip_refs(text) == text
