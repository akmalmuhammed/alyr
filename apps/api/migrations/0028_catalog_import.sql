-- Importing and exporting the catalog (ALY-108, decision D-039).
--
-- One row per import. A file is first uploaded and previewed (status `preview`, the file
-- kept so the owner applies exactly what they saw), then applied (`applied`, the file
-- dropped and what was done kept for the one undo), and maybe undone (`undone`). A photo zip
-- waits here until the background job has added its photos.
--
-- Each import is also written to the activity record (`activity`, who did it) when it is
-- applied and when it is undone; those rows use the import's id as the subject id.

create table item_imports (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    status text not null default 'preview' check (status in ('preview', 'applied', 'undone')),
    filename text not null,
    kind text not null check (kind in ('csv', 'xlsx')),
    -- The uploaded sheet, until it is applied.
    file bytea,
    -- What the owner chose: {"on_duplicate": "create"}.
    options jsonb not null default '{}',
    -- The optional zip of photos, matched to rows by file name, until its photos are added.
    zip_name text,
    zip bytea,
    -- Counts and the rows that had problems, as shown after the import.
    summary jsonb not null default '{}',
    -- Each item as it was and as it became, for the one undo.
    changes jsonb not null default '[]',
    -- The photo job: {"state", "plan", "next", "total", "done", "failed", "attached"}.
    photos jsonb not null default '{}',
    actor_id uuid references users(id) on delete set null,
    actor_name text not null,
    created_at timestamptz not null default clock_timestamp(),
    applied_at timestamptz,
    undone_at timestamptz,
    undone_by text
);
create index item_imports_recent on item_imports (tenant_id, created_at desc);

alter table item_imports enable row level security;
alter table item_imports force row level security;
create policy tenant_isolation on item_imports
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
-- Delete is for previews that were never applied.
grant select, insert, update, delete on item_imports to alyr_app;
