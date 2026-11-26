-- Discovery 2.0: Google's text is kept at most 30 days (modules/discovery/retention.py).
--
-- A proposal's change cannot be edited once it exists (0121): what a person approved is what is
-- applied. The one exception is the retention sweep removing the "before" a Google source returned,
-- once the proposal can no longer be approved, applied or undone: it may replace `change.before`
-- with `{"removed": true}` and nothing else. The field, the "after" and the hash stay as they were.
create or replace function discovery_proposals_keep_the_change() returns trigger
language plpgsql as $$
begin
    if new.type is distinct from old.type
       or new.target is distinct from old.target
       or new.location_id is distinct from old.location_id
       or new.subject_ref is distinct from old.subject_ref
       or new.change_hash is distinct from old.change_hash
       or new.finding_id is distinct from old.finding_id
       or new.connector_kind is distinct from old.connector_kind then
        raise exception 'a proposal''s change cannot be edited' using errcode = '23514';
    end if;
    if new.change is distinct from old.change and not (
        old.status not in ('proposed', 'approved')
        and new.status = old.status
        and new.change = jsonb_set(old.change, '{before}', '{"removed": true}'::jsonb)
    ) then
        raise exception 'a proposal''s change cannot be edited' using errcode = '23514';
    end if;
    return new;
end $$;
