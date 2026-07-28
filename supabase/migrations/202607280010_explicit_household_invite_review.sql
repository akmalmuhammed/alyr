begin;

-- Return only the minimum information an authenticated recipient needs to
-- make a deliberate membership decision. The one-time bearer remains the
-- authorization input, and invalid, expired, revoked, already-used,
-- self-issued, or email-mismatched invitations reveal no household metadata.
create or replace function public.preview_household_invite(p_code text)
returns table(
  household_name text,
  role public.household_role,
  expires_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_invite public.invites;
  v_reservation public.household_invite_signup_reservations;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select lower(trim(email))
  into v_user_email
  from auth.users
  where id = v_user_id;
  if v_user_email is null then
    raise exception 'INVITE_INVALID_OR_EXPIRED'
      using errcode = 'P0001';
  end if;

  select invite.*
  into v_invite
  from public.invites as invite
  join public.households as household
    on household.id = invite.household_id
   and household.deleted_at is null
  where invite.code_hash =
      encode(digest(upper(trim(p_code)), 'sha256'), 'hex')
    and invite.accepted_at is null
    and invite.revoked_at is null
    and invite.expires_at > now()
    and invite.created_by <> v_user_id;
  if not found or v_invite.role not in (
    'editor'::public.household_role,
    'viewer'::public.household_role
  ) then
    raise exception 'INVITE_INVALID_OR_EXPIRED'
      using errcode = 'P0001';
  end if;

  select reservation.*
  into v_reservation
  from public.household_invite_signup_reservations as reservation
  where reservation.invite_id = v_invite.id;
  if found and (
    v_reservation.expires_at <= now()
    or v_reservation.email_hash <>
      encode(digest(v_user_email, 'sha256'), 'hex')
  ) then
    raise exception 'INVITE_INVALID_OR_EXPIRED'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.memberships as membership
    where membership.household_id = v_invite.household_id
      and membership.user_id = v_user_id
      and membership.status = 'active'
      and membership.deleted_at is null
  ) then
    raise exception 'ALREADY_ACTIVE_MEMBER' using errcode = 'P0001';
  end if;

  return query
  select household.name, v_invite.role, v_invite.expires_at
  from public.households as household
  where household.id = v_invite.household_id
    and household.deleted_at is null;
end
$$;

revoke all on function public.preview_household_invite(text)
  from public, anon;
grant execute on function public.preview_household_invite(text)
  to authenticated;

commit;
