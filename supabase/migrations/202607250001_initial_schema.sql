begin;

create extension if not exists pgcrypto with schema extensions;

create type public.household_role as enum ('owner', 'editor', 'viewer');
create type public.membership_status as enum ('active', 'revoked');
create type public.sync_operation_status as enum ('applied', 'conflict', 'rejected');
create type public.blob_status as enum (
  'local-only',
  'upload-intent',
  'uploaded-pending-verification',
  'stored',
  'needs-attention'
);
create type public.export_status as enum ('queued', 'processing', 'ready', 'failed', 'expired');

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Closed-pilot admission is operator-managed. There is deliberately no
-- authenticated client policy or RPC for creating these rows.
create table public.pilot_enrollments (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  max_households integer not null default 1
    check (max_households between 1 and 3),
  approved_at timestamptz not null default now(),
  expires_at timestamptz,
  note text
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.household_role not null,
  status public.membership_status not null default 'active',
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, user_id)
);

create table public.devices (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  platform text not null check (platform in ('ios', 'android', 'web')),
  version integer not null default 1,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.places (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  kind text not null default 'home',
  tenure text not null default 'unknown',
  address_text text,
  region_label text check (
    region_label is null or char_length(region_label) between 1 and 120
  ),
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  location_source text not null default 'unknown'
    check (
      location_source in (
        'device_gps', 'user_pin', 'geocoder', 'manual_coordinates',
        'photo_exif', 'imported', 'not_set', 'unknown'
      )
    ),
  location_precision text not null default 'locality_only'
    check (
      location_precision in (
        'exact', 'user_placed', 'approximate', 'locality_only'
      )
    ),
  horizontal_accuracy_m double precision check (
    horizontal_accuracy_m is null or horizontal_accuracy_m >= 0
  ),
  location_observed_at timestamptz,
  location_confirmed_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((latitude is null) = (longitude is null)),
  check (
    latitude is not null
    or (
      location_source in ('unknown', 'not_set')
      and location_precision = 'locality_only'
      and horizontal_accuracy_m is null
    )
  ),
  check (
    location_source <> 'device_gps'
    or (
      latitude is not null
      and horizontal_accuracy_m is not null
      and location_precision in ('exact', 'approximate')
      and location_observed_at is not null
    )
  ),
  check (
    location_source <> 'user_pin'
    or (
      latitude is not null
      and location_precision = 'user_placed'
      and horizontal_accuracy_m is null
      and location_confirmed_at is not null
    )
  ),
  check (location_precision <> 'exact' or location_source = 'device_gps'),
  unique (household_id, id)
);

create table public.spaces (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  place_id uuid not null,
  parent_space_id uuid,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null default 'room'
    check (kind in ('room', 'zone', 'container')),
  ordinal integer not null default 0,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, id),
  unique (household_id, place_id, id),
  foreign key (household_id, place_id)
    references public.places(household_id, id) on delete cascade,
  foreign key (household_id, place_id, parent_space_id)
    references public.spaces(household_id, place_id, id) on delete cascade
);

create table public.assets (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 180),
  category_id text not null,
  category_path text[] not null default '{}',
  description text,
  importance text not null default 'ordinary'
    check (importance in ('ordinary', 'important', 'critical', 'legacy')),
  lifecycle text not null default 'active',
  profile jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, id)
);

create table public.asset_value_assertions (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  asset_id uuid not null,
  amount_minor bigint not null
    check (amount_minor between 0 and 9007199254740991),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  as_of date not null,
  source text not null default 'user-entered'
    check (source = 'user-entered'),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, id),
  foreign key (household_id, asset_id)
    references public.assets(household_id, id) on delete cascade
);

create index asset_value_assertions_household_asset_as_of
  on public.asset_value_assertions(household_id, asset_id, as_of desc)
  where deleted_at is null;

create table public.asset_location_revisions (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  asset_id uuid not null,
  place_id uuid,
  space_id uuid,
  status text not null check (
    status in ('known', 'needs-detail', 'unknown', 'virtual', 'not-applicable')
  ),
  location_detail text,
  source text not null default 'user',
  revision integer not null check (revision > 0),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  proposed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (space_id is null or place_id is not null),
  check (status <> 'known' or place_id is not null),
  check (
    status not in ('unknown', 'virtual', 'not-applicable')
    or (place_id is null and space_id is null)
  ),
  unique (asset_id, revision),
  unique (household_id, id),
  foreign key (household_id, asset_id)
    references public.assets(household_id, id) on delete cascade,
  foreign key (household_id, place_id)
    references public.places(household_id, id),
  foreign key (household_id, place_id, space_id)
    references public.spaces(household_id, place_id, id)
);

create unique index one_active_location_per_asset
  on public.asset_location_revisions(asset_id)
  where valid_to is null;

create table public.evidence (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  asset_id uuid not null,
  kind text not null check (
    kind in ('paper', 'artifact', 'media', 'record', 'note', 'link')
  ),
  relation text not null default 'other' check (
    relation in (
      'ownership', 'identity', 'service', 'provenance', 'condition',
      'insurance', 'valuation', 'legal', 'access', 'context', 'other'
    )
  ),
  title text not null check (char_length(title) between 1 and 180),
  review_status text not null default 'pending'
    check (review_status in ('pending', 'reviewed', 'rejected')),
  storage_state text not null default 'unknown'
    check (
      storage_state in (
        'unknown', 'on-device', 'queued', 'uploading', 'processing',
        'cloud-acknowledged', 'missing-original', 'failed', 'quarantined'
      )
    ),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, id),
  foreign key (household_id, asset_id)
    references public.assets(household_id, id) on delete cascade
);

create table public.blob_objects (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  expected_evidence_id uuid not null,
  expected_evidence_version_id uuid not null,
  object_key text not null,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint not null check (byte_size between 1 and 10485760),
  mime_type text not null,
  status public.blob_status not null default 'local-only',
  intent_expires_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, object_key),
  unique (household_id, id)
);

create table public.evidence_versions (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  evidence_id uuid not null,
  blob_object_id uuid,
  version_number integer not null check (version_number > 0),
  file_name text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size between 1 and 10485760),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (evidence_id, version_number),
  foreign key (household_id, evidence_id)
    references public.evidence(household_id, id) on delete cascade,
  foreign key (household_id, blob_object_id)
    references public.blob_objects(household_id, id)
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code_hash text not null unique,
  role public.household_role not null default 'viewer',
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.sync_operations (
  cursor bigint generated always as identity unique,
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  idempotency_key text not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  actor_id uuid not null references auth.users(id),
  device_id uuid,
  entity_type text not null,
  entity_id uuid not null,
  base_version integer not null check (base_version >= 0),
  command text not null,
  payload jsonb not null default '{}'::jsonb,
  client_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  status public.sync_operation_status not null,
  result jsonb not null default '{}'::jsonb,
  unique (household_id, idempotency_key)
);

