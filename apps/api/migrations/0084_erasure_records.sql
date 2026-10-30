-- Erasing a stopped client's data (spec 042, decision D-116): what the job records and needs.
--
-- The privacy notice promises that a business's data is deleted 60 days after it stops. The
-- clock is `clients.cancels_on` (0075). The job that keeps the promise is `alyr.erase_job`, run
-- daily as the database owner; it never runs as the application's role.

-- ── On the client ────────────────────────────────────────────────────────────────────────
alter table clients
    -- When ALYR erased the client's businesses and scrubbed its contact details. Set once. A
    -- client with this set cannot be cancelled again or have its cancellation undone: there is
    -- nothing left to keep.
    add column erased_at timestamptz,
    -- When the erasure of the client's first business began. From then on the cancellation
    -- cannot be undone or asked again: a client with some businesses gone and some not
    -- is the one state nobody should be able to come back to.
    add column erase_started_at timestamptz,
    -- A reason ALYR must not erase this client yet (a dispute, a request from an authority, a
    -- payment in doubt). Non-empty means held. Only the erasure job's `hold` and `release`
    -- commands write it.
    add column erase_hold text not null default '' check (length(erase_hold) <= 500),
    add column erase_hold_at timestamptz;

-- ── A cancelled client takes no business in ──────────────────────────────────────────────
-- Putting a business under a client that has cancelled (or been erased) would have the
-- erasure delete a live business with it. The move is refused (the route answers 404).
create or replace function admin_set_business_client(p_tenant uuid, p_client uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
    perform assert_platform_admin();
    update tenants set client_id = p_client
        where id = p_tenant and exists (
            select 1 from clients where id = p_client
              and cancels_on is null and erased_at is null);
    return found;
end $$;

-- ── ALYR's own records name a business by its ID only ────────────────────────────────────
-- Three records ALYR keeps after a business is erased point at it: the lines of a quote made
-- for it, the card checkouts made for it, and the terms its owner accepted. The business's row
-- goes (so every list and every background loop that reads `tenants` simply no longer sees
-- it), and these keep the ID as plain data, as `platform_audit` already does.
alter table quote_lines drop constraint quote_lines_business_id_fkey;
alter table card_checkouts drop constraint card_checkouts_business_id_fkey;
alter table terms_acceptances drop constraint terms_acceptances_tenant_id_fkey;

-- ── The receipt: counts only ─────────────────────────────────────────────────────────────
-- One row per business erased, and one per client when its own details were scrubbed. Table
-- names and numbers of rows; never a name, a number, an address or a message. Written in the
-- same transaction as the deletion, so a receipt exists exactly when the deletion happened.
create table erasure_receipts (
    id uuid primary key default gen_random_uuid(),
    scope text not null check (scope in ('business', 'client')),
    client_id uuid not null,
    business_id uuid,
    business_type text not null default '',
    went_live_on date,
    -- The day the client's cancellation took effect: the start of the 60 days.
    stopped_on date,
    erased_at timestamptz not null default now(),
    -- Rows deleted, kept and scrubbed, by table; people removed or anonymised, by kind.
    deleted jsonb not null default '{}',
    kept jsonb not null default '{}',
    scrubbed jsonb not null default '{}',
    people jsonb not null default '{}',
    -- Which version of the table-by-table rules ran (core/erase_rules.py), so a receipt can be
    -- read against the rules of its day.
    rules text not null
);
create index erasure_receipts_client on erasure_receipts (client_id, erased_at);

create function erasure_receipts_append_only() returns trigger
language plpgsql as $$
begin
    raise exception 'an erasure receipt cannot be changed' using errcode = '42501';
end $$;
create trigger erasure_receipts_append_only before update or delete on erasure_receipts
    for each row execute function erasure_receipts_append_only();

alter table erasure_receipts enable row level security;
alter table erasure_receipts force row level security;
create policy erasure_receipts_read on erasure_receipts for select using (is_back_office());
create policy erasure_receipts_write on erasure_receipts for insert with check (is_back_office());
grant select on erasure_receipts to alyr_app;

-- ── The photos: a list of prefixes to empty ──────────────────────────────────────────────
-- Product photos are not in the database but in the photo store, under `shops/<business id>/`.
-- The job writes one row per erased business in the same transaction as the deletion; the
-- worker, which holds the store's keys (the job does not), empties the prefix and writes how
-- many objects went. A row stays until a listing of the prefix comes back empty. The worker can
-- read and update the row; it cannot add one.
create table erasure_files (
    business_id uuid primary key,
    prefix text not null check (prefix ~ '^shops/[0-9a-f-]{36}/$'),
    queued_at timestamptz not null default now(),
    attempts integer not null default 0,
    objects_deleted integer not null default 0,
    -- The store's own short error code, at most; never a key or a secret.
    last_error text not null default '' check (length(last_error) <= 200),
    done_at timestamptz
);
grant select on erasure_files to alyr_app;
grant update (attempts, objects_deleted, last_error, done_at) on erasure_files to alyr_app;
