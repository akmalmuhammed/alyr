-- ALY-324, decision D-166, spec 066: Discovery, Phase 2. Proposals (one exact change to one place's
-- public presence, with its before and after, waiting for a person), the facts an owner confirmed
-- (the only source of a proposal's "after"), and which staff-role members manage which places.
-- Three tables, all of a shop's own: forced row-level security and an index that starts with
-- tenant_id on every one (tests/test_tenant_isolation.py, tests/test_discovery_tables.py).
--
-- Reserved for Discovery: migrations 0120 to 0129. This one is 0121; 0122 is the asks, 0123 the
-- sample business's state.

-- What a finding saw, as plain values, so a proposal can show the "before" without asking the
-- source again: {"<location id>": {"listing": {...}, "website": {...}}}, only the fields the rule
-- measured. Not a copy of a listing: the few values the rule compared (hours, a number, a name, a
-- category, a link) and nothing of Google's content beyond them.
alter table discovery_findings
    add column observed jsonb not null default '{}' check (jsonb_typeof(observed) = 'object');

-- Something the owner confirmed to be true about a place. A proposal's "after" comes only from
-- here (or from the place's own name and WhatsApp number, which the owner typed): never from what
-- Google or the website show, which are what is wrong.
create table discovery_facts (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    location_id uuid not null references discovery_locations(id) on delete cascade,
    key text not null check (key in ('hours', 'phone', 'category', 'name', 'whatsapp')),
    value jsonb not null check (jsonb_typeof(value) = 'object'),
    -- owner: typed in the workspace by someone allowed; sample: the fictional business's own truth.
    source text not null check (source in ('owner', 'sample')),
    confirmed_by uuid references users(id) on delete set null,
    -- Kept beside the id so the person is still named when their login goes.
    confirmed_name text not null default '' check (length(confirmed_name) <= 160),
    confirmed_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (tenant_id, location_id, key),
    check (source <> 'owner' or confirmed_name <> '')
);

create table discovery_proposals (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    finding_id uuid not null references discovery_findings(id) on delete cascade,
    location_id uuid not null references discovery_locations(id) on delete cascade,
    type text not null check (type in (
        'set_hours', 'set_phone', 'set_category', 'set_name', 'add_whatsapp_link',
        'reply_to_review')),
    target text not null check (target in ('listing', 'website')),
    connector_kind text not null check (connector_kind in ('sample', 'gbp')),
    -- '' or the review's source_ref for a reply.
    subject_ref text not null default '' check (length(subject_ref) <= 200),
    -- {"field": ..., "before": ..., "after": ...}: plain values, never words.
    change jsonb not null check (jsonb_typeof(change) = 'object'),
    -- SHA-256 of the canonical JSON of {type, target, location_id, subject_ref, field, after}.
    change_hash text not null check (change_hash ~ '^[0-9a-f]{64}$'),
    severity text not null check (severity in ('high', 'medium', 'low')),
    status text not null default 'proposed' check (status in (
        'proposed', 'approved', 'declined', 'expired', 'applied', 'failed', 'undone')),
    proposer_kind text not null default 'engine' check (proposer_kind in ('engine', 'agent')),
    proposed_by uuid references users(id) on delete set null,
    run_id uuid references discovery_runs(id) on delete set null,
    proposed_at timestamptz not null default now(),
    expires_at timestamptz not null,
    -- Who approved or declined, and through which door. Only a person's tap reaches `approved`:
    -- the channel is one of two, and the name is never empty (the code allows no other way).
    decided_by uuid references users(id) on delete set null,
    decided_name text not null default '' check (length(decided_name) <= 160),
    decided_channel text check (decided_channel in ('portal', 'whatsapp')),
    decided_at timestamptz,
    expire_reason text check (expire_reason in (
        'time', 'finding_gone', 'finding_done', 'finding_skipped', 'superseded')),
    apply_attempts integer not null default 0 check (apply_attempts >= 0),
    apply_started_at timestamptz,
    applied_at timestamptz,
    -- {ref, at}: public facts from the source, never a token.
    receipt jsonb check (receipt is null or jsonb_typeof(receipt) = 'object'),
    undo_until timestamptz,
    undone_by uuid references users(id) on delete set null,
    undone_name text not null default '' check (length(undone_name) <= 160),
    undone_at timestamptz,
    failure_code text check (failure_code is null or length(failure_code) <= 60),
    verification text check (verification in ('pending', 'confirmed', 'not_confirmed')),
    verified_run_id uuid references discovery_runs(id) on delete set null,
    updated_at timestamptz not null default now(),
    check (expires_at > proposed_at),
    check (status <> 'approved' or (decided_at is not null and decided_channel is not null
                                    and decided_name <> '')),
    check (status <> 'applied' or applied_at is not null),
    check (status <> 'declined' or decided_at is not null),
    check (status <> 'undone' or undone_at is not null),
    check (status <> 'expired' or expire_reason is not null)
);

-- At most one live proposal for the same thing: a second check-up, a second press of "Prepare
-- change" or a retried job finds the first.
create unique index discovery_proposals_one_live
    on discovery_proposals (tenant_id, finding_id, type, target, subject_ref)
    where status in ('proposed', 'approved');
create index discovery_proposals_status on discovery_proposals (tenant_id, status, proposed_at desc);
create index discovery_proposals_finding on discovery_proposals (tenant_id, finding_id);
create index discovery_proposals_place on discovery_proposals (tenant_id, location_id, status);
create index discovery_proposals_hash on discovery_proposals (tenant_id, change_hash);
create index discovery_proposals_due on discovery_proposals (tenant_id, expires_at)
    where status = 'proposed';

-- What a person approved is what is applied: the change and everything that says where it goes
-- cannot be edited once the proposal exists.
create function discovery_proposals_keep_the_change() returns trigger
language plpgsql as $$
begin
    if new.type is distinct from old.type
       or new.target is distinct from old.target
       or new.location_id is distinct from old.location_id
       or new.subject_ref is distinct from old.subject_ref
       or new.change is distinct from old.change
       or new.change_hash is distinct from old.change_hash
       or new.finding_id is distinct from old.finding_id
       or new.connector_kind is distinct from old.connector_kind then
        raise exception 'a proposal''s change cannot be edited' using errcode = '23514';
    end if;
    return new;
end $$;
create trigger discovery_proposals_keep_the_change before update on discovery_proposals
    for each row execute function discovery_proposals_keep_the_change();

-- Who a branch manager is: a staff-role member the owner or an admin linked to a place. A staff
-- member with no place here approves nothing.
create table discovery_location_managers (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    location_id uuid not null references discovery_locations(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (tenant_id, location_id, user_id)
);
create index discovery_location_managers_user on discovery_location_managers (tenant_id, user_id);

do $$
declare t text;
begin
    foreach t in array array[
        'discovery_facts', 'discovery_proposals', 'discovery_location_managers'
    ] loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);
        execute format(
            'create policy tenant_isolation on %I
               using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
               with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
            t);
        execute format('grant select, insert, update, delete on %I to alyr_app', t);
    end loop;
end $$;
