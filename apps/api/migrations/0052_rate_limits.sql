-- Rate limits (ALY-116). One row per counted request to an open door: asking for a sign-in code,
-- guessing one, signing up, placing an order or a booking from a customer page.
--
-- `key` is a SHA-256 of the email or address being counted, never the value itself: an address
-- is personal data and nothing here needs to read it back. Not tenant-owned (the requester is
-- nobody's customer yet), so no tenant_id and no row-level security; listed on the global tables
-- in tests/test_tenant_isolation.py. Rows older than a day are removed as new ones are written.
create table rate_hits (
    bucket text not null,
    key text not null,
    at timestamptz not null default now()
);
create index rate_hits_lookup on rate_hits (bucket, key, at);
create index rate_hits_age on rate_hits (at);

grant select, insert, delete on rate_hits to alyr_app;
