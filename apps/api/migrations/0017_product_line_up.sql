-- The product line-up of 17 Oct 2026 (ALY-99, decision D-035): ALYR Chat, ALYR Bookings
-- (split out of Chat), ALYR Agent (included for every business), ALYR Accounts (what was
-- called Credit accounts) and ALYR Payroll, still coming.
--
-- Products are bundles of modules declared in `catalog.py`. No table records which
-- product a business bought: a business's modules (`tenant_modules`) say it, and module
-- keys do not change. So only the rows that name a product by its key change here:
--   * the price list, which applies items per product (D-032);
--   * setup requests, filed under a product.
-- Quotes are left alone: each keeps its own copy of what was offered, and an accepted
-- quote cannot change (0015). Weekly reports are stored per module, not per product.
--
-- The migration declares itself the back office and steps through each business's own
-- scope, so it works the same whether or not the role running it bypasses row-level
-- security.

select set_config('app.platform_admin', 'on', true);

-- Items that applied to businesses using Credit accounts now apply to ALYR Accounts.
update price_items set applies = 'product:accounts' where applies = 'product:credit';

-- The starting item takes the product's new name, unless ALYR renamed it already. Its
-- key stays 'credit': quotes made from it refer to that key.
update price_items
    set name = 'ALYR Accounts', name_ar = 'ALYR Accounts', updated_at = now(),
        updated_by = 'Product line-up, 17 Oct 2026'
    where key = 'credit' and name = 'Credit accounts';

-- ALYR Bookings is priced as ALYR Chat was for an appointment business, so a salon's
-- draft quote stays QAR 449 a month. ALYR Agent is included: a line at QAR 0, so the
-- quote shows what the subscription brings. Both are editable in the back office.
insert into price_items (key, name, name_ar, kind, price, applies, sort, updated_by) values
    ('bookings', 'ALYR Bookings', 'ALYR Bookings', 'monthly', 44900, 'product:bookings', 15,
     'Product line-up, 17 Oct 2026'),
    ('agent', 'ALYR Agent, included', 'ALYR Agent، مشمول', 'monthly', 0, 'product:agent', 25,
     'Product line-up, 17 Oct 2026')
on conflict (key) do nothing;

select set_config('app.platform_admin', '', true);

-- Setup requests filed under the old keys. The bookings steps (services, opening hours)
-- now belong to ALYR Bookings, and so does the setup request of an appointment business
-- that ALYR sets up with the owner.
do $$
declare
    t uuid;
begin
    for t in select id from tenants loop
        -- Both the scope and an explicit filter: a role that bypasses row-level security
        -- would otherwise see every business's modules.
        perform set_config('app.tenant_id', t::text, true);
        update setup_requests set product_key = 'accounts'
            where tenant_id = t and product_key = 'credit';
        update setup_requests set product_key = 'bookings'
            where tenant_id = t and product_key = 'chat' and step_key in ('services', 'hours');
        update setup_requests set product_key = 'bookings'
            where tenant_id = t and product_key = 'chat' and step_key = 'onboarding'
              and exists (select 1 from tenant_modules m where m.tenant_id = t
                          and m.module_key = 'bookings' and m.enabled)
              and not exists (select 1 from tenant_modules m where m.tenant_id = t
                              and m.module_key = 'orders' and m.enabled);
    end loop;
    perform set_config('app.tenant_id', '', true);
end $$;
