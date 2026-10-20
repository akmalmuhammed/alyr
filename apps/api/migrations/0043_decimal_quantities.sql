-- Decimal and weight quantities (ALY-149, decision D-039 "As built (decimal quantities)").
--
-- Until now every quantity was an integer, and the unit `kg` was only a label. A customer
-- could not order 0.5 kg of dates or 250 ml of oud, and a shop could not hold 12.5 kg. Now a
-- quantity is an exact decimal with three places: `numeric(14,3)`. Never a float.
--
-- What changes, and what does not:
--
-- * Every column that counts units becomes numeric(14,3) with the value it had: order lines,
--   stock holds, the stock log (delta, balance_after), a daily allowance's running total, a
--   size's stock and daily limit, an item's smallest order, pack size and low-stock number,
--   and the shop's and the templates' low-stock number. A whole number stays whole (3 becomes
--   3.000 and is read back as 3), so a shop that never sells a fraction sees nothing change.
-- * `items.pack_size` is the item's STEP (sold in lots of that much: 6 pieces, or 0.25 kg) and
--   `items.min_order` its smallest order (1 piece, or 0.25 kg). No new column: the step and the
--   minimum of a measure are the pack size and the minimum of any item.
-- * The constraints keep their meaning. A line's quantity is above zero; stock is not below
--   zero (the single conditional update in modules/items/stock.py still moves the number and
--   writes the log row together); `min_order` was "at least 1" and is now "above zero"
--   because 0.25 kg is a smallest order too.
-- * Only a MEASURE (kg, g, litre, ml, metre, tola) may hold a fraction. The database refuses a
--   fraction on a counted unit (piece, pack, box, portion, hour): in an item's minimum and pack
--   size, in an order line, and in a size's stock, a daily limit and a day's allowance.
-- * The units widen: g, l, ml, m and tola join the six units that were already allowed (the
--   keys `l` and `m` are the ones the Documents engine uses). The documents' own list gets
--   `ml` and `tola` so a document can be made from an order.
-- * "Sold by weight or volume" is a feature (`decimal_quantity`). Every shop that exists gets a
--   row that says OFF, so none of them behaves differently; a new shop of a type that weighs or
--   pours (grocery, bakery) starts with it on.
-- * An order line keeps the unit it was ordered in (`order_items.unit`). Lines made before this
--   keep the default `piece`, which shows a bare number exactly as they always did; no old
--   row is rewritten.
-- * Row-level security is untouched: no table is made or dropped, no policy changes.
--
-- Safe on a database with data: ALTER COLUMN TYPE rewrites each table once, inside this
-- migration's transaction, with `using col::numeric(14,3)` so no value moves.

-- ----------------------------------------------------------------- the measures

-- (1) items: the unit list, then the three columns.
alter table items drop constraint items_unit_check;
alter table items add constraint items_unit_check check (unit in (
    'piece', 'kg', 'box', 'pack', 'portion', 'hour', 'g', 'l', 'ml', 'm', 'tola'));

alter table items
    drop constraint items_min_order_check,
    drop constraint items_pack_size_check,
    alter column pack_size type numeric(14, 3) using pack_size::numeric(14, 3),
    alter column min_order type numeric(14, 3) using min_order::numeric(14, 3),
    alter column low_stock_at type numeric(14, 3) using low_stock_at::numeric(14, 3);
alter table items alter column min_order set default 1;
alter table items
    add constraint items_pack_size_check check (pack_size > 0),
    add constraint items_min_order_check check (min_order > 0),
    add constraint items_whole_unless_measure check (
        unit in ('kg', 'g', 'l', 'ml', 'm', 'tola')
        or (min_order = trunc(min_order) and (pack_size is null or pack_size = trunc(pack_size))));

-- (2) sizes and colours: stock and daily limit.
alter table item_variants
    alter column on_hand type numeric(14, 3) using on_hand::numeric(14, 3),
    alter column daily_limit type numeric(14, 3) using daily_limit::numeric(14, 3);
alter table item_variants alter column on_hand set default 0;

alter table variant_day_stock
    alter column delta type numeric(14, 3) using delta::numeric(14, 3);

