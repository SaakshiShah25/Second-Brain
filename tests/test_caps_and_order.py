"""Monthly free caps (entitlements.py) and the user's initiative order (db.py)."""

import types

import pytest

import db
import entitlements
from conftest import events


@pytest.fixture
def usage(monkeypatch):
    counts = {}
    monkeypatch.setattr(entitlements, "get_tier", lambda uid: "free")
    monkeypatch.setattr(entitlements.db, "get_usage_count", lambda uid, res, period: counts.get((uid, res), 0))

    def inc(uid, res, period):
        counts[(uid, res)] = counts.get((uid, res), 0) + 1

    monkeypatch.setattr(entitlements.db, "increment_usage", inc)
    return counts


def test_each_action_is_counted_and_recorded(usage, obs):
    entitlements.check_and_increment("u", "interactions_logged")
    assert usage[("u", "interactions_logged")] == 1
    assert events("usage", "interactions_logged")[0]["user_id"] == "u"


def test_cap_blocks_records_and_alerts_once(usage, obs):
    cap = entitlements.FREE_LIMITS["ai_questions_asked"]
    usage[("u", "ai_questions_asked")] = cap
    for _ in range(2):
        with pytest.raises(entitlements.LimitExceeded):
            entitlements.check_and_increment("u", "ai_questions_asked")
    assert len(events("limit", "user_monthly_cap")) == 2
    assert len(obs.sent) == 1 and "monthly" in obs.sent[0][1]


def test_premium_and_unmetered_never_block(usage, obs, monkeypatch):
    entitlements.check_and_increment("u", "some_free_thing")
    monkeypatch.setattr(entitlements, "get_tier", lambda uid: "premium")
    usage[("u", "interactions_logged")] = 10_000
    entitlements.check_and_increment("u", "interactions_logged")  # no raise


def test_database_trouble_fails_open(obs, monkeypatch):
    monkeypatch.setattr(entitlements, "get_tier", lambda uid: "free")

    def down(*a):
        raise RuntimeError("supabase timeout")

    monkeypatch.setattr(entitlements.db, "get_usage_count", down)
    entitlements.check_and_increment("u", "interactions_logged")  # the user is never blocked by our outage


class _Query:
    def __init__(self, log, fail_on_position):
        self.log, self.fail = log, fail_on_position
        self.ordered = []

    def select(self, *a): return self
    def eq(self, *a): return self
    def update(self, row): self.log.append(("update", row)); return self
    def order(self, col, **kw): self.ordered.append(col); return self

    def execute(self):
        if self.fail and "position" in self.ordered:
            raise RuntimeError("column initiative.position does not exist")
        self.log.append(("order", tuple(self.ordered)))
        return types.SimpleNamespace(data=[{"id": 1, "name": "Work"}])


def _client(monkeypatch, fail_on_position):
    log = []
    client = types.SimpleNamespace(table=lambda name: _Query(log, fail_on_position))
    monkeypatch.setattr(db, "get_client", lambda: client)
    return log


def test_initiatives_follow_saved_order_and_survive_missing_column(monkeypatch):
    log = _client(monkeypatch, fail_on_position=False)
    assert db.get_initiatives("u") == [{"id": 1, "name": "Work"}]
    assert ("order", ("position", "created_at")) in log
    log = _client(monkeypatch, fail_on_position=True)
    assert db.get_initiatives("u") == [{"id": 1, "name": "Work"}]  # falls back to creation order
    assert ("order", ("created_at",)) in log


def test_reorder_writes_positions_and_reports_missing_column(monkeypatch):
    log = _client(monkeypatch, fail_on_position=False)
    assert db.reorder_initiatives("u", [3, 1, 2]) is True
    assert [row for kind, row in log if kind == "update"] == [{"position": 0}, {"position": 1}, {"position": 2}]

    class Broken(_Query):
        def execute(self):
            raise RuntimeError("no column")

    monkeypatch.setattr(db, "get_client", lambda: types.SimpleNamespace(table=lambda n: Broken([], False)))
    assert db.reorder_initiatives("u", [1]) is False


class _Racy:
    """A table where the row appears between our read and our insert -
    another request from the same new user created it first."""

    def __init__(self, existing, code="23505"):
        self.existing, self.code, self.reads = existing, code, 0

    def select(self, *a): return self
    def eq(self, *a): return self
    def order(self, *a, **k): return self

    def insert(self, rows):
        from postgrest.exceptions import APIError

        raise APIError({"message": "duplicate key", "code": self.code, "hint": None, "details": None})

    def execute(self):
        self.reads += 1
        return types.SimpleNamespace(data=[] if self.reads == 1 else self.existing)


PREF = [{"user_id": "new-user", "theme": "dark"}]
INITS = [{"id": 1, "name": "Personal"}, {"id": 2, "name": "Work"}]


@pytest.mark.parametrize("fn,existing,expected", [
    (lambda: db.get_user_preference("new-user"), PREF, PREF[0]),
    (lambda: db.get_initiatives("new-user"), INITS, INITS),
])
def test_new_users_first_screen_race_returns_the_existing_defaults(monkeypatch, fn, existing, expected):
    """Regression (evals/load.py): a new user's first screen loads settings and
    initiatives concurrently; the losing insert used to 500."""
    table = _Racy(existing)
    monkeypatch.setattr(db, "get_client", lambda: types.SimpleNamespace(table=lambda n: table))
    assert fn() == expected


def test_other_database_errors_still_surface(monkeypatch):
    from postgrest.exceptions import APIError

    table = _Racy([], code="42501")  # permission denied - not a race
    monkeypatch.setattr(db, "get_client", lambda: types.SimpleNamespace(table=lambda n: table))
    with pytest.raises(APIError):
        db.get_user_preference("u")
