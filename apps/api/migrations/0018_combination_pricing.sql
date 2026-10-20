-- Combination pricing (ALY-99, decision D-035; the founder, 17 Oct 2026).
--
-- A business pays its first product at QAR 449 a month and each product it adds at
-- QAR 150: ALYR Chat and ALYR Bookings together are QAR 599, and with ALYR Accounts
-- QAR 749. ALYR Agent is always included, as a QAR 0 line. The price list gains one item
-- with a new rule, `extra_product`, whose price each product beyond a business's first
-- is charged at when a quote is drafted (`pricing.draft_lines`). Quotes already made keep
-- their own lines.

select set_config('app.platform_admin', 'on', true);

alter table price_items drop constraint price_items_applies_check;
alter table price_items add constraint price_items_applies_check
    check (applies ~ '^(each_business|each_client|manual|extra_product|product:[a-z_]+|module:[a-z_]+)$');

-- ALYR Accounts as a business's only product is priced like the others. It started at
-- QAR 0 (0015); a price ALYR set since then is left alone.
update price_items
    set price = 44900, updated_at = now(), updated_by = 'Combination pricing, 17 Oct 2026'
    where key = 'credit' and price = 0;

insert into price_items (key, name, name_ar, kind, price, applies, sort, updated_by) values
    ('extra_product', 'Each extra product', 'كل منتج إضافي', 'monthly', 15000, 'extra_product',
     26, 'Combination pricing, 17 Oct 2026')
on conflict (key) do nothing;

select set_config('app.platform_admin', '', true);
