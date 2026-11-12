"""Instructions to the app - "create a reading list in Personal", "make a space called Health" - are carried out,
not logged as a to-do (commands.py, api/routers/chat.py)."""
import os
import sys
import types

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import commands  # noqa: E402


def find_list_stub(get_lists, supported=lambda: True):
    """db.find_list for tests: same words, same space (None = no space)."""
    import text_utils

    def find_list(uid, name, initiative_id=None, lists=None):
        key = text_utils.list_key(name)
        for l in (get_lists() if lists is None else lists):
            if text_utils.list_key(l["name"]) == key and (not supported() or (l.get("initiative_id") or None) == (initiative_id or None)):
                return l
        return None

    return find_list



def test_create_list_and_create_space_messages_are_recognised():
    assert commands.parse("create a new reading list in Personal") == {"kind": "create_list", "name": "Reading list", "space": "Personal"}
    assert commands.parse("Please make a list called Movies under the Personal space") == {"kind": "create_list", "name": "Movies", "space": "Personal"}
    assert commands.parse("Create a reading list") == {"kind": "create_list", "name": "Reading list"}
    assert commands.parse("Create a new space called Health") == {"kind": "create_space", "name": "Health"}
    assert commands.parse("make a new category Fitness") == {"kind": "create_space", "name": "Fitness"}
    assert commands.parse("Create an initiative called Case Studies") == {"kind": "create_space", "name": "Case Studies"}


def test_a_following_add_is_kept_and_add_it_to_a_space_is_a_place_not_a_task():
    assert commands.parse("create a reading list in Personal and add Dune") == {
        "kind": "create_list", "name": "Reading list", "space": "Personal", "then": "add Dune"}
    # the user's own phrasing: "create a new reading list and add it to the Personal space"
    assert commands.parse("Can you create a new reading list and add it to the Personal space") == {
        "kind": "create_list", "name": "Reading list", "space": "Personal"}


def test_ordinary_messages_are_left_alone():
    for text in ["Add milk to my shopping list", "add Dune to my reading list", "Create a to-do list", "start a startup initiative",
                 "add a task to create a list", "Met Priya, send her the deck", "what is on my reading list?", ""]:
        assert commands.parse(text) is None, text


def _chat(monkeypatch, spaces, lists=None, supported=True):
    import api.routers.chat as chat
    made = {"lists": [], "spaces": [], "updated": []}
    lists = lists if lists is not None else []

    def create_initiative(uid, name):
        if any(s["name"].lower() == name.lower() for s in spaces):
            raise ValueError("exists")
        made["spaces"].append(name)
        return {"id": 90 + len(made["spaces"]), "name": name}

    monkeypatch.setattr(chat, "db", types.SimpleNamespace(
        get_initiatives=lambda uid: spaces,
        get_lists=lambda uid: lists,
        create_initiative=create_initiative,
        create_list=lambda uid, name, emoji=None, initiative_id=None: made["lists"].append((name, initiative_id)) or {"id": 7, "name": name, "emoji": emoji},
        update_list=lambda uid, lid, **f: made["updated"].append((lid, f)),
        find_list=find_list_stub(lambda: lists, lambda: supported),
        set_list_tasks_space=lambda uid, lid, sid: None,
        list_space_supported=lambda: supported,
    ))
    return chat, made


def test_creating_a_list_in_a_named_space_makes_it_there(monkeypatch):
    chat, made = _chat(monkeypatch, [{"id": 2, "name": "Personal"}, {"id": 3, "name": "Work"}])
    out = chat._run_command("u", {"kind": "create_list", "name": "Reading list", "space": "personal"}, None)
    assert made["lists"] == [("Reading list", 2)] and "Personal" in out["answer"] and out["space_id"] == 2 and out["changed"] == ["lists"]


def test_an_unknown_space_creates_nothing_and_says_which_exist(monkeypatch):
    chat, made = _chat(monkeypatch, [{"id": 2, "name": "Personal"}])
    out = chat._run_command("u", {"kind": "create_list", "name": "Reading list", "space": "Hobbies"}, None)
    assert made["lists"] == [] and "Hobbies" in out["answer"] and "Personal" in out["answer"] and out["changed"] == []


def test_a_list_you_already_have_is_reused_and_given_a_home_if_it_had_none(monkeypatch):
    chat, made = _chat(monkeypatch, [{"id": 2, "name": "Personal"}], lists=[{"id": 5, "name": "Books", "initiative_id": None}])
    out = chat._run_command("u", {"kind": "create_list", "name": "Reading list", "space": "Personal"}, None)
    assert made["lists"] == [] and made["updated"] == [(5, {"initiative_id": 2})] and "already have" in out["answer"]


