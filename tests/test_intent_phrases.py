"""A growing list of real phrasings: when a message is sorted wrongly, add it here so it stays fixed."""
import pytest

import intent

QUESTIONS = [
    "To whom I had I assigned the task of the scheduler.",  # saved as a to-do before
    "to whom did I give the scheduler task", "From whom do I have to collect the cheque.", "On what date did I meet Priya.",
    "Who did I assign the scheduler to.", "Who has the scheduler task", "Who all are working on the release.", "who owns the payments release",
    "When did I last talk to Rohan.", "when is mom's birthday", "Where did I keep the passport", "What did I note about pricing.",
    "What do I need to do this week", "What's pending for ABSL.", "Which tasks are overdue.", "what time is my flight",
    "How many tasks do I have today", "Did I send the invoice to Ravi.", "Have I paid the electricity bill", "Do I have anything due tomorrow",
    "Is there anything pending in Work", "Any tasks for today", "Show me my pending tasks.", "List all my notes about Goa",
    "Tell me who I assigned the scheduler to", "Okay so what did we decide about the release", "Hey, do you know when the demo is",
    "For which client did I prepare the deck", "Who is the prime minister of India",
]

NOT_QUESTIONS = [
    "Assign the scheduler task to Ravi.", "I assigned the scheduler task to Ravi.", "When I reach the office, call Bob",
    "What we decided: ship on Friday", "What I discussed with Ravi was the budget", "Where is the passport: in the blue drawer",
    "Which is why we need to delay the launch", "For what it is worth, the demo went well", "Have to call mom tonight",
    "Had a great call with Priya", "Do my taxes this weekend", "Will call the bank tomorrow", "Was a good meeting with the team",
    "How I fixed the login bug", "Remind me to ask who owns the release", "Follow up on who is handling the scheduler",
    "Find out who was assigned the scheduler", "Show the demo to Priya on Monday", "List my old phone for sale",
    "Met Priya today. Did I mention she likes the demo", "To whom it may concern letter needs to be drafted by Friday",
    "Tell Rohan the demo moved to Friday", "Who knows, maybe we move to Goa next year",
]


@pytest.mark.parametrize("text", QUESTIONS)
def test_questions_are_asked_not_saved(text):
    assert intent.fast_classify(text) == "ask"


@pytest.mark.parametrize("text", NOT_QUESTIONS)
def test_notes_and_todos_are_never_taken_for_questions_by_the_rules(text):
    assert intent.fast_classify(text) != "ask"