create index sync_operations_household_cursor
  on public.sync_operations(household_id, cursor);

create table public.audit_events (
  cursor bigint generated always as identity primary key,
  id uuid not null unique default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  actor_id uuid references auth.users(id),
  event_name text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.export_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  scope jsonb not null default '{}'::jsonb,
  status public.export_status not null default 'queued',
  version integer not null default 1,
  object_key text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  actor_id uuid references auth.users(id),
  event_name text not null check (
    event_name in (
      'pilot_invitation_accepted',
      'household_created',
      'first_asset_passport_created',
      'asset_location_confirmed',
      'first_evidence_reviewed',
      'critical_register_25_completed',
      'asset_retrieval_completed',
      'access_grant_created',
      'continuity_snapshot_exported',
      'household_returned_day_30_45',
      'reservation_paid',
      'pilot_contract_signed'
    )
  ),
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create or replace function public.current_household_role(p_household_id uuid)
returns public.household_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.role
  from public.memberships m
  where m.household_id = p_household_id
    and m.user_id = auth.uid()
    and m.status = 'active'
    and m.deleted_at is null
  limit 1
$$;

create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_household_role(p_household_id) is not null
$$;

create or replace function public.can_edit_household(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.current_household_role(p_household_id) in ('owner', 'editor'),
    false
  )
$$;

create or replace function public.can_admin_household(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_household_role(p_household_id) = 'owner', false)
$$;

create or replace function public.create_household(p_name text)
returns public.households
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_household public.households;
  v_enrollment public.pilot_enrollments;
  v_existing_households integer;
  v_pilot_households integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if char_length(trim(p_name)) not between 1 and 120 then
    raise exception 'INVALID_HOUSEHOLD_NAME' using errcode = 'P0001';
  end if;

  -- One global transaction lock makes the 20-household free-pilot cap
  -- deterministic even when owners enroll concurrently.
  perform pg_advisory_xact_lock(hashtext('alyr.closed-pilot.enrollment'));

  select *
  into v_enrollment
  from public.pilot_enrollments
  where user_id = v_user_id
    and enabled
    and (expires_at is null or expires_at > now())
  for update;

  if not found then
    raise exception 'PILOT_ENROLLMENT_REQUIRED' using errcode = 'P0001';
  end if;

  select count(*)
  into v_existing_households
  from public.households
  where created_by = v_user_id and deleted_at is null;

  if v_existing_households >= v_enrollment.max_households then
    raise exception 'PILOT_HOUSEHOLD_LIMIT' using errcode = 'P0001';
  end if;

  select count(*)
  into v_pilot_households
  from public.households
  where deleted_at is null;

  if v_pilot_households >= 20 then
    raise exception 'PILOT_CAPACITY_REACHED' using errcode = 'P0001';
  end if;

  insert into public.households(name, created_by)
  values (trim(p_name), v_user_id)
  returning * into v_household;

  insert into public.memberships(household_id, user_id, role)
  values (v_household.id, v_user_id, 'owner');

  insert into public.audit_events(household_id, actor_id, event_name, entity_type, entity_id)
  values (v_household.id, v_user_id, 'household.created', 'household', v_household.id);

  -- Durable account routing belongs in provider-controlled app metadata, never
  -- in client-editable user metadata. A refreshed JWT can now restore the same
  -- household-scoped local vault after process death or reinstall.
  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'active_household_id', v_household.id::text,
      'onboarding_complete', false
    )
  where id = v_user_id;

  return v_household;
end
$$;

create or replace function public.complete_household_onboarding(
  p_household_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if not public.can_admin_household(p_household_id) then
    raise exception 'HOUSEHOLD_ADMIN_REQUIRED' using errcode = 'P0001';
  end if;

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'active_household_id', p_household_id::text,
      'onboarding_complete', true
    )
  where id = v_user_id;

  insert into public.audit_events(
    household_id,
    actor_id,
    event_name,
    entity_type,
    entity_id
  )
  values (
    p_household_id,
    v_user_id,
    'household.onboarding_completed',
    'household',
    p_household_id
  );
end
$$;

create or replace function public.create_household_invite(
  p_household_id uuid,
  p_role public.household_role default 'viewer',
  p_ttl interval default interval '7 days'
)
returns table(invite_id uuid, invite_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_code text;
  v_invite public.invites;
begin
  if not public.can_admin_household(p_household_id) then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  if p_ttl <= interval '0 seconds' or p_ttl > interval '30 days' then
    raise exception 'INVALID_INVITE_TTL' using errcode = 'P0001';
  end if;

  v_code := upper(encode(gen_random_bytes(9), 'hex'));

  insert into public.invites(
    household_id,
    code_hash,
    role,
    expires_at,
    created_by
  )
  values (
    p_household_id,
    encode(digest(v_code, 'sha256'), 'hex'),
    p_role,
    now() + p_ttl,
    auth.uid()
  )
  returning * into v_invite;

  insert into public.audit_events(household_id, actor_id, event_name, entity_type, entity_id)
  values (p_household_id, auth.uid(), 'invite.created', 'invite', v_invite.id);

  return query select v_invite.id, v_code, v_invite.expires_at;
end
$$;

create or replace function public.accept_household_invite(p_code text)
returns public.memberships
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.invites;
  v_membership public.memberships;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select *
  into v_invite
  from public.invites
  where code_hash = encode(digest(upper(trim(p_code)), 'sha256'), 'hex')
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'INVITE_INVALID_OR_EXPIRED' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.memberships
    where household_id = v_invite.household_id
      and user_id = v_user_id
      and status = 'active'
      and deleted_at is null
  ) then
    raise exception 'ALREADY_ACTIVE_MEMBER' using errcode = 'P0001';
  end if;

  insert into public.memberships(household_id, user_id, role)
  values (v_invite.household_id, v_user_id, v_invite.role)
  on conflict (household_id, user_id)
  do update set
    role = excluded.role,
    status = 'active',
    deleted_at = null,
    version = public.memberships.version + 1,
    updated_at = now()
  returning * into v_membership;

  update public.invites
  set accepted_by = v_user_id, accepted_at = now()
  where id = v_invite.id;

  insert into public.audit_events(household_id, actor_id, event_name, entity_type, entity_id)
  values (v_invite.household_id, v_user_id, 'invite.accepted', 'membership', v_membership.id);

  return v_membership;
