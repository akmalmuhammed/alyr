-- A client's subscription after go-live (ALY-218, go-live item 39, spec 040, decision D-082).
--
-- The plan's clock starts when the client's first business goes live. Each period is paid in
-- advance: by card through Paddle (renewals arrive by themselves, D-074) or by transfer, cash or
-- cheque recorded in the back office. A client whose next period is not paid is past due; after
-- the grace period ALYR pauses what the client's businesses send on WhatsApp, until they pay.
-- Nothing is ever deleted and the workspace stays open (D-033, D-053). A client can also cancel
-- with seven days' notice (D-034); from that day sending stops the same way.
--
-- What the state is comes from the accepted quote, the payments and the go-live date
-- (core/subscription.py). The back office's sweep writes it here so that the outbound layer
-- can read in one row whether a business may send, and /ops can list clients by state.

alter table clients
    add column billing_state text not null default ''
        check (billing_state in ('', 'no_price', 'awaiting_payment', 'active', 'past_due',
                                 'suspended', 'cancelled')),
    add column billing_checked_at timestamptz,
    -- Set while ALYR has paused sending for this client: 'overdue' or 'cancelled'.
    add column sending_paused_at timestamptz,
    add column sending_paused_reason text not null default ''
        check (sending_paused_reason in ('', 'overdue', 'cancelled')),
    -- Cancelling: when it was asked, by whom and why, and the day it takes effect.
    add column cancel_requested_at timestamptz,
    add column cancels_on date,
    add column cancel_note text not null default '' check (length(cancel_note) <= 500);

-- Emails ALYR sent a client about their subscription, one of each kind per due date, so the
-- hourly sweep never sends the same one twice.
create table billing_notices (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references clients(id),
    kind text not null check (kind in ('due', 'pause_soon', 'paused', 'cancel_scheduled')),
    due_on date not null,
    sent_at timestamptz not null default now(),
    unique (client_id, kind, due_on)
);

-- ALYR's own records about its clients: only the back office reads or writes them.
alter table billing_notices enable row level security;
alter table billing_notices force row level security;
create policy billing_notices_back_office on billing_notices for all
    using (is_back_office()) with check (is_back_office());
grant select, insert on billing_notices to alyr_app;
