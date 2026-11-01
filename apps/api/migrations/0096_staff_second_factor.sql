-- ALY-125, part 2: a second factor for ALYR staff (D-136).
--
-- One row per member of ALYR staff who has begun to set up an authenticator app. Global, like
-- `platform_admins`: these people belong to ALYR, not to a shop. No row-level security;
-- listed on the global tables in tests/test_tenant_isolation.py and in core/erase_rules.py.
--
-- `secret_sealed` is the TOTP secret sealed with AES-256-GCM under a key derived from
-- ALYR_LINK_SECRET (core/second_factor.py), with the email bound in. `pending_sealed` is a
-- secret being set up: it does nothing until its first right code, so a replacement that is
-- started and abandoned leaves the working factor as it was. `last_step` is the newest
-- 30-second step a code was accepted for; a code for that step or an older one is refused, so a
-- code seen once cannot be used again. `enrol_open_until` is how the break-glass lets a
-- member of staff enrol while the second factor is required and they have none.
create table staff_factors (
    email text primary key check (email = lower(email)),
    secret_sealed text,
    pending_sealed text,
    confirmed_at timestamptz,
    last_step bigint not null default 0,
    enrol_open_until timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check ((confirmed_at is null) = (secret_sealed is null))
);

-- One-time recovery codes. Only a keyed hash is stored (HMAC-SHA256 under a key derived from
-- ALYR_LINK_SECRET), so a copy of the database cannot be used to find a code. A code is
-- spent by setting `used_at`, once.
create table staff_recovery_codes (
    email text not null check (email = lower(email)),
    code_hash text not null,
    created_at timestamptz not null default now(),
    used_at timestamptz,
    primary key (email, code_hash)
);

-- When a session passed the second factor. A session counts as verified only if this is not
-- earlier than the factor's `confirmed_at`, so replacing or removing the factor ends every
-- session that relied on the old one.
alter table sessions add column second_factor_at timestamptz;

grant select, insert, update, delete on staff_factors, staff_recovery_codes to alyr_app;
