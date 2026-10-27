"""
scripts/seed_demo_data.py — Loads a deterministic, edge-case-heavy dataset
into ONE demo account, for local manual testing of every screen.

    .venv/bin/python scripts/seed_demo_data.py [demo-email]

Defaults to demo@myconfia.local. Re-runnable: it first wipes that user's
own rows (only rows where user_id = the demo user - nothing else is
touched), then inserts everything again through db.py, so field-level
encryption is applied exactly as in production. Embeddings are computed
via Cohere so Ask/semantic search works; if Cohere is unreachable the
notes are still inserted, just without vectors.

All dates are relative to "today", so Today / Overdue / Due soon /
Reconnect always show the intended buckets whenever this is re-run.

What it deliberately covers (see the CASES comments inline):
  People      full profile vs. bare name; phone-only / email-only; long
              names; single-word; lowercase; accented and non-Latin
              names (A–Z index "#" bucket); same-first-name pairs
              (disambiguation); a likely duplicate (merge); two people
              at one company with different casing (company briefing);
              a person with no notes at all; a person only ever
              *mentioned* (never met); a person literally named "Unknown"
              (task-label fallback); stale contacts at 2w / 1m / 3m / 6m+.
  Initiatives keyword-matched icons, custom colour, fallback icon,
              very long name, emoji name, one with zero notes.
  Notes       today / yesterday / this week / this month / months ago /
              last year / future-dated / undated; standalone vs. person;
              uncategorised; empty summary (raw-text fallback); very long
              text; markdown / HTML-ish / emoji / Hinglish text; location
              text + device geo + maps link; decisions & concerns;
              secondary mentions with relation.
  Tasks       mine vs. theirs; open vs. done; overdue (1d, 30d); due
              today, tomorrow, in 5 days, in 30 days; no due date; very
              long description; task about a different person than the
              note; task owed by "Unknown"; task on a standalone note
              with and without an initiative; one marked on-calendar.
"""

import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

import db  # noqa: E402
import embeddings  # noqa: E402

EMAIL = sys.argv[1] if len(sys.argv) > 1 else "demo@myconfia.local"


