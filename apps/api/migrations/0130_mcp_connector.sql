-- The MCP connector (specs/067-mcp-connector, D-170, ALY-288, ALY-289, ALY-293): an owner's own
-- Claude or ChatGPT calls the same actions the workspace uses. This migration holds the sign-in
-- (clients, requests, grants, tokens), the confirm step, the shop's switches, and what the
-- activity record needs to name the door.
--
-- Tokens, codes and confirm tokens are random 256-bit values shown once and kept only as SHA-256
-- hashes (the same as sign-in codes, sessions and API keys). The tables that hold a business's
-- rows follow the usual pattern (tenant_id, forced row-level security, an index that starts with
-- the tenant). A token is presented before the business is known, so `mcp_tokens` lets one row be
-- read by the hash of the token presented, the way `api_keys` lets one be read by its prefix
-- (0043); writing stays inside the business.

-- ── The activity record learns a door (`mcp`) and a subject (`mcp`) ───────────────────────────
-- The lists are read from the constraints as they are now and `mcp` added, so every value earlier
-- migrations (and branches merged since) allow is kept.
do $$
declare
    def text;
    found text[];
begin
    select pg_get_constraintdef(oid) into def from pg_constraint
        where conrelid = 'activity'::regclass and conname = 'activity_subject_check';
    select array_agg(m[1]) into found from regexp_matches(def, '''([a-z_]+)''::text', 'g') as m;
    if not ('mcp' = any(found)) then
        alter table activity drop constraint activity_subject_check;
        execute format(
            'alter table activity add constraint activity_subject_check '
            'check (subject = any (array[%s]::text[]))',
            (select string_agg(quote_literal(s), ', ') from unnest(array_append(found, 'mcp')) s));
    end if;

    select pg_get_constraintdef(oid) into def from pg_constraint
        where conrelid = 'activity'::regclass and conname = 'activity_channel_check';
    select array_agg(m[1]) into found from regexp_matches(def, '''([a-z_]+)''::text', 'g') as m;
    if not ('mcp' = any(found)) then
        alter table activity drop constraint activity_channel_check;
        execute format(
            'alter table activity add constraint activity_channel_check '
            'check (channel = any (array[%s]::text[]))',
            (select string_agg(quote_literal(s), ', ') from unnest(array_append(found, 'mcp')) s));
    end if;
end $$;

-- ── Apps that may ask to connect (global: known before any business is) ───────────────────────
-- A client is one app (Claude, ChatGPT, a developer's tool): registered by itself (RFC 7591) or
-- read from the metadata document at its own HTTPS address (a client ID that is a URL). What it
-- says about itself (name, addresses) is shown to the person and never used to decide anything.
create table mcp_clients (
    app_id text primary key check (length(app_id) between 8 and 500),
    kind text not null check (kind in ('dcr', 'cimd')),
    name text not null check (length(name) between 1 and 80),
    redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 10),
    client_uri text check (client_uri is null or length(client_uri) <= 500),
    created_at timestamptz not null default now(),
    fetched_at timestamptz not null default now(),
    expires_at timestamptz not null,
    last_used_at timestamptz
);
grant select, insert, update, delete on mcp_clients to alyr_app;

-- The 15 minutes while a person signs in at the connector's page. `secret_hash` is the hash of
-- the value the page carries in a hidden field; `binder_hash` the hash of the value in the cookie
-- of the browser that began it: both must be presented to go on. Global because the business is
-- chosen at the end of it.
create table mcp_auth_requests (
    id uuid primary key default gen_random_uuid(),
    secret_hash text not null unique check (secret_hash ~ '^[0-9a-f]{64}$'),
    binder_hash text not null check (binder_hash ~ '^[0-9a-f]{64}$'),
    app_id text not null references mcp_clients (app_id) on delete cascade,
    redirect_uri text not null,
    code_challenge text not null check (length(code_challenge) between 43 and 128),
    state text check (state is null or length(state) <= 1000),
    scopes text[] not null,
    resource text not null,
    lang text not null default 'en' check (lang in ('en', 'ar')),
    address_hash text not null default '',
    email text,
    user_id uuid references users (id) on delete cascade,
    verified_at timestamptz,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    used_at timestamptz
);
create index mcp_auth_requests_expiry on mcp_auth_requests (expires_at);
grant select, insert, update, delete on mcp_auth_requests to alyr_app;

-- ── A business's own switches ─────────────────────────────────────────────────────────────────
-- Off until an owner opts in (and confirms where the data goes), pausable at once by an owner or
-- an admin (the kill switch). The caps are the business's own; null means the default.
create table mcp_settings (
    tenant_id uuid primary key
        default nullif(current_setting('app.tenant_id', true), '')::uuid references tenants (id),
    enabled boolean not null default false,
    enabled_by text,
    enabled_by_user uuid,
    enabled_at timestamptz,
    opt_in_version text,
    paused_at timestamptz,
    paused_by text,
    cap_hit_at timestamptz,
    writes_per_day integer check (writes_per_day is null or writes_per_day between 1 and 1000),
    sends_per_day integer check (sends_per_day is null or sends_per_day between 0 and 1000),
    updated_at timestamptz not null default now()
);

-- ── One person's permission for one app on one business ───────────────────────────────────────
create table mcp_grants (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null
        default nullif(current_setting('app.tenant_id', true), '')::uuid references tenants (id),
    user_id uuid not null references users (id) on delete cascade,
    app_id text not null references mcp_clients (app_id) on delete cascade,
    scopes text[] not null check (cardinality(scopes) >= 1),
    resource text not null,
    place_hash text not null default '',
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    last_used_at timestamptz,
    revoked_at timestamptz,
    revoked_by text,
    revoked_why text check (revoked_why is null or length(revoked_why) <= 80)
);
create index mcp_grants_tenant on mcp_grants (tenant_id, created_at desc);
create index mcp_grants_person on mcp_grants (tenant_id, user_id, app_id);

-- ── Codes, access tokens and refresh tokens ───────────────────────────────────────────────────
create table mcp_tokens (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null
        default nullif(current_setting('app.tenant_id', true), '')::uuid references tenants (id),
    grant_id uuid not null references mcp_grants (id) on delete cascade,
    kind text not null check (kind in ('code', 'access', 'refresh')),
    token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
    expires_at timestamptz not null,
    used_at timestamptz,
    -- A code remembers what it was made for.
    redirect_uri text,
    code_challenge text,
    created_at timestamptz not null default now()
);
create index mcp_tokens_grant on mcp_tokens (tenant_id, grant_id, kind);
create index mcp_tokens_expiry on mcp_tokens (tenant_id, expires_at);

-- ── A preview waiting for its yes ─────────────────────────────────────────────────────────────
create table mcp_confirmations (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null
        default nullif(current_setting('app.tenant_id', true), '')::uuid references tenants (id),
    grant_id uuid not null references mcp_grants (id) on delete cascade,
    token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
    tool text not null,
    args_hash text not null check (args_hash ~ '^[0-9a-f]{64}$'),
    preview jsonb not null default '{}',
    affects integer not null default 1 check (affects >= 0),
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    used_at timestamptz
);
create index mcp_confirmations_grant on mcp_confirmations (tenant_id, grant_id, created_at desc);

do $$
declare t text;
begin
    foreach t in array array['mcp_settings', 'mcp_grants', 'mcp_confirmations'] loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);
        execute format(
            'create policy tenant_isolation on %I
               using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
               with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
            t);
    end loop;
end $$;

alter table mcp_tokens enable row level security;
alter table mcp_tokens force row level security;
create policy tenant_isolation on mcp_tokens
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
           or token_hash = nullif(current_setting('app.mcp_token', true), ''))
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

grant select, insert, update on mcp_settings, mcp_grants to alyr_app;
grant select, insert, update, delete on mcp_tokens, mcp_confirmations to alyr_app;

-- ── What the anomaly alert counts ─────────────────────────────────────────────────────────────
-- A signal is a kind, a business's ID and a time: nothing a person wrote, nothing a customer said.
-- The alert rule reads counts across every business (core/alerts.py), so the table is global.
create table mcp_signals (
    id bigint generated always as identity primary key,
    kind text not null check (kind in ('write', 'new_place')),
    shop uuid not null,
    at timestamptz not null default now()
);
create index mcp_signals_recent on mcp_signals (kind, at);
grant select, insert, delete on mcp_signals to alyr_app;
