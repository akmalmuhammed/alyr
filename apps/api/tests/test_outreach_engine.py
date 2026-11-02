"""The outreach engine end to end (ALY-310, specs/065): research with the citation contract and
published contacts, drafting, approval, the send gateway's eleven checks, replies, unsubscribe and
erasure. Real PostgreSQL, HTTP in, every outside service its simulator."""

# The fixtures `office` and `outreach_env` come from outreach_support and are named here as
# arguments, which ruff reads as a redefinition.
# ruff: noqa: F811

from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from uuid import UUID

import pytest

from alyr.outreach import gateway, llm, sequences, unsubscribe
from alyr.outreach.providers.finder import Person
from alyr.outreach.providers.mailbox import NotSent, Uncertain
from outreach_support import (
    ADMIN,
    LEGAL,
    SUNDAY_10,
    add,
    approve,
    detail,
    engine,
    first_draft,
    kill,
    office,  # noqa: F401
    osql,
    outreach_env,  # noqa: F401
    researched,
    run,
)


def sent(client) -> list[EmailMessage]:
    return engine(client).providers.mailbox.sent


def intent_of(pid, step=1):
    return osql("select * from outreach_intents where prospect_id = $1 and step = $2",
                UUID(pid), step)[0]


def attempt(client, intent_id):
    return run(client, gateway.attempt, engine(client), intent_id)


def queued_but_not_sent(client, n=1, **over):
    """A prospect whose first message is approved and queued, not yet sent (the kill switch was
    on when it was approved). The kill switch is off again on return."""
    pid, seen = researched(client, n, **over)
    kill(True)
    assert approve(client, seen).status_code == 200
    kill(False)
    assert sent(client) == []
    return pid, intent_of(pid)


# ── research, published contacts and drafting ─────────────

SITE = """<html><head><script type="application/ld+json">
{"@type": "Bakery", "name": "Lulu Cakes", "email": "info@lulu-cakes.example",
 "telephone": "+974 4400 1122"}</script></head><body>
<h1>Lulu Cakes</h1><p>We bake birthday cakes to order in Al Sadd since 2016.</p>
<p>Orders are taken by WhatsApp and delivered across Doha the same day.</p>
<p>Call +974 5555 1234 or write to owner.lulu@lulu-cakes.example any time.</p>
<a href="/contact">Contact</a><a href="mailto:Sales@Lulu-Cakes.example">Sales</a></body></html>"""
CONTACT = """<html><body><p>Visit our shop on Al Sadd Street, open from nine every day.</p>
<p>Write to fatima.lulu@gmail.com for wedding orders.</p></body></html>"""


def test_research_keeps_published_contacts_and_the_model_never_sees_one(office):
    e = engine(office)
    e.providers.web.pages = {"https://lulu-cakes.example/": SITE,
                             "https://lulu-cakes.example/contact": CONTACT}
    pid = add(office, 1, company="Lulu Cakes", website="lulu-cakes.example", email="",
              first_name="", basis="", basis_note="")
    assert office.post(f"{ADMIN}/prospects/{pid}/research").status_code == 200
    seen = detail(office, pid)
    p = seen
    # The named address on its own domain first, with the page it was published on.
    assert p["contact_email"] == "owner.lulu@lulu-cakes.example"
    assert p["email_source"] == "published"
    assert p["basis"] == "published_business_contact"
    assert p["basis_note"] == "https://lulu-cakes.example/"
    found = {f["email"]: (f["kind"], f["source_url"]) for f in seen["published_emails"]}
    assert found == {
        "owner.lulu@lulu-cakes.example": ("named", "https://lulu-cakes.example/"),
        "sales@lulu-cakes.example": ("role", "https://lulu-cakes.example/"),
        "info@lulu-cakes.example": ("role", "https://lulu-cakes.example/"),
        "fatima.lulu@gmail.com": ("free_mail", "https://lulu-cakes.example/contact"),
    }
    # Nothing was guessed, so the email finder was never asked.
    assert e.providers.finder.asked == []
    assert p["stage"] == "in_review"
    assert sum(c["kept"] for c in seen["claims"]) >= 2
    # Data minimisation: no payload the model received holds an address or a number.
    calls = e.providers.llm.calls
    assert {c["role"] for c in calls} >= {"researcher", "qualifier", "composer", "critic"}
    for call in calls:
        assert not llm.personal(call["user"]), call["role"]
        assert not llm.personal(call["system"]), call["role"]
    # The stored page is what the model read: no address or number in it either.
    stored = osql("select text from outreach_pages where prospect_id = $1", UUID(pid))
    assert stored and not any(llm.personal(r["text"]) for r in stored)


