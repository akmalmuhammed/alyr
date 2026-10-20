-- ALY-128: cancelling an order that was put on a customer's credit account takes the sale
-- off the ledger.
--
-- A new kind of entry, `reversal`, undoes the credit sale of one order. It is added next
-- to the sale, never instead of it, so the ledger still shows both. Each entry that comes
-- from an order now says which one (`order_id`), so the age of the debt can be worked out
-- without the cancelled order: the sale leaves the bucket it was in, which a payment
-- would not do (a payment settles the oldest debt first).
--
-- At most one reversal per order, whatever path cancels it and however often: the unique
-- index below is the guard under the order's own row lock.

alter table ledger_entries drop constraint ledger_entries_kind_check;
alter table ledger_entries add constraint ledger_entries_kind_check
    check (kind in ('sale', 'payment', 'adjustment', 'reversal'));
-- The existing amount check (positive unless an adjustment) covers a reversal as well.

-- `on delete set null`: only the demo shops' reset deletes orders, and it must not be
-- stopped by the ledger rows that point at them.
alter table ledger_entries add column order_id uuid references orders(id) on delete set null;

create unique index ledger_entries_one_reversal_per_order
    on ledger_entries (order_id) where kind = 'reversal';
create index ledger_entries_order on ledger_entries (tenant_id, order_id)
    where order_id is not null;

-- Sales the order link wrote before this migration carry their order's number in the note
-- ("Order #1001"). Link the ones that match one order of that customer exactly, so that
-- cancelling such an order after this migration reverses its own sale.
--
-- The migration owner normally bypasses row-level security. Where it does not (a hosted
-- database whose admin is not a superuser), forced security would hide every row from this
-- statement, so it is lifted for the length of this transaction.
alter table ledger_entries no force row level security;
alter table orders no force row level security;

update ledger_entries e set order_id = o.id
from orders o
where e.kind = 'sale' and e.order_id is null
  and o.payment = 'on_account'
  and o.tenant_id = e.tenant_id and o.contact_id = e.contact_id
  and e.note = 'Order #' || o.number and e.amount = o.total;

alter table ledger_entries force row level security;
alter table orders force row level security;
