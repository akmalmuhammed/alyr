-- The Catalog in the weekly report (ALY-109, decision D-039; spec 007).
--
-- 1. A record of a customer asking for something that was sold out: once per customer, item
--    and day. The report's "customers who asked for something sold out" line reads it, and
--    nothing else does. Written when a customer's cart check or order is refused for a sold-out
--    item and when the chat shows a customer a sold-out item. `via` says which.
--
-- Nothing here is visible to an owner or a customer by itself: the rows are only written, and
-- the report only reads them, for a shop whose `catalog` module is on, and it is off for every
-- shop until go-live.

create table sold_out_asks (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    contact_id uuid not null references contacts(id) on delete cascade,
    item_id uuid not null references items(id) on delete cascade,
    -- The calendar date on the shop's own wall clock, so the key is "once a day" for the shop.
    day date not null,
    via text not null check (via in ('order_page', 'whatsapp')),
    created_at timestamptz not null default now(),
    primary key (contact_id, item_id, day)
);
create index sold_out_asks_week on sold_out_asks (tenant_id, created_at);
create index sold_out_asks_item on sold_out_asks (item_id);

alter table sold_out_asks enable row level security;
alter table sold_out_asks force row level security;
create policy tenant_isolation on sold_out_asks
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

grant select, insert on sold_out_asks to alyr_app;
