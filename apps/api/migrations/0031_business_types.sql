-- Business-type templates for the Catalog (ALY-107, decision D-039).
--
-- 1. Sample items. A type can start a shop with believable examples so the screens are not
--    empty. A sample is marked (`is_sample`), carries a key the screens draw its tile from
--    (`sample_key`, no photo is stored), and is a draft for as long as it is a sample: the
--    check below means a sample can never be for sale, so it can never reach a customer. An
--    owner makes one theirs by saving it (the flag is cleared) or removes every sample in one
--    step. Existing items are not samples.
-- 2. The starting values a type gives a shop, which the owner can change: whether sold-out
--    items are greyed or left out of the order page, how a new item runs out by default, and
--    whether the low-stock and sold-out alerts are on. The defaults are what every shop has
--    today (greyed, "on or off", both alerts on), so no existing shop behaves differently.
--
-- Nothing here is visible to an owner or a customer by itself: the Catalog module is off for
-- every shop until the go-live sweep (ALY-113), and the three business types that exist only
-- for the Catalog are not offered until `catalog_for_new_shops` is switched on.

alter table items
    add column is_sample boolean not null default false,
    add column sample_key text not null default '';
alter table items add constraint items_sample_is_draft check (not is_sample or status = 'draft');
create index items_samples on items (tenant_id) where is_sample;

alter table shop_settings
    add column sold_out_display text not null default 'grey'
        check (sold_out_display in ('grey', 'hide')),
    add column new_item_rule text not null default 'switch'
        check (new_item_rule in ('always', 'switch', 'count', 'daily_limit')),
    add column alert_low_stock boolean not null default true,
    add column alert_sold_out boolean not null default true;
