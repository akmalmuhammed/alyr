-- Item codes and ordering by code on WhatsApp (ALY-136, decision D-039).
--
-- 1. Every item has a short number of its own, its CODE: 101, 102, 103... in the order the
--    shop made its items, unique in the shop, never changed and never used again once an item
--    has had it (an archived item keeps its number). It is not the SKU: the SKU is the
--    owner's own and may be anything or nothing; the code is ALYR's, always there, and short
--    enough to type on a phone and to put in a WhatsApp message. A customer sends it in the
--    chat, or the order page puts it in a message for them (`modules/items/codes.py`).
--    * The database gives the number (a trigger), not the application, so every way an item
--      is made (the screens, an import, the seeds, a test) gets one, and two items made at the
--      same moment cannot get the same one: the shop's counter row is locked by the first, the
--      second waits for its turn.
--    * Sample items (`is_sample`, the examples a type of business starts with) have no code
--      and use no number; a sample the owner keeps as their own (`adopt`) is given one then.
--    * A code cannot be changed once it is set, by the app or by anyone else (the trigger
--      refuses). It is shown to the owner and can be copied, not edited.
--    * Existing items are numbered here, oldest first, from 101, per shop. Safe on a database
--      with data; the data step alone can be run again (an item that has a code is left alone).
-- 2. The shop's choice of how customers order on WhatsApp: `chat` (the number runs on ALYR, the
--    chat answers a code) or `link` (the shop keeps its own number and answers itself; ALYR
--    gives the page and a ready, readable order message). It only changes the wording of the
--    message the order page prepares.
-- 3. What the chat remembers about a customer who is ordering by message: the draft order
--    (items they confirmed), the one question waiting for an answer, and how many codes they
--    sent that matched nothing lately. One row per customer and shop, with an expiry, cleared
--    when the order is placed.
--
-- Row-level security is forced on the new tables. Nothing here is visible to a customer or
-- an owner by itself except the codes.

-- ------------------------------------------------------------------------------ codes

alter table items
    add column code integer
        constraint items_code_range check (code is null or code between 101 and 99999);
create unique index items_code on items (tenant_id, code) where code is not null;

-- Where the next number of each shop is. Rows are only added and moved forward by the trigger
-- below; the app can read them, and a shop's reset (the demo shop, the tests) can delete them.
create table item_code_counters (
    tenant_id uuid primary key
        default nullif(current_setting('app.tenant_id', true), '')::uuid references tenants(id),
    next_code integer not null default 101 check (next_code between 101 and 100000)
);
alter table item_code_counters enable row level security;
alter table item_code_counters force row level security;
create policy tenant_isolation on item_code_counters
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, delete on item_code_counters to alyr_app;

-- Runs with the owner's rights so the app role needs no right to write the counter; the
-- counter row it touches is still the one of the shop being written (row-level security
-- applies to the owner too, because it is forced).
create function items_assign_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v integer;
begin
    if tg_op = 'UPDATE' and old.code is not null and new.code is distinct from old.code then
        raise exception 'an item code cannot be changed' using errcode = 'check_violation';
    end if;
    if new.code is null and not new.is_sample then
        insert into item_code_counters (tenant_id, next_code) values (new.tenant_id, 102)
            on conflict (tenant_id) do update set next_code = item_code_counters.next_code + 1
            returning next_code - 1 into v;
        new.code := v;
    end if;
    return new;
end $$;
create trigger items_code before insert or update on items
    for each row execute function items_assign_code();

-- Number the items that exist, per shop, oldest first. The shop is selected the way 0032
-- does it, so this also works for an owner that does not bypass row-level security.
do $$
declare
    t record;
    r record;
    n integer;
begin
    for t in select id from tenants loop
        perform set_config('app.tenant_id', t.id::text, true);
        -- Every statement names the shop: a superuser owner is not held to one shop by
        -- row-level security, and must not number another shop's items.
        n := coalesce((select max(code) from items where tenant_id = t.id), 100);
        for r in
            select id from items where tenant_id = t.id and code is null and not is_sample
            order by created_at, sort, name, id
        loop
            n := n + 1;
            update items set code = n where id = r.id;
        end loop;
        if exists (select 1 from items where tenant_id = t.id and code is not null) then
            insert into item_code_counters (tenant_id, next_code) values (t.id, n + 1)
                on conflict (tenant_id) do update
                set next_code = greatest(item_code_counters.next_code, excluded.next_code);
        end if;
    end loop;
    perform set_config('app.tenant_id', '', true);
end $$;

-- ------------------------------------------------------------- how customers order

alter table shop_settings
    add column whatsapp_mode text not null default 'chat'
        check (whatsapp_mode in ('chat', 'link'));

-- --------------------------------------------------------- an order being put together

create table chat_carts (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    contact_id uuid not null references contacts(id) on delete cascade,
    -- What the customer confirmed: [{item_id, variant_id, quantity, price}]. `price` is what
    -- they were last shown for one, so a change is said before the order is placed.
    lines jsonb not null default '[]',
    -- The question waiting for an answer: what was understood and is waiting for Confirm or
    -- Change, or a size still to choose. Null when there is none.
    pending jsonb,
    pending_expires_at timestamptz,
    -- Codes sent lately that matched nothing: past a few in a short time the chat stops
    -- searching and hands the customer to a person.
    misses integer not null default 0,
    misses_since timestamptz,
    expires_at timestamptz not null,
    updated_at timestamptz not null default now(),
    unique (tenant_id, contact_id)
);
create index chat_carts_expiry on chat_carts (tenant_id, expires_at);
alter table chat_carts enable row level security;
alter table chat_carts force row level security;
create policy tenant_isolation on chat_carts
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update, delete on chat_carts to alyr_app;
