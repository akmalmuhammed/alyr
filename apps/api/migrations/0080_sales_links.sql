-- Sales links: a quote made on a visit opens sign-up at the pay step (ALY-216, D-105 to D-108,
-- spec 041).
--
-- A lead is a client with no business yet. Its plan (the type of business, the Arabic name, the
-- area) is kept on the client, so the quote engine can draft the first quote from the price list
-- for that type before the owner has signed up. ALY-84 builds the pipeline around leads; this is
-- only what the link needs.
--
-- A sales link is one offer to one lead: a signed token in the address (core/links.py, purpose
-- `sales`; the token is not stored, it is made again from this row), a life, and a record of what
-- came of it. ALYR's own table, like `quotes`: the back office reads and writes it with forced
-- row-level security; the owner's public page reaches it only through the API, which declares it
-- is ALYR (core/access.py `office`) and names one link.

alter table clients
    add column prospect jsonb check (prospect is null or jsonb_typeof(prospect) = 'object');

create table sales_links (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references clients(id),
    created_at timestamptz not null default now(),
    created_by text not null default '',
    expires_at timestamptz not null,
    revoked_at timestamptz,
    revoked_by text not null default '',
    revoked_reason text not null default '' check (revoked_reason in ('', 'by_hand', 'replaced', 'email_changed')),
    opens integer not null default 0,
    first_opened_at timestamptz,
    last_opened_at timestamptz,
    -- The owner proved the email the code went to.
    verified_at timestamptz,
    -- Used: the business that was made, joined to the lead's client.
    claimed_at timestamptz,
    claimed_tenant uuid references tenants(id),
    check ((claimed_at is null) = (claimed_tenant is null))
);

-- A client has at most one link that is neither revoked nor used. Making a new one revokes the
-- old one first (core/sales_link.py).
create unique index sales_links_one_live on sales_links (client_id)
    where revoked_at is null and claimed_at is null;
create index sales_links_client on sales_links (client_id, created_at desc);

alter table sales_links enable row level security;
alter table sales_links force row level security;
create policy sales_links_back_office on sales_links for all
    using (is_back_office()) with check (is_back_office());
grant select, insert, update on sales_links to alyr_app;
