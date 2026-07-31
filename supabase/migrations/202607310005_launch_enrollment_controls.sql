begin;

-- Launch enrollment is intentionally closed until an operator changes this
-- singleton. The same row owns the account, household, pending-signup, and
-- blob ceilings so opening registration is one reviewable control-plane
-- change rather than a collection of unrelated feature flags.
create table public.launch_enrollment_controls (
  id smallint primary key default 1 check (id = 1),
  signup_mode text not null default 'closed_pilot'
    check (
      signup_mode in (
        'closed_pilot',
        'public_email',
        'public_email_google'
      )
    ),
  max_registered_users integer not null default 20
    check (max_registered_users between 1 and 1000000),
  max_households integer not null default 20
    check (max_households between 1 and 1000000),
  max_pending_signups integer not null default 20
    check (max_pending_signups between 1 and 100000),
  public_account_max_households integer not null default 1
    check (public_account_max_households between 1 and 3),
  max_attachment_bytes bigint not null default 10485760
    check (max_attachment_bytes between 1 and 104857600),
  household_storage_limit_bytes bigint not null default 41943040
    check (household_storage_limit_bytes between 1 and 1099511627776),
  global_storage_limit_bytes bigint not null default 838860800
    check (global_storage_limit_bytes between 1 and 1125899906842624),
  email_grant_ttl_seconds integer not null default 600
    check (email_grant_ttl_seconds between 120 and 1800),
  email_network_limit integer not null default 5
    check (email_network_limit between 1 and 100),
  email_network_window_seconds integer not null default 600
    check (email_network_window_seconds between 60 and 86400),
  email_address_limit integer not null default 3
    check (email_address_limit between 1 and 100),
  email_address_window_seconds integer not null default 3600
    check (email_address_window_seconds between 60 and 86400),
  google_network_limit integer not null default 10
    check (google_network_limit between 1 and 100),
  google_network_window_seconds integer not null default 600
    check (google_network_window_seconds between 60 and 86400),
  config_version bigint not null default 1
    check (config_version > 0),
  updated_at timestamptz not null default now(),
  check (household_storage_limit_bytes >= max_attachment_bytes),
  check (global_storage_limit_bytes >= household_storage_limit_bytes)
);

insert into public.launch_enrollment_controls (id)
values (1);

alter table public.launch_enrollment_controls enable row level security;
alter table public.launch_enrollment_controls force row level security;
revoke all on table public.launch_enrollment_controls
  from public, anon, authenticated;

-- HMAC key material is isolated from Auth event payloads, Edge requests, and
-- rate-limit tables. It makes network and email pseudonyms resistant to an
-- offline dictionary attack if an operational bucket export is exposed.
create table public.launch_enrollment_keys (
  id smallint primary key default 1 check (id = 1),
  key_material bytea not null default extensions.gen_random_bytes(32)
    check (octet_length(key_material) = 32),
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

insert into public.launch_enrollment_keys (id)
values (1);

alter table public.launch_enrollment_keys enable row level security;
alter table public.launch_enrollment_keys force row level security;
revoke all on table public.launch_enrollment_keys
  from public, anon, authenticated, supabase_auth_admin;

-- Both email preflight and OAuth Auth-hook reservations use this ledger.
-- Raw email addresses, IP addresses, provider subject identifiers, and bearer
-- grants are never retained. An email preflight keeps an idempotency key so a
-- lost response can be replayed without minting or reserving another slot.
create table public.launch_signup_reservations (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('email', 'google')),
  idempotency_key uuid unique,
  auth_user_id uuid,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  network_scope_hash text not null
    check (network_scope_hash ~ '^[0-9a-f]{64}$'),
  grant_hash text check (
    grant_hash is null or grant_hash ~ '^[0-9a-f]{64}$'
  ),
  control_version bigint not null check (control_version > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  hook_accepted_at timestamptz,
  consumed_by uuid,
  consumed_at timestamptz,
  check (expires_at > created_at),
  check ((consumed_by is null) = (consumed_at is null)),
  check (
    (
      provider = 'email'
      and idempotency_key is not null
      and grant_hash is not null
    )
    or (
      provider = 'google'
      and idempotency_key is null
      and grant_hash is null
      and auth_user_id is not null
      and hook_accepted_at is not null
    )
  )
);

create unique index launch_signup_reservations_auth_user
  on public.launch_signup_reservations(auth_user_id)
  where auth_user_id is not null;
create index launch_signup_reservations_email_pending
  on public.launch_signup_reservations(email_hash, expires_at)
  where consumed_at is null;
create index launch_signup_reservations_expiry
  on public.launch_signup_reservations(expires_at, id);

alter table public.launch_signup_reservations enable row level security;
alter table public.launch_signup_reservations force row level security;
revoke all on table public.launch_signup_reservations
  from public, anon, authenticated, supabase_auth_admin;

create or replace function public.heldat_launch_hmac(p_value text)
returns text
language plpgsql
security definer
stable
set search_path = public, extensions, pg_temp
as $$
declare
  v_key bytea;
begin
  if p_value is null or char_length(p_value) not between 1 and 2048 then
    raise exception 'ENROLLMENT_PSEUDONYM_INPUT_INVALID'
      using errcode = 'P0001';
  end if;

  select key_material
  into v_key
  from public.launch_enrollment_keys
  where id = 1;
  if not found or octet_length(v_key) <> 32 then
    raise exception 'ENROLLMENT_CONTROL_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  return encode(
    extensions.hmac(convert_to(p_value, 'UTF8'), v_key, 'sha256'),
    'hex'
  );
end
$$;

revoke execute on function public.heldat_launch_hmac(text)
  from public, anon, authenticated, supabase_auth_admin;

