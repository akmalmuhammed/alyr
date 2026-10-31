-- ALY-125, part 1: tell an ALYR staff member when their account signs in from somewhere new.
--
-- One row per device or address an ALYR staff member has signed in from. `value` is a SHA-256
-- of the browser's user-agent text ("device") or of the visitor's address ("address"): the
-- table only has to answer "have I seen this before?", never to show an address back. The
-- address itself goes in the audit log entry for the sign-in (platform_audit), where ALYR's
-- staff read it.
--
-- Global, not tenant-owned: these people belong to ALYR, not to a shop. No row-level security,
-- like `rate_hits`; listed on the global tables in tests/test_tenant_isolation.py and in
-- core/erase_rules.py (ALYR's own staff are never touched by an erasure).
create table staff_known (
    email text not null check (email = lower(email)),
    kind text not null check (kind in ('device', 'address')),
    value text not null,
    first_seen timestamptz not null default now(),
    last_seen timestamptz not null default now(),
    primary key (email, kind, value)
);

grant select, insert, update on staff_known to alyr_app;
