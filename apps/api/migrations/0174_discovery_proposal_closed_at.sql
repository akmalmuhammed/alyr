-- Discovery 2.0, polish from QA (agent P2): when an ask closed without a decision.
--
-- discovery_proposals.closed_at is set when a proposal leaves `proposed` as `expired` (its 14 days
-- ran out, a newer check replaced it, the finding was fixed, done or set aside, or the person
-- approved a changed value with "Change it"). Proof dates such a receipt by it: before, it fell back
-- to `expires_at`, which for a replaced ask is a date in the future. A decided proposal keeps its
-- own times (`decided_at`, `applied_at`, `undone_at`) and has no `closed_at`.
--
-- Columns only; row-level security on the table is unchanged (0121).

alter table discovery_proposals add column closed_at timestamptz;

-- An expired proposal from before this migration closed when it last changed: nothing touches an
-- expired proposal afterwards except the retention sweep, which keeps `updated_at` (0170).
update discovery_proposals set closed_at = updated_at where status = 'expired';

alter table discovery_proposals add constraint discovery_proposals_closed_at_expired
    check (closed_at is null or status = 'expired');