end
$$;

create or replace function public.validate_product_event_properties()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_common text[] := array[
    'schemaVersion', 'platform', 'appVersion', 'locale', 'occurredOffline'
  ];
  v_event_specific text[];
  v_allowed text[];
  v_key text;
begin
  if jsonb_typeof(new.properties) <> 'object' then
    raise exception 'INVALID_ANALYTICS_PROPERTIES' using errcode = 'P0001';
  end if;

  v_event_specific := case new.event_name
    when 'pilot_invitation_accepted'
      then array['invitationChannel']
    when 'household_created'
      then array['creationMode']
    when 'first_asset_passport_created'
      then array['captureSource', 'elapsedTimeBand']
    when 'asset_location_confirmed'
      then array['locationPrecision', 'hierarchyDepth']
    when 'first_evidence_reviewed'
      then array['evidenceKind', 'hasOriginal']
    when 'critical_register_25_completed'
      then array['completionTimeBand']
    when 'asset_retrieval_completed'
      then array['resultEntityType', 'retrievalSource']
    when 'access_grant_created'
      then array['role', 'expiryBand']
    when 'continuity_snapshot_exported'
      then array['format', 'assetCountBand', 'redacted']
    when 'household_returned_day_30_45'
      then array['returnDayBand']
    when 'reservation_paid'
      then array['planCode', 'currency', 'amountBand']
    when 'pilot_contract_signed'
      then array['partnerType', 'annualizedValueBand']
    else null
  end;

  if v_event_specific is null then
    raise exception 'UNKNOWN_ANALYTICS_EVENT' using errcode = 'P0001';
  end if;

  v_allowed := v_common || v_event_specific;

  foreach v_key in array v_allowed
  loop
    if not new.properties ? v_key then
      raise exception 'MISSING_ANALYTICS_PROPERTY' using errcode = 'P0001';
    end if;
  end loop;

  for v_key in select jsonb_object_keys(new.properties)
  loop
    if not v_key = any(v_allowed) then
      raise exception 'SENSITIVE_ANALYTICS_PROPERTY' using errcode = 'P0001';
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_each(new.properties) property
    where jsonb_typeof(property.value) in ('object', 'array')
  ) then
    raise exception 'INVALID_ANALYTICS_PROPERTY_VALUE' using errcode = 'P0001';
  end if;

  if new.properties->>'schemaVersion' <> '1' then
    raise exception 'INVALID_ANALYTICS_SCHEMA_VERSION' using errcode = 'P0001';
  end if;

  if new.properties->>'platform' not in ('ios', 'android', 'web')
     or new.properties->>'locale' not in ('en', 'ar')
     or coalesce(new.properties->>'appVersion', '') !~
        '^[0-9A-Za-z][0-9A-Za-z.+_-]{0,39}$'
     or jsonb_typeof(new.properties->'occurredOffline') <> 'boolean' then
    raise exception 'INVALID_ANALYTICS_PROPERTY_VALUE' using errcode = 'P0001';
  end if;

  case new.event_name
    when 'pilot_invitation_accepted' then
      if new.properties->>'invitationChannel' not in ('manual-code', 'deep-link') then
        raise exception 'INVALID_ANALYTICS_PROPERTY_VALUE' using errcode = 'P0001';
      end if;
    when 'household_created' then
      if new.properties->>'creationMode' not in ('sample', 'personal') then
        raise exception 'INVALID_ANALYTICS_PROPERTY_VALUE' using errcode = 'P0001';
      end if;
    when 'first_asset_passport_created' then
      if new.properties->>'captureSource' not in (
        'camera', 'image-library', 'document-import', 'manual'
      ) or new.properties->>'elapsedTimeBand' not in (
        'under-2-minutes', 'under-5-minutes', '5-10-minutes', 'over-10-minutes'
      ) then
        raise exception 'INVALID_ANALYTICS_PROPERTY_VALUE' using errcode = 'P0001';
      end if;
    when 'asset_location_confirmed' then
      if new.properties->>'locationPrecision' not in (
        'exact', 'user_placed', 'approximate', 'locality_only', 'unknown'
      ) or jsonb_typeof(new.properties->'hierarchyDepth') <> 'number'
         or (new.properties->>'hierarchyDepth')::integer not between 0 and 4 then
        raise exception 'INVALID_ANALYTICS_PROPERTY_VALUE' using errcode = 'P0001';
      end if;
    when 'first_evidence_reviewed' then
      if new.properties->>'evidenceKind' not in (
        'paper', 'artifact', 'media', 'record', 'note', 'link'
      ) or jsonb_typeof(new.properties->'hasOriginal') <> 'boolean' then
        raise exception 'INVALID_ANALYTICS_PROPERTY_VALUE' using errcode = 'P0001';
      end if;
    when 'critical_register_25_completed' then
      if new.properties->>'completionTimeBand' not in (
        'same-day', '2-7-days', '8-30-days', 'over-30-days'
      ) then
        raise exception 'INVALID_ANALYTICS_PROPERTY_VALUE' using errcode = 'P0001';
      end if;
    when 'asset_retrieval_completed' then
      if new.properties->>'resultEntityType' not in (
        'asset', 'place', 'space', 'evidence', 'member'
      ) or new.properties->>'retrievalSource' not in (
        'search', 'asset-list', 'place-view', 'deep-link'
      ) then
        raise exception 'INVALID_ANALYTICS_PROPERTY_VALUE' using errcode = 'P0001';
      end if;
    when 'access_grant_created' then
      if new.properties->>'role' not in ('owner', 'editor', 'viewer')
         or new.properties->>'expiryBand' not in (
           '24-hours', '7-days', '30-days', 'no-expiry'
         ) then
        raise exception 'INVALID_ANALYTICS_PROPERTY_VALUE' using errcode = 'P0001';
      end if;
    when 'continuity_snapshot_exported' then
      if new.properties->>'format' not in ('pdf', 'json-manifest')
         or new.properties->>'assetCountBand' not in (
           '1-5', '6-24', '25-49', '50-plus'
         ) or jsonb_typeof(new.properties->'redacted') <> 'boolean' then
        raise exception 'INVALID_ANALYTICS_PROPERTY_VALUE' using errcode = 'P0001';
      end if;
    when 'household_returned_day_30_45' then
      if new.properties->>'returnDayBand' not in ('30-34', '35-39', '40-45') then
        raise exception 'INVALID_ANALYTICS_PROPERTY_VALUE' using errcode = 'P0001';
      end if;
    when 'reservation_paid' then
      if new.properties->>'planCode' not in (
        'pilot-household', 'pilot-partner'
      ) or coalesce(new.properties->>'currency', '') !~ '^[A-Z]{3}$'
         or new.properties->>'amountBand' not in (
           'under-100', '100-499', '500-4999', '5000-plus'
         ) then
        raise exception 'INVALID_ANALYTICS_PROPERTY_VALUE' using errcode = 'P0001';
      end if;
    when 'pilot_contract_signed' then
      if new.properties->>'partnerType' not in (
        'broker', 'insurer', 'adviser', 'family-office',
        'estate-professional', 'residence-manager', 'other'
      ) or new.properties->>'annualizedValueBand' not in (
        'under-5000', '5000-9999', '10000-24999', '25000-plus'
      ) then
        raise exception 'INVALID_ANALYTICS_PROPERTY_VALUE' using errcode = 'P0001';
      end if;
  end case;

  return new;