def d(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


def find_user_id(email: str) -> str:
    page = 1
    while True:
        users = db.get_client().auth.admin.list_users(page=page, per_page=200)
        if not users:
            break
        for u in users:
            if (u.email or "").lower() == email.lower():
                return u.id
        page += 1
    raise SystemExit(f"No auth user with email {email} - create it first.")


def wipe(uid: str):
    c = db.get_client()
    # Children first; every filter is scoped to this one user.
    for table in ["task", "interaction_person", "interaction", "person", "initiative"]:
        c.table(table).delete().eq("user_id", uid).execute()


def main(email: str = EMAIL):
    uid = find_user_id(email)
    print(f"Seeding {email} ({uid})")
    wipe(uid)

    # ---------------- Initiatives ----------------
    ini = {}
    for name, color in [
        ("Job", None),                     # keyword -> briefcase, auto colour
        ("Fitness", "#c93b8f"),            # keyword icon + CUSTOM colour override
        ("Tenaxis AI", None),              # no keyword -> hashed fallback icon
        ("Family", None),
        ("Finance", None),
        ("Learning Spanish & Portuguese for the Lisbon relocation next year", None),  # very long name
        ("Side ideas 💡", None),           # emoji in name
        ("Travel", None),                  # zero notes -> empty filter state
    ]:
        ini[name] = db.create_initiative(uid, name, color)["id"]
    LONG_INI = "Learning Spanish & Portuguese for the Lisbon relocation next year"

    # ---------------- People ----------------
    P = {}

    def person(key, name, **kw):
        P[key] = db.create_person(uid, name, **kw)

    person("priya_r", "Priya Raman", role="Head of Product", company="Northwind",
           phone="+91 98200 11111", email="priya.raman@northwind.io",
           aliases=["PR", "Priya R"], tags=["design partner", "investor intro", "decision maker"],
           first_met_date=d(-420),
           description="Sharp and direct; prefers async updates over calls.\nEx-Google PM, cares a lot about onboarding metrics.",
           personal_notes=[
               {"date": d(-380), "note": "Was pregnant — due in spring (likely outdated now)"},
               {"date": d(-60), "note": "Training for the Mumbai marathon"},
               {"date": d(-4), "note": "Daughter starts school in June; loves filter coffee"},
           ])
    person("vikas", "Vikas Mehta", role="Founder & CEO", company="northwind",  # lowercase company - ilike grouping
           email="vikas@northwind.io", first_met_date=d(-300))
    person("priya_s", "Priya Sharma", role="Recruiter", company="Hirewell",   # same first name -> disambiguation
           phone="+91 99000 22222", description="Helps with senior hiring; very responsive on WhatsApp.")
    person("priya_s_dup", "Priya S", company="Hirewell",                      # likely duplicate -> merge
           description="Recruiter from Hirewell (probably the same Priya Sharma).")
    person("anita", "Anita Desai", role="Strength Coach", company="FitLab", phone="+91 90000 33333")  # phone only
    person("arjun", "Arjun Kapoor", role="ML Engineer", company="Tenaxis", email="arjun@tenaxis.ai")  # email only
    person("rahul", "Rahul Iyer", role="Partner", company="Blume Ventures", email="rahul@blume.vc",
           tags=["investor"], first_met_date=d(-120))
    person("meera", "Meera Shah", description="My cousin in Ahmedabad.")      # no role/company
    person("sunil", "Dr. Sunil Rao", role="Dentist", company="Smile Clinic", phone="+91 80 4000 5555")
    person("rhea", "Rhea Raman", description="Priya Raman's sister.")         # only ever MENTIONED
    person("kenji", "Kenji Watanabe", role="Partnerships Lead", company="Mizuho Labs",  # card scan, no notes
           phone="+81 3-1234-5678", email="kenji.w@mizuho-labs.jp",
           description="Met at a conference booth; scanned his card.")
    person("long", "Maximilian Alexander von Hohenzollern-Sigmaringen",       # truncation
           role="Senior Vice President of Strategic Partnerships and Ecosystem Development",
           company="International Consolidated Logistics & Maritime Holdings GmbH")
    person("bob", "Bob")                                                      # single word, nothing else
    person("zara", "zara khan", role="designer")                              # lowercase name sorting
    person("olafur", "Ólafur Arnalds", role="Composer")                       # accented -> '#' bucket
    person("liwei", "李伟", role="Supplier", company="Shenzhen Parts Co.", aliases=["Li Wei"])  # non-Latin
    person("unknown", "Unknown")                                              # literal "Unknown" fallback

    # ---------------- Notes (interactions) ----------------
    notes = {}

    def note(key, raw_text, *, person=None, date_=None, summary="", initiative=None, location=None,
             appearance="", decisions=None, concerns=None, topics=None, sentiment=None,
             other_people=None, geo=None):
        emb = embeddings.compute_embedding(raw_text) if raw_text else None
        extracted = {"other_people": other_people or [], "opinions_expressed": []}
        geo_kw = {}
        if geo:
            lat, lng, addr = geo
            geo_kw = dict(geo_lat=lat, geo_lng=lng, geo_address=addr,
                          maps_url=f"https://www.google.com/maps?q={lat},{lng}")
        notes[key] = db.create_interaction(
            uid, person_id=P.get(person) if person else None, raw_text=raw_text, date=date_,
            location=location, appearance=appearance, summary=summary,
            sentiment=sentiment, topics=topics, extracted_facts=extracted, embedding=emb,
            decisions=decisions, concerns=concerns,
            initiative_id=ini.get(initiative) if initiative else None, **geo_kw,
        )
        print("  note", key, "embedded" if emb else "NO EMBEDDING")

    # Priya Raman - long timeline, every field populated
    note("pr_today",
         "Coffee with Priya at Blue Tokai, Bandra. She liked the new pricing but wants a usage-based tier for "
         "smaller teams. Her sister Rhea is joining their design team next month. Agreed to keep the annual "
         "plan price as-is. She's worried seat pricing will make small teams churn. I need to send her a "
         "revised proposal by Monday, and she'll intro me to their CFO.",
         person="priya_r", date_=d(0), initiative="Job",
         summary="Priya liked the new pricing but wants a usage-based tier for small teams; revised proposal due Monday.",
         location="Blue Tokai, Bandra", appearance="Navy blazer, looked tired after a red-eye",
         decisions=["Keep the annual plan price unchanged", "Pilot starts with the design team only"],
         concerns=["Seat pricing may cause small teams to churn", "Security review could take 6+ weeks"],
         topics=["pricing", "pilot", "hiring"],
         sentiment=[{"topic": "pricing", "sentiment": "positive"}, {"topic": "security review", "sentiment": "negative"}],
         other_people=[{"name": "Rhea Raman", "relation": "Priya's sister, joining design team"}],
         geo=(19.0596, 72.8295, "Blue Tokai Coffee, Bandra West, Mumbai"))
    note("pr_m30", "Demo call with Priya. She asked whether we support SSO. Told her it's on the roadmap for Q1.",
         person="priya_r", date_=d(-30), initiative="Job", summary="Demo call; Priya asked about SSO (Q1 roadmap).",
         concerns=["No SSO yet"])
    note("pr_m95", "First intro call with Priya via Rahul. Northwind is evaluating three vendors.",
         person="priya_r", date_=d(-95), initiative="Job", summary="Intro call via Rahul; Northwind evaluating 3 vendors.")
    note("pr_lastyear", "Met Priya at Product Summit Bangalore. Talked about onboarding funnels.",
         person="priya_r", date_=d(-400), initiative=None,
         summary="Met at Product Summit; talked onboarding funnels.", location="Bangalore International Centre")

    # Company briefing: second Northwind contact
    note("vikas_m10", "Quick call with Vikas, Northwind's CEO. He wants the pilot to show ROI within 60 days "
         "and asked for two customer references.", person="vikas", date_=d(-10), initiative="Job",
         summary="Vikas wants ROI in 60 days and two customer references.",
         decisions=["60-day pilot success criteria = 20% faster onboarding"])

    # Disambiguation pair
    note("ps_m5", "Priya from Hirewell sent three senior backend profiles. Need to reply with feedback.",
         person="priya_s", date_=d(-5), initiative="Job", summary="Priya (Hirewell) sent 3 backend profiles.")
    note("psdup_m60", "Priya S called about the hiring retainer; asked for 18% fee.",
         person="priya_s_dup", date_=d(-60), initiative="Finance", summary="Hiring retainer fee proposed at 18%.")

    # Fitness (custom-colour initiative)
    note("anita_y", "Session with Anita. Dropped deadlifts to 3x5 at 90kg, add mobility work twice a week. "
         "Knee felt better. She'll send me a new programme.", person="anita", date_=d(-1), initiative="Fitness",
         summary="Deadlifts down to 3x5 @90kg; add mobility twice a week.", appearance="Gym kit, very energetic")
    note("anita_m20", "Anita measured body fat at 18%. Goal is 15% by March.", person="anita", date_=d(-20),
         initiative="Fitness", summary="Body fat 18%, target 15% by March.")

    # Tenaxis (fallback icon)
    note("arjun_m3", "Arjun shipped the retrieval fix; p95 latency is down 40%. Next he's evaluating a reranker "
         "and will send benchmarks. I promised to review the eval harness.", person="arjun", date_=d(-3),
         initiative="Tenaxis AI", summary="Retrieval fix shipped (p95 -40%); reranker eval next.",
         decisions=["Ship retrieval fix to all users"], topics=["latency", "reranker"])

    # Stale contacts at various thresholds
    note("rahul_m45", "Rahul is interested in leading the seed round but wants 3 months of traction numbers.",
         person="rahul", date_=d(-45), initiative="Finance",
         summary="Rahul may lead seed; wants 3 months of traction data.",
         concerns=["Traction still early"])
    note("meera_m100", "Video call with Meera. Planning Diwali at home this year — need to book flights early. "
         "Mom wants everyone there by the 10th.", person="meera", date_=d(-100), initiative="Family",
         summary="Diwali at home this year; book flights early.")
    note("sunil_m210", "Dental check-up with Dr. Rao. Needs a filling on the lower left molar; come back in 6 months.",
         person="sunil", date_=d(-210), summary="Needs a filling; follow-up in 6 months.",
         location="Smile Clinic, Indiranagar")  # uncategorised -> Others

    # Truncation / long content
    long_text = (
        "Long dinner with Maximilian at the Taj. We covered the entire logistics partnership: warehousing in "
        "Hamburg, last-mile in Pune and Chennai, customs brokerage, insurance, and a revenue-share model. "
    ) * 12 + "\n\nHe will send the term sheet; I owe him our compliance deck and a reference from an existing customer."
    note("long_m7", long_text, person="long", date_=d(-7), initiative="Job",
         summary=("Maximilian proposed a multi-country logistics partnership covering warehousing, last-mile, customs "
                  "brokerage, insurance and a revenue share; term sheet coming, compliance deck owed from our side, "
                  "plus a customer reference, plus a follow-up with their legal team in Hamburg next quarter."),
         decisions=["Proceed to term sheet"], concerns=["Revenue share above 15% is a non-starter", "GDPR data residency"])

    # Odd-name people
    note("bob_m2", "Bob fixed the leaking kitchen tap. Paid ₹800.", person="bob", date_=d(-2),
         summary="")  # EMPTY summary -> card falls back to raw text
    note("zara_m12", "zara shared new logo concepts — option B is the strongest.", person="zara", date_=d(-12),
         initiative="Side ideas 💡", summary="Logo concepts; option B strongest.")
    note("olafur_m25", "Ólafur agreed to license a track for the launch video. 🎶", person="olafur", date_=d(-25),
         initiative="Side ideas 💡", summary="Ólafur will license a track for the launch video 🎶")
    note("liwei_m14", "李伟 confirmed the PCB order ships next week. Price ¥12,400 for 500 units.",
         person="liwei", date_=d(-14), initiative="Finance", summary="PCB order ships next week; ¥12,400 / 500 units.")
    note("unknown_m4", "Someone from the landlord's office called — they'll fix the elevator; didn't catch the name.",
         person="unknown", date_=d(-4), summary="Landlord's office will fix the elevator.")

    # Standalone notes (no person)
    note("idea_today", "Idea: a weekly 'people I owe' digest every Sunday evening.", date_=d(0),
         initiative="Side ideas 💡", summary="Idea: weekly 'people I owe' digest on Sundays.")
    note("solo_m8", "Reminder to self: renew passport before the Lisbon trip. Check the **new** appointment rules "
         "at https://passportindia.gov.in <b>not bold</b> <script>alert('x')</script> 😅", date_=d(-8),
         initiative=LONG_INI, summary="Renew passport before Lisbon — check **new** rules <script>alert('x')</script> 😅")
    note("solo_uncat", "Thought: our onboarding email is too long, cut it to 3 bullets.", date_=d(-15),
         summary="Onboarding email too long — cut to 3 bullets.")  # standalone + uncategorised
    note("hinglish", "Mummy ne bola ki Sunday ko lunch pe sab aa rahe hain, mithai le aana.", date_=d(-6),
         initiative="Family", summary="Family lunch Sunday — bring sweets.")
    note("future", "Board meeting prep notes: Q3 numbers, hiring plan, runway 18 months.", date_=d(9),
         initiative="Job", summary="Board meeting prep (future-dated note).")
    note("undated", "Some undated scribble: 'trust is built in drops and lost in buckets'.",
         date_=None, summary="Undated quote about trust.")
    note("geo_only", "Parked at level P2, pillar 14.", date_=d(-1), summary="Parked at P2, pillar 14.",
         geo=(12.9716, 77.5946, "Phoenix Marketcity, Bengaluru"))

    # ---------------- Secondary mentions ----------------
    db.link_interaction_person(uid, notes["pr_today"], P["rhea"], "Priya's sister, joining design team")
    db.link_interaction_person(uid, notes["vikas_m10"], P["priya_r"], "Vikas's Head of Product")
    db.link_interaction_person(uid, notes["rahul_m45"], P["priya_r"], "Rahul made the intro")

    # ---------------- Tasks ----------------
    def task(note_key, desc, due=None, owner="me", status="open", person=None, calendar=False):
        tid = db.create_task(uid, notes[note_key], desc, due_date=due, owner=owner,
                             person_id=P.get(person) if person else None)
        if status != "open":
            db.update_task_status(uid, tid, status)
        if calendar:
            db.set_task_calendar_event(uid, tid, "demo-calendar-event-id")
        return tid

    task("pr_today", "Send Priya the revised pricing proposal with a usage-based tier", due=d(2))   # due soon, mine
    task("pr_today", "Priya to intro me to Northwind's CFO", due=d(5), owner="them")                # theirs, due soon
    task("pr_today", "Share the security questionnaire with Rhea's team", due=d(14), person="rhea")  # task about OTHER person
    task("pr_m30", "Send SSO roadmap one-pager to Priya", due=d(-30), status="done")                 # done
    task("vikas_m10", "Send Vikas two customer references", due=d(-1))                               # overdue by 1 day
    task("rahul_m45", "Share 3 months of traction numbers with Rahul", due=d(-30))                   # overdue by 30 days
    task("ps_m5", "Reply to Priya (Hirewell) with feedback on the 3 profiles", due=d(0))             # due today
    task("anita_y", "Anita to send the new training programme", due=d(1), owner="them")              # tomorrow, theirs
    task("anita_m20", "Book body-fat re-test", due=d(30))                                            # open, not soon
    task("arjun_m3", "Arjun to send reranker benchmarks", due=d(4), owner="them", calendar=True)     # on calendar
    task("arjun_m3", "Review the eval harness PR", due=None)                                         # no due date
    task("meera_m100", "Book flights home for Diwali", due=d(-60), status="done")
    task("long_m7",
         "Send Maximilian the full compliance deck including SOC 2 report, GDPR data-processing addendum, "
         "insurance certificates, and a reference contact from an existing logistics customer in the EU",
         due=d(6))                                                                                    # very long
    task("unknown_m4", "Fix the elevator", due=d(3), owner="them")                                   # owner = "Unknown"
    task("idea_today", "Sketch the Sunday digest email", due=d(7))                                   # standalone + initiative
    task("solo_uncat", "Rewrite onboarding email", due=d(-2))                                        # standalone, no initiative, overdue
    task("solo_m8", "Renew passport", due=d(20), status="done")
    task("zara_m12", "Tell zara to go with logo option B", due=d(-5), status="done")
    task("liwei_m14", "李伟 to share tracking number", due=d(8), owner="them")

    print("Done.")


if __name__ == "__main__":
    main()
