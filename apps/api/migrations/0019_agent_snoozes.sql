-- "Not now" on the ALYR Agent's knowledge cards (ALY-99, `03-build-brief.md` §4).
--
-- An owner or admin can set a card aside. It stays hidden until the numbers behind it
-- change (a different fingerprint) or until the next Sunday, whichever comes first. One
-- row per card per business; setting it aside again replaces the row. Tenant-owned, with
-- the same row-level security as every other business table (0001).

create table agent_snoozes (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    insight_key text not null,
    -- What the card counted when it was set aside; a new count brings it back.
    fingerprint text not null,
    until timestamptz not null,
    created_by text not null default '',
    created_at timestamptz not null default now(),
    primary key (tenant_id, insight_key)
);

alter table agent_snoozes enable row level security;
alter table agent_snoozes force row level security;
create policy tenant_isolation on agent_snoozes
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update, delete on agent_snoozes to alyr_app;