-- Service-only preflight for password/email registration. Edge must pass a
-- SHA-256 network scope rather than an address; Postgres HMACs that scope once
-- more before it reaches either the reservation or rate-limit ledger.
create or replace function public.issue_public_email_signup_grant(
  p_email text,
  p_network_scope_hash text,
  p_idempotency_key uuid
)
returns table (
  enrollment_grant text,
  expires_at timestamptz,
  signup_channel text
)
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_email_hash text;
  v_network_hash text;
  v_grant text;
  v_grant_hash text;
  v_expires_at timestamptz;
  v_controls public.launch_enrollment_controls;
  v_existing public.launch_signup_reservations;
  v_rate record;
  v_registered bigint;
  v_pending bigint;
begin
  if char_length(v_email) not between 3 and 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or coalesce(p_network_scope_hash, '') !~ '^[0-9a-f]{64}$'
    or p_idempotency_key is null
    or p_idempotency_key =
      '00000000-0000-0000-0000-000000000000'::uuid
  then
    raise exception 'PUBLIC_SIGNUP_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  -- One lock serializes capacity reservations across email and OAuth without
  -- exposing a row or count to public roles.
  perform pg_advisory_xact_lock(
    hashtextextended('heldat.launch-enrollment.capacity', 0)
  );

  select *
  into v_controls
  from public.launch_enrollment_controls
  where id = 1
  for update;
  if not found then
    raise exception 'PUBLIC_SIGNUP_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_controls.signup_mode not in (
    'public_email',
    'public_email_google'
  ) then
    raise exception 'PUBLIC_SIGNUP_CLOSED' using errcode = 'P0001';
  end if;

  v_email_hash := public.heldat_launch_hmac('email:' || v_email);
  v_network_hash := public.heldat_launch_hmac(
    'edge-network-sha256:' || p_network_scope_hash
  );

  select reservation.*
  into v_existing
  from public.launch_signup_reservations as reservation
  where reservation.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_existing.provider <> 'email'
      or v_existing.email_hash <> v_email_hash
      or v_existing.network_scope_hash <> v_network_hash
    then
      raise exception 'PUBLIC_SIGNUP_IDEMPOTENCY_CONFLICT'
        using errcode = 'P0001';
    end if;
    if v_existing.consumed_at is not null
      or v_existing.expires_at <= now()
    then
      raise exception 'PUBLIC_SIGNUP_REQUEST_EXPIRED'
        using errcode = 'P0001';
    end if;

    v_grant := public.heldat_launch_hmac(
      'email-grant-v1:'
      || p_idempotency_key::text || ':'
      || v_existing.email_hash || ':'
      || v_existing.network_scope_hash
    );
    if v_existing.grant_hash <> public.heldat_launch_hmac(
      'grant-hash:' || v_grant
    ) then
      raise exception 'PUBLIC_SIGNUP_UNAVAILABLE' using errcode = 'P0001';
    end if;

    return query
    select
      v_grant,
      v_existing.expires_at,
      'heldat-public-email-v1'::text;
    return;
  end if;

  select *
  into v_rate
  from public.consume_api_rate_limit(
    v_network_hash,
    'signup.email.network',
    v_controls.email_network_limit,
    v_controls.email_network_window_seconds
  );
  if not coalesce(v_rate.allowed, false) then
    raise exception 'PUBLIC_SIGNUP_RATE_LIMITED' using errcode = 'P0001';
  end if;

  select *
  into v_rate
  from public.consume_api_rate_limit(
    v_email_hash,
    'signup.email.address',
    v_controls.email_address_limit,
    v_controls.email_address_window_seconds
  );
  if not coalesce(v_rate.allowed, false) then
    raise exception 'PUBLIC_SIGNUP_RATE_LIMITED' using errcode = 'P0001';
  end if;

  select count(*)
  into v_registered
  from auth.users
  where deleted_at is null;

  select count(*)
  into v_pending
  from public.launch_signup_reservations as pending_reservation
  where pending_reservation.consumed_at is null
    and pending_reservation.expires_at > now();

  if v_registered + v_pending >= v_controls.max_registered_users
    or v_pending >= v_controls.max_pending_signups
  then
    raise exception 'PUBLIC_SIGNUP_CAPACITY_REACHED'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.launch_signup_reservations as email_reservation
    where email_reservation.email_hash = v_email_hash
      and email_reservation.consumed_at is null
      and email_reservation.expires_at > now()
  ) then
    raise exception 'PUBLIC_SIGNUP_ALREADY_PENDING'
      using errcode = 'P0001';
  end if;

  v_grant := public.heldat_launch_hmac(
    'email-grant-v1:'
    || p_idempotency_key::text || ':'
    || v_email_hash || ':'
    || v_network_hash
  );
  v_grant_hash := public.heldat_launch_hmac('grant-hash:' || v_grant);
  v_expires_at := now()
    + make_interval(secs => v_controls.email_grant_ttl_seconds);

  insert into public.launch_signup_reservations (
    provider,
    idempotency_key,
    email_hash,
    network_scope_hash,
    grant_hash,
    control_version,
    expires_at
  )
  values (
    'email',
    p_idempotency_key,
    v_email_hash,
    v_network_hash,
    v_grant_hash,
    v_controls.config_version,
    v_expires_at
  );

  return query
  select v_grant, v_expires_at, 'heldat-public-email-v1'::text;
end
$$;

revoke execute on function public.issue_public_email_signup_grant(
  text,
  text,
  uuid
) from public, anon, authenticated, supabase_auth_admin;
grant execute on function public.issue_public_email_signup_grant(
  text,
  text,
  uuid
) to service_role;