-- (3) the stock log and the holds.
alter table stock_movements
    alter column delta type numeric(14, 3) using delta::numeric(14, 3),
    alter column balance_after type numeric(14, 3) using balance_after::numeric(14, 3);
alter table stock_holds
    alter column quantity type numeric(14, 3) using quantity::numeric(14, 3);

-- (4) order lines, with the unit each was ordered in.
alter table order_items
    alter column quantity type numeric(14, 3) using quantity::numeric(14, 3),
    add column unit text not null default 'piece' check (unit in (
        'piece', 'kg', 'box', 'pack', 'portion', 'hour', 'g', 'l', 'ml', 'm', 'tola')),
    -- Whether the line was ordered by an item sold in fractions: only then is the unit written
    -- beside the quantity ("0.5 kg"). A line from before, and a line of a kilo item sold in whole
    -- numbers, read as they always did ("3").
    add column unit_shown boolean not null default false;
alter table order_items add constraint order_items_whole_unless_measure check (
    unit in ('kg', 'g', 'l', 'ml', 'm', 'tola') or quantity = trunc(quantity));

-- (5) the shop's and the templates' low-stock number.
alter table shop_settings
    alter column low_stock_at type numeric(14, 3) using low_stock_at::numeric(14, 3);
alter table shop_settings alter column low_stock_at set default 5;
alter table business_templates
    alter column low_stock_at type numeric(14, 3) using low_stock_at::numeric(14, 3);
alter table business_templates alter column low_stock_at set default 5;
alter table business_templates drop constraint business_templates_unit_check;
alter table business_templates add constraint business_templates_unit_check check (unit in (
    'piece', 'kg', 'box', 'pack', 'portion', 'hour', 'g', 'l', 'ml', 'm', 'tola'));

-- (6) Every shop that exists keeps its form: "Sold by weight or volume" is off for it, whatever its
-- type would start a new shop with. A new shop gets its type's value when it is made; an owner
-- switches it on in Features. (Forced row-level security is lifted for the length of this
-- transaction, as migration 0035 did, so an owner that does not bypass it can write every shop's row.)
alter table shop_features no force row level security;
insert into shop_features (tenant_id, key, enabled, config, set_by, updated_by)
select t.id, 'decimal_quantity', false, '{}'::jsonb, 'template', 'ALYR migration'
from tenants t
on conflict do nothing;
alter table shop_features force row level security;

-- (7) the Documents engine can carry the two new units.
alter table document_lines drop constraint document_lines_unit_check;
alter table document_lines add constraint document_lines_unit_check check (unit in (
    'piece', 'kg', 'g', 'l', 'm', 'box', 'pack', 'portion', 'hour', 'day', 'service',
    'ml', 'tola'));

-- -------------------------------------------------------- a fraction needs a measure

-- A size's stock, daily limit and day's allowance may be a fraction only if the item's unit is a
-- measure. The test costs nothing for a whole number (the usual case): the item is looked up
-- only when a fraction is being written.
create function qty_whole_guard() returns trigger language plpgsql as $$
declare
    v_item uuid;
    v_unit text;
begin
    if tg_table_name = 'item_variants' then
        if (new.on_hand = trunc(new.on_hand)
            and (new.daily_limit is null or new.daily_limit = trunc(new.daily_limit))) then
            return new;
        end if;
        v_item := new.item_id;
    else
        if new.delta = trunc(new.delta) then
            return new;
        end if;
        select item_id into v_item from item_variants where id = new.variant_id;
    end if;
    select unit into v_unit from items where id = v_item;
    if v_unit is null or v_unit not in ('kg', 'g', 'l', 'ml', 'm', 'tola') then
        raise exception 'only a measure (kg, g, litre, ml, metre, tola) may hold a fraction'
            using errcode = '23514';
    end if;
    return new;
end $$;

create trigger item_variants_whole_guard before insert or update of on_hand, daily_limit
    on item_variants for each row execute function qty_whole_guard();
create trigger variant_day_stock_whole_guard before insert or update of delta
    on variant_day_stock for each row execute function qty_whole_guard();