def test_a_free_mail_address_is_used_only_when_the_business_published_it_and_is_flagged(office):
    e = engine(office)
    e.providers.web.pages = {"https://abaya-house.example/": CONTACT.replace(
        "</body>", "<p>Hand made abayas from our own workshop in Doha.</p></body>")}
    pid = add(office, 2, company="Abaya House", website="abaya-house.example", email="",
              basis="", basis_note="")
    office.post(f"{ADMIN}/prospects/{pid}/research")
    seen = detail(office, pid)
    assert seen["contact_email"] == "fatima.lulu@gmail.com"
    assert "free-mail" in seen["basis_note"]
    item = next(i for i in office.get(f"{ADMIN}/review").json()["items"]
                if i["prospect"]["id"] == pid)
    assert item["basis_problem"] is None
    assert any("free-mail" in w for w in item["warnings"])


def test_without_a_published_address_the_finder_is_used_and_must_verify(office):
    e = engine(office)
    e.providers.web.pages = {"https://flowers.example/": "<p>Fresh flowers delivered in Doha "
                             "every day of the week.</p><p>Bouquets for weddings and "
                             "birthdays made by hand.</p>"}
    e.providers.finder.people = {"flowers.example": [
        Person("guess@flowers.example", "personal", "G", "", "Owner", ()),  # a pattern: no source
        Person("noor@flowers.example", "personal", "Noor", "Ali", "Founder", ("flowers.example",)),
    ]}
    e.providers.finder.statuses = {"noor@flowers.example": "accept_all"}
    pid = add(office, 3, company="Flowers", website="flowers.example", email="", first_name="",
              role="", basis="", basis_note="")
    office.post(f"{ADMIN}/prospects/{pid}/research")
    p = detail(office, pid)
    assert p["contact_email"] == "noor@flowers.example" and p["email_verifier"] == "accept_all"
    assert p["contact_first_name"] == "Noor" and p["basis"] == "published_business_contact"
    item = next(i for i in office.get(f"{ADMIN}/review").json()["items"]
                if i["prospect"]["id"] == pid)
    assert any("accept_all" in w for w in item["warnings"])

    e.providers.finder.people = {"flowers2.example": [
        Person("x@flowers2.example", "personal", "X", "", "Owner", ("flowers2.example",))]}
    e.providers.finder.statuses = {"x@flowers2.example": "unknown"}
    e.providers.web.pages["https://flowers2.example/"] = \
        e.providers.web.pages["https://flowers.example/"]
    pid2 = add(office, 4, company="Flowers 2", website="flowers2.example", email="", basis="",
               basis_note="")
    office.post(f"{ADMIN}/prospects/{pid2}/research")
    assert detail(office, pid2)["stage"] == "needs_human"


def test_too_little_evidence_goes_to_a_person(office):
    e = engine(office)
    e.providers.llm.answers["researcher"] = lambda user: {
        "business_type": "shop", "summary": "", "claims": [
            {"id": "c1", "text": "Huge", "url": "https://bakery-5.example/",
             "quote": "the biggest bakery in the whole world"}]}
    pid = add(office, 5)
    office.post(f"{ADMIN}/prospects/{pid}/research")
    seen = detail(office, pid)
    assert seen["stage"] == "needs_human"
    assert "too little evidence" in seen["stage_reason"]
    assert seen["claims"][0]["kept"] is False
    assert seen["claims"][0]["dropped_reason"] == "the quote is not on the page"
    assert seen["drafts"] == []