-- The Auth event's app_metadata is provider-controlled; user_metadata is not.
-- Email launch signup therefore requires the one-use server grant, while
-- Google signup requires app_metadata.provider plus providers[] and a valid
-- metadata.ip_address. OAuth IP pseudonyms are HMACed before rate limiting.
create or replace function public.heldat_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(event #>> '{user,email}', '')));
  v_channel text := coalesce(
    event #>> '{user,user_metadata,alyr_signup_channel}',
    ''
  );
  v_pilot_grant text := coalesce(
    event #>> '{user,user_metadata,pilot_signup_grant}',
    ''
  );
  v_public_grant text := coalesce(
    event #>> '{user,user_metadata,public_signup_grant}',
    ''
  );
  v_provider text := lower(trim(coalesce(
    event #>> '{user,app_metadata,provider}',
    ''
  )));
  v_operator_provisioned boolean :=
    event #> '{user,app_metadata,heldat_operator_provisioned}'
      = 'true'::jsonb;
  v_user_id uuid;
  v_ip text;
  v_network_hash text;
  v_email_hash text;
  v_grant_hash text;
  v_controls public.launch_enrollment_controls;
  v_reservation public.launch_signup_reservations;
  v_rate record;
  v_registered bigint;
  v_pending_other bigint;
  v_pilot_valid boolean := false;
begin
  -- Public Auth clients cannot write app_metadata. This preserves explicitly
  -- operator-created fixtures and recovery identities.
  if v_operator_provisioned then
    return '{}'::jsonb;
  end if;

  -- Preserve the closed-pilot grant contract in every launch mode.
  if char_length(v_email) between 3 and 254
    and position('@' in v_email) > 1
    and v_channel = 'mobile-pilot-v1'
    and v_pilot_grant ~ '^[0-9a-f]{64}$'
  then
    select exists (
      select 1
      from public.pilot_signup_approvals as approval
      where approval.email_hash =
          encode(extensions.digest(v_email, 'sha256'), 'hex')
        and approval.pending_grant_hash =
          encode(extensions.digest(v_pilot_grant, 'sha256'), 'hex')
        and approval.pending_grant_expires_at > now()
        and approval.enabled
        and approval.claimed_at is null
        and (approval.expires_at is null or approval.expires_at > now())
    )
    into v_pilot_valid;
    if v_pilot_valid then
      return '{}'::jsonb;
    end if;
  end if;

  if char_length(v_email) not between 3 and 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or coalesce(event #>> '{user,id}', '')
      !~ '^[0-9a-fA-F-]{36}$'
  then
    return jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 403,
        'message', 'A valid Heldat enrollment approval is required.'
      )
    );
  end if;
  v_user_id := (event #>> '{user,id}')::uuid;

  perform pg_advisory_xact_lock(
    hashtextextended('heldat.launch-enrollment.capacity', 0)
  );
  select *
  into v_controls
  from public.launch_enrollment_controls
  where id = 1
  for update;
  if not found then
    return jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 503,
        'message', 'Heldat enrollment is temporarily unavailable.'
      )
    );
  end if;

  v_email_hash := public.heldat_launch_hmac('email:' || v_email);

  if v_provider = 'email'
    and coalesce(event #> '{user,app_metadata,providers}', '[]'::jsonb)
      @> '["email"]'::jsonb
    and v_channel = 'heldat-public-email-v1'
    and v_public_grant ~ '^[0-9a-f]{64}$'
  then
    if v_controls.signup_mode not in (
      'public_email',
      'public_email_google'
    ) then
      return jsonb_build_object(
        'error',
        jsonb_build_object(
          'http_code', 403,
          'message', 'Heldat public enrollment is closed.'
        )
      );
    end if;

    v_grant_hash := public.heldat_launch_hmac(
      'grant-hash:' || v_public_grant
    );
    select reservation.*
    into v_reservation
    from public.launch_signup_reservations as reservation
    where reservation.provider = 'email'
      and reservation.email_hash = v_email_hash
      and reservation.grant_hash = v_grant_hash
      and reservation.consumed_at is null
      and reservation.expires_at > now()
    for update;
    if not found then
      return jsonb_build_object(
        'error',
        jsonb_build_object(
          'http_code', 403,
          'message', 'A valid Heldat enrollment approval is required.'
        )
      );
    end if;

    if v_reservation.auth_user_id is not null then
      if v_reservation.auth_user_id = v_user_id
        and v_reservation.hook_accepted_at is not null
      then
        return '{}'::jsonb;
      end if;
      return jsonb_build_object(
        'error',
        jsonb_build_object(
          'http_code', 403,
          'message', 'A valid Heldat enrollment approval is required.'
        )
      );
    end if;

    begin
      v_ip := host(
        (trim(coalesce(event #>> '{metadata,ip_address}', '')))::inet
      );
    exception
      when invalid_text_representation then
        return jsonb_build_object(
          'error',
          jsonb_build_object(
            'http_code', 403,
            'message', 'A valid Heldat enrollment approval is required.'
          )
        );
    end;
    v_network_hash := public.heldat_launch_hmac('auth-ip:' || v_ip);

    select *
    into v_rate
    from public.consume_api_rate_limit(
      v_network_hash,
      'signup.email.hook-network',
      v_controls.email_network_limit,
      v_controls.email_network_window_seconds
    );
    if not coalesce(v_rate.allowed, false) then
      return jsonb_build_object(
        'error',
        jsonb_build_object(
          'http_code', 429,
          'message', 'Too many enrollment attempts. Try again later.'
        )
      );
    end if;

    select count(*)
    into v_registered
    from auth.users
    where deleted_at is null;
    select count(*)
    into v_pending_other
    from public.launch_signup_reservations
    where consumed_at is null
      and expires_at > now()
      and id <> v_reservation.id;
    if v_registered + v_pending_other
        >= v_controls.max_registered_users
      or v_pending_other >= v_controls.max_pending_signups
    then
      return jsonb_build_object(
        'error',
        jsonb_build_object(
          'http_code', 503,
          'message', 'Heldat enrollment capacity is currently full.'
        )
      );
    end if;

    update public.launch_signup_reservations
    set
      auth_user_id = v_user_id,
      hook_accepted_at = now()
    where id = v_reservation.id;
    return '{}'::jsonb;
  end if;

  if v_provider = 'google'
    and coalesce(event #> '{user,app_metadata,providers}', '[]'::jsonb)
      @> '["google"]'::jsonb
  then
    if v_controls.signup_mode <> 'public_email_google' then
      return jsonb_build_object(
        'error',
        jsonb_build_object(
          'http_code', 403,
          'message', 'Heldat public enrollment is closed.'
        )
      );
    end if;

    begin
      v_ip := host(
        (trim(coalesce(event #>> '{metadata,ip_address}', '')))::inet
      );
    exception
      when invalid_text_representation then
        return jsonb_build_object(
          'error',
          jsonb_build_object(
            'http_code', 403,
            'message', 'A valid Heldat enrollment approval is required.'
          )
        );
    end;
    v_network_hash := public.heldat_launch_hmac('auth-ip:' || v_ip);

    select reservation.*
    into v_reservation
    from public.launch_signup_reservations as reservation
    where reservation.auth_user_id = v_user_id
    for update;
    if found then
      if v_reservation.provider = 'google'
        and v_reservation.email_hash = v_email_hash
        and v_reservation.network_scope_hash = v_network_hash
        and v_reservation.consumed_at is null
        and v_reservation.expires_at > now()
        and v_reservation.hook_accepted_at is not null
      then
        return '{}'::jsonb;
      end if;
      return jsonb_build_object(
        'error',
        jsonb_build_object(
          'http_code', 403,
          'message', 'A valid Heldat enrollment approval is required.'
        )
      );
    end if;

    select *
    into v_rate
    from public.consume_api_rate_limit(
      v_network_hash,
      'signup.google.network',
      v_controls.google_network_limit,
      v_controls.google_network_window_seconds
    );
    if not coalesce(v_rate.allowed, false) then
      return jsonb_build_object(
        'error',
        jsonb_build_object(
          'http_code', 429,
          'message', 'Too many enrollment attempts. Try again later.'
        )
      );
    end if;

    select count(*)
    into v_registered
    from auth.users
    where deleted_at is null;
    select count(*)
    into v_pending_other
    from public.launch_signup_reservations
    where consumed_at is null
      and expires_at > now();
    if v_registered + v_pending_other
        >= v_controls.max_registered_users
      or v_pending_other >= v_controls.max_pending_signups
    then
      return jsonb_build_object(
        'error',
        jsonb_build_object(
          'http_code', 503,
          'message', 'Heldat enrollment capacity is currently full.'
        )
      );
    end if;

    insert into public.launch_signup_reservations (
      provider,
      auth_user_id,
      email_hash,
      network_scope_hash,
      control_version,
      expires_at,
      hook_accepted_at
    )
    values (
      'google',
      v_user_id,
      v_email_hash,
      v_network_hash,
      v_controls.config_version,
      now() + interval '15 minutes',
      now()
    );
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error',
    jsonb_build_object(
      'http_code', 403,
      'message', 'A valid Heldat enrollment approval is required.'
    )
  );
exception
  when invalid_text_representation or check_violation
  then
    return jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 403,
        'message', 'A valid Heldat enrollment approval is required.'
      )
    );
  when others then
    return jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 503,
        'message', 'Heldat enrollment is temporarily unavailable.'
      )
    );
end
$$;

revoke execute on function public.heldat_before_user_created(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.heldat_before_user_created(jsonb)
  to supabase_auth_admin;

-- Broaden the existing after-insert consumer without changing the trigger
-- name. Public launch identities must have a reservation bound by the Auth
-- hook; otherwise the auth.users insertion aborts.
create or replace function public.consume_pilot_signup_grant()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_channel text :=
    coalesce(new.raw_user_meta_data, '{}'::jsonb)
      ->> 'alyr_signup_channel';
  v_pilot_grant text :=
    coalesce(new.raw_user_meta_data, '{}'::jsonb)
      ->> 'pilot_signup_grant';
  v_public_grant text :=
    coalesce(new.raw_user_meta_data, '{}'::jsonb)
      ->> 'public_signup_grant';
  v_provider text := lower(coalesce(
    coalesce(new.raw_app_meta_data, '{}'::jsonb) ->> 'provider',
    ''
  ));
  v_operator_provisioned boolean :=
    coalesce(new.raw_app_meta_data, '{}'::jsonb)
      -> 'heldat_operator_provisioned' = 'true'::jsonb;
  v_email text := lower(trim(coalesce(new.email, '')));
  v_approval public.pilot_signup_approvals;
  v_reservation public.launch_signup_reservations;
  v_controls public.launch_enrollment_controls;
begin
  if v_operator_provisioned then
    return new;
  end if;

  if v_channel = 'mobile-pilot-v1' then
    if v_pilot_grant is null or v_pilot_grant !~ '^[0-9a-f]{64}$' then
      raise exception 'PILOT_SIGNUP_GRANT_REQUIRED' using errcode = 'P0001';
    end if;

    perform pg_advisory_xact_lock(hashtext('alyr.closed-pilot.signup'));
    select approval.*
    into v_approval
    from public.pilot_signup_approvals as approval
    where approval.email_hash =
        encode(digest(v_email, 'sha256'), 'hex')
      and approval.pending_grant_hash =
        encode(digest(v_pilot_grant, 'sha256'), 'hex')
      and approval.pending_grant_expires_at > now()
      and approval.enabled
      and approval.claimed_at is null
      and (approval.expires_at is null or approval.expires_at > now())
    for update;
    if not found then
      raise exception 'PILOT_SIGNUP_GRANT_REQUIRED' using errcode = 'P0001';
    end if;

    insert into public.pilot_enrollments (
      user_id,
      enabled,
      max_households,
      approved_at,
      expires_at,
      note
    )
    values (
      new.id,
      true,
      v_approval.max_households,
      v_approval.approved_at,
      v_approval.expires_at,
      'Created from a one-use pilot signup approval.'
    )
    on conflict (user_id) do nothing;

    update public.pilot_signup_approvals
    set
      claimed_by = new.id,
      claimed_at = now(),
      pending_grant_hash = null,
      pending_grant_expires_at = null
    where id = v_approval.id;

    update auth.users
    set raw_user_meta_data =
      coalesce(raw_user_meta_data, '{}'::jsonb)
        - array['alyr_signup_channel', 'pilot_signup_grant']
    where id = new.id;
    return new;
  end if;

  if v_provider = 'email'
    and v_channel = 'heldat-public-email-v1'
    and v_public_grant ~ '^[0-9a-f]{64}$'
  then
    perform pg_advisory_xact_lock(
      hashtextextended('heldat.launch-enrollment.capacity', 0)
    );
    select *
    into v_controls
    from public.launch_enrollment_controls
    where id = 1
    for update;
    if not found or v_controls.signup_mode not in (
      'public_email',
      'public_email_google'
    ) then
      raise exception 'PUBLIC_SIGNUP_RESERVATION_REQUIRED'
        using errcode = 'P0001';
    end if;

    select reservation.*
    into v_reservation
    from public.launch_signup_reservations as reservation
    where reservation.provider = 'email'
      and reservation.auth_user_id = new.id
      and reservation.email_hash =
        public.heldat_launch_hmac('email:' || v_email)
      and reservation.grant_hash =
        public.heldat_launch_hmac('grant-hash:' || v_public_grant)
      and reservation.hook_accepted_at is not null
      and reservation.consumed_at is null
      and reservation.expires_at > now()
    for update;
  elsif v_provider = 'google' then
    perform pg_advisory_xact_lock(
      hashtextextended('heldat.launch-enrollment.capacity', 0)
    );
    select *
    into v_controls
    from public.launch_enrollment_controls
    where id = 1
    for update;
    if not found or v_controls.signup_mode <> 'public_email_google' then
      raise exception 'PUBLIC_SIGNUP_RESERVATION_REQUIRED'
        using errcode = 'P0001';
    end if;

    select reservation.*
    into v_reservation
    from public.launch_signup_reservations as reservation
    where reservation.provider = 'google'
      and reservation.auth_user_id = new.id
      and reservation.email_hash =
        public.heldat_launch_hmac('email:' || v_email)
      and reservation.hook_accepted_at is not null
      and reservation.consumed_at is null
      and reservation.expires_at > now()
    for update;
  else
    return new;
  end if;

  if not found then
    raise exception 'PUBLIC_SIGNUP_RESERVATION_REQUIRED'
      using errcode = 'P0001';
  end if;

  insert into public.pilot_enrollments (
    user_id,
    enabled,
    max_households,
    approved_at,
    note
  )
  values (
    new.id,
    true,
    v_controls.public_account_max_households,
    now(),
    'Created from a capacity-checked public launch reservation.'
  )
  on conflict (user_id) do nothing;

  update public.launch_signup_reservations
  set
    consumed_by = new.id,
    consumed_at = now()
  where id = v_reservation.id
    and consumed_at is null;
  if not found then
    raise exception 'PUBLIC_SIGNUP_RESERVATION_REQUIRED'
      using errcode = 'P0001';
  end if;

  update auth.users
  set raw_user_meta_data =
    coalesce(raw_user_meta_data, '{}'::jsonb)
      - array['alyr_signup_channel', 'public_signup_grant']
  where id = new.id;
  return new;
end
$$;

revoke execute on function public.consume_pilot_signup_grant()
  from public, anon, authenticated, service_role, supabase_auth_admin;

-- Household creation keeps its existing idempotency and membership contract,
-- but its global ceiling now follows the operator-controlled singleton.
create or replace function public.create_household(
  p_name text,
  p_operation_id uuid,
  p_household_id uuid
)
returns public.households
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := trim(p_name);
  v_household public.households;
  v_membership public.memberships;
  v_receipt public.household_creation_operations;
  v_enrollment public.pilot_enrollments;
  v_controls public.launch_enrollment_controls;
  v_existing_households integer;
  v_pilot_households integer;
  v_receipt_count integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if p_operation_id is null or p_household_id is null then
    raise exception 'INVALID_OPERATION_ID' using errcode = 'P0001';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'INVALID_HOUSEHOLD_NAME' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('alyr.closed-pilot.enrollment'));

  select *
  into v_controls
  from public.launch_enrollment_controls
  where id = 1
  for update;
  if not found then
    raise exception 'ENROLLMENT_CONTROL_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- Each actor/household retains at most eight current receipts. Expired
  -- receipts are removed before replay lookup; their household UUID still
  -- makes a later recovery deterministic.
  delete from public.household_creation_operations
  where user_id = v_user_id
    and created_at < now() - interval '30 days';

  select * into v_receipt
  from public.household_creation_operations
  where operation_id = p_operation_id
  for update;

  if found then
    if v_receipt.user_id is distinct from v_user_id
      or v_receipt.request_name is distinct from v_name
      or v_receipt.household_id is distinct from p_household_id
    then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    select * into v_household
    from public.households
    where id = v_receipt.household_id
      and deleted_at is null
    for update;
    if not found then
      raise exception 'IDEMPOTENCY_RECEIPT_INVALID' using errcode = 'P0001';
    end if;

    select * into v_membership
    from public.memberships
    where household_id = v_household.id
      and user_id = v_user_id
      and role = 'owner'::public.household_role
      and status = 'active'
      and deleted_at is null
    for update;
    if not found then
      raise exception 'IDEMPOTENCY_RECEIPT_INVALID' using errcode = 'P0001';
    end if;

    update auth.users
    set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'active_household_id', v_household.id::text,
        'active_membership_id', v_membership.id::text,
        'active_household_role', v_membership.role::text,
        'onboarding_complete',
          v_household.onboarding_completed_at is not null
      )
    where id = v_user_id;

    return v_household;
  end if;

  select * into v_enrollment
  from public.pilot_enrollments
  where user_id = v_user_id
    and enabled
    and (expires_at is null or expires_at > now())
  for update;
  if not found then
    raise exception 'PILOT_ENROLLMENT_REQUIRED' using errcode = 'P0001';
  end if;

  -- A different operation UUID may recover only its explicitly supplied
  -- household UUID. No account-global onboarding flag or arbitrary
  -- created_by row participates in selection.
  select * into v_household
  from public.households
  where id = p_household_id
  for update;

  if found then
    if v_household.deleted_at is not null
      or v_household.created_by is distinct from v_user_id
    then
      raise exception 'HOUSEHOLD_RECOVERY_DENIED' using errcode = 'P0001';
    end if;

    select * into v_membership
    from public.memberships
    where household_id = p_household_id
      and user_id = v_user_id
      and role = 'owner'::public.household_role
      and status = 'active'
      and deleted_at is null
    for update;
    if not found then
      raise exception 'HOUSEHOLD_RECOVERY_DENIED' using errcode = 'P0001';
    end if;

    select count(*) into v_receipt_count
    from public.household_creation_operations
    where user_id = v_user_id
      and household_id = p_household_id;
    if v_receipt_count >= 8 then
      raise exception 'HOUSEHOLD_OPERATION_LIMIT' using errcode = 'P0001';
    end if;

    insert into public.household_creation_operations(
      operation_id, user_id, request_name, household_id
    )
    values (
      p_operation_id, v_user_id, v_name, p_household_id
    );

    update auth.users
    set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'active_household_id', v_household.id::text,
        'active_membership_id', v_membership.id::text,
        'active_household_role', v_membership.role::text,
        'onboarding_complete',
          v_household.onboarding_completed_at is not null
      )
    where id = v_user_id;

    return v_household;
  end if;

  select count(*) into v_existing_households
  from public.households
  where created_by = v_user_id and deleted_at is null;
  if v_existing_households >= v_enrollment.max_households then
    raise exception 'PILOT_HOUSEHOLD_LIMIT' using errcode = 'P0001';
  end if;

  select count(*) into v_pilot_households
  from public.households where deleted_at is null;
  if v_pilot_households >= v_controls.max_households then
    raise exception 'PILOT_CAPACITY_REACHED' using errcode = 'P0001';
  end if;

  insert into public.households(id, name, created_by)
  values (p_household_id, v_name, v_user_id)
  returning * into v_household;

  insert into public.memberships(household_id, user_id, role)
  values (v_household.id, v_user_id, 'owner')
  returning * into v_membership;

  insert into public.household_creation_operations(
    operation_id, user_id, request_name, household_id
  )
  values (
    p_operation_id, v_user_id, v_name, v_household.id
  );

  insert into public.audit_events(
    household_id, actor_id, event_name, entity_type, entity_id
  )
  values (
    v_household.id, v_user_id, 'household.created', 'household', v_household.id
  );

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'active_household_id', v_household.id::text,
      'active_membership_id', v_membership.id::text,
      'active_household_role', v_membership.role::text,
      'onboarding_complete', false
    )
  where id = v_user_id;

  return v_household;
