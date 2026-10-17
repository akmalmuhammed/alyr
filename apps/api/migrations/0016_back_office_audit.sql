-- The internal tool, phase 1 (decision D-033): an audit log of every staff action, the
-- staff list with names, snoozed items on Today, and the cross-business reads Today needs.

-- Every change ALYR staff make in the back office, written in the same transaction as
-- the change. The app may add entries and read them; nobody may edit or remove one.
create table platform_audit (
    id bigint generated always as identity primary key,
    at timestamptz not null default now(),
    staff_email text not null,
    staff_name text not null default '',
    action text not null,
    subject_type text not null,
    subject_id text not null default '',
    client_id uuid,
    business_id uuid,
    detail jsonb not null default '{}'
);
create index platform_audit_at on platform_audit (at desc);
create index platform_audit_client on platform_audit (client_id, at desc);

create function platform_audit_append_only() returns trigger
language plpgsql as $$
begin
    raise exception 'the audit log cannot be changed' using errcode = '42501';
end $$;
create trigger platform_audit_append_only before update or delete on platform_audit
    for each row execute function platform_audit_append_only();

alter table platform_audit enable row level security;
alter table platform_audit force row level security;
create policy platform_audit_read on platform_audit for select using (is_back_office());
create policy platform_audit_write on platform_audit for insert with check (is_back_office());
grant select, insert on platform_audit to alyr_app;

-- Staff have names and we know who added them.
alter table platform_admins
    add column name text not null default '',
    add column added_by text not null default '';

-- A Today item set aside until a date ("remind me on Sunday").
create table today_snoozes (
    item_key text primary key,
    until timestamptz not null,
    by_email text not null default '',
    created_at timestamptz not null default now()
);
alter table today_snoozes enable row level security;
alter table today_snoozes force row level security;
create policy today_snoozes_back_office on today_snoozes for all
    using (is_back_office()) with check (is_back_office());
grant select, insert, update, delete on today_snoozes to alyr_app;

-- Add or remove ALYR staff. The last one cannot be removed, so the back office is never
-- locked out.
create function admin_add_staff(p_email text, p_name text, p_by text) returns void
language plpgsql security definer set search_path = public as $$
begin
    perform assert_platform_admin();
    insert into platform_admins (email, name, added_by) values (lower(p_email), p_name, p_by)
        on conflict (email) do update set name = excluded.name;
end $$;

create function admin_remove_staff(p_email text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
    perform assert_platform_admin();
    if (select count(*) from platform_admins) <= 1 then
        raise exception 'the last member of ALYR staff cannot be removed' using errcode = '42501';
    end if;
    delete from platform_admins where email = lower(p_email);
    return found;
end $$;

-- Staff with their last sign-in.
create function admin_staff()
returns table (email text, name text, added_by text, created_at timestamptz,
               last_sign_in timestamptz)
language plpgsql security definer set search_path = public as $$
begin
    perform assert_platform_admin();
    return query
    select p.email, coalesce(nullif(p.name, ''), u.name, ''), p.added_by, p.created_at,
           (select max(s.created_at) from sessions s where s.user_id = u.id)
    from platform_admins p left join users u on u.email = p.email
    order by p.created_at;
end $$;

-- Messages that failed and jobs that gave up, per business, over the last 7 days.
-- Counts only: the back office never reads what customers wrote.
create function admin_delivery_problems()
returns table (tenant_id uuid, name text, failed_messages bigint, failed_jobs bigint,
               last_failure timestamptz)
language plpgsql security definer set search_path = public as $$
begin
    perform assert_platform_admin();
    return query
    select t.id, t.name,
           (select count(*) from messages m where m.tenant_id = t.id and m.status = 'failed'
              and m.created_at > now() - interval '7 days'),
           (select count(*) from jobs j where j.tenant_id = t.id and j.status = 'failed'
              and j.created_at > now() - interval '7 days'),
           greatest(
             (select max(m.created_at) from messages m where m.tenant_id = t.id
                and m.status = 'failed'),
             (select max(j.finished_at) from jobs j where j.tenant_id = t.id
                and j.status = 'failed'))
    from tenants t;
end $$;

revoke all on function admin_add_staff(text, text, text) from public;
revoke all on function admin_remove_staff(text) from public;
revoke all on function admin_staff() from public;
revoke all on function admin_delivery_problems() from public;
grant execute on function admin_add_staff(text, text, text) to alyr_app;
grant execute on function admin_remove_staff(text) to alyr_app;
grant execute on function admin_staff() to alyr_app;
grant execute on function admin_delivery_problems() to alyr_app;
