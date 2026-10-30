-- The activation job (ALY-213, spec 041, decision D-100).
--
-- When a client's payment is recorded (or staff waive it), ALYR turns the signed-up business into
-- a working workspace: the plan is checked, the modules of the accepted quote are switched on,
-- the starting setup and the onboarding steps are in place, and the owner is emailed a "your
-- workspace is ready" message with a sign-in link that works once.
--
-- `activations` is ALYR's record of that, one row per client, with the result of each step so
-- the back office can see what happened and run it again. `signin_links` holds the one-time links
-- (as hashes, like sessions and sign-in codes).

create table activations (
    id uuid primary key default gen_random_uuid(),
    -- One activation per client: a second payment, or the same one recorded twice, finds this row.
    client_id uuid not null unique references clients(id),
    -- The accepted quote it was made for (the one in force when it was last run).
    quote_id uuid references quotes(id),
    -- The business the job runs under and the link opens, and the owner who is emailed.
    business_id uuid references tenants(id),
    user_id uuid references users(id),
    -- What started it: staff recorded a payment, Paddle's webhook did, staff waived the payment,
    -- or the worker's sweep found a payment no other path reported.
    trigger text not null check (trigger in ('payment', 'card', 'waived', 'sweep')),
    -- queued: waiting for the worker, or trying again; done; failed: gave up, waiting for staff.
    status text not null default 'queued' check (status in ('queued', 'done', 'failed')),
    attempts integer not null default 0,
    -- What each step did: {"plan": {"ok": true, "at": "...", "note": "..."}, ...}. Names and
    -- reasons only, never a link or a code.
    steps jsonb not null default '{}',
    error text not null default '' check (length(error) <= 500),
    -- The email went to the owner at this time. A run never sends it twice unless staff ask.
    emailed_at timestamptz,
    -- The address it went to, for the back office: staff already see the client's email.
    sent_to text not null default '',
    recorded_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    finished_at timestamptz
);
create index activations_status on activations (status, created_at desc);

alter table activations enable row level security;
alter table activations force row level security;
create policy activations_back_office on activations for all
    using (is_back_office()) with check (is_back_office());
grant select, insert, update on activations to alyr_app;

-- A sign-in link: a random token, kept only as a hash. It works once and expires. It belongs to
-- one person in one business and says which activation made it, so a new one for the same
-- activation can end the one before. Like `sessions` and `login_codes` it is a person's, not a
-- shop's, and is read before anyone is signed in.
create table signin_links (
    token_hash text primary key,
    user_id uuid not null references users(id),
    tenant_id uuid not null references tenants(id),
    activation_id uuid references activations(id),
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    used_at timestamptz
);
create index signin_links_activation on signin_links (activation_id) where used_at is null;
create index signin_links_user on signin_links (user_id);
grant select, insert, update, delete on signin_links to alyr_app;

-- Activations are made for payments from this moment on. The sweep never reaches back to a client
-- who paid before it existed: nobody is emailed "your workspace is ready" about an old payment.
insert into platform_settings (key, value, updated_by)
values ('activation_since', to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
        'Migration 0077 (ALY-213)')
on conflict (key) do nothing;
