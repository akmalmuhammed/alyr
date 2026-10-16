-- The weekly result report (ALY-75, decision D-030). Every Sunday morning the owner
-- hears in numbers what ALYR did for the shop the week before. What was sent is kept,
-- so a week is never reported twice.

-- Which of the shop's own WhatsApp numbers (staff contacts) receive the report.
alter table contacts add column weekly_report boolean not null default false;
alter table contacts add constraint contacts_weekly_report_staff
    check (not weekly_report or role = 'staff');

-- A shop can switch the report off.
alter table shop_settings add column weekly_report boolean not null default true;

create table weekly_reports (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    -- The Sunday the reported week began, in the shop's time zone.
    week_start date not null,
    -- The numbers, per section, as they were when the report was made.
    sections jsonb not null,
    sent_at timestamptz,
    created_at timestamptz not null default now(),
    primary key (tenant_id, week_start)
);
alter table weekly_reports enable row level security;
alter table weekly_reports force row level security;
create policy tenant_isolation on weekly_reports
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
-- Delete only so the demo shop can be reset; nothing else removes a report.
grant select, insert, update, delete on weekly_reports to alyr_app;