def test_the_draft_carries_the_footer_and_passes_the_lint(office):
    _, seen = researched(office)
    steps = {d["step"]: d for d in seen["drafts"] if d["kind"] == "sequence"}
    assert set(steps) == {1, 2, 3}
    first = steps[1]
    assert first["body"].startswith("Hi Sara,")
    assert LEGAL in first["body"] and "Akmal Muhammed" in first["body"]
    assert 'reply "stop"' in first["body"]
    assert first["lint"]["ok"] and first["critic"]["ok"]
    assert {f["key"] for f in first["lint"]["findings"]} >= {
        "uncited_fact", "under_150_words", "subject_length", "no_link", "no_tracking",
        "opt_out_line", "legal_line"}
    assert {f["key"] for f in first["critic"]["findings"]} == {
        "rests_on_brief", "short_plain", "true_to_offer"}
    for sentence in first["sentences"]:
        assert sentence["text"] in first["body"]
    assert steps[2]["subject"] == "Re: " + first["subject"]
    assert any(s["claim_ids"] for s in first["sentences"])
    assert steps[2]["wait_working_days"] == 3 and steps[3]["wait_working_days"] == 7


def test_the_days_model_budget_stops_research_until_tomorrow(office):
    osql("insert into outreach_events (kind, detail) values ('model', $1::jsonb)",
         '{"micros": 6000000}')
    pid = add(office, 6)
    office.post(f"{ADMIN}/prospects/{pid}/research")
    p = detail(office, pid)
    assert p["stage"] == "researching"
    later = osql("select run_at from jobs where kind = 'outreach.research' and status = 'queued'")
    assert later and later[0]["run_at"] > datetime.now(UTC) + timedelta(minutes=5)
    assert osql("select count(*) as n from outreach_events where kind = 'spend_cap'")[0]["n"] == 1
    assert engine(office).providers.llm.calls == []


# ── approval and sending ───────────────────────────────────