end
$$;


revoke execute on function public.create_household(text, uuid, uuid)
  from public, anon;
grant execute on function public.create_household(text, uuid, uuid)
  to authenticated;

-- Upload reservations preserve immutable evidence validation while applying
-- operator-controlled per-file, household, and provider-wide byte ceilings.
create or replace function public.create_blob_upload_intent(
  p_id uuid,
  p_household_id uuid,
  p_evidence_id uuid,
  p_evidence_version_id uuid,
  p_object_key text,
  p_checksum_sha256 text,
  p_byte_size bigint,
  p_mime_type text
)
returns public.blob_objects
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_blob public.blob_objects;
  v_household_usage bigint;
  v_global_usage bigint;
  v_controls public.launch_enrollment_controls;
begin
  if not public.can_edit_household(p_household_id) then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  -- Serialize the global provider allowance before the household row lock.
  -- Every quota-changing path uses this order to avoid cross-household races.
  perform pg_advisory_xact_lock(
    hashtextextended('heldat.storage.global-capacity', 0)
  );
  select *
  into v_controls
  from public.launch_enrollment_controls
  where id = 1
  for update;
  if not found then
    raise exception 'STORAGE_CONTROL_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- All quota-changing reservation paths take this lock before inspecting an
  -- existing BlobObject or calculating retained bytes.
  perform 1
  from public.households
  where id = p_household_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'HOUSEHOLD_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_object_key is distinct from concat(
    p_household_id::text,
    '/',
    p_id::text,
    '/',
    p_evidence_version_id::text
  ) then
    raise exception 'INVALID_OBJECT_KEY' using errcode = 'P0001';
  end if;

  if p_checksum_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_CHECKSUM' using errcode = 'P0001';
  end if;

  if p_byte_size < 1
    or p_byte_size > v_controls.max_attachment_bytes
  then
    raise exception 'INVALID_FILE_SIZE' using errcode = 'P0001';
  end if;

  if char_length(coalesce(p_mime_type, '')) not between 1 and 160 then
    raise exception 'INVALID_MIME_TYPE' using errcode = 'P0001';
  end if;

  -- Evidence is the parent for both Asset Evidence and Place Documents. The
  -- parent entity must still be active, preventing cross-household, deleted,
  -- or detached records from reserving cloud bytes.
  perform 1
  from public.evidence parent
  where parent.id = p_evidence_id
    and parent.household_id = p_household_id
    and parent.deleted_at is null
    and (
      (
        parent.asset_id is not null
        and parent.place_id is null
        and exists (
          select 1
          from public.assets asset
          where asset.id = parent.asset_id
            and asset.household_id = parent.household_id
            and asset.deleted_at is null
        )
      )
      or
      (
        parent.place_id is not null
        and parent.asset_id is null
        and exists (
          select 1
          from public.places place
          where place.id = parent.place_id
            and place.household_id = parent.household_id
            and place.deleted_at is null
        )
      )
    )
  for key share;

  if not found then
    raise exception 'EVIDENCE_PARENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.evidence_versions version
    where version.id = p_evidence_version_id
  ) then
    raise exception 'UPLOAD_ALREADY_COMPLETED' using errcode = 'P0001';
  end if;

  select *
  into v_blob
  from public.blob_objects
  where id = p_id
  for update;

  if found then
    if v_blob.household_id is distinct from p_household_id
       or v_blob.expected_evidence_id is distinct from p_evidence_id
       or v_blob.expected_evidence_version_id
            is distinct from p_evidence_version_id
       or v_blob.object_key is distinct from p_object_key
       or v_blob.checksum_sha256 is distinct from p_checksum_sha256
       or v_blob.byte_size is distinct from p_byte_size
       or v_blob.mime_type is distinct from p_mime_type
       or v_blob.created_by is distinct from auth.uid() then
      raise exception 'UPLOAD_INTENT_CONFLICT' using errcode = 'P0001';
    end if;

    if v_blob.deleted_at is not null
       or v_blob.status = 'needs-attention'
       or v_blob.intent_expires_at is null
       or v_blob.intent_expires_at <= now() then
      raise exception 'UPLOAD_INTENT_EXPIRED' using errcode = 'P0001';
    end if;

    if v_blob.status <> 'upload-intent' then
      raise exception 'UPLOAD_ALREADY_COMPLETED' using errcode = 'P0001';
    end if;

    select coalesce(sum(quota_entry.byte_size), 0)
    into v_household_usage
    from (
      select blob.byte_size
      from public.blob_objects blob
      where blob.household_id = p_household_id
        and blob.deleted_at is null
      union all
      select cleanup.byte_size
      from public.blob_object_cleanup_queue cleanup
      where cleanup.household_id = p_household_id
    ) quota_entry;

    select coalesce(sum(quota_entry.byte_size), 0)
    into v_global_usage
    from (
      select blob.byte_size
      from public.blob_objects blob
      where blob.deleted_at is null
      union all
      select cleanup.byte_size
      from public.blob_object_cleanup_queue cleanup
    ) quota_entry;

    -- The current active intent is already included in both usage totals. Do
    -- not add it twice, but reject renewal after an operator lowers a ceiling.
    if v_household_usage > v_controls.household_storage_limit_bytes then
      raise exception 'HOUSEHOLD_STORAGE_LIMIT' using errcode = 'P0001';
    end if;
    if v_global_usage > v_controls.global_storage_limit_bytes then
      raise exception 'GLOBAL_STORAGE_LIMIT' using errcode = 'P0001';
    end if;

    update public.blob_objects
    set
      intent_expires_at = now() + interval '15 minutes',
      updated_at = now()
    where id = p_id
    returning * into v_blob;

    return v_blob;
  end if;

  select coalesce(sum(quota_entry.byte_size), 0)
  into v_household_usage
  from (
    select blob.byte_size
    from public.blob_objects blob
    where blob.household_id = p_household_id
      and blob.deleted_at is null
    union all
    select cleanup.byte_size
    from public.blob_object_cleanup_queue cleanup
    where cleanup.household_id = p_household_id
  ) quota_entry;

  select coalesce(sum(quota_entry.byte_size), 0)
  into v_global_usage
  from (
    select blob.byte_size
    from public.blob_objects blob
    where blob.deleted_at is null
    union all
    select cleanup.byte_size
    from public.blob_object_cleanup_queue cleanup
  ) quota_entry;

  if v_household_usage + p_byte_size
      > v_controls.household_storage_limit_bytes
  then
    raise exception 'HOUSEHOLD_STORAGE_LIMIT' using errcode = 'P0001';
  end if;
  if v_global_usage + p_byte_size
      > v_controls.global_storage_limit_bytes
  then
    raise exception 'GLOBAL_STORAGE_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.blob_objects(
    id,
    household_id,
    expected_evidence_id,
    expected_evidence_version_id,
    object_key,
    checksum_sha256,
    byte_size,
    mime_type,
    status,
    intent_expires_at,
    created_by
  )
  values (
    p_id,
    p_household_id,
    p_evidence_id,
    p_evidence_version_id,
    p_object_key,
    p_checksum_sha256,
    p_byte_size,
    p_mime_type,
    'upload-intent',
    now() + interval '15 minutes',
    auth.uid()
  )
  returning * into v_blob;

  return v_blob;
