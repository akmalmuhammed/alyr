-- Visits history import (D-197, D-198, spec 070): a shop's past visits, read from a file its other
-- system exported, written into the same tables the booking engine uses, so the Agent's rules,
-- the weekly report and the MCP read tools have something real to read for a business that does
-- not take its bookings in ALYR.
--
-- What is added, and why each piece is what it is:
--
--  * `history_imports`: one row per file, its state (preview, applied, undone), the hash of the
--    file, what was read from it while it is only a preview (the sheet, dropped when it is applied
--    or discarded), the mapping and options, the counts it made, and the three dates the
--    dashboard needs to say where its numbers come from: the day the export was cut
--    (`exported_on`) and the first and last visit in it.
--  * a mark on every row an import made: `history_import_id` on bookings, contacts, services and
--    booking_resources. Undo removes exactly what an import made by that mark.
--  * `bookings.history_row_key`: a keyed hash of (client, start, service), so a file that overlaps
--    an earlier one, or the same visit twice in one file, makes one booking.
--  * `contacts.history_key`: a keyed hash of whatever identified the client in the file (the
--    shop's own client number, a phone number, or a name). A client the shop prefers not to
--    store by name or phone is only this key: `contacts_reachable` accepts it.
--  * two CHECKs that make the guards true in the database, not only in the code: an imported
--    booking is never `booked` (a past visit left in that state would raise "not marked yet" and
--    would be remindable), and an imported booking always has its row key.
--
-- Nothing here sends anything. `core/outbound.py` refuses an imported contact who has never
-- written to the shop; `modules/reviews.py` never asks one. Additive only: no existing row changes.

create table history_imports (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    status text not null default 'preview' check (status in ('preview', 'applied', 'undone')),
    filename text not null,
    -- SHA-256 of the file's bytes. One applied import per file per business.
    file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
    -- What was read from the file, kept only while it is a preview (like a sales import's), and
    -- dropped when it is applied or discarded: the customer file itself is never stored.
    sheet jsonb,
    -- Which column is which, and what staff chose for this file.
    mapping jsonb not null default '{}',
    options jsonb not null default '{}',
    summary jsonb not null default '{}',
    -- The secret half of every key this business's imports make (hex). The business's first applied
    -- import fixes it; later previews use it, so the same client keeps the same key.
    key_salt text not null check (key_salt ~ '^[0-9a-f]{32,128}$'),
    -- What the file is ("the salon's booking system"), typed by staff, at most 60 characters.
    source text not null default '' check (length(source) <= 60),
    -- "Data from": the day the export was cut, and the first and last visit it holds.
    exported_on date,
    first_visit_on date,
    last_visit_on date,
    actor_id uuid references users(id) on delete set null,
    actor_name text not null,
    created_at timestamptz not null default clock_timestamp(),
    applied_at timestamptz,
    undone_at timestamptz,
    undone_by text
);
create index history_imports_recent on history_imports (tenant_id, created_at desc);
create unique index history_imports_one_file on history_imports (tenant_id, file_sha256)
    where status = 'applied';

alter table history_imports enable row level security;
alter table history_imports force row level security;
create policy tenant_isolation on history_imports
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update, delete on history_imports to alyr_app;

-- ── the mark on what an import made ──────────────────────────────────────────────────────────
alter table services
    add column history_import_id uuid references history_imports(id);
alter table booking_resources
    add column history_import_id uuid references history_imports(id);
alter table contacts
    add column history_import_id uuid references history_imports(id),
    add column history_key text check (history_key ~ '^[0-9a-f]{32}$');
alter table bookings
    add column history_import_id uuid references history_imports(id),
    add column history_row_key text check (history_row_key ~ '^[0-9a-f]{32}$'),
    -- A visit that is over has a final state. An imported row is never `booked`.
    add constraint bookings_history_final check (
        history_import_id is null or status in ('completed', 'no_show', 'cancelled')),
    add constraint bookings_history_key check (
        (history_import_id is null) = (history_row_key is null));

create index services_history on services (tenant_id, history_import_id)
    where history_import_id is not null;
create index booking_resources_history on booking_resources (tenant_id, history_import_id)
    where history_import_id is not null;
create index contacts_history on contacts (tenant_id, history_import_id)
    where history_import_id is not null;
create index bookings_history on bookings (tenant_id, history_import_id)
    where history_import_id is not null;
create unique index contacts_history_key on contacts (tenant_id, history_key)
    where history_key is not null;
create unique index bookings_history_row_key on bookings (tenant_id, history_row_key)
    where history_row_key is not null;

-- A client known only by a key has neither a phone nor a WhatsApp ID. It still cannot be reached:
-- `core/outbound.py` refuses a contact an import made until that person writes to the shop.
alter table contacts drop constraint contacts_reachable;
alter table contacts add constraint contacts_reachable
    check (phone is not null or wa_user_id is not null or forgotten_at is not null
           or history_key is not null);
