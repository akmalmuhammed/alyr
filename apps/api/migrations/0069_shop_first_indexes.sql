-- A shop's rows are found without reading every other shop's (go-live checklist item 33,
-- ALY-275, D-076). Measured on a copy at production sizes (300 shops, 50k orders, 244k jobs):
-- an order's lines were found by reading every shop's lines, and every job claim read the
-- whole queue looking for stuck jobs.

-- Every table that holds a shop's rows has an index that starts with tenant_id;
-- tests/test_tenant_isolation.py fails for a table without one. These had none.
create index order_items_order on order_items (tenant_id, order_id);
create index order_items_sold on order_items (tenant_id, item_id);
create index payment_requests_order on payment_requests (tenant_id, order_id);
create index payment_requests_paid on payment_requests (tenant_id, paid_at) where status = 'paid';
create index ledger_accounts_promised on ledger_accounts (tenant_id, promised_until);
create index services_shop on services (tenant_id, sort);
create index saved_replies_shop on saved_replies (tenant_id, created_at);
create index message_media_shop on message_media (tenant_id, message_id);
create index staff_pending_shop on staff_pending (tenant_id, created_at);
create index stock_alerts_shop on stock_alerts (tenant_id, day);
create index variant_day_stock_shop on variant_day_stock (tenant_id, day);
create index document_lines_shop on document_lines (tenant_id, document_id);
create index document_files_shop on document_files (tenant_id, document_id);

-- A customer's orders, and a shop's orders newest first (the workspace, ALYR Agent).
create index orders_contact on orders (tenant_id, contact_id);
create index orders_created on orders (tenant_id, created_at);

-- The job queue. Jobs left running by a process that died are found among the running ones
-- only; "is one already waiting for this item / this week" among the waiting ones only.
create index jobs_running on jobs (locked_at) where status = 'running';
create index jobs_waiting on jobs (tenant_id, kind) where status in ('queued', 'running');

-- Every shop has its default price group from the moment it exists. The order page used to
-- make it on the first read that found none, so a customer's read could write (PERF-13).
-- The shop is made by the owner role, which row-level security still applies to: the group
-- is written inside the new shop's scope, and the caller's scope is put back.
create function tenants_default_price_group() returns trigger
language plpgsql set search_path = public as $$
declare
    v_scope text := current_setting('app.tenant_id', true);
begin
    perform set_config('app.tenant_id', new.id::text, true);
    insert into price_groups (tenant_id, name, name_ar, is_default)
    values (new.id, 'Retail', 'التجزئة', true)
    on conflict do nothing;
    perform set_config('app.tenant_id', coalesce(v_scope, ''), true);
    return new;
end $$;

create trigger tenants_default_price_group after insert on tenants
    for each row execute function tenants_default_price_group();

-- Shops made since migration 0026 that no page has opened yet.
alter table price_groups no force row level security;
insert into price_groups (tenant_id, name, name_ar, is_default)
select t.id, 'Retail', 'التجزئة', true from tenants t
where not exists (select 1 from price_groups g where g.tenant_id = t.id and g.is_default)
on conflict do nothing;
alter table price_groups force row level security;
