-- Pay before access (ALY-212, decision D-051; spec 020).
--
-- A client pays ALYR before their workspace opens: the setup fee and the first period of
-- the price they accepted. Until online payment exists (ALY-5, ALY-188), the client pays by
-- bank transfer (or cash, cheque or a payment link) and ALYR's staff record it in the back
-- office. Recording enough to cover what is due opens the workspace for every business of
-- the client. ALYR's staff can also open it without a payment, with a reason (a pilot, the
-- demo shop); that is audited.
--
-- This is the client paying ALYR, never a shop's customer paying the shop (ALYR never
-- holds a shop's money, hard rule 3). Amounts are integer dirhams. No card numbers: a
-- reference is what the bank or the link shows.

-- When the client's workspace opened. Null: not paid yet, the products stay locked.
alter table clients add column access_from timestamptz;
-- Why ALYR opened it without a payment, when it did.
alter table clients add column access_note text not null default '';

-- Every client that exists today keeps its workspace open: they were set up before this
-- rule, and the demo shops are among them.
update clients set access_from = created_at, access_note = 'Open before pay-first (D-051)';

create table client_payments (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references clients(id),
    -- The accepted quote it pays for.
    quote_id uuid references quotes(id),
    amount integer not null check (amount > 0),
    method text not null check (method in ('bank_transfer', 'cash', 'cheque', 'link')),
    -- What the bank statement or the payment link shows. Never a card number.
    reference text not null default '' check (length(reference) <= 120),
    received_on date not null,
    note text not null default '' check (length(note) <= 500),
    recorded_at timestamptz not null default now(),
    recorded_by text not null default ''
);
create index client_payments_client on client_payments (client_id, received_on);

-- The owner reads their own client's payments; only the back office writes.
alter table client_payments enable row level security;
alter table client_payments force row level security;
create policy client_payments_own on client_payments for select using (client_id = own_client());
create policy client_payments_back_office on client_payments for all
    using (is_back_office()) with check (is_back_office());
grant select, insert on client_payments to alyr_app;
