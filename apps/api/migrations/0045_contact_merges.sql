-- ALY-115: when two records turn out to be one customer, the duplicate is folded into the
-- other (core/identity.py). Almost everything that pointed at the duplicate moves with it.
-- Two kinds of record cannot: an issued document and a recorded payment are locked by
-- triggers (an invoice is never rewritten), and they keep the contact ID they were made
-- with. This table says where that ID went, so a screen that lists a customer's documents
-- can follow it, and nothing points at a person nobody can find.
--
-- Append only. The dropped contact has no foreign key: it is deleted by the merge.
create table contact_merges (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    -- The contact that remains. If the shop later deletes that customer, the trail goes too.
    kept_contact_id uuid not null references contacts(id) on delete cascade,
    dropped_contact_id uuid not null,
    -- How many rows of each kind moved, so a merge can be explained afterwards. Counts
    -- only: no names, numbers or message text.
    moved jsonb not null default '{}',
    merged_at timestamptz not null default now()
);
create index contact_merges_dropped on contact_merges (tenant_id, dropped_contact_id);
create index contact_merges_kept on contact_merges (tenant_id, kept_contact_id);

alter table contact_merges enable row level security;
alter table contact_merges force row level security;
create policy tenant_isolation on contact_merges
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert on contact_merges to alyr_app;
-- The one thing that may change: if the surviving contact is itself merged into another later,
-- the trail follows it. Nothing else on a row can be changed.
grant update (kept_contact_id) on contact_merges to alyr_app;
