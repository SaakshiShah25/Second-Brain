"""
scripts/seed_persona_accounts.py — Creates (if missing) and seeds three
local test accounts, one per usage mode, so Work / Personal / Both can be
tested side by side:

    work@myconfia.local      Work      a consultant: clients, deals, hiring
    personal@myconfia.local  Personal  family, friends, health, home
    both@myconfia.local      Both      the full edge-case dataset from
                                       seed_demo_data.py (work + life mixed)

    .venv/bin/python scripts/seed_persona_accounts.py

All three use the password Demo@12345. Re-runnable: each run wipes and
reloads ONLY these accounts' own rows (via seed_demo_data.wipe). Terms
are pre-accepted and the tour marked done, so testing starts straight on
the app - use demo@myconfia.local to test the first-run flow instead.
usage_mode is set only if the column exists (schema.sql section 25);
otherwise that step is skipped with a note and the app behaves as "Both".
"""

import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from seed_demo_data import d, find_user_id, wipe  # noqa: E402  (also loads .env)
import seed_demo_data  # noqa: E402
import db  # noqa: E402
import embeddings  # noqa: E402

PASSWORD = "Demo@12345"


def ensure_user(email: str) -> str:
    try:
        return find_user_id(email)
    except SystemExit:
        user = db.get_client().auth.admin.create_user(
            {"email": email, "password": PASSWORD, "email_confirm": True}
        )
        print(f"Created {email}")
        return user.user.id


def set_prefs(uid: str, mode: str):
    now = datetime.now(timezone.utc).isoformat()
    db.update_user_preference(uid, terms_accepted_at=now, tour_completed_at=now, theme="light")
    try:
        db.update_user_preference(uid, usage_mode=mode)
        print(f"  usage_mode = {mode}")
    except Exception:
        print(f"  usage_mode NOT set (run schema.sql section 25 first, then re-run) - app treats it as 'both'")


class Seeder:
    """Tiny helper so each dataset below reads as data, not plumbing."""

    def __init__(self, uid: str):
        self.uid, self.P, self.N, self.I = uid, {}, {}, {}

    def initiatives(self, *names):
        # db.get_initiatives() auto-creates the "Personal"/"Work" starters on
        # first read - reuse a starter we want, drop one we don't (the
        # account was just wiped, so it can't hold any notes).
        existing = {i["name"].lower(): i["id"] for i in db.get_initiatives(self.uid)}
        wanted = {n.lower() for n in names}
        for lname, iid in existing.items():
            if lname not in wanted:
                db.delete_initiative(self.uid, iid)
        for name in names:
            self.I[name] = existing.get(name.lower()) or db.create_initiative(self.uid, name)["id"]

    def person(self, key, name, **kw):
        self.P[key] = db.create_person(self.uid, name, **kw)

    def note(self, key, raw_text, *, person=None, days=0, summary="", ini=None, location=None,
             decisions=None, concerns=None, other_people=None):
        self.N[key] = db.create_interaction(
            self.uid, person_id=self.P.get(person) if person else None, raw_text=raw_text,
            date=d(days) if days is not None else None, location=location, summary=summary,
            extracted_facts={"other_people": other_people or [], "opinions_expressed": []},
            embedding=embeddings.compute_embedding(raw_text),
            decisions=decisions, concerns=concerns,
            initiative_id=self.I.get(ini) if ini else None,
        )

    def task(self, note, desc, due=None, owner="me", done=False, person=None):
        tid = db.create_task(self.uid, self.N[note], desc, due_date=d(due) if due is not None else None,
                             owner=owner, person_id=self.P.get(person) if person else None)
        if done:
            db.update_task_status(self.uid, tid, "done")

    def mention(self, note, person, relation):
        db.link_interaction_person(self.uid, self.N[note], self.P[person], relation)


