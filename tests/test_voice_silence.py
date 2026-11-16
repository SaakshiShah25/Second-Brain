"""Silence must not come back as words: Whisper invents "I'm sorry" / "Thank you" for a recording nobody spoke into."""
from types import SimpleNamespace

import pytest

import voice


def seg(text, no_speech=0.0, logprob=-0.2):
    return {"text": text, "no_speech_prob": no_speech, "avg_logprob": logprob}


def fake_client(result, calls=None):
    def create(**kw):
        if calls is not None:
            calls.append(kw)
        return result

    return SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=create)))


@pytest.fixture
def use(monkeypatch):
    def _use(result, calls=None):
        monkeypatch.setattr(voice, "get_client", lambda: fake_client(result, calls))
    return _use


def test_a_made_up_phrase_over_silence_is_not_a_transcript(use):
    use(SimpleNamespace(text=" I'm sorry.", segments=[seg(" I'm sorry.", no_speech=0.92, logprob=-1.4)]))
    assert voice.transcribe_audio(b"x") == ""
    use(SimpleNamespace(text="Thank you.", segments=[seg("Thank you.", no_speech=0.5, logprob=-0.4)]))
    assert voice.transcribe_audio(b"x") == ""


def test_real_speech_is_kept_even_when_it_contains_those_words(use):
    use(SimpleNamespace(text=" I am sorry I missed your call. Send the deck to Priya by Friday.",
                        segments=[seg(" I am sorry I missed your call.", 0.02, -0.15), seg(" Send the deck to Priya by Friday.", 0.01, -0.1)]))
    assert voice.transcribe_audio(b"x") == "I am sorry I missed your call. Send the deck to Priya by Friday."


def test_only_the_unsure_segment_is_dropped_from_a_longer_recording(use):
    use(SimpleNamespace(text="Call the bank tomorrow. Thank you.", segments=[seg("Call the bank tomorrow.", 0.03, -0.2), seg(" Thank you.", 0.7, -1.3)]))
    assert voice.transcribe_audio(b"x") == "Call the bank tomorrow."


def test_a_one_word_real_note_with_confident_speech_is_kept(use):
    use(SimpleNamespace(text="Okay", segments=[seg("Okay", 0.01, -0.1)]))
    assert voice.transcribe_audio(b"x") == "Okay"


def test_without_segment_detail_a_lone_stock_phrase_is_dropped(use):
    use(SimpleNamespace(text="I am sorry.", segments=None))
    assert voice.transcribe_audio(b"x") == ""
    use(SimpleNamespace(text="Pay the electricity bill tomorrow.", segments=None))
    assert voice.transcribe_audio(b"x") == "Pay the electricity bill tomorrow."


def test_a_model_without_verbose_json_falls_back_to_plain_text(monkeypatch):
    calls = []

    def create(**kw):
        calls.append(kw.get("response_format"))
        if kw.get("response_format"):
            raise RuntimeError("response_format verbose_json is not supported")
        return SimpleNamespace(text="Book the dentist.", segments=None)

    monkeypatch.setattr(voice, "get_client", lambda: SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=create))))
    assert voice.transcribe_audio(b"x") == "Book the dentist." and calls == ["verbose_json", None]
