-- D-191, spec 043 "Stage 5": a deposit the customer paid the shop by bank transfer, written
-- down by staff. ALYR never holds or moves the money (hard rule 3); this is the shop's record
-- that it received it, so the booking counts the deposit against the bill and the rule for a
-- no-show or a late cancel applies to it as it does to a deposit paid by link.
--
-- Additive: three columns on `bookings`. The table's row-level security, its forced policy and
-- its grants are the ones it already has (migrations 0001 and 0076); no table is added, so
-- core/erase_rules.py and core/forget.py need nothing.
--   deposit_method       'link' (paid through a pay link, the default) or 'transfer'
--   deposit_reference    what staff typed to find it again (a transfer reference), at most 80
--   deposit_received_at  when staff wrote it down; set for every transfer
alter table bookings
    add column deposit_method text not null default 'link'
        check (deposit_method in ('link', 'transfer')),
    add column deposit_reference text not null default ''
        check (length(deposit_reference) <= 80),
    add column deposit_received_at timestamptz,
    add constraint bookings_transfer_shape check (
        deposit_method = 'link'
        or (deposit_state <> 'none' and deposit_received_at is not null));