end
$$;

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
  v_usage bigint;
begin
  if not public.can_edit_household(p_household_id) then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  -- Serialize quota accounting per household so concurrent intents cannot
  -- both observe the same remaining allowance.
  perform 1
  from public.households
  where id = p_household_id and deleted_at is null
  for update;

  if split_part(p_object_key, '/', 3) = ''
     or p_object_key <> p_household_id::text || '/' || p_id::text || '/' ||
        split_part(p_object_key, '/', 3) then
    raise exception 'INVALID_OBJECT_KEY' using errcode = 'P0001';
  end if;

  if p_checksum_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_CHECKSUM' using errcode = 'P0001';
  end if;

  if p_byte_size < 1 or p_byte_size > 10485760 then
    raise exception 'INVALID_FILE_SIZE' using errcode = 'P0001';
  end if;

  select *
  into v_blob
  from public.blob_objects
  where id = p_id
  for update;

  if found then
    if v_blob.household_id <> p_household_id
       or v_blob.expected_evidence_id <> p_evidence_id
       or v_blob.expected_evidence_version_id <> p_evidence_version_id
       or v_blob.object_key <> p_object_key
       or v_blob.checksum_sha256 <> p_checksum_sha256
       or v_blob.byte_size <> p_byte_size
       or v_blob.mime_type <> p_mime_type then
      raise exception 'UPLOAD_INTENT_CONFLICT' using errcode = 'P0001';
    end if;

    if v_blob.status <> 'upload-intent' or v_blob.deleted_at is not null then
      raise exception 'UPLOAD_ALREADY_COMPLETED' using errcode = 'P0001';
    end if;

    update public.blob_objects
    set intent_expires_at = now() + interval '15 minutes', updated_at = now()
    where id = p_id
    returning * into v_blob;

    return v_blob;
  end if;

  select coalesce(sum(byte_size), 0)
  into v_usage
  from public.blob_objects
  where household_id = p_household_id
    and deleted_at is null
    and (
      status <> 'upload-intent'
      or intent_expires_at > now()
    );

  if v_usage + p_byte_size > 41943040 then
    raise exception 'HOUSEHOLD_STORAGE_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.blob_objects(
    id, household_id, expected_evidence_id, expected_evidence_version_id,
    object_key, checksum_sha256, byte_size, mime_type, status,
    intent_expires_at, created_by
  )
  values (
    p_id, p_household_id, p_evidence_id, p_evidence_version_id, p_object_key,
    p_checksum_sha256, p_byte_size, p_mime_type, 'upload-intent',
    now() + interval '15 minutes', auth.uid()
  )
  returning * into v_blob;

  return v_blob;
end
$$;

create or replace function public.mark_blob_stored(
  p_id uuid,
  p_checksum_sha256 text,
  p_byte_size bigint,
  p_verified_actor_id uuid
)
returns public.blob_objects
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_blob public.blob_objects;
begin
  select *
  into v_blob
  from public.blob_objects
  where id = p_id and deleted_at is null
  for update;

  if not found or v_blob.created_by <> p_verified_actor_id then
    raise exception 'UPLOAD_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_blob.checksum_sha256 <> p_checksum_sha256 then
    raise exception 'UPLOAD_CHECKSUM_MISMATCH' using errcode = 'P0001';
  end if;

  if v_blob.byte_size <> p_byte_size then
    raise exception 'UPLOAD_SIZE_MISMATCH' using errcode = 'P0001';
  end if;

  if v_blob.status = 'stored' then
    return v_blob;
  end if;

  if v_blob.status <> 'upload-intent' then
    raise exception 'UPLOAD_STATE_CONFLICT' using errcode = 'P0001';
  end if;

  update public.blob_objects
  set
    status = 'stored',
    intent_expires_at = null,
    updated_at = now()
  where id = p_id
  returning * into v_blob;

  return v_blob;
end
$$;

create trigger product_event_privacy_guard
before insert or update on public.product_events
for each row execute function public.validate_product_event_properties();

