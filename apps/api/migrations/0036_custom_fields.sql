-- The owner's own fields on items and sizes (ALY-148, decision D-039 "As built (feature engine)").
--
-- A shop defines fields (Serves, Warranty months, Concentration, Allergens): a key, a name in
-- English and Arabic, a kind (text, number, one of a list, yes or no, a date), whether it is on
-- an item or on each size or colour, whether customers see it, whether it is searched, whether it
-- is required, and an order. A field is archived, never deleted: its values stay.
--
-- The values live in a `custom` column of `items` and of `item_variants`, an object keyed by the
-- field's key. Why a column and not a table of values: a value is read with the item it belongs
-- to (the list, the order page, the files), is copied to an order line as it is, needs no join,
-- takes the row-level security of the row it is on, and is still queryable (`custom ->> 'key'`,
-- and a GIN index for containment). The kind is checked by the application against the field's
-- definition, which is where its choices and limits are. An order line keeps a snapshot of the
-- fields the customer could see, as a list, so an order never changes when a field is renamed.

create table custom_fields (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    key text not null check (key ~ '^[a-z][a-z0-9_]{0,29}$'),
    label text not null default '' check (char_length(label) <= 60),
    label_ar text not null default '' check (char_length(label_ar) <= 60),
    kind text not null check (kind in ('text', 'number', 'choice', 'yes_no', 'date')),
    applies_to text not null default 'item' check (applies_to in ('item', 'variant')),
    -- [{"value": "nuts", "label": "Contains nuts", "label_ar": "...", "active": true}]
    choices jsonb not null default '[]',
    -- Beside a number: "ml", "months".
    unit text not null default '' check (char_length(unit) <= 12),
    shown_to_customers boolean not null default false,
    searchable boolean not null default false,
    required boolean not null default false,
    sort integer not null default 0,
    archived_at timestamptz,
    created_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (label <> '' or label_ar <> ''),
    unique (tenant_id, key)
);
create index custom_fields_shop on custom_fields (tenant_id, sort, created_at);

alter table items add column custom jsonb not null default '{}';
alter table item_variants add column custom jsonb not null default '{}';
create index items_custom on items using gin (custom jsonb_path_ops);
create index item_variants_custom on item_variants using gin (custom jsonb_path_ops);

-- What the customer could see of the fields when they ordered: [{"key", "label", "label_ar",
-- "kind", "text", "text_ar"}] for the item's fields and the chosen size's.
alter table order_items add column custom jsonb not null default '[]';

alter table custom_fields enable row level security;
alter table custom_fields force row level security;
create policy tenant_isolation on custom_fields
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update, delete on custom_fields to alyr_app;
