-- Discovery 2.0, the loop (agent D): at most three open asks, "Change it", the life of a change
-- after it is approved, the check about 20 hours after it was applied, and the Sunday card's
-- "Change it" and its one result. Columns only; row-level security on both tables is unchanged
-- (0121, 0122).
--
-- discovery_proposals:
--   opened_at       when the proposal became one of the business's (at most three) open asks. A
--                   proposal with none is "Also noticed": it waits its turn, and its 14 days start
--                   when it is opened (`expires_at` is set again then).
--   approved_as     `unedited` (approved as proposed) or `edited` (the person changed the "after"
--                   first: "Change it"). The approve-unedited rate is read from this.
--   edited_from     an edited approval is a new proposal (a change is never edited in place,
--                   0121); this names the one the person was shown, which expires as `edited`.
--   decline_reason  `declined` (Decline in the workspace) or `not_now` ("Not now"): both close the
--                   proposal and start the 14-day cool-off; "Not now" comes back after it only if
--                   the next check still finds the difference.
--   life            what has happened to the change since the tap: approved, sent, pending_review
--                   (the platform reviews it before it shows), live (a check saw it), and the two
--                   exits rejected (the platform did not accept it) and changed_back (the platform
--                   put the old value back). `life_history` is [{state, at}], oldest first.
--   verify_at       when the change is next looked at (about 20 hours after it was applied, so a
--                   result on WhatsApp can arrive inside the person's 24-hour window).
--   verified_at     when a check last saw it as it was approved.

alter table discovery_proposals
    add column opened_at timestamptz,
    add column approved_as text check (approved_as in ('unedited', 'edited')),
    add column edited_from uuid references discovery_proposals(id) on delete set null,
    add column decline_reason text check (decline_reason in ('declined', 'not_now')),
    add column life text check (life in (
        'approved', 'sent', 'pending_review', 'live', 'rejected', 'changed_back')),
    add column life_history jsonb not null default '[]'
        check (jsonb_typeof(life_history) = 'array'),
    add column verify_at timestamptz,
    add column verified_at timestamptz;

alter table discovery_proposals drop constraint discovery_proposals_expire_reason_check;
alter table discovery_proposals add constraint discovery_proposals_expire_reason_check
    check (expire_reason in (
        'time', 'finding_gone', 'finding_done', 'finding_skipped', 'superseded', 'edited'));

-- What was approved before this migration was approved as proposed: there was no other way.
update discovery_proposals set approved_as = 'unedited'
    where decided_channel is not null and status in ('approved', 'applied', 'failed', 'undone');

create index discovery_proposals_verify on discovery_proposals (tenant_id, verify_at)
    where status = 'applied' and verify_at is not null;

-- discovery_asks: "Change it" is a tap too (it sends the link to the workspace's edit and keeps
-- the ask open), and the one result of an ask is sent once (`result_sent_at`).
alter table discovery_asks drop constraint discovery_asks_answer_check;
alter table discovery_asks add constraint discovery_asks_answer_check
    check (answer in ('approve', 'later', 'details', 'change'));
alter table discovery_asks add column result_sent_at timestamptz;
