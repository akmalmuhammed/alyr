-- Keep Place classification authoritative when a versioned Place update is
-- accepted. The original sync function already stores `kind` and `tenure` on
-- create; this trigger extends the same reviewed payload to updates without
-- adding a second record-version bump.

create or replace function public.apply_place_classification_from_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  v_tenure text;
begin
  if
    new.status <> 'applied'
    or new.entity_type <> 'place'
    or new.command not in ('place.create', 'place.update')
  then
    return new;
  end if;

  if new.payload ? 'kind' then
    v_kind := coalesce(nullif(trim(new.payload->>'kind'), ''), 'unknown');
    if v_kind not in (
      'home', 'property', 'storage', 'temporary', 'other', 'unknown'
    ) then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end if;
  end if;

  if new.payload ? 'tenure' then
    v_tenure := coalesce(
      nullif(trim(new.payload->>'tenure'), ''),
      'unknown'
    );
    if v_tenure not in (
      'owned', 'rented', 'managed', 'borrowed', 'unknown'
    ) then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
    end if;
  end if;

  if v_kind is null and v_tenure is null then
    return new;
  end if;

  update public.places
  set
    kind = coalesce(v_kind, kind),
    tenure = coalesce(v_tenure, tenure)
  where id = new.entity_id
    and household_id = new.household_id
    and deleted_at is null;

  if not found then
    raise exception 'VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  return new;
end
$$;

revoke all on function public.apply_place_classification_from_sync()
  from public, anon, authenticated;

drop trigger if exists sync_place_classification
  on public.sync_operations;

create trigger sync_place_classification
after insert on public.sync_operations
for each row
when (
  new.entity_type = 'place'
  and new.command in ('place.create', 'place.update')
)
execute function public.apply_place_classification_from_sync();
