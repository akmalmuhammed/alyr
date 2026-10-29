-- ALY-130, decision D-065 (written as D-040 and migration 0026 on 18 Oct; renumbered on
-- 28 Oct to follow main, to 0061 so it runs after every migration on main): owners and staff act on the shop from WhatsApp as well as from
-- the workspace. This migration gives a staff WhatsApp number an owner (a person who can
-- sign in), says which door each recorded action came through, and adds a per-person
-- channel preference.

-- A staff number belongs to one person, proved by a one-time code sent from the phone.
-- `verified_at` is when. The person's role is never copied here: it is read from their
-- membership each time, so removing them or changing their role takes effect at once.
alter table contacts
    add column user_id uuid references users(id) on delete set null,
    add column verified_at timestamptz;
alter table contacts add constraint contacts_user_is_staff
    check (user_id is null or role = 'staff');
-- One number per person per shop: linking a new number replaces the old one.
create unique index contacts_staff_user on contacts (tenant_id, user_id)
    where user_id is not null;

-- The one-time codes. Only a hash is stored. A code lasts ten minutes; every wrong try
-- against the shop counts against all of its live codes, and at ten the codes are dead.
create table staff_link_codes (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    user_id uuid not null references users(id) on delete cascade,
    code_hash text not null,
    attempts integer not null default 0,
    expires_at timestamptz not null,
    used_at timestamptz,
    created_at timestamptz not null default now()
);
create index staff_link_codes_live on staff_link_codes (tenant_id, code_hash)
    where used_at is null;
alter table staff_link_codes enable row level security;
alter table staff_link_codes force row level security;
create policy tenant_isolation on staff_link_codes
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update, delete on staff_link_codes to alyr_app;

-- Which door an action on the record came through, and a subject for the team itself
-- (a number linked or unlinked). The list keeps every subject the earlier migrations
-- allow (0034 is the last that changed it) and adds `team`.
alter table activity
    add column channel text not null default 'portal'
        check (channel in ('portal', 'whatsapp', 'system'));
alter table activity drop constraint activity_subject_check;
alter table activity add constraint activity_subject_check
    check (subject in ('conversation', 'order', 'booking', 'account', 'item', 'catalog', 'document',
                       'team'));

-- Where a person prefers to work. It decides where later phases nudge them, and it shows
-- which door each client uses.
alter table memberships
    add column channel_preference text not null default 'both'
        check (channel_preference in ('portal', 'whatsapp', 'both'));
