"""A new account (its settings row being created for the first time) emails ALERT_EMAIL; an existing one doesn't.
Run: python tests/test_signup_alert.py"""

import os
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import db  # noqa: E402
import observability  # noqa: E402


class _Table:
    def __init__(self, existing):
        self.existing = existing

    def select(self, *_):
        return self

    def eq(self, *_):
        return self

    def insert(self, row):
        self.row = row
        return self

    def execute(self):
        if hasattr(self, "row"):  # after an insert: the new row
            return types.SimpleNamespace(data=[self.row])
        return types.SimpleNamespace(data=self.existing)


def _run(existing):
    sent = []
    real = (db.get_client, db.get_user_email, observability.alert, observability.alert_email, db.threading.Thread)
    db.get_client = lambda: types.SimpleNamespace(table=lambda _: _Table(existing))
    db.get_user_email = lambda uid: "new@person.com"
    observability.alert = lambda key, subject, body: sent.append((key, subject, body)) or True
    observability.alert_email = lambda: "me@example.com"

    class Inline:  # run the background thread right away so the test can look at the result
        def __init__(self, target, **_):
            self.target = target

        def start(self):
            self.target()

    db.threading.Thread = Inline
    try:
        db.get_user_preference("u1")
    finally:
        db.get_client, db.get_user_email, observability.alert, observability.alert_email, db.threading.Thread = real
    return sent


def test_a_first_visit_sends_a_signup_email():
    sent = _run(existing=[])
    assert len(sent) == 1
    key, subject, body = sent[0]
    assert key == "signup:u1" and "new@person.com" in subject and "new@person.com" in body


def test_a_returning_user_sends_nothing():
    assert _run(existing=[{"user_id": "u1"}]) == []


if __name__ == "__main__":
    test_a_first_visit_sends_a_signup_email()
    test_a_returning_user_sends_nothing()
    print("ok")
