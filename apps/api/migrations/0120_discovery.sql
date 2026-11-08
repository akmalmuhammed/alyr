-- ALY-318, decision D-160, spec 065: Discovery, Phase 1. How customers find a business (its
-- listing, its website, WhatsApp and its reviews), checked by rules, with the evidence kept.
-- Six tables, all of a shop's own: forced row-level security, and an index that starts with
-- tenant_id on every one (tests/test_tenant_isolation.py and tests/test_discovery_tables.py).
--
-- Reserved for Discovery: migrations 0120 to 0129. Phase 2 adds 0121.

-- One row per connector a shop has switched on or off. `config` is never a secret: a key for an
-- outside source is held as the other connectors hold theirs, in the settings, not here.
create table discovery_connections (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    kind text not null check (kind in ('sample', 'places', 'gbp')),
    status text not null default 'on' check (status in ('on', 'off', 'error')),
    config jsonb not null default '{}' check (jsonb_typeof(config) = 'object'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
-- At most one row that is on, per kind.
create unique index discovery_connections_one_on
    on discovery_connections (tenant_id, kind) where status = 'on';
create index discovery_connections_shop on discovery_connections (tenant_id, created_at);

-- The places a check covers. At most 50 per shop (the action refuses more) and one primary.
create table discovery_locations (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    name text not null check (btrim(name) <> '' and length(name) <= 160),
    name_ar text not null default '' check (length(name_ar) <= 160),
    area text not null default '' check (length(area) <= 120),
    -- The connector's own id for the listing; null if none.
    place_ref text check (place_ref is null or length(place_ref) <= 200),
    website_url text check (website_url is null or length(website_url) <= 300),
    -- The business's own number for this place, as +974...
    whatsapp_e164 text check (whatsapp_e164 is null or whatsapp_e164 ~ '^\+[1-9][0-9]{6,14}$'),
    is_primary boolean not null default false,
    position integer not null default 0,
    created_at timestamptz not null default now()
);
create index discovery_locations_shop on discovery_locations (tenant_id, position, created_at);
create unique index discovery_locations_one_primary
    on discovery_locations (tenant_id) where is_primary;

-- A check-up. Only one per shop is queued or running at a time (the partial unique index), so a
-- second press of "Run check-up" finds the first.
create table discovery_runs (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
    trigger text not null default 'manual' check (trigger in ('manual', 'schedule')),
    connector_kind text not null check (connector_kind in ('sample', 'places', 'gbp')),
    -- 0 to 100, or null when nothing was measured.
    score integer check (score is null or (score >= 0 and score <= 100)),
    -- {presence, reviews, website, whatsapp, ai}, each {value, measured, weight}.
    score_parts jsonb check (score_parts is null or jsonb_typeof(score_parts) = 'object'),
    steps_used integer not null default 0 check (steps_used >= 0),
    step_budget integer not null default 60 check (step_budget > 0),
    -- What outside calls cost, in the connector's own units; the sample connector is 0.
    cost_units integer not null default 0 check (cost_units >= 0),
    cost_budget integer not null default 100 check (cost_budget >= 0),
    -- A plain sentence for the owner, never a stack trace; `error_code` names it.
    error text,
    error_ar text,
    error_code text,
    created_at timestamptz not null default now(),
    started_at timestamptz,
    finished_at timestamptz,
    created_by uuid references users(id) on delete set null
);
create unique index discovery_runs_one_active
    on discovery_runs (tenant_id) where status in ('queued', 'running');
create index discovery_runs_shop on discovery_runs (tenant_id, created_at desc);

-- The log of a run: every step is a row, written as the step ends, so a run that fails keeps it.
create table discovery_run_steps (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    run_id uuid not null references discovery_runs(id) on delete cascade,
    seq integer not null check (seq > 0),
    tool text not null check (length(tool) <= 60),
    -- One plain sentence, in English.
    summary text not null default '' check (length(summary) <= 400),
    ok boolean not null default true,
    cost_units integer not null default 0 check (cost_units >= 0),
    started_at timestamptz not null default clock_timestamp(),
    ended_at timestamptz not null default clock_timestamp(),
    unique (tenant_id, run_id, seq)
);

-- What a rule found. The fingerprint (the rule and the place) is the same on every run, so a
-- finding is updated, not repeated; one row per fingerprint per shop.
create table discovery_findings (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    fingerprint text not null check (length(fingerprint) <= 120),
    rule_id text not null check (length(rule_id) <= 60),
    -- Null for the whole business. A place that is removed takes its findings with it.
    location_id uuid references discovery_locations(id) on delete cascade,
    -- agent: ALYR can do it after approval; owner: needs the owner or Google; process: changes
    -- how the branches work.
    kind text not null check (kind in ('agent', 'owner', 'process')),
    severity text not null check (severity in ('high', 'medium', 'low')),
    status text not null default 'open'
        check (status in ('open', 'skipped', 'owner_done', 'verified', 'gone')),
    -- [{label, value, where, seen_at}], kept as keys and plain values, worded when read.
    evidence jsonb not null default '[]' check (jsonb_typeof(evidence) = 'array'),
    first_run_id uuid not null references discovery_runs(id),
    last_run_id uuid not null references discovery_runs(id),
    last_seen_at timestamptz not null default now(),
    resolved_run_id uuid references discovery_runs(id),
    created_at timestamptz not null default now(),
    -- When the status last changed, for "Done, newest first".
    updated_at timestamptz not null default now(),
    unique (tenant_id, fingerprint)
);
create index discovery_findings_status on discovery_findings (tenant_id, status, severity);
create index discovery_findings_location on discovery_findings (tenant_id, location_id);

-- A snapshot of public reviews. Third-party personal data (an author's name and words): it lives
-- in this shop's rows only, goes with the shop's erasure (core/erase_rules.py) and never leaves
-- Qatar. Review text is data: shown quoted and escaped, never sent to a model or a template.
create table discovery_reviews (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    location_id uuid not null references discovery_locations(id) on delete cascade,
    source text not null check (source in ('google', 'sample')),
    source_ref text not null check (length(source_ref) <= 200),
    rating integer not null check (rating between 1 and 5),
    posted_at timestamptz not null,
    author_name text not null default '' check (length(author_name) <= 120),
    body text not null default '' check (length(body) <= 4000),
    language text not null default 'en' check (language in ('en', 'ar')),
    replied boolean not null default false,
    reply_text text not null default '' check (length(reply_text) <= 4000),
    fetched_run_id uuid references discovery_runs(id),
    unique (tenant_id, source, source_ref)
);
create index discovery_reviews_place on discovery_reviews (tenant_id, location_id, posted_at desc);

do $$
declare t text;
begin
    foreach t in array array[
        'discovery_connections', 'discovery_locations', 'discovery_runs', 'discovery_run_steps',
        'discovery_findings', 'discovery_reviews'
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

-- The activity record learns a subject for Discovery (who started a check-up, set a finding
-- aside, changed the places). The list is read from the constraint as it is now and `discovery`
-- added, so it keeps every subject earlier migrations (and branches merged since) allow.
do $$
declare
    def text;
    subjects text[];
begin
    select pg_get_constraintdef(oid) into def from pg_constraint
        where conrelid = 'activity'::regclass and conname = 'activity_subject_check';
    select array_agg(m[1]) into subjects from regexp_matches(def, '''([a-z_]+)''::text', 'g') as m;
    if not ('discovery' = any(subjects)) then
        alter table activity drop constraint activity_subject_check;
        -- Written as ARRAY['a'::text, ...], the form the database prints, so a later migration can
        -- read the list the same way.
        execute format(
            'alter table activity add constraint activity_subject_check '
            'check (subject = any (array[%s]::text[]))',
            (select string_agg(quote_literal(s), ', ') from unnest(array_append(subjects, 'discovery')) s));
    end if;
end $$;
