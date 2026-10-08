-- Sign-in for workspace staff (ALY-18, decision D-022). A person signs in with a
-- one-time code sent to their email; a session cookie then identifies them.

-- People. A person is not owned by a tenant: one accountant may work for several shops.
create table users (
    id uuid primary key default gen_random_uuid(),
    email text not null unique check (email = lower(email)),
    name text not null,
    created_at timestamptz not null default now()
);

-- Which shop a person works for, and as what. Tenant-owned, so row-level security
-- applies. The second half of the policy lets sign-in find the shops of the person
-- who has just proved who they are, before any tenant is chosen.
create table memberships (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    user_id uuid not null references users(id) on delete cascade,
    role text not null check (role in ('owner', 'admin', 'agent')),
    created_at timestamptz not null default now(),
    primary key (tenant_id, user_id)
);
alter table memberships enable row level security;
alter table memberships force row level security;
create policy tenant_isolation on memberships
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
           or user_id = nullif(current_setting('app.user_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update, delete on memberships to alyr_app;

-- One-time codes. Only a hash is stored; a code lasts ten minutes and five guesses.
create table login_codes (
    id uuid primary key default gen_random_uuid(),
    email text not null,
    code_hash text not null,
    attempts integer not null default 0,
    used boolean not null default false,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);
create index login_codes_email on login_codes (email, created_at);

-- Signed-in browsers. Only a hash of the cookie value is stored.
create table sessions (
    token_hash text primary key,
    user_id uuid not null references users(id) on delete cascade,
    tenant_id uuid not null references tenants(id),
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

grant select, insert, update on users to alyr_app;
grant select, insert, update, delete on login_codes, sessions to alyr_app;