# ---------------------------------------------------------------- WORK
def seed_work(uid: str):
    s = Seeder(uid)
    s.initiatives("Work", "Clients", "Projects", "Hiring", "Networking", "Finance")

    # Three people at one company -> company briefing
    s.person("neha", "Neha Kulkarni", role="VP Operations", company="Acme Logistics", phone="+91 98111 20001",
             email="neha.k@acmelogistics.com", tags=["client", "decision maker"], first_met_date=d(-150),
             description="Data-driven, wants weekly written updates. Hates surprises on invoices.",
             personal_notes=[{"date": d(-40), "note": "Big Liverpool FC fan"}, {"date": d(-6), "note": "Back from paternity leave of her co-lead; team stretched"}])
    s.person("karan", "Karan Bhatia", role="Procurement Manager", company="Acme Logistics", email="karan.b@acmelogistics.com",
             tags=["client"])
    s.person("ritu", "Ritu Menon", role="CTO", company="Acme Logistics", email="ritu@acmelogistics.com",
             description="Technical, sceptical of AI claims - show real benchmarks.")
    s.person("daniel", "Daniel Park", role="Head of Growth", company="Brightline", phone="+1 415 555 0142",
             email="daniel@brightline.io", tags=["prospect"])
    s.person("ananya", "Ananya Rao", role="Senior Backend Engineer (candidate)", company="", email="ananya.rao@gmail.com",
             tags=["candidate"])
    s.person("vivek", "Vivek Sinha", role="Talent Partner", company="Hirewell", phone="+91 99000 44444")
    s.person("lena", "Lena Fischer", role="Partner", company="Northstar Ventures", email="lena@northstar.vc",
             tags=["investor"], first_met_date=d(-220))
    s.person("omar", "Omar Haddad", role="Founder", company="Tidewater AI", email="omar@tidewater.ai",
             description="Met at SaaSBoomi; scanned his card.")              # no notes yet
    s.person("sam", "Sam D'Souza", role="Design Lead", company="Freelance", email="sam@sdstudio.in")
    s.person("priyanka", "Priyanka Jain", role="Chartered Accountant", company="Jain & Co", phone="+91 22 4000 1234")

    s.note("acme_qbr", "Quarterly review with Neha and Karan at Acme. Delivery SLA is at 96%, they want 98% by Q1. "
           "Karan pushed for a 10% discount on renewal; Neha is open to a 2-year deal instead. Ritu will join next "
           "time to review the routing model.", person="neha", days=0, ini="Clients",
           summary="Acme QBR: SLA 96% (target 98%); renewal discount vs 2-year deal; Ritu joins next review.",
           location="Acme office, Powai", decisions=["Offer 2-year deal at current price instead of 10% discount"],
           concerns=["SLA gap could block renewal"],
           other_people=[{"name": "Karan Bhatia", "relation": "Acme procurement"}, {"name": "Ritu Menon", "relation": "Acme CTO"}])
    s.mention("acme_qbr", "karan", "Acme procurement, pushed for discount")
    s.mention("acme_qbr", "ritu", "Acme CTO, joining next review")
    s.task("acme_qbr", "Send Neha the 2-year renewal proposal", due=2)
    s.task("acme_qbr", "Karan to share last quarter's delivery data", due=4, owner="them", person="karan")
    s.task("acme_qbr", "Prepare routing-model benchmark deck for Ritu", due=9, person="ritu")

    s.note("ritu_call", "Call with Ritu - she wants to see precision/recall on their own routes before any AI rollout.",
           person="ritu", days=-12, ini="Clients", summary="Ritu wants benchmarks on Acme's own routes first.",
           concerns=["Sceptical of AI claims"])
    s.note("daniel_disc", "Discovery call with Daniel at Brightline. 40-person growth team, churn is their #1 metric. "
           "Budget approval sits with their CFO. Wants a pilot proposal.", person="daniel", days=-2, ini="Clients",
           summary="Brightline discovery: churn focus, CFO approves budget, wants pilot proposal.")
    s.task("daniel_disc", "Draft Brightline pilot proposal", due=1)
    s.task("daniel_disc", "Daniel to intro me to their CFO", due=-3, owner="them")          # overdue, theirs

    s.note("ananya_int", "Interviewed Ananya for the backend role. Strong on Postgres and queues, weaker on system "
           "design. Expecting 38 LPA. Vivek from Hirewell sourced her.", person="ananya", days=-1, ini="Hiring",
           summary="Ananya: strong Postgres/queues, weaker system design, expects 38 LPA.",
           decisions=["Move to system-design round"])
    s.mention("ananya_int", "vivek", "Recruiter who sourced her")
    s.task("ananya_int", "Schedule system-design round with Ananya", due=0)                  # due today
    s.task("ananya_int", "Send Vivek feedback on Ananya", due=-1, person="vivek")             # overdue 1 day

    s.note("lena_coffee", "Coffee with Lena from Northstar. Interested in our seed extension if we hit 30 paying "
           "customers. Asked for monthly investor updates.", person="lena", days=-48, ini="Finance",
           summary="Lena: seed extension possible at 30 paying customers; wants monthly updates.")
    s.task("lena_coffee", "Send Lena the monthly investor update", due=-18)                   # overdue 18 days

    s.note("sam_brand", "Sam shared the new brand system. Going with the ink + amber palette.", person="sam", days=-6,
           ini="Projects", summary="New brand system approved: ink + amber.", decisions=["Adopt ink + amber palette"])
    s.task("sam_brand", "Pay Sam's invoice #0142", due=5)
    s.note("tax", "Priyanka flagged that advance tax for Q3 is due on the 15th. Need to share expense ledger.",
           person="priyanka", days=-95, ini="Finance", summary="Q3 advance tax due on the 15th; share ledger.")
    s.task("tax", "Share expense ledger with Priyanka", done=True, due=-90)

    s.note("standup", "Team standup: release slipped by two days because of the migration. Need to update Acme.",
           days=0, ini="Projects", summary="Release slipped 2 days (migration) - update Acme.")
    s.task("standup", "Tell Neha about the 2-day release slip", due=0, person="neha")
    s.note("idea", "Idea: package the routing benchmarks as a public case study for inbound leads.", days=-3,
           ini="Networking", summary="Idea: routing benchmarks as public case study.")
    s.note("conf", "SaaSBoomi panels worth following up: pricing for vertical SaaS, India-to-US GTM.", days=-30,
           ini="Networking", summary="SaaSBoomi takeaways: vertical SaaS pricing, India→US GTM.")
    s.task("conf", "Email Omar to set up a call", due=3, person="omar")
    s.note("old_client", "Wrap-up call with Daniel's predecessor at Brightline, project closed.", person="daniel",
           days=-400, ini="Clients", summary="Old Brightline project closed (last year).")


