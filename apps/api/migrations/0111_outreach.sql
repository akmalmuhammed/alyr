-- ALYR's own outreach engine (ALY-310, specs/065-outreach-engine, D-152): find a business and the
-- right person's work email, research it, draft a message with its sources, the founder approves,
-- the send gateway sends from a dedicated outreach mailbox, follow-ups go out until a reply.
--
-- Every table here is ALYR's own, not a shop's: no tenant_id. Like the other back-office tables
-- (clients, platform_audit, today_snoozes), each has forced row-level security that lets a row be
-- read or written only on a connection that declared the back office (`is_back_office()`: the
-- API's staff declaration, and since D-137 a back-office or worker login). Listed on the global
-- tables in tests/test_tenant_isolation.py and in core/erase_rules.py.
--
-- No email address is kept where it is not needed: suppression holds SHA-256 hashes only, a send
-- and a reply hold the hash of the address, and a prospect's own address is erased by the
-- engine's daily job 30 days after an opt-out, a bounce or a disqualification.

create table outreach_settings (
    only_row boolean primary key default true check (only_row),
    kill_switch boolean not null default false,
    kill_reason text not null default '',
    kill_at timestamptz,
    kill_by text not null default '',
    daily_cap integer not null default 50 check (daily_cap between 0 and 1000),
    default_level smallint not null default 1 check (default_level between 0 and 3),
    -- Addresses nobody should ever be sent to. A send to one trips the kill switch.
    honeytokens text[] not null default '{}',
    booking_url text not null default '',
    -- When the recurring work last ran (the worker's tick claims each by moving these).
    last_poll_at timestamptz,
    last_digest_on date,
    last_erase_on date,
    updated_by text not null default '',
    updated_at timestamptz not null default now()
);
insert into outreach_settings (only_row) values (true);

create table outreach_mailboxes (
    id uuid primary key default gen_random_uuid(),
    from_address text not null unique check (from_address = lower(from_address)),
    from_name text not null default '',
    -- The first day it sent: the ramp (10, 20, 30, then 40 a day) counts weeks from it.
    first_send_on date,
    paused_at timestamptz,
    paused_reason text not null default '',
    created_at timestamptz not null default now()
);

create table outreach_prospects (
    id uuid primary key default gen_random_uuid(),
    company text not null,
    website text not null default '',
    domain text not null default '',
    country text not null default '' check (country = '' or country ~ '^[A-Z]{2}$'),
    business_type text not null default '',
    -- discovery: a web search (Exa); places: Google Places Text Search, kept as its place_id and
    -- the business's name only (no address, phone, rating or position: Google's terms); overture:
    -- an Overture Maps places file (CDLA Permissive 2.0 / Apache 2.0), with its release.
    source text not null check (source in ('manual', 'import', 'discovery', 'places',
        'overture')),
    source_url text not null default '',
    source_ref text not null default '',
    first_name text not null default '',
    last_name text not null default '',
    role text not null default '',
    email text,
    -- SHA-256 of the lower-cased address, for the frequency rules; erased with the address.
    email_hash text,
    email_source text not null default '',
    email_verification text not null default '',
    basis text not null default '' check (basis in ('', 'published_business_contact',
        'existing_relationship', 'referral', 'opt_in', 'inbound', 'legitimate_interest',
        'conspicuous_publication')),
    basis_note text not null default '',
    language text not null default 'en' check (language in ('en', 'ar')),
    stage text not null default 'new' check (stage in ('new', 'researching', 'researched',
        'drafting', 'in_review', 'approved', 'sending', 'done', 'needs_human', 'disqualified',
        'rejected', 'replied', 'bounced', 'opted_out')),
    stage_reason text not null default '',
    fit_score smallint check (fit_score between 0 and 100),
    fit_reason text not null default '',
    -- Null: the default level in outreach_settings. The country's cap always applies on top.
    level smallint check (level between 0 and 3),
    notes text not null default '',
    paused boolean not null default false,
    created_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    last_activity_at timestamptz not null default now(),
    erased_at timestamptz
);
create index outreach_prospects_stage on outreach_prospects (stage, updated_at desc);
create index outreach_prospects_domain on outreach_prospects (domain) where domain <> '';
create index outreach_prospects_email on outreach_prospects (email_hash) where email_hash is not null;

-- Addresses the business published on its own site (a mailto: link, the text of a page, or the
-- page's schema.org `email`), each with the exact page it was read from. Never guessed from a
-- pattern. Erased with the prospect.
create table outreach_found_emails (
    id bigint generated always as identity primary key,
    prospect_id uuid not null references outreach_prospects(id) on delete cascade,
    email text not null,
    source_url text not null,
    -- named (a person's), role (info@, sales@), or free_mail (published on its own site; flagged)
    kind text not null check (kind in ('named', 'role', 'free_mail', 'other_domain')),
    found_at timestamptz not null default now(),
    unique (prospect_id, email)
);

create table outreach_pages (
    id bigint generated always as identity primary key,
    prospect_id uuid not null references outreach_prospects(id) on delete cascade,
    url text not null,
    fetched_at timestamptz not null default now(),
    text_hash text not null,
    text text not null,
    fetched_by text not null default 'direct'
);
create index outreach_pages_prospect on outreach_pages (prospect_id);

create table outreach_claims (
    id bigint generated always as identity primary key,
    prospect_id uuid not null references outreach_prospects(id) on delete cascade,
    claim_key text not null,
    text text not null,
    url text not null,
    quote text not null,
    kept boolean not null,
    why text not null default '',
    created_at timestamptz not null default now(),
    unique (prospect_id, claim_key)
);

create table outreach_drafts (
    id uuid primary key default gen_random_uuid(),
    prospect_id uuid not null references outreach_prospects(id) on delete cascade,
    -- 1 to 3: the first message and two follow-ups; 4: a reply to a "yes" (the Concierge).
    step smallint not null check (step between 1 and 4),
    version integer not null default 1,
    subject text not null default '',
    body text not null default '',
    language text not null default 'en' check (language in ('en', 'ar')),
    -- Each sentence with the claims it cites; null for a text a person wrote.
    sentences jsonb,
    critic jsonb not null default '{}',
    lint jsonb not null default '{}',
    body_hash text not null,
    status text not null default 'in_review' check (status in ('in_review', 'approved',
        'rejected', 'superseded', 'sent')),
    reason text not null default '',
    created_by text not null,
    created_at timestamptz not null default now(),
    unique (prospect_id, step, version)
);
create index outreach_drafts_status on outreach_drafts (status, created_at);

create table outreach_approvals (
    id bigint generated always as identity primary key,
    draft_id uuid not null references outreach_drafts(id) on delete cascade,
    body_hash text not null,
    staff_email text not null,
    at timestamptz not null default now()
);
create index outreach_approvals_draft on outreach_approvals (draft_id);

create table outreach_intents (
    id uuid primary key default gen_random_uuid(),
    prospect_id uuid not null references outreach_prospects(id) on delete cascade,
    step smallint not null check (step between 1 and 4),
    draft_id uuid not null references outreach_drafts(id) on delete cascade,
    -- prospect and step: one send each, ever.
    idempotency_key text not null unique,
    run_at timestamptz not null default now(),
    status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'held',
        'blocked', 'rescheduled', 'dropped')),
    last_check smallint,
    last_result text not null default '',
    enqueued_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index outreach_intents_due on outreach_intents (run_at)
    where status in ('queued', 'rescheduled');
create index outreach_intents_prospect on outreach_intents (prospect_id);

create table outreach_sends (
    id uuid primary key default gen_random_uuid(),
    intent_id uuid not null unique references outreach_intents(id) on delete cascade,
    mailbox_id uuid not null references outreach_mailboxes(id),
    prospect_id uuid not null references outreach_prospects(id) on delete cascade,
    step smallint not null,
    message_id text not null unique,
    sent_at timestamptz not null default now(),
    to_hash text not null,
    domain_hash text not null,
    status text not null default 'sent' check (status in ('sent', 'bounced'))
);
create index outreach_sends_at on outreach_sends (sent_at desc);
create index outreach_sends_prospect on outreach_sends (prospect_id);
create index outreach_sends_to on outreach_sends (to_hash);

create table outreach_replies (
    id uuid primary key default gen_random_uuid(),
    send_id uuid references outreach_sends(id) on delete set null,
    prospect_id uuid references outreach_prospects(id) on delete cascade,
    -- The message's own Message-ID: a reply read twice is stored once.
    message_id text not null unique,
    received_at timestamptz not null default now(),
    from_hash text not null default '',
    subject text not null default '',
    -- Quoted history removed, cut to 20,000 characters; erased with the prospect.
    body text not null default '',
    kind text not null check (kind in ('bounce', 'auto_reply', 'opt_out', 'read', 'unmatched')),
    label text not null default '',
    confidence real,
    needs_founder boolean not null default false,
    handled_by text not null default '',
    handled_at timestamptz,
    note text not null default ''
);
create index outreach_replies_open on outreach_replies (received_at desc) where handled_at is null;
create index outreach_replies_prospect on outreach_replies (prospect_id);

create table outreach_suppression (
    id bigint generated always as identity primary key,
    email_hash text,
    domain_hash text,
    reason text not null,
    source text not null default '',
    at timestamptz not null default now(),
    check ((email_hash is null) <> (domain_hash is null))
);
create unique index outreach_suppression_email on outreach_suppression (email_hash)
    where email_hash is not null;
create unique index outreach_suppression_domain on outreach_suppression (domain_hash)
    where domain_hash is not null;

-- The timeline: append only. Detail never holds an email address or a phone number.
create table outreach_events (
    id bigint generated always as identity primary key,
    prospect_id uuid references outreach_prospects(id) on delete cascade,
    kind text not null,
    detail jsonb not null default '{}',
    at timestamptz not null default now()
);
create index outreach_events_prospect on outreach_events (prospect_id, at);
create index outreach_events_kind on outreach_events (kind, at);

create function outreach_events_append_only() returns trigger
language plpgsql as $$
begin
    raise exception 'the outreach timeline cannot be changed' using errcode = '42501';
end $$;
create trigger outreach_events_append_only before update on outreach_events
    for each row execute function outreach_events_append_only();

create table outreach_connection_tests (
    id bigint generated always as identity primary key,
    service text not null,
    ok boolean not null,
    message text not null default '',
    at timestamptz not null default now(),
    by_email text not null default ''
);
create index outreach_connection_tests_service on outreach_connection_tests (service, at desc);

-- Only the back office (and the worker, which runs the engine's jobs) reads or writes them.
do $$
declare
    t text;
begin
    foreach t in array array['outreach_settings', 'outreach_mailboxes', 'outreach_prospects',
        'outreach_found_emails', 'outreach_pages', 'outreach_claims', 'outreach_drafts', 'outreach_approvals',
        'outreach_intents', 'outreach_sends', 'outreach_replies', 'outreach_suppression',
        'outreach_events', 'outreach_connection_tests']
    loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);
        execute format('create policy %I on %I for all using (is_back_office()) '
                       'with check (is_back_office())', t || '_back_office', t);
        execute format('grant select, insert, update, delete on %I to alyr_app', t);
    end loop;
end $$;
-- The settings row is never deleted, and the timeline is never rewritten.
revoke delete on outreach_settings from alyr_app;
revoke update on outreach_events from alyr_app;