end
$$;

-- Operator mutations use optimistic concurrency and an idempotency receipt.
-- Replaying an operation returns its original snapshot even after a later,
-- unrelated configuration change.
create table public.launch_enrollment_config_operations (
  operation_id uuid primary key,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  result_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.launch_enrollment_config_operations
  enable row level security;
alter table public.launch_enrollment_config_operations
  force row level security;
revoke all on table public.launch_enrollment_config_operations
  from public, anon, authenticated, supabase_auth_admin;

create or replace function public.configure_launch_enrollment(
  p_operation_id uuid,
  p_expected_version bigint,
  p_signup_mode text,
  p_max_registered_users integer,
  p_max_households integer,
  p_max_pending_signups integer,
  p_public_account_max_households integer,
  p_max_attachment_bytes bigint,
  p_household_storage_limit_bytes bigint,
  p_global_storage_limit_bytes bigint,
  p_email_grant_ttl_seconds integer,
  p_email_network_limit integer,
  p_email_network_window_seconds integer,
  p_email_address_limit integer,
  p_email_address_window_seconds integer,
  p_google_network_limit integer,
  p_google_network_window_seconds integer
)
returns public.launch_enrollment_controls
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_request_hash text;
  v_operation public.launch_enrollment_config_operations;
  v_controls public.launch_enrollment_controls;
begin
  if p_operation_id is null
    or p_operation_id =
      '00000000-0000-0000-0000-000000000000'::uuid
    or p_expected_version is null
  then
    raise exception 'LAUNCH_CONFIG_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  v_request_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'signup_mode', p_signup_mode,
          'max_registered_users', p_max_registered_users,
          'max_households', p_max_households,
          'max_pending_signups', p_max_pending_signups,
          'public_account_max_households',
            p_public_account_max_households,
          'max_attachment_bytes', p_max_attachment_bytes,
          'household_storage_limit_bytes',
            p_household_storage_limit_bytes,
          'global_storage_limit_bytes', p_global_storage_limit_bytes,
          'email_grant_ttl_seconds', p_email_grant_ttl_seconds,
          'email_network_limit', p_email_network_limit,
          'email_network_window_seconds',
            p_email_network_window_seconds,
          'email_address_limit', p_email_address_limit,
          'email_address_window_seconds',
            p_email_address_window_seconds,
          'google_network_limit', p_google_network_limit,
          'google_network_window_seconds',
            p_google_network_window_seconds
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_advisory_xact_lock(
    hashtextextended('heldat.launch-enrollment.configuration', 0)
  );
  select *
  into v_operation
  from public.launch_enrollment_config_operations
  where operation_id = p_operation_id
  for update;
  if found then
    if v_operation.request_hash <> v_request_hash then
      raise exception 'LAUNCH_CONFIG_IDEMPOTENCY_CONFLICT'
        using errcode = 'P0001';
    end if;
    select *
    into v_controls
    from jsonb_populate_record(
      null::public.launch_enrollment_controls,
      v_operation.result_snapshot
    );
    return v_controls;
  end if;

  select *
  into v_controls
  from public.launch_enrollment_controls
  where id = 1
  for update;
  if not found then
    raise exception 'ENROLLMENT_CONTROL_UNAVAILABLE'
      using errcode = 'P0001';
  end if;
  if v_controls.config_version <> p_expected_version then
    raise exception 'LAUNCH_CONFIG_VERSION_CONFLICT'
      using errcode = 'P0001';
  end if;

  update public.launch_enrollment_controls
  set
    signup_mode = p_signup_mode,
    max_registered_users = p_max_registered_users,
    max_households = p_max_households,
    max_pending_signups = p_max_pending_signups,
    public_account_max_households = p_public_account_max_households,
    max_attachment_bytes = p_max_attachment_bytes,
    household_storage_limit_bytes = p_household_storage_limit_bytes,
    global_storage_limit_bytes = p_global_storage_limit_bytes,
    email_grant_ttl_seconds = p_email_grant_ttl_seconds,
    email_network_limit = p_email_network_limit,
    email_network_window_seconds = p_email_network_window_seconds,
    email_address_limit = p_email_address_limit,
    email_address_window_seconds = p_email_address_window_seconds,
    google_network_limit = p_google_network_limit,
    google_network_window_seconds = p_google_network_window_seconds,
    config_version = config_version + 1,
    updated_at = now()
  where id = 1
  returning * into v_controls;

  insert into public.launch_enrollment_config_operations (
    operation_id,
    request_hash,
    result_snapshot
  )
  values (
    p_operation_id,
    v_request_hash,
    to_jsonb(v_controls)
  );

  return v_controls;
end
$$;

revoke execute on function public.configure_launch_enrollment(
  uuid,
  bigint,
  text,
  integer,
  integer,
  integer,
  integer,
  bigint,
  bigint,
  bigint,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer
) from public, anon, authenticated, supabase_auth_admin;
grant execute on function public.configure_launch_enrollment(
  uuid,
  bigint,
  text,
  integer,
  integer,
  integer,
  integer,
  bigint,
  bigint,
  bigint,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer
) to service_role;

create or replace function public.purge_launch_signup_reservations(
  p_batch_size integer default 10000
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  if p_batch_size not between 1 and 50000 then
    raise exception 'SIGNUP_RETENTION_ARGUMENT_INVALID'
      using errcode = 'P0001';
  end if;

  with stale as (
    select ctid
    from public.launch_signup_reservations
    where expires_at < now() - interval '24 hours'
      or (
        consumed_at is not null
        and consumed_at < now() - interval '24 hours'
      )
    order by coalesce(consumed_at, expires_at), id
    limit p_batch_size
    for update skip locked
  )
  delete from public.launch_signup_reservations as reservation
  using stale
  where reservation.ctid = stale.ctid;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end
$$;

revoke execute on function public.purge_launch_signup_reservations(integer)
  from public, anon, authenticated, supabase_auth_admin;
grant execute on function public.purge_launch_signup_reservations(integer)
  to service_role;

do $$
declare
  v_job_id bigint;
begin
  if exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) then
    select jobid
    into v_job_id
    from cron.job
    where jobname = 'heldat-launch-signup-retention'
    order by jobid
    limit 1;
    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;
    perform cron.schedule(
      'heldat-launch-signup-retention',
      '37 * * * *',
      $job$select public.purge_launch_signup_reservations(10000);$job$
    );
  end if;
end
$$;

comment on table public.launch_enrollment_controls is
  'Private singleton controlling launch admission and storage capacity; seeded closed.';
comment on table public.launch_signup_reservations is
  'Short-lived HMAC-pseudonymized email and Google signup capacity reservations.';
comment on function public.issue_public_email_signup_grant(text, text, uuid) is
  'Service-only, rate-limited and idempotent public email signup preflight.';
comment on function public.heldat_before_user_created(jsonb) is
  'Fail-closed Auth hook for pilot, public email, and Google enrollment.';

commit;
