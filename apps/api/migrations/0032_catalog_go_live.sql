-- The Catalog is switched on (ALY-113, decision D-039).
--
-- 1. Shops that already exist get the Catalog module. A shop is a row in `tenant_modules` per
--    module; until now no shop had a `catalog` row, so the Catalog was off for everyone. New
--    shops get it from onboarding (`Settings.catalog_for_new_shops`, now on); this gives the
--    same to the shops made before. Every business type has a catalog except travel and
--    documents (`presets.py`), so those two are left alone; a business with no type of its
--    own (made in the back office) gets the plain Catalog, as `presets_catalog.setup_for`
--    says. A wholesaler's catalog needs the orders module (ALY-107: its customers order from
--    the price list), so a wholesaler gets that too.
-- 2. The activity record gets a subject for the Catalog's settings (who changed what: whether
--    agents may edit items, the low-stock number, how sold-out items look, staff numbers,
--    price groups, categories; `modules/items/changes.py`).
--
-- Safe to run on a database that has data, and to run again:
-- * a business row with no modules at all is not a shop (ALYR's own placeholder row) and is
--   left alone;
-- * a module the shop already has a row for is never touched, so a shop whose Catalog the back
--   office switched off before this ran stays off, and the back office can still switch it
--   off for any shop afterwards;
-- * it changes nothing else about a shop: no setting, category, item or sample is written
--   (the shop keeps the starting values it always had; the Catalog's samples are for new
--   shops only), so no existing shop behaves differently apart from gaining the screens.
--
-- Row-level security stays forced: each shop is selected the way 0017 does it, and the shop is
-- named in the insert as well.

alter table activity drop constraint activity_subject_check;
alter table activity add constraint activity_subject_check
    check (subject in ('conversation', 'order', 'booking', 'account', 'item', 'catalog'));

-- 3. The back office switches the Catalog on or off for one shop. A shop's modules are rows
--    the app role cannot write for another shop, so this goes through a narrow function, as
--    `admin_set_business_client` does. It only touches the one row asked for, and the route
--    that calls it (`routes/admin.py`) allows the Catalog and nothing else.
create function admin_set_module(p_tenant uuid, p_module text, p_enabled boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
    v_before text := coalesce(current_setting('app.tenant_id', true), '');
begin
    perform assert_platform_admin();
    if not exists (select 1 from tenants where id = p_tenant) then
        return false;
    end if;
    perform set_config('app.tenant_id', p_tenant::text, true);
    insert into tenant_modules (tenant_id, module_key, enabled, enabled_at, enabled_by)
        values (p_tenant, p_module, p_enabled, now(), 'ALYR back office')
        on conflict (tenant_id, module_key) do update
        set enabled = excluded.enabled, enabled_at = now(), enabled_by = excluded.enabled_by;
    perform set_config('app.tenant_id', v_before, true);
    return true;
end $$;
revoke all on function admin_set_module(uuid, text, boolean) from public;
grant execute on function admin_set_module(uuid, text, boolean) to alyr_app;

do $$
declare
    t record;
begin
    for t in
        select id, business_type from tenants
        where business_type not in ('travel', 'documents')
    loop
        perform set_config('app.tenant_id', t.id::text, true);
        -- A row with no modules at all is not a shop (ALYR's own placeholder row, say).
        if not exists (select 1 from tenant_modules where tenant_id = t.id) then
            continue;
        end if;
        insert into tenant_modules (tenant_id, module_key, enabled_by)
            values (t.id, 'catalog', 'ALYR go-live (migration 0032)')
            on conflict (tenant_id, module_key) do nothing;
        if t.business_type = 'wholesale' then
            insert into tenant_modules (tenant_id, module_key, enabled_by)
                values (t.id, 'orders', 'ALYR go-live (migration 0032)')
                on conflict (tenant_id, module_key) do nothing;
        end if;
    end loop;
    perform set_config('app.tenant_id', '', true);
end $$;
