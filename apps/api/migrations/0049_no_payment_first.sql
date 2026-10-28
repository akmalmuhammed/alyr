-- No payment first (ALY-242, decision D-053; the founder, 25 Oct 2026).
--
-- A client's workspace opens at sign-up. Payment is asked for at go-live instead, so the
-- column that held a client's products shut (`access_from`, 0048) is open from the day the
-- client is made, and every client still waiting on a payment is opened now. ALYR's staff can
-- still waive a payment (a pilot, a demo) with a reason: that is a column of its own, so
-- "opened" and "paid for" are no longer the same fact.
--
-- The price of each added product goes from QAR 150 to QAR 50 (D-035 set 150). A quote that
-- already exists keeps its own lines; only new drafts follow the price list, and only if
-- ALYR has not changed the value since.

alter table clients alter column access_from set default now();
alter table clients add column payment_waived_at timestamptz;

update clients
    set access_from = now(), access_note = 'Opened when payment first was dropped (D-053)'
    where access_from is null;

-- A client ALYR opened by hand with a reason (D-051) has its payment waived.
update clients set payment_waived_at = access_from
    where access_note <> '' and access_note <> 'Open before pay-first (D-051)'
      and access_note <> 'Opened when payment first was dropped (D-053)';

select set_config('app.platform_admin', 'on', true);
update price_items
    set price = 5000, updated_at = now(), updated_by = 'No payment first, 25 Oct 2026'
    where key = 'extra_product' and price = 15000;
select set_config('app.platform_admin', '', true);