def test_the_space_picked_in_the_input_bar_is_used_when_none_is_named(monkeypatch):
    chat, made = _chat(monkeypatch, [{"id": 2, "name": "Personal"}])
    chat._run_command("u", {"kind": "create_list", "name": "Movies"}, 2)
    assert made["lists"] == [("Movies", 2)]


def test_creating_a_space_twice_is_said_not_repeated(monkeypatch):
    chat, made = _chat(monkeypatch, [{"id": 2, "name": "Health"}])
    assert "already have" in chat._run_command("u", {"kind": "create_space", "name": "health"}, None)["answer"]
    out = chat._run_command("u", {"kind": "create_space", "name": "Fitness"}, None)
    assert made["spaces"] == ["Fitness"] and out["changed"] == ["initiatives"]


# ---- "workspace" and deleting a space ----

def test_workspace_is_a_word_for_a_space_and_the_task_after_it_is_kept():
    assert commands.parse("Create a workspace named IBM and add this task: Send the onboarding document tomorrow.") == {
        "kind": "create_space", "name": "IBM", "then": "add this task: Send the onboarding document tomorrow."}
    assert commands.parse("make a new workspace for Health") == {"kind": "create_space", "name": "Health"}
    assert commands.parse("create a list called Books in the IBM workspace") == {"kind": "create_list", "name": "Books", "space": "IBM"}


def test_deleting_a_space_is_recognised_in_the_usual_wordings():
    for text, name, certain in [
        ("Delete the section Work under spaces tab", "Work", True),
        ("remove the space Work", "Work", True),
        ("delete workspace IBM", "IBM", True),
        ("please remove the Health space", "Health", False),
        ("delete the IBM workspace", "IBM", False),
    ]:
        assert commands.parse(text) == {"kind": "delete_space", "name": name, "certain": certain}, text


def test_ordinary_messages_with_delete_in_them_are_not_commands():
    for text in ["remove milk from my shopping list", "delete the draft email", "delete the category from my notes", "Delete my account"]:
        assert commands.parse(text) is None, text


def test_deleting_a_space_only_asks_and_never_deletes(monkeypatch):
    chat, made = _chat(monkeypatch, [{"id": 2, "name": "Personal"}, {"id": 3, "name": "Work"}])
    out = chat._run_command("u", {"kind": "delete_space", "name": "work", "certain": True}, None)
    assert out["confirm"] == {"action": "delete_space", "id": 3, "name": "Work"}
    assert "move to Others" in out["answer"] and out["changed"] == []
    assert made["spaces"] == []  # nothing was touched


def test_a_space_that_does_not_exist_is_said_or_let_through(monkeypatch):
    chat, _ = _chat(monkeypatch, [{"id": 2, "name": "Personal"}])
    sure = chat._run_command("u", {"kind": "delete_space", "name": "IBM", "certain": True}, None)
    assert "confirm" not in sure and "IBM" in sure["answer"] and "Personal" in sure["answer"]
    unsure = chat._run_command("u", {"kind": "delete_space", "name": "Old files", "certain": False}, None)
    assert unsure.get("fallthrough") is True  # "delete the old files folder" may just be a to-do


def test_the_task_added_with_a_new_workspace_is_filed_in_it(monkeypatch):
    import asyncio
    chat, made = _chat(monkeypatch, [])
    captured = []

    async def fake_capture(uid, text, lat, lng, request, on_stage=None, initiative_id=None):
        captured.append((text, initiative_id))
        return {"status": "saved", "parts": []}

    monkeypatch.setattr(chat.capture_router, "_capture_text_core", fake_capture)
    body = types.SimpleNamespace(initiative_id=None, geo_lat=None, geo_lng=None, save_only=False)
    cmd = commands.parse("Create a workspace named IBM and add this task: Send the onboarding document tomorrow.")
    out = asyncio.run(chat._handle_command("u", body, None, cmd))
    assert made["spaces"] == ["IBM"]
    assert captured == [("Send the onboarding document tomorrow.", out["space_id"])]  # the wrapper words are dropped
    assert out["capture"]["status"] == "saved"


def test_the_today_box_does_not_offer_to_delete_a_space(monkeypatch):
    import asyncio
    chat, _ = _chat(monkeypatch, [{"id": 3, "name": "Work"}])
    body = types.SimpleNamespace(initiative_id=None, geo_lat=None, geo_lng=None, save_only=True)
    out = asyncio.run(chat._handle_command("u", body, None, commands.parse("delete the space Work")))
    assert out["intent"] == "blocked" and "Home tab" in out["answer"] and "confirm" not in out
