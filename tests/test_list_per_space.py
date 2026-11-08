"""A list belongs to one space: the same name in two spaces is two lists."""

import os
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import db  # noqa: E402

LISTS = [
    {"id": 1, "name": "Reading list", "emoji": "📚", "initiative_id": 2},
    {"id": 2, "name": "Reading list", "emoji": "📚", "initiative_id": 3},
    {"id": 3, "name": "Movies", "emoji": "🎬", "initiative_id": None},
]


def test_find_list_matches_by_name_within_the_space(monkeypatch):
    monkeypatch.setattr(db, "list_space_supported", lambda: True)
    assert db.find_list("u", "my reading list", 3, lists=LISTS)["id"] == 2
    assert db.find_list("u", "Reading list", 2, lists=LISTS)["id"] == 1
    assert db.find_list("u", "Reading list", 9, lists=LISTS) is None
    assert db.find_list("u", "films", None, lists=LISTS)["id"] == 3   # "Films" is the Movies list, which has no space


def test_without_the_migration_the_name_alone_decides(monkeypatch):
    monkeypatch.setattr(db, "list_space_supported", lambda: False)
    assert db.find_list("u", "Reading list", 9, lists=LISTS)["id"] == 1


def test_a_capture_into_a_space_uses_or_makes_that_spaces_list(monkeypatch):
    import api.routers.capture as cap
    made = []
    lists = [dict(l) for l in LISTS]

    def create_list(uid, name, emoji=None, initiative_id=None):
        row = {"id": 50 + len(made), "name": name, "emoji": emoji, "initiative_id": initiative_id}
        made.append(row)
        lists.append(row)
        return row

    cap.db = types.SimpleNamespace(
        get_lists=lambda u: lists,
        find_list=lambda u, name, space, lists=None: db.find_list(u, name, space, lists=lists),
        create_list=create_list,
    )
    monkeypatch.setattr(db, "list_space_supported", lambda: True)
    r = cap._ListResolver("u")
    assert r.resolve("Reading list", 3)["id"] == 2         # Work already has one
    assert r.resolve("Reading list", 4)["initiative_id"] == 4 and len(made) == 1   # a third space gets its own
    assert r.resolve("Reading list", 4)["id"] == made[0]["id"]  # ...once