def test_approved_first_message_goes_with_its_headers_and_nothing_tracks_it(office):
    pid, seen = researched(office)
    answer = approve(office, seen)
    assert answer.status_code == 200, answer.text
    assert len(answer.json()["approved"]) == 3
    [message] = sent(office)
    assert message["To"] == "sara@bakery-1.example"
    assert message["From"] == "Akmal Muhammed <akmal@alyr-team.example>"
    assert message["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    assert "<mailto:akmal@alyr-team.example?subject=unsubscribe>" in message["List-Unsubscribe"]
    assert "https://api.alyr.test/o/unsubscribe/" in message["List-Unsubscribe"]
    assert message.get_content_type() == "text/plain"
    assert "http" not in message.get_content()
    p = detail(office, pid)
    assert p["stage"] == "sending"
    assert [s["step"] for s in p["sends"]] == [1]
    # The follow-up is queued for three working days later, in the recipient's calendar.
    follow = intent_of(pid, 2)
    assert follow["status"] == "queued"
    assert follow["run_at"] == SUNDAY_10.replace(day=11, hour=8, minute=30)
    # Every send is on the audit log, written by the engine.
    assert osql("select count(*) as n from platform_audit where action = 'outreach.sent' "
                "and subject_id = $1", pid)[0]["n"] == 1


def test_a_stale_hash_is_refused_and_an_edit_needs_its_own_approval(office):
    pid, seen = researched(office)
    draft = first_draft(seen)
    stale = office.post(f"{ADMIN}/drafts/{draft['id']}/approve",
                        json={"body_hash": "0" * 64, "with_follow_ups": False})
    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "stale_hash"
    edited = office.post(f"{ADMIN}/drafts/{draft['id']}/edit", json={
        "subject": "A short question",
        "body": draft["body"].replace("Would a short call", "Would a ten minute call")})
    assert edited.status_code == 200 and edited.json()["lint"]["ok"], edited.text
    again = office.post(f"{ADMIN}/drafts/{draft['id']}/approve",
                        json={"body_hash": draft["body_hash"], "with_follow_ups": False})
    assert again.status_code == 409  # the old version is superseded
    assert sent(office) == []


def test_an_approved_draft_edited_before_it_goes_is_held(office):
    pid, intent = queued_but_not_sent(office)
    approved = [d for d in detail(office, pid)["drafts"] if d["step"] == 1][0]
    assert approved["status"] == "approved"
    office.post(f"{ADMIN}/drafts/{approved['id']}/edit",
                json={"subject": approved["subject"], "body": approved["body"] + " "})
    assert attempt(office, intent["id"]) == "hold"
    row = intent_of(pid)
    assert (row["status"], row["last_check"]) == ("held", 4)
    assert detail(office, pid)["stage"] == "in_review"
    assert sent(office) == []


def test_a_retried_intent_sends_once(office):
    pid, intent = queued_but_not_sent(office)
    assert attempt(office, intent["id"]) == "sent"
    assert attempt(office, intent["id"]) == "duplicate"
    run(office, engine(office)._send, None, {"intent_id": str(intent["id"])})
    assert len(sent(office)) == 1
    assert osql("select count(*) as n from outreach_sends")[0]["n"] == 1


def test_a_send_that_broke_midway_is_never_sent_again(office):
    pid, intent = queued_but_not_sent(office)
    engine(office).providers.mailbox.fail_next = Uncertain("reset")
    assert attempt(office, intent["id"]) == "uncertain"
    assert intent_of(pid)["status"] == "sending"
    assert attempt(office, intent["id"]) == "duplicate"
    assert sent(office) == []


def test_a_definite_refusal_releases_the_claim_for_another_try(office):
    pid, intent = queued_but_not_sent(office)
    engine(office).providers.mailbox.fail_next = NotSent("421 try later")
    with pytest.raises(gateway.Retry):
        attempt(office, intent["id"])
    assert intent_of(pid)["status"] == "queued"
    assert attempt(office, intent["id"]) == "sent"


def test_a_honeytoken_trips_the_kill_switch(office):
    pid, intent = queued_but_not_sent(office)
    osql("update outreach_settings set honeytokens = $1", ["sara@bakery-1.example"])
    assert attempt(office, intent["id"]) == "trip"
    settings = osql("select kill_switch, kill_by from outreach_settings")[0]
    assert settings["kill_switch"] is True and settings["kill_by"] == "gateway"
    assert intent_of(pid)["status"] == "blocked"
    assert sent(office) == []
    # Only a person clears it, and the engine cannot.
    assert office.post(f"{ADMIN}/kill-switch", json={"on": False}).status_code == 200


def test_honeytokens_are_refused_upstream_too(office):
    osql("update outreach_settings set honeytokens = $1", ["trap@bakery-9.example"])
    answer = office.post(f"{ADMIN}/prospects", json={
        "company": "Trap", "country": "QA", "contact_email": "trap@bakery-9.example",
        "basis": "opt_in"})
    assert answer.status_code == 422


# Each check of the gateway refuses on its own. `breaks` changes one thing about a prospect whose
# first message is approved and would otherwise go; the gateway must stop at that check.


def _off(client, _):
    engine(client).settings.outreach = "off"


def _kill(client, _):
    kill(True)


def _honey(client, _):
    osql("update outreach_settings set honeytokens = $1", ["sara@bakery-1.example"])


def _sent_already(client, pid):
    osql("update outreach_intents set status = 'sending' where prospect_id = $1", UUID(pid))


def _unapproved(client, pid):
    osql("delete from outreach_approvals")


def _suppressed(client, pid):
    from alyr.outreach import store

    osql("insert into outreach_suppression (domain_hash, reason) values ($1, 'test')",
         store.domain_hash("bakery-1.example"))


def _no_basis(client, pid):
    osql("update outreach_prospects set basis = '' where id = $1", UUID(pid))


def _busy_company(client, pid):
    osql("insert into outreach_prospects (company, domain, country, source, stage) "
         "values ('Same', 'bakery-1.example', 'QA', 'manual', 'sending')")


def _bad_health(client, pid):
    box = osql("insert into outreach_mailboxes (from_address) values ('akmal@alyr-team.example') "
               "on conflict (from_address) do update set from_name = 'x' returning id")[0]["id"]
    other = osql("insert into outreach_prospects (company, country, source) values "
                 "('Old', 'QA', 'manual') returning id")[0]["id"]
    for n in range(20):
        i = osql("insert into outreach_intents (prospect_id, step, draft_id, idempotency_key, "
                 "status) select $1, 1, id, $2, 'sent' from outreach_drafts limit 1 returning id",
                 other, f"old:{n}")[0]["id"]
        osql("insert into outreach_sends (intent_id, mailbox_id, prospect_id, step, message_id, "
             "to_hash, domain_hash, status, sent_at) values ($1, $2, $3, 1, $4, 'h', 'd', $5, $6)",
             i, box, other, f"<old{n}@x>", "bounced" if n < 1 else "sent",
             SUNDAY_10 - timedelta(days=2))


def _cap(client, pid):
    osql("update outreach_settings set daily_cap = 0")


def _night(client, pid):
    engine(client).clock = lambda: SUNDAY_10.replace(hour=22)


def _lint(client, pid):
    osql("update outreach_drafts set body = replace(body, $1, ''), "
         "body_hash = encode(sha256(convert_to(subject || E'\\n\\n' || replace(body, $1, ''), "
         "'UTF8')), 'hex') where prospect_id = $2 and step = 1", LEGAL, UUID(pid))
    osql("update outreach_approvals a set body_hash = d.body_hash from outreach_drafts d "
         "where d.id = a.draft_id")


CHECKS = [(1, _off), (1, _kill), (2, _honey), (3, _sent_already), (4, _unapproved),
          (5, _suppressed), (6, _no_basis), (7, _busy_company), (8, _bad_health), (9, _cap),
          (10, _night), (11, _lint)]


@pytest.mark.parametrize("number,breaks", CHECKS, ids=[f.__name__ for _, f in CHECKS])
def test_each_check_refuses_on_its_own(office, number, breaks):
    pid, intent = queued_but_not_sent(office)
    breaks(office, pid)
    run(office, gateway.attempt, engine(office), intent["id"])
    row = intent_of(pid)
    assert row["last_check"] == number, row["last_result"]
    assert sent(office) == []


def test_the_first_failing_check_decides(office):
    pid, intent = queued_but_not_sent(office)
    _night(office, pid)
    _cap(office, pid)
    _suppressed(office, pid)
    run(office, gateway.attempt, engine(office), intent["id"])
    assert intent_of(pid)["last_check"] == 5


def test_rescheduled_sends_wait_for_the_recipients_next_opening(office):
    pid, intent = queued_but_not_sent(office)
    _night(office, pid)
    assert attempt(office, intent["id"]) == "reschedule"
    row = intent_of(pid)
    assert row["status"] == "rescheduled"
    assert row["run_at"] == SUNDAY_10.replace(day=9, hour=8, minute=30)


def test_the_mailbox_pauses_itself_and_only_a_person_resumes_it(office):
    pid, intent = queued_but_not_sent(office)
    _bad_health(office, pid)
    assert attempt(office, intent["id"]) == "pause"
    assert osql("select paused_at is not null as p from outreach_mailboxes")[0]["p"]
    assert attempt(office, intent["id"]) == "stop"
    assert office.post(f"{ADMIN}/mailbox/resume").status_code == 200


def test_the_ramp_and_the_global_cap():
    from datetime import date

    assert gateway.ramp_cap(None, date(2026, 11, 8)) == 10
    assert gateway.ramp_cap(date(2026, 11, 1), date(2026, 11, 8)) == 20
    assert gateway.ramp_cap(date(2026, 10, 1), date(2026, 11, 8)) == 40


def test_a_follow_up_waits_for_its_gap_and_then_goes(office):
    pid, seen = researched(office)
    approve(office, seen)
    follow = intent_of(pid, 2)
    assert attempt(office, follow["id"]) == "reschedule"
    assert intent_of(pid, 2)["last_check"] == 7
    engine(office).clock = lambda: SUNDAY_10 + timedelta(days=3)  # Wednesday
    assert attempt(office, follow["id"]) == "sent"
    second = sent(office)[1]
    assert second["In-Reply-To"] == sent(office)[0]["Message-ID"]
    assert second["Subject"].startswith("Re: ")


def test_l1_holds_a_follow_up_nobody_approved(office):
    pid, seen = researched(office)
    approve(office, seen, with_follow_ups=False)
    engine(office).clock = lambda: SUNDAY_10 + timedelta(days=3)
    assert attempt(office, intent_of(pid, 2)["id"]) == "hold"
    # Approving it puts the same intent back in the queue; it goes once.
    follow = next(d for d in detail(office, pid)["drafts"]
                  if d["step"] == 2 and d["status"] == "in_review")
    answer = office.post(f"{ADMIN}/drafts/{follow['id']}/approve",
                         json={"body_hash": follow["body_hash"], "with_follow_ups": False})
    assert answer.status_code == 200, answer.text
    assert len(sent(office)) == 2


# ── replies ────────────────────────────────────────────────


def reply(client, to: EmailMessage, text: str, uid="1", **headers) -> None:
    message = EmailMessage()
    message["From"] = to["To"]
    message["To"] = to["From"]
    message["Subject"] = "Re: " + to["Subject"]
    message["Message-ID"] = f"<reply{uid}@bakery.example>"
    message["In-Reply-To"] = to["Message-ID"]
    for name, value in headers.items():
        message[name.replace("_", "-")] = value
    message.set_content(text + "\n\nOn Sun Akmal wrote:\n> " + to.get_content())
    engine(client).providers.mailbox.inbox.append((uid, bytes(message)))
    run(client, engine(client)._poll, None, {})


def sending(client):
    pid, seen = researched(client)
    approve(client, seen)
    return pid, sent(client)[0]


@pytest.mark.parametrize("words", ["Please remove me from your list.", "لا ترسل لي رسائل"])
def test_opt_out_words_suppress_without_a_model(office, words):
    pid, first = sending(office)
    calls = len(engine(office).providers.llm.calls)
    reply(office, first, words)
    assert len(engine(office).providers.llm.calls) == calls
    p = detail(office, pid)
    assert p["stage"] == "opted_out"
    assert intent_of(pid, 2)["status"] == "dropped"
    assert osql("select count(*) as n from outreach_suppression where source = 'reply'"
                )[0]["n"] == 1
    assert p["replies"][0]["kind"] == "opt_out"


def test_any_reply_stops_the_sequence_and_a_yes_gets_a_reply_to_approve(office):
    pid, first = sending(office)
    reply(office, first, "Yes, interested, let's have a call.")
    p = detail(office, pid)
    assert p["stage"] == "replied"
    assert intent_of(pid, 2)["status"] == "dropped"
    [r] = p["replies"]
    assert r["label"] == "interested" and r["waiting_because"] == "interested"
    assert "wrote:" not in r["body"]
    reader = [c for c in engine(office).providers.llm.calls if c["role"] == "reader"][-1]
    assert not llm.personal(reader["user"])
    concierge = [d for d in p["drafts"] if d["kind"] == "booking_reply"]
    assert concierge and "https://cal.example/akmal" in concierge[0]["body"]
    assert r["booking_draft_id"] == concierge[0]["id"]
    answer = office.post(f"{ADMIN}/drafts/{concierge[0]['id']}/approve",
                         json={"body_hash": concierge[0]["body_hash"]})
    assert answer.status_code == 200, answer.text
    assert len(sent(office)) == 2


def test_an_unclear_reply_stops_the_sequence_and_waits(office):
    pid, first = sending(office)
    reply(office, first, "Who gave you my address?")
    p = detail(office, pid)
    assert p["stage"] == "replied"
    waiting = office.get(f"{ADMIN}/replies").json()["replies"]
    assert waiting[0]["waiting_because"] == "low_confidence"
    assert waiting[0]["company"] == "Demo Bakery 1" and waiting[0]["step"] == 1
    assert office.post(f"{ADMIN}/replies/{waiting[0]['id']}/handled",
                       json={"note": "called"}).status_code == 200
    assert office.get(f"{ADMIN}/replies").json()["replies"] == []


def test_an_auto_reply_does_not_stop_the_sequence(office):
    pid, first = sending(office)
    reply(office, first, "I am out of the office until 2026-11-20.", Auto_Submitted="auto-replied")
    assert detail(office, pid)["stage"] == "sending"
    assert intent_of(pid, 2)["status"] == "queued"


def test_a_bounce_suppresses_and_stops(office):
    pid, first = sending(office)
    bounce = EmailMessage()
    bounce["From"] = "Mail Delivery Subsystem <mailer-daemon@alyr-team.example>"
    bounce["Subject"] = "Delivery Status Notification (Failure)"
    bounce["Message-ID"] = "<bounce1@x>"
    bounce.set_content(f"Status: 5.1.1\nThe account does not exist.\n"
                       f"Message-ID: {first['Message-ID']}")
    engine(office).providers.mailbox.inbox.append(("9", bytes(bounce)))
    run(office, engine(office)._poll, None, {})
    p = detail(office, pid)
    assert p["stage"] == "bounced" and p["sends"][0]["status"] == "bounced"
    assert osql("select count(*) as n from outreach_suppression where source = 'bounce'"
                )[0]["n"] == 1


def test_replies_are_read_only_while_outreach_is_on(office):
    pid, first = sending(office)
    engine(office).settings.outreach = "off"
    reply(office, first, "stop")
    assert detail(office, pid)["stage"] == "sending"


# ── unsubscribe ────────────────────────────────────────────


def test_one_click_unsubscribe_by_page_and_post(office):
    pid, first = sending(office)
    link = first["List-Unsubscribe"].split("<")[2].rstrip(">")
    path = link.replace("https://api.alyr.test", "")
    page = office.get(path)
    assert page.status_code == 200 and "<form" in page.text and "noindex" in page.text
    assert detail(office, pid)["stage"] == "sending"
    done = office.post(path, data={"List-Unsubscribe": "One-Click"})
    assert done.status_code == 200
    assert detail(office, pid)["stage"] == "opted_out"
    assert intent_of(pid, 2)["status"] == "dropped"
    assert office.post(path).status_code == 200  # again: still fine


def test_a_forged_unsubscribe_token_is_refused(office):
    sending(office)
    from uuid import uuid4

    forged = unsubscribe.token(engine(office).settings, uuid4())[:-2] + "AA"
    assert office.get(f"/o/unsubscribe/{forged}").status_code == 200
    assert "does not work" in office.get(f"/o/unsubscribe/{forged}").text
    assert office.post(f"/o/unsubscribe/{forged}").status_code == 404
    assert office.post("/o/unsubscribe/not-a-token").status_code == 404
    assert osql("select count(*) as n from outreach_suppression")[0]["n"] == 0


# ── erasure and the recurring work ─────────────────────────


def test_erasure_after_30_days_keeps_the_suppression_hashes(office):
    pid, first = sending(office)
    reply(office, first, "unsubscribe")
    osql("update outreach_prospects set updated_at = now() - interval '31 days' where id = $1",
         UUID(pid))
    before = osql("select email_hash from outreach_suppression")
    run(office, engine(office)._erase, None, {})
    p = detail(office, pid)
    assert p["contact_email"] == "" and p["contact_first_name"] == ""
    assert p["erased"] is True
    assert all(d["body"] == "" for d in p["drafts"])
    assert all(r["body"] == "" for r in p["replies"])
    assert p["claims"] == [] and p["published_emails"] == []
    assert osql("select email_hash from outreach_suppression") == before
    # The address stays refused for good.
    again = office.post(f"{ADMIN}/prospects", json={
        "company": "Again", "country": "QA", "contact_email": "sara@bakery-1.example",
        "basis": "opt_in"})
    assert again.status_code == 422


def test_a_recent_opt_out_is_not_erased_yet(office):
    pid, first = sending(office)
    reply(office, first, "unsubscribe")
    run(office, engine(office)._erase, None, {})
    assert detail(office, pid)["erased"] is False


def test_the_tick_claims_each_recurring_run_once(office):
    e = engine(office)
    first = run(office, sequences.tick, e, SUNDAY_10)
    assert first["poll"] and first["digest"] and first["erase"]
    again = run(office, sequences.tick, e, SUNDAY_10 + timedelta(minutes=1))
    assert not (again["poll"] or again["digest"] or again["erase"])
    later = run(office, sequences.tick, e, SUNDAY_10 + timedelta(minutes=6))
    assert later["poll"] and not later["digest"]


def test_the_digest_is_counts_only(office, monkeypatch):
    from alyr.core import alerts

    told = []

    async def notify(title, body, **_):
        told.append(body)

    monkeypatch.setattr(alerts, "notify", notify)
    pid, first = sending(office)
    body = run(office, sequences.digest, engine(office))
    assert told == [body]
    assert "@" not in body and "Sara" not in body and "Bakery" not in body
