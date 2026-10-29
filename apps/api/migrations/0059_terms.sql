-- Terms and the privacy notice, accepted at sign-up and again when a new version is published
-- (ALY-167, D-067, spec 031).
--
-- `terms_versions` is ALYR's own list of what an owner is asked to accept: the customer
-- agreement and the privacy notice, each with a version, where it is read in English and in
-- Arabic, and what changed. Every business may read it (the sign-up screen shows it before the
-- business exists); only the back office adds to it, and a published version never changes
-- (a correction is a new version). The newest version of each kind is the current one.
--
-- `terms_acceptances` is a business's own record of who accepted which version, when, and from
-- where. It is append-only: the app may add to it, never change or remove it, because a record
-- that can be edited proves nothing.

create table terms_versions (
    id uuid primary key default gen_random_uuid(),
    kind text not null check (kind in ('agreement', 'privacy')),
    version text not null check (version <> ''),
    title text not null,
    title_ar text not null,
    -- Where the text is read: a path on alyr.qa ("/privacy") or an https address.
    url text not null check (url like '/%' or url like 'https://%'),
    url_ar text not null check (url_ar like '/%' or url_ar like 'https://%'),
    -- What is different from the version before, in a sentence, for the owner who is asked again.
    changes text not null default '',
    changes_ar text not null default '',
    published_at timestamptz not null default now(),
    published_by text not null default '',
    unique (kind, version)
);

alter table terms_versions enable row level security;
alter table terms_versions force row level security;
create policy terms_versions_read on terms_versions for select using (true);
create policy terms_versions_back_office on terms_versions for insert
    with check (is_back_office());
grant select, insert on terms_versions to alyr_app;

create table terms_acceptances (
    id bigserial primary key,
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    version_id uuid not null references terms_versions(id),
    user_id uuid references users(id),
    -- The owner's name when they accepted, kept as written.
    accepted_by text not null default '',
    accepted_at timestamptz not null default now(),
    ip text not null default '',
    user_agent text not null default '',
    unique (tenant_id, version_id)
);
create index terms_acceptances_tenant on terms_acceptances (tenant_id, accepted_at);

alter table terms_acceptances enable row level security;
alter table terms_acceptances force row level security;
create policy tenant_isolation on terms_acceptances
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert on terms_acceptances to alyr_app;
grant usage on sequence terms_acceptances_id_seq to alyr_app;

-- The privacy notice as it is published on the site (ALY-72, 28 Oct 2026). The customer
-- agreement is not listed: it waits for the lawyer (ALY-98, ALY-51), and the founder publishes
-- it from the back office when it is ready, which asks every owner once.
select set_config('app.platform_admin', 'on', true);
insert into terms_versions (kind, version, title, title_ar, url, url_ar, changes, changes_ar,
                            published_at, published_by)
values ('privacy', '2026-10-28', 'ALYR privacy notice', 'إشعار الخصوصية لدى ALYR',
        '/privacy', '/ar/privacy', '', '', '2026-10-28 00:00:00+03', 'Published with the site');
select set_config('app.platform_admin', '', true);
