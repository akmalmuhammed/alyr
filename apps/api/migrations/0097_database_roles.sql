-- ALY-125, part 3 (SEC-2, SEC-5, D-137): the back office and the worker are roles, not a setting
-- anyone may write.
--
-- Until now the guards that keep ALYR's cross-business powers to ALYR trusted a transaction-local
-- setting: `app.platform_admin = 'on'` opened the back office's tables and functions
-- (`is_back_office()`, `assert_platform_admin()`), and `app.worker = 'on'` opened every business's
-- jobs. Any code running as the application role can write a setting, so a bug that ran one SQL
-- statement of an attacker's choosing as `alyr_app` could read all clients, call `admin_add_staff`
-- or read every business's jobs. (Proved on 29 Oct 2026 in a rolled-back transaction.)
--
-- After this migration a guard has a second condition: while `role_guard.enforced` is true, the
-- login that made the connection (`session_user`) must be `alyr_admin` or `alyr_worker`
-- (migrate.py creates them; each is a member of `alyr_app`, so it can do whatever the application
-- can, and nothing more is granted), or the database's owner (migrations, the first-admin job,
-- the erasure job). `alyr_app` is not a member of either, and cannot make itself one.
--
-- `enforced` starts FALSE, so applying this migration changes nothing at all: every guard still
-- reads only the setting, as before. The founder switches it on, after the API and the worker
-- sign in as their new roles, with `python -m alyr.db_roles enforce`
-- (infra/gcp/roles.sh, docs/runbooks/database-roles.md), and can switch it off again at once.
--
-- `session_user`, not `current_user`: inside a SECURITY DEFINER function `current_user` is the
-- function's owner, and `SET ROLE` changes it; `session_user` is who signed in.

create table role_guard (
    only_row boolean primary key default true check (only_row),
    enforced boolean not null default false,
    changed_at timestamptz not null default now()
);
insert into role_guard (only_row) values (true);
-- Read by every guard, in the caller's own transaction; written only by the owner.
grant select on role_guard to alyr_app;

create function role_guard_enforced() returns boolean
language sql stable as $$
    select coalesce((select enforced from role_guard), false)
$$;

-- Who counts as the database's own: its owner, and a superuser.
create function is_database_owner() returns boolean
language sql stable as $$
    select session_user = (select pg_get_userbyid(datdba) from pg_database
                           where datname = current_database())
        or coalesce((select rolsuper from pg_roles where rolname = session_user), false)
$$;

-- May this login carry the back office's declaration? Anyone, while the guard is not enforced.
create function is_back_office_role() returns boolean
language sql stable as $$
    select not role_guard_enforced()
        or is_database_owner()
        or pg_has_role(session_user, 'alyr_admin', 'member')
        or pg_has_role(session_user, 'alyr_worker', 'member')
$$;

-- May this login claim every business's jobs? Anyone, while the guard is not enforced.
create function is_worker_role() returns boolean
language sql stable as $$
    select not role_guard_enforced()
        or is_database_owner()
        or pg_has_role(session_user, 'alyr_worker', 'member')
$$;

-- The back office's two guards keep reading the setting (the API's declaration that it checked
-- the caller, D-033) and now also ask which login declared it.
create or replace function is_back_office() returns boolean
language sql stable as $$
    select coalesce(current_setting('app.platform_admin', true), '') = 'on'
        and is_back_office_role()
$$;

create or replace function assert_platform_admin() returns void
language plpgsql as $$
begin
    if coalesce(current_setting('app.platform_admin', true), '') <> 'on'
       or not is_back_office_role() then
        raise exception 'back office only' using errcode = '42501';
    end if;
end $$;

-- A business sees its own jobs; the worker, which serves every business, declares itself with a
-- setting while it claims work, and now has to be the worker's login too.
alter policy tenant_isolation on jobs
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
           or (current_setting('app.worker', true) = 'on' and is_worker_role()))
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
                or (current_setting('app.worker', true) = 'on' and is_worker_role()));