# ---------------------------------------------------------------- PERSONAL
def seed_personal(uid: str):
    s = Seeder(uid)
    s.initiatives("Personal", "Family", "Friends", "Health", "Home", "Finance", "Travel")

    s.person("mum", "Mum", description="Lives in Pune. Loves gardening and old Hindi films.", aliases=["Mom", "Aai"],
             phone="+91 98220 10001",
             personal_notes=[{"date": d(-200), "note": "Birthday is 14 November"},
                             {"date": d(-20), "note": "Favourite flowers: white lilies"},
                             {"date": d(-5), "note": "Knee is bothering her; started physio"}])
    s.person("dad", "Dad", aliases=["Baba"], phone="+91 98220 10002", description="Retired engineer, into cricket.")
    s.person("isha", "Isha", description="Younger sister, studying in Bangalore.", phone="+91 98765 30003",
             personal_notes=[{"date": d(-10), "note": "Final exams in December"}])
    s.person("rohan", "Rohan Gupta", description="Best friend since school.", phone="+91 99999 40004",
             tags=["close friend"], first_met_date=d(-5000),
             personal_notes=[{"date": d(-15), "note": "Just got engaged to Tara!"}])
    s.person("tara", "Tara Iyer", description="Rohan's fiancée.")                         # mentioned only
    s.person("meghna", "Meghna Shah", description="College friend, moved to Toronto.", email="meghna.s@gmail.com")
    s.person("drmehta", "Dr. Kavita Mehta", role="GP", company="Sunrise Clinic", phone="+91 22 2600 7777")
    s.person("vinod", "Vinod", role="Plumber", phone="+91 90040 50005")
    s.person("aunty", "Shalini Aunty", description="Neighbour on the 4th floor, waters plants when we travel.")
    s.person("coach", "Arjun (gym)", role="Trainer", company="Cult Fit")
    s.person("landlord", "Mr. Fernandes", description="Landlord.", phone="+91 98200 60006")

    s.note("mum_call", "Long call with Mum. Her knee is hurting so she started physio twice a week. She wants us all "
           "home for Diwali. Dad is excited about the India-Australia series.", person="mum", days=0, ini="Family",
           summary="Mum started physio for her knee; wants everyone home for Diwali.",
           other_people=[{"name": "Dad", "relation": "Mum's husband"}])
    s.mention("mum_call", "dad", "Excited about the cricket series")
    s.task("mum_call", "Book train tickets to Pune for Diwali", due=3)
    s.task("mum_call", "Order white lilies for Mum's birthday", due=20)

    s.note("rohan_dinner", "Dinner with Rohan - he got engaged to Tara! Wedding is in February in Goa. He asked me to "
           "be a groomsman.", person="rohan", days=-1, ini="Friends", location="Bombay Canteen",
           summary="Rohan engaged to Tara; Goa wedding in Feb; I'm a groomsman.",
           other_people=[{"name": "Tara Iyer", "relation": "Rohan's fiancée"}])
    s.mention("rohan_dinner", "tara", "Rohan's fiancée")
    s.task("rohan_dinner", "Block February dates for Rohan's wedding", due=7)
    s.task("rohan_dinner", "Rohan to send the wedding WhatsApp group link", due=2, owner="them")

    s.note("isha", "Isha called stressed about exams. Promised to send her my old DSA notes.", person="isha",
           days=-4, ini="Family", summary="Isha stressed about exams; send her my DSA notes.")
    s.task("isha", "Send Isha my DSA notes", due=-2)                                          # overdue

    s.note("doc", "Annual check-up with Dr. Mehta. Vitamin D is low, take supplements for 3 months. Recheck in "
           "March. BP normal.", person="drmehta", days=-9, ini="Health",
           summary="Check-up: low Vitamin D (3 months of supplements), BP normal, recheck in March.",
           decisions=["Start Vitamin D supplements"])
    s.task("doc", "Book follow-up blood test", due=120)
    s.note("gym", "Arjun changed my programme: 4 days a week, more mobility. Target 5k under 28 min.", person="coach",
           days=-2, ini="Health", summary="New programme: 4 days/week, mobility; 5k under 28 min goal.")

    s.note("leak", "Vinod fixed the bathroom leak, ₹1,200. Said the geyser valve needs replacing soon.", person="vinod",
           days=-14, ini="Home", summary="Bathroom leak fixed (₹1,200); geyser valve needs replacing.")
    s.task("leak", "Ask Vinod to replace the geyser valve", due=10)
    s.note("rent", "Mr. Fernandes says rent goes up 5% from January. Lease renewal paperwork next month.",
           person="landlord", days=-25, ini="Finance", summary="Rent +5% from January; lease renewal next month.",
           concerns=["Rent increase"])
    s.task("rent", "Pay November rent", due=-1)                                              # overdue
    s.task("rent", "Pay October rent", due=-31, done=True)

    s.note("meghna", "Video call with Meghna in Toronto - she might visit India in April.", person="meghna", days=-70,
           ini="Friends", summary="Meghna may visit India in April.")                    # stale ~70 days
    s.note("aunty", "Shalini Aunty watered the plants while we were in Kerala. Get her something from the trip.",
           person="aunty", days=-120, ini="Home", summary="Shalini Aunty watered plants during Kerala trip.")  # stale

    s.note("goa", "Thinking about a Goa trip around Rohan's wedding - maybe stay 3 extra days in the south.",
           days=-1, ini="Travel", summary="Extend Goa wedding trip by 3 days in South Goa.")
    s.note("budget", "This month: spent too much on food delivery. Cap at ₹6,000 next month.", days=-5,
           ini="Finance", summary="Food delivery overspend - cap ₹6,000 next month.")
    s.task("budget", "Set up a monthly budget tracker", due=None)
    s.note("thought", "Want to read more fiction this year - start with 'Tomorrow, and Tomorrow, and Tomorrow'.",
           days=-8, summary="Read more fiction - start with 'Tomorrow, and Tomorrow, and Tomorrow'.")  # uncategorised
    s.note("quote", "\"The days are long but the decades are short.\"", days=None, ini="Personal",
           summary="Quote: the days are long but the decades are short.")                  # undated


def main():
    accounts = [
        ("work@myconfia.local", "work", seed_work),
        ("personal@myconfia.local", "personal", seed_personal),
        ("both@myconfia.local", "both", None),
    ]
    for email, mode, seed in accounts:
        uid = ensure_user(email)
        print(f"Seeding {email} ({mode})")
        set_prefs(uid, mode)
        if seed is None:
            seed_demo_data.main(email)        # wipes + loads the full mixed edge-case dataset
        else:
            wipe(uid)
            seed(uid)
    print(f"\nDone. Password for all three: {PASSWORD}")


if __name__ == "__main__":
    main()
