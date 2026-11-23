"""The Today box (ChatRequest.save_only): everything is saved, nothing is answered, and no model call is spent on
deciding note-or-question."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.routers import chat  # noqa: E402
from api.schemas import ChatRequest  # noqa: E402


def route(text, **kw):
    return chat._route_without_model(ChatRequest(text=text, **kw))


def test_the_usual_chat_still_needs_the_model_to_decide():
    assert route("What did I note about pricing?") is None     # without save_only nothing changes: the model-assisted path
    assert chat._route_without_model(ChatRequest(text="Met Priya, she wants the quote by Friday")) is None


def test_the_today_box_saves_tasks_and_notes_without_asking_a_model():
    for text in ("Pay the invoice by Friday", "Met Priya today, she wants the quote by Friday", "buy milk",
                 "uh so I spoke to Sid, he is moving to Dubai", "Send the deck by 6pm today"):
        assert route(text, save_only=True) == "capture", text


def test_the_today_box_turns_an_obvious_question_away_instead_of_saving_it():
    for text in ("What's overdue?", "What did I note about pricing?", "When is Rohan's birthday?", "Who owes me money?"):
        assert route(text, save_only=True) == "question_here", text
    reply = chat._question_here_reply()
    assert reply["intent"] == "blocked" and reply["reason"] == "question" and "Home" in reply["answer"]


def test_save_it_as_a_note_still_always_saves():
    assert route("What's overdue?", as_note=True) == "capture"


if __name__ == "__main__":
    tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print("ok  ", name)
        except Exception as e:  # noqa: BLE001
            failed += 1
            print("FAIL", name, "->", repr(e)[:200])
    sys.exit(1 if failed else 0)


def test_greetings_and_pleasantries_are_answered_not_saved():
    import intent

    for text in ["Hi ssup", "hi", "Hello!", "hey there", "what's up", "Whats up?", "good morning", "how are you", "thanks", "Thank you so much",
                 "ok", "okay cool", "bye", "good night", "hi, how r u?"]:
        assert intent.smalltalk_reply(text), text
    assert "See you" in intent.smalltalk_reply("bye") and "Anytime" in intent.smalltalk_reply("thanks")
    assert intent.smalltalk_reply("Hi ssup").startswith("Hi!")


def test_real_notes_that_start_like_a_greeting_are_still_saved():
    import intent

    for text in ["Hi Priya, send the deck by Friday", "Thanks Priya for the deck", "Call you later", "Good news from Acme today",
                 "ok to ship the release on Friday", "Met everyone at the offsite", "Hey - buy milk", "", "   "]:
        assert intent.smalltalk_reply(text) is None, text