create or replace function public.record_product_event(
  p_event_name text,
  p_household_id uuid default null,
  p_properties jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if p_household_id is not null and not public.is_household_member(p_household_id) then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  insert into public.product_events(household_id, actor_id, event_name, properties)
  values (p_household_id, auth.uid(), p_event_name, coalesce(p_properties, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end
$$;

create or replace function public.apply_sync_operation(p_operation jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_command_record jsonb := coalesce(p_operation->'command', '{}'::jsonb);
  v_id uuid := coalesce(
    nullif(p_operation->>'operationId', ''),
    nullif(p_operation->>'id', '')
  )::uuid;
  v_household uuid := coalesce(
    nullif(p_operation->>'householdId', ''),
    nullif(v_command_record->>'householdId', '')
  )::uuid;
  v_entity_id uuid := coalesce(
    nullif(v_command_record->>'aggregateId', ''),
    nullif(p_operation->>'entityId', '')
  )::uuid;
  v_entity_type text := coalesce(
    nullif(split_part(v_command_record->>'type', '.', 1), ''),
    nullif(p_operation->>'entityType', '')
  );
  v_command text := coalesce(
    nullif(v_command_record->>'type', ''),
    nullif(p_operation->>'command', '')
  );
  v_base_version integer := coalesce(
    nullif(v_command_record->>'observedVersion', '')::integer,
    nullif(p_operation->>'baseVersion', '')::integer,
    0
  );
  v_payload jsonb := coalesce(
    v_command_record->'payload',
    p_operation->'payload',
    '{}'::jsonb
  );
  v_idempotency_key text := coalesce(
    nullif(v_command_record->>'idempotencyKey', ''),
    v_id::text
  );
  v_device_id uuid := case
    when coalesce(v_command_record->>'deviceId', p_operation->>'deviceId', '')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then coalesce(v_command_record->>'deviceId', p_operation->>'deviceId')::uuid
    else null
  end;
  v_client_created_at timestamptz := coalesce(
    nullif(v_command_record->>'occurredAt', '')::timestamptz,
    nullif(p_operation->>'createdAt', '')::timestamptz,
    now()
  );
  v_result jsonb;
  v_request_hash text;
  v_existing_request_hash text;
  v_version integer;
  v_cursor bigint;
  v_active_location public.asset_location_revisions;
  v_asset_record_version integer;
  v_evidence_record_version integer;
  v_current_evidence_version integer;
  v_blob public.blob_objects;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if coalesce((p_operation->>'operationVersion')::integer, 1) <> 1
     or coalesce((v_command_record->>'commandVersion')::integer, 1) <> 1 then
    raise exception 'UNSUPPORTED_CONTRACT_VERSION' using errcode = 'P0001';
  end if;

  if nullif(p_operation->>'householdId', '') is not null
     and nullif(v_command_record->>'householdId', '') is not null
     and p_operation->>'householdId' <> v_command_record->>'householdId' then
    raise exception 'HOUSEHOLD_SCOPE_MISMATCH' using errcode = 'P0001';
  end if;

  if nullif(p_operation->>'entityType', '') is not null
     and nullif(v_command_record->>'type', '') is not null
     and p_operation->>'entityType' <> split_part(v_command_record->>'type', '.', 1) then
    raise exception 'ENTITY_TYPE_MISMATCH' using errcode = 'P0001';
  end if;

  if v_device_id is null then
    raise exception 'INVALID_DEVICE_ID' using errcode = 'P0001';
  end if;

  if not public.can_edit_household(v_household) then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  if octet_length(p_operation::text) > 1048576
     or length(v_idempotency_key) < 1
     or length(v_idempotency_key) > 128 then
    raise exception 'INVALID_OPERATION_SIZE' using errcode = 'P0001';
  end if;

  -- Serialize exact retries before checking the operation ledger so two
  -- devices cannot both mutate and then manufacture a version conflict.
  perform pg_advisory_xact_lock(
    hashtextextended(v_household::text || ':' || v_idempotency_key, 0)
  );

  v_request_hash := encode(
    digest(
      jsonb_build_object(
        'actorId', v_actor,
        'householdId', v_household,
        'deviceId', v_device_id,
        'entityType', v_entity_type,
        'entityId', v_entity_id,
        'baseVersion', v_base_version,
        'command', v_command,
        'payload', v_payload
      )::text,
      'sha256'
    ),
    'hex'
  );

  select result, request_hash
  into v_result, v_existing_request_hash
  from public.sync_operations
  where household_id = v_household
    and (id = v_id or idempotency_key = v_idempotency_key)
  limit 1;

  if found then
    if v_existing_request_hash <> v_request_hash then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return v_result || jsonb_build_object('idempotent', true);
  end if;

  if v_command in ('value.create', 'value.update') then
    if
      (v_payload->>'amountMinor') is null
      or (v_payload->>'amountMinor') !~ '^[0-9]+$'
      or (v_payload->>'amountMinor')::numeric > 9007199254740991
      or (v_payload->>'currency') is null
      or (v_payload->>'currency') !~ '^[A-Z]{3}$'
      or (v_payload->>'asOf') is null
      or (v_payload->>'asOf') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or (v_payload->>'asOf')::date > current_date
      or coalesce(v_payload->>'source', 'user-entered') <> 'user-entered'
    then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end if;

    perform 1
    from public.assets
    where id = (v_payload->>'assetId')::uuid
      and household_id = v_household
      and lifecycle = 'active'
      and deleted_at is null;

    if not found then
      raise exception 'ASSET_UNAVAILABLE' using errcode = 'P0001';
    end if;
  end if;

  if v_command = 'place.update' then
    if
      (v_payload ? 'name' and char_length(trim(coalesce(v_payload->>'name', ''))) not between 1 and 160)
      or (
        v_payload ? 'regionLabel'
        and char_length(trim(coalesce(v_payload->>'regionLabel', ''))) not between 1 and 120
      )
      or (
        v_payload ?| array[
          'latitude', 'longitude', 'locationSource', 'locationPrecision',
          'horizontalAccuracyM', 'observedAt', 'confirmedAt'
        ]
        and not (v_payload ?& array[
          'latitude', 'longitude', 'locationSource', 'locationPrecision',
          'horizontalAccuracyM', 'observedAt', 'confirmedAt'
        ])
      )
    then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end if;
  end if;

  if v_command in ('space.create', 'space.update') then
    if
      char_length(trim(coalesce(v_payload->>'name', ''))) not between 1 and 120
      or coalesce(v_payload->>'kind', '') not in ('room', 'zone', 'container')
      or nullif(v_payload->>'placeId', '') is null
    then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end if;
  end if;

  if v_command = 'place.create' then
    if v_base_version <> 0 then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

    insert into public.places(
      id, household_id, name, kind, tenure, address_text, region_label,
      latitude, longitude,
      location_source, location_precision, horizontal_accuracy_m,
      location_observed_at, location_confirmed_at, created_by
    )
    values (
      v_entity_id,
      v_household,
      trim(v_payload->>'name'),
      coalesce(v_payload->>'kind', 'home'),
      coalesce(v_payload->>'tenure', 'unknown'),
      coalesce(
        nullif(v_payload->>'addressText', ''),
        nullif(v_payload->>'addressSummary', '')
      ),
      nullif(trim(v_payload->>'regionLabel'), ''),
      nullif(v_payload->>'latitude', '')::double precision,
      nullif(v_payload->>'longitude', '')::double precision,
      coalesce(v_payload->>'locationSource', 'unknown'),
      coalesce(v_payload->>'locationPrecision', 'locality_only'),
      nullif(v_payload->>'horizontalAccuracyM', '')::double precision,
      nullif(v_payload->>'observedAt', '')::timestamptz,
      nullif(v_payload->>'confirmedAt', '')::timestamptz,
      v_actor
    );
    v_version := 1;

  elsif v_command = 'place.update' then
    update public.places
    set
      name = case
        when v_payload ? 'name' then trim(v_payload->>'name')
        else name
      end,
      address_text = case
        when v_payload ? 'addressSummary'
          then nullif(trim(v_payload->>'addressSummary'), '')
        when v_payload ? 'addressText'
          then nullif(trim(v_payload->>'addressText'), '')
        else address_text
      end,
      region_label = case
        when v_payload ? 'regionLabel'
          then nullif(trim(v_payload->>'regionLabel'), '')
        else region_label
      end,
      latitude = case
        when v_payload ? 'latitude'
          then nullif(v_payload->>'latitude', '')::double precision
        else latitude
      end,
      longitude = case
        when v_payload ? 'longitude'
          then nullif(v_payload->>'longitude', '')::double precision
        else longitude
      end,
      location_source = case
        when v_payload ? 'locationSource'
          then coalesce(nullif(v_payload->>'locationSource', ''), 'not_set')
        else location_source
      end,
      location_precision = case
        when v_payload ? 'locationPrecision'
          then coalesce(nullif(v_payload->>'locationPrecision', ''), 'locality_only')
        else location_precision
      end,
      horizontal_accuracy_m = case
        when v_payload ? 'horizontalAccuracyM'
          then nullif(v_payload->>'horizontalAccuracyM', '')::double precision
        else horizontal_accuracy_m
      end,
      location_observed_at = case
        when v_payload ? 'observedAt'
          then nullif(v_payload->>'observedAt', '')::timestamptz
        else location_observed_at
      end,
      location_confirmed_at = case
        when v_payload ? 'confirmedAt'
          then nullif(v_payload->>'confirmedAt', '')::timestamptz
        else location_confirmed_at
      end,
      version = version + 1,
      updated_at = now()
    where id = v_entity_id
      and household_id = v_household
      and version = v_base_version
      and deleted_at is null
    returning version into v_version;

    if not found then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

  elsif v_command = 'space.create' then
    if v_base_version <> 0 then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

    insert into public.spaces(
      id, household_id, place_id, parent_space_id, name, kind, ordinal, created_by
    )
    values (
      v_entity_id,
      v_household,
      (v_payload->>'placeId')::uuid,
      nullif(v_payload->>'parentSpaceId', '')::uuid,
      trim(v_payload->>'name'),
      coalesce(v_payload->>'kind', 'room'),
      coalesce((v_payload->>'ordinal')::integer, 0),
      v_actor
    );
    v_version := 1;

  elsif v_command = 'space.update' then
    if
      nullif(v_payload->>'parentSpaceId', '')::uuid = v_entity_id
      or exists (
        with recursive ancestors as (
          select id, parent_space_id
          from public.spaces
          where id = nullif(v_payload->>'parentSpaceId', '')::uuid
            and household_id = v_household
            and place_id = (v_payload->>'placeId')::uuid
            and deleted_at is null
          union all
          select parent.id, parent.parent_space_id
          from public.spaces parent
          join ancestors child on parent.id = child.parent_space_id
          where parent.household_id = v_household
            and parent.place_id = (v_payload->>'placeId')::uuid
            and parent.deleted_at is null
        )
        select 1 from ancestors where id = v_entity_id
      )
    then
      raise exception 'INVALID_SPACE_HIERARCHY' using errcode = 'P0001';
    end if;

    update public.spaces
    set
      parent_space_id = nullif(v_payload->>'parentSpaceId', '')::uuid,
      name = trim(v_payload->>'name'),
      kind = v_payload->>'kind',
      ordinal = coalesce((v_payload->>'ordinal')::integer, ordinal),
      version = version + 1,
      updated_at = now()
    where id = v_entity_id
      and household_id = v_household
      and place_id = (v_payload->>'placeId')::uuid
      and version = v_base_version
      and deleted_at is null
    returning version into v_version;

    if not found then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

  elsif v_command = 'asset.create' then
    if v_base_version <> 0 then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

    insert into public.assets(
      id, household_id, name, category_id, category_path, description,
      importance, profile, created_by
    )
    values (
      v_entity_id,
      v_household,
      trim(v_payload->>'name'),
      v_payload->>'categoryId',
      coalesce(
        array(select jsonb_array_elements_text(v_payload->'categoryPath')),
        '{}'::text[]
      ),
      nullif(v_payload->>'description', ''),
      coalesce(v_payload->>'importance', 'ordinary'),
      coalesce(v_payload->'profile', '{}'::jsonb),
      v_actor
    );
    v_version := 1;

  elsif v_command = 'asset.update' then
    update public.assets
    set
      name = coalesce(nullif(trim(v_payload->>'name'), ''), name),
      description = case
        when v_payload ? 'description' then nullif(v_payload->>'description', '')
        else description
      end,
      profile = case when v_payload ? 'profile' then v_payload->'profile' else profile end,
      version = version + 1,
      updated_at = now()
    where id = v_entity_id
      and household_id = v_household
      and version = v_base_version
      and deleted_at is null
    returning version into v_version;

    if not found then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

  elsif v_command = 'asset.archive' then
    update public.assets
    set lifecycle = 'archived', version = version + 1, updated_at = now()
    where id = v_entity_id
      and household_id = v_household
      and version = v_base_version
      and deleted_at is null
    returning version into v_version;

    if not found then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

  elsif v_command = 'asset.restore' then
    update public.assets
    set lifecycle = 'active', version = version + 1, updated_at = now()
    where id = v_entity_id
      and household_id = v_household
      and version = v_base_version
      and deleted_at is null
    returning version into v_version;

    if not found then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

  elsif v_command = 'value.create' then
    if v_base_version <> 0 then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

    insert into public.asset_value_assertions(
      id, household_id, asset_id, amount_minor, currency, as_of, source,
      created_by
    )
    values (
      v_entity_id,
      v_household,
      (v_payload->>'assetId')::uuid,
      (v_payload->>'amountMinor')::bigint,
      upper(v_payload->>'currency'),
      (v_payload->>'asOf')::date,
      coalesce(v_payload->>'source', 'user-entered'),
      v_actor
    );
    v_version := 1;

  elsif v_command = 'value.update' then
    update public.asset_value_assertions
    set
      amount_minor = (v_payload->>'amountMinor')::bigint,
      currency = upper(v_payload->>'currency'),
      as_of = (v_payload->>'asOf')::date,
      version = version + 1,
      updated_at = now()
    where id = v_entity_id
      and household_id = v_household
      and asset_id = (v_payload->>'assetId')::uuid
      and version = v_base_version
      and deleted_at is null
    returning version into v_version;

    if not found then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

  elsif v_command = 'value.delete' then
    update public.asset_value_assertions
    set
      version = version + 1,
      updated_at = now(),
      deleted_at = now()
    where id = v_entity_id
      and household_id = v_household
      and version = v_base_version
      and deleted_at is null
    returning version into v_version;

    if not found then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

  elsif v_command = 'asset.move' then
    select *
    into v_active_location
    from public.asset_location_revisions
    where asset_id = v_entity_id and household_id = v_household and valid_to is null
    for update;

    if found and v_active_location.revision <> v_base_version then
      raise exception 'LOCATION_CONFLICT' using errcode = 'P0001';
    end if;

    if not found and v_base_version <> 0 then
      raise exception 'LOCATION_CONFLICT' using errcode = 'P0001';
    end if;

    update public.asset_location_revisions
    set valid_to = now()
    where asset_id = v_entity_id
      and household_id = v_household
      and valid_to is null;

    v_version := coalesce(v_active_location.revision, 0) + 1;

    insert into public.asset_location_revisions(
      id, household_id, asset_id, place_id, space_id, status, location_detail,
      source, revision, proposed_by
    )
    values (
      coalesce(nullif(v_payload->>'assignmentId', '')::uuid, gen_random_uuid()),
      v_household,
      v_entity_id,
      nullif(v_payload->>'placeId', '')::uuid,
      nullif(v_payload->>'spaceId', '')::uuid,
      v_payload->>'status',
      nullif(v_payload->>'locationDetail', ''),
      coalesce(v_payload->>'source', 'user'),
      v_version,
      v_actor
    );

    update public.assets
    set version = version + 1, updated_at = now()
    where id = v_entity_id and household_id = v_household and deleted_at is null
    returning version into v_asset_record_version;

  elsif v_command = 'evidence.create' then
    if v_base_version <> 0 then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

    insert into public.evidence(
      id, household_id, asset_id, kind, relation, title, storage_state,
      created_by
    )
    values (
      v_entity_id,
      v_household,
      (v_payload->>'assetId')::uuid,
      v_payload->>'kind',
      coalesce(v_payload->>'relation', 'other'),
      coalesce(
        nullif(trim(v_payload->>'title'), ''),
        nullif(trim(v_payload->>'fileName'), ''),
        'Supporting evidence'
      ),
      'queued',
      v_actor
    );
    v_version := 1;

  elsif v_command = 'evidence.review' then
    update public.evidence
    set
      review_status = coalesce(v_payload->>'reviewStatus', 'reviewed'),
      version = version + 1,
      updated_at = now()
    where id = v_entity_id
      and household_id = v_household
      and version = v_base_version
      and deleted_at is null
    returning version into v_version;

    if not found then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

  elsif v_command in ('evidence.version.create', 'evidence.version.add') then
    perform 1
    from public.evidence
    where id = (v_payload->>'evidenceId')::uuid
      and household_id = v_household
      and deleted_at is null
    for update;

    if not found then
      raise exception 'EVIDENCE_NOT_FOUND' using errcode = 'P0001';
    end if;

    select coalesce(max(version_number), 0)
    into v_current_evidence_version
    from public.evidence_versions
    where evidence_id = (v_payload->>'evidenceId')::uuid
      and household_id = v_household;

    if v_base_version <> v_current_evidence_version then
      raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
    end if;

    if nullif(v_payload->>'blobObjectId', '') is not null then
      select *
      into v_blob
      from public.blob_objects
      where id = (v_payload->>'blobObjectId')::uuid
        and household_id = v_household
        and status = 'stored'
        and expected_evidence_id = (v_payload->>'evidenceId')::uuid
        and expected_evidence_version_id = v_entity_id
        and deleted_at is null;

      if not found then
        raise exception 'BLOB_NOT_READY' using errcode = 'P0001';
      end if;

      if nullif(v_payload->>'checksumSha256', '') is distinct from v_blob.checksum_sha256
         or nullif(v_payload->>'byteSize', '')::bigint is distinct from v_blob.byte_size
         or nullif(v_payload->>'mimeType', '') is distinct from v_blob.mime_type then
        raise exception 'BLOB_METADATA_CONFLICT' using errcode = 'P0001';
      end if;
    end if;

    insert into public.evidence_versions(
      id, household_id, evidence_id, blob_object_id, version_number,
      file_name, mime_type, byte_size, checksum_sha256, created_by
    )
    values (
      v_entity_id,
      v_household,
      (v_payload->>'evidenceId')::uuid,
      nullif(v_payload->>'blobObjectId', '')::uuid,
      v_current_evidence_version + 1,
      nullif(v_payload->>'fileName', ''),
      coalesce(v_blob.mime_type, nullif(v_payload->>'mimeType', '')),
      coalesce(v_blob.byte_size, nullif(v_payload->>'byteSize', '')::bigint),
      coalesce(v_blob.checksum_sha256, nullif(v_payload->>'checksumSha256', '')),
      v_actor
    );
    v_version := v_current_evidence_version + 1;

    update public.evidence
    set
      storage_state = case
        when v_blob.id is not null then 'cloud-acknowledged'
        else 'missing-original'
      end,
      version = version + 1,
      updated_at = now()
    where id = (v_payload->>'evidenceId')::uuid
      and household_id = v_household
    returning version into v_evidence_record_version;

  else
    raise exception 'UNSUPPORTED_COMMAND' using errcode = 'P0001';
  end if;

  v_result := jsonb_build_object(
    'operationId', v_id,
    'entityId', v_entity_id,
    'entityVersion', v_version,
    'status', 'applied',
    'idempotent', false
  );

  if v_command = 'asset.move' then
    v_result := v_result || jsonb_build_object(
      'entityVersion', v_asset_record_version,
      'locationVersion', v_version
    );
  elsif v_command in ('evidence.version.create', 'evidence.version.add') then
    v_result := v_result || jsonb_build_object(
      'entityVersion', v_evidence_record_version,
      'evidenceVersionNumber', v_version
    );
  end if;

  insert into public.sync_operations(
    id, household_id, idempotency_key, request_hash, actor_id, device_id,
    entity_type, entity_id, base_version, command, payload, client_created_at,
    status, result
  )
  values (
    v_id,
    v_household,
    v_idempotency_key,
    v_request_hash,
    v_actor,
    v_device_id,
    v_entity_type,
    v_entity_id,
    v_base_version,
    v_command,
    v_payload,
    v_client_created_at,
    'applied',
    v_result
  )
  returning cursor into v_cursor;

  v_result := v_result || jsonb_build_object('cursor', v_cursor);

  update public.sync_operations set result = v_result where id = v_id;

  insert into public.audit_events(
    household_id, actor_id, event_name, entity_type, entity_id,
    metadata
  )
  values (
    v_household,
    v_actor,
    'sync.' || v_command,
    v_entity_type,
    v_entity_id,
    jsonb_build_object('operationId', v_id, 'version', v_version)
  );

  return v_result;
exception
  when unique_violation then
    select result, request_hash
    into v_result, v_existing_request_hash
    from public.sync_operations
    where household_id = v_household
      and (id = v_id or idempotency_key = v_idempotency_key)
    limit 1;

    if found then
      if v_existing_request_hash <> v_request_hash then
        raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
      end if;
      return v_result || jsonb_build_object('idempotent', true);
    end if;
    raise;
end
$$;

create or replace function public.pull_sync_operations(
  p_household_id uuid,
  p_after_cursor bigint default 0,
  p_limit integer default 250
)
returns table(
  cursor bigint,
  operation_id uuid,
  entity_type text,
  entity_id uuid,
  command text,
  payload jsonb,
  result jsonb,
  received_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    so.cursor,
    so.id,
    so.entity_type,
    so.entity_id,
    so.command,
    so.payload,
    so.result,
    so.received_at
  from public.sync_operations so
  where public.is_household_member(p_household_id)
    and so.household_id = p_household_id
    and so.cursor > greatest(p_after_cursor, 0)
  order by so.cursor
  limit least(greatest(p_limit, 1), 500)
$$;

create or replace function public.create_export_snapshot(
  p_household_id uuid,
  p_scope jsonb default '{}'::jsonb
)
returns public.export_snapshots
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_snapshot public.export_snapshots;
begin
  if not public.can_edit_household(p_household_id) then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  insert into public.export_snapshots(household_id, requested_by, scope)
  values (p_household_id, auth.uid(), coalesce(p_scope, '{}'::jsonb))
  returning * into v_snapshot;

  insert into public.audit_events(household_id, actor_id, event_name, entity_type, entity_id)
  values (p_household_id, auth.uid(), 'export.queued', 'export', v_snapshot.id);

  return v_snapshot;
end
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'households', 'memberships', 'devices', 'places', 'spaces', 'assets',
    'asset_value_assertions', 'asset_location_revisions', 'evidence',
    'blob_objects', 'evidence_versions',
    'invites', 'sync_operations', 'audit_events', 'export_snapshots',
    'product_events', 'pilot_enrollments'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
  end loop;
end
$$;

create policy households_read on public.households
for select using (public.is_household_member(id));

create policy memberships_read on public.memberships
for select using (public.is_household_member(household_id));

create policy memberships_admin_update on public.memberships
for update using (public.can_admin_household(household_id))
with check (public.can_admin_household(household_id));

create policy invites_owner_read on public.invites
for select using (public.can_admin_household(household_id));

create policy audit_events_owner_read on public.audit_events
for select using (public.can_admin_household(household_id));

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'devices', 'places', 'spaces', 'assets', 'asset_value_assertions',
    'asset_location_revisions', 'evidence', 'blob_objects',
    'evidence_versions', 'sync_operations', 'product_events'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select using (public.is_household_member(household_id))',
      v_table || '_read',
      v_table
    );
  end loop;
end
$$;

create policy export_snapshots_editor_read on public.export_snapshots
for select using (
  requested_by = auth.uid()
  or public.can_edit_household(household_id)
);

revoke all on all tables in schema public from anon;
revoke insert, update, delete on all tables in schema public from authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant select on public.households, public.memberships, public.devices, public.places,
  public.spaces, public.assets, public.asset_value_assertions,
  public.asset_location_revisions, public.evidence, public.blob_objects,
  public.evidence_versions, public.invites,
  public.sync_operations, public.audit_events, public.export_snapshots
to authenticated;

grant execute on function public.current_household_role(uuid) to authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.can_edit_household(uuid) to authenticated;
grant execute on function public.can_admin_household(uuid) to authenticated;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.complete_household_onboarding(uuid) to authenticated;
grant execute on function public.create_household_invite(uuid, public.household_role, interval) to authenticated;
grant execute on function public.accept_household_invite(text) to authenticated;
grant execute on function public.apply_sync_operation(jsonb) to authenticated;
grant execute on function public.pull_sync_operations(uuid, bigint, integer) to authenticated;
grant execute on function public.create_export_snapshot(uuid, jsonb) to authenticated;
grant execute on function public.record_product_event(text, uuid, jsonb) to authenticated;
grant execute on function public.create_blob_upload_intent(
  uuid, uuid, uuid, uuid, text, text, bigint, text
) to authenticated;
grant execute on function public.mark_blob_stored(uuid, text, bigint, uuid) to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence',
  'evidence',
  false,
  10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf', 'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy evidence_objects_read on storage.objects
for select to authenticated
using (
  bucket_id = 'evidence'
  and public.is_household_member((storage.foldername(name))[1]::uuid)
  and exists (
    select 1
    from public.blob_objects blob
    where blob.household_id = (storage.foldername(name))[1]::uuid
      and blob.object_key = name
      and (
        blob.status = 'stored'
        or (
          blob.status = 'upload-intent'
          and blob.created_by = auth.uid()
          and blob.intent_expires_at > now()
        )
      )
      and blob.deleted_at is null
  )
);

create policy evidence_objects_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'evidence'
  and public.can_edit_household((storage.foldername(name))[1]::uuid)
  and exists (
    select 1
    from public.blob_objects blob
    where blob.household_id = (storage.foldername(name))[1]::uuid
      and blob.object_key = name
      and blob.status = 'upload-intent'
      and blob.intent_expires_at > now()
      and coalesce((metadata->>'size')::bigint, -1) = blob.byte_size
      and blob.created_by = auth.uid()
      and blob.deleted_at is null
  )
);

commit;
