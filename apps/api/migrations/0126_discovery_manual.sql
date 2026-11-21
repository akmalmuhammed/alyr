-- Discovery on a real business before Google is connected (D-169, spec 065 "As built: a real
-- business", the first client's audit). ALYR staff record what a remote audit saw, and a `manual`
-- source turns it into the snapshot the twelve rules score. Two things, additive:
--
-- 1. The three places that name a source learn `manual`. Their check constraints are read as they
--    stand and `manual` added (the way 0120 and 0130 do for the activity record), so a name a
--    parallel branch added is kept and nothing is assumed about how Postgres named them. Run twice
--    it changes nothing the second time. `discovery_proposals.connector_kind` is NOT widened: a
--    hand source makes no proposals.
--
-- 2. `discovery_observations`: one row is one place as staff saw it on one day, who recorded it and
--    when. Append-only: the app role may select and insert and nothing else (a correction is a
--    new row; a place that is removed takes its rows with it by the foreign key, which Postgres
--    runs as the table's owner). A block that staff did not record is null: "not checked", never
--    "nothing there". The text of a review and its author are never columns: `reviews` holds only
--    a rating, a date and whether it was answered (modules/discovery/observations.py refuses
--    anything else before it is stored). Forced row-level security and a tenant-first index like
--    the other Discovery tables (tests/test_discovery_tables.py).
--
-- Reserved for Discovery: migrations 0120 to 0129.

do $$
declare
    spec record;
    found record;
    kinds text[];
begin
    for spec in
        select * from (values
            ('discovery_connections', 'kind'),
            ('discovery_runs', 'connector_kind'),
            ('discovery_reviews', 'source')
        ) as v(tbl, col)
    loop
        for found in
            select c.conname, pg_get_constraintdef(c.oid) as def
              from pg_constraint c
             where c.conrelid = spec.tbl::regclass and c.contype = 'c'
               and position(spec.col || ' = ANY' in pg_get_constraintdef(c.oid)) > 0
               and position('''sample''' in pg_get_constraintdef(c.oid)) > 0
        loop
            select array_agg(m[1]) into kinds
              from regexp_matches(found.def, '''([a-z_]+)''::text', 'g') as m;
            if not ('manual' = any(kinds)) then
                execute format('alter table %I drop constraint %I', spec.tbl, found.conname);
                execute format(
                    'alter table %I add constraint %I check (%I = any (array[%s]::text[]))',
                    spec.tbl, found.conname, spec.col,
                    (select string_agg(quote_literal(k), ', ')
                       from unnest(array_append(kinds, 'manual')) k));
            end if;
        end loop;
    end loop;
end $$;

create table discovery_observations (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    location_id uuid not null references discovery_locations(id) on delete cascade,
    -- The day it was seen (not the day it was recorded): a finding's evidence carries it.
    observed_on date not null,
    recorded_at timestamptz not null default now(),
    -- The member of ALYR staff who recorded it, by name, as the back office knows them.
    recorded_by text not null check (btrim(recorded_by) <> '' and length(recorded_by) <= 160),
    -- Where it was seen, in staff's words: "the public Google Maps page; the contact page".
    seen_where text not null default '' check (length(seen_where) <= 300),
    -- Each block is null when it was not recorded ("not checked").
    listing jsonb check (listing is null or jsonb_typeof(listing) = 'object'),
    website jsonb check (website is null or jsonb_typeof(website) = 'object'),
    -- [{"rating": 1-5, "posted_on": "2026-11-01", "replied": false}]: never a name or a word.
    reviews jsonb check (reviews is null or jsonb_typeof(reviews) = 'array'),
    social jsonb check (social is null or jsonb_typeof(social) = 'object'),
    check (listing is not null or website is not null or reviews is not null or social is not null),
    -- A day that has not happened cannot have been seen (a day of slack for the zone).
    check (observed_on <= (recorded_at at time zone 'UTC')::date + 1)
);
create index discovery_observations_place
    on discovery_observations (tenant_id, location_id, recorded_at desc);

alter table discovery_observations enable row level security;
alter table discovery_observations force row level security;
create policy tenant_isolation on discovery_observations
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert on discovery_observations to alyr_app;
