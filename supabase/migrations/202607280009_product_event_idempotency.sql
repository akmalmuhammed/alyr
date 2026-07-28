begin;

alter table public.product_events
  add column client_event_id uuid;

update public.product_events
set client_event_id = id
where client_event_id is null;

alter table public.product_events
  alter column client_event_id set default gen_random_uuid(),
  alter column client_event_id set not null;

create unique index product_events_actor_client_event_id_unique
on public.product_events(actor_id, client_event_id)
where actor_id is not null;

revoke all on function public.record_product_event(
  text,
  uuid,
  jsonb
) from public, anon, authenticated;
drop function public.record_product_event(text, uuid, jsonb);

create or replace function public.record_product_event(
  p_event_name text,
  p_household_id uuid,
  p_properties jsonb,
  p_client_event_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_id uuid;
  v_existing public.product_events%rowtype;
  v_properties jsonb := coalesce(p_properties, '{}'::jsonb);
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if p_client_event_id is null then
    raise exception 'ANALYTICS_IDEMPOTENCY_REQUIRED'
      using errcode = 'P0001';
  end if;

  if p_household_id is null
     or not public.is_household_member(p_household_id) then
    raise exception 'PERMISSION_DENIED' using errcode = 'P0001';
  end if;

  insert into public.product_events(
    household_id,
    actor_id,
    event_name,
    properties,
    client_event_id
  )
  values (
    p_household_id,
    v_actor_id,
    p_event_name,
    v_properties,
    p_client_event_id
  )
  on conflict (actor_id, client_event_id)
    where actor_id is not null
  do nothing
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  select *
  into v_existing
  from public.product_events
  where actor_id = v_actor_id
    and client_event_id = p_client_event_id;

  if not found then
    raise exception 'ANALYTICS_ACKNOWLEDGEMENT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  if v_existing.household_id is distinct from p_household_id
     or v_existing.event_name is distinct from p_event_name
     or v_existing.properties is distinct from v_properties then
    raise exception 'ANALYTICS_IDEMPOTENCY_CONFLICT'
      using errcode = 'P0001';
  end if;

  return v_existing.id;
end
$$;

revoke all on function public.record_product_event(
  text,
  uuid,
  jsonb,
  uuid
) from public, anon;
grant execute on function public.record_product_event(
  text,
  uuid,
  jsonb,
  uuid
) to authenticated;

commit;
