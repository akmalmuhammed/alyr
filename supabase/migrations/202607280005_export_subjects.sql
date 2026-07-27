-- Keep the cloud continuity manifest complete after Place documents and owned
-- Property values become first-class sync subjects. Every exported value and
-- evidence row carries an explicit discriminator and exactly one parent ID.

create or replace function public.read_export_manifest_source(
  p_snapshot_id uuid,
  p_request_hash text,
  p_claim_token uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with snapshot as (
    select
      export_snapshot.household_id,
      export_snapshot.scope
    from public.export_snapshots export_snapshot
    where export_snapshot.id = p_snapshot_id
      and export_snapshot.requested_by = auth.uid()
      and export_snapshot.request_hash = p_request_hash
      and export_snapshot.status = 'processing'
      and export_snapshot.processing_token = p_claim_token
      and public.can_edit_household(export_snapshot.household_id)
  ),
  household_record as (
    select
      household.id,
      household.name,
      household.version,
      household.created_at,
      household.updated_at
    from public.households household
    join snapshot on snapshot.household_id = household.id
    where household.deleted_at is null
  ),
  selected_assets as (
    select
      asset.id,
      asset.name,
      asset.category_id,
      asset.category_path,
      asset.description,
      asset.importance,
      asset.lifecycle,
      asset.profile,
      asset.version,
      asset.created_at,
      asset.updated_at
    from public.assets asset
    join snapshot on snapshot.household_id = asset.household_id
    where asset.deleted_at is null
      and (
        jsonb_array_length(snapshot.scope->'assetIds') = 0
        or exists (
          select 1
          from jsonb_array_elements_text(
            snapshot.scope->'assetIds'
          ) as requested(asset_id)
          where requested.asset_id::uuid = asset.id
        )
      )
  ),
  household_places as (
    select
      place.id,
      place.name,
      place.kind,
      place.tenure,
      place.address_text,
      place.region_label,
      place.latitude,
      place.longitude,
      place.location_source,
      place.location_precision,
      place.horizontal_accuracy_m,
      place.location_observed_at,
      place.location_confirmed_at,
      place.version,
      place.created_at,
      place.updated_at
    from public.places place
    join snapshot on snapshot.household_id = place.household_id
    where place.deleted_at is null
  ),
  household_spaces as (
    select
      space.id,
      space.place_id,
      space.parent_space_id,
      space.name,
      space.kind,
      space.ordinal,
      space.version,
      space.created_at,
      space.updated_at
    from public.spaces space
    join snapshot on snapshot.household_id = space.household_id
    where space.deleted_at is null
  ),
  selected_values as (
    select
      value_assertion.id,
      value_assertion.asset_id,
      value_assertion.place_id,
      case
        when value_assertion.asset_id is not null then 'asset'
        else 'place'
      end as subject_kind,
      value_assertion.amount_minor,
      value_assertion.currency,
      value_assertion.as_of,
      value_assertion.source,
      value_assertion.version,
      value_assertion.created_at,
      value_assertion.updated_at
    from public.asset_value_assertions value_assertion
    join snapshot on snapshot.household_id = value_assertion.household_id
    left join selected_assets asset
      on asset.id = value_assertion.asset_id
    left join household_places place
      on place.id = value_assertion.place_id
    where value_assertion.deleted_at is null
      and (
        (
          value_assertion.asset_id is not null
          and value_assertion.place_id is null
          and asset.id is not null
        )
        or (
          value_assertion.asset_id is null
          and value_assertion.place_id is not null
          and place.id is not null
        )
      )
  ),
  selected_locations as (
    select
      location_revision.id,
      location_revision.asset_id,
      location_revision.place_id,
      location_revision.space_id,
      location_revision.status,
      location_revision.location_detail,
      location_revision.source,
      location_revision.revision,
      location_revision.valid_from,
      location_revision.valid_to,
      location_revision.created_at
    from public.asset_location_revisions location_revision
    join snapshot on snapshot.household_id = location_revision.household_id
    join selected_assets asset on asset.id = location_revision.asset_id
  ),
  selected_evidence as (
    select
      evidence_record.id,
      evidence_record.asset_id,
      evidence_record.place_id,
      case
        when evidence_record.asset_id is not null then 'asset'
        else 'place'
      end as subject_kind,
      evidence_record.kind,
      evidence_record.relation,
      evidence_record.title,
      evidence_record.review_status,
      evidence_record.storage_state,
      evidence_record.version,
      evidence_record.created_at,
      evidence_record.updated_at
    from public.evidence evidence_record
    join snapshot on snapshot.household_id = evidence_record.household_id
    left join selected_assets asset
      on asset.id = evidence_record.asset_id
    left join household_places place
      on place.id = evidence_record.place_id
    where evidence_record.deleted_at is null
      and (
        (
          evidence_record.asset_id is not null
          and evidence_record.place_id is null
          and asset.id is not null
        )
        or (
          evidence_record.asset_id is null
          and evidence_record.place_id is not null
          and place.id is not null
        )
      )
  ),
  selected_evidence_versions as (
    select
      evidence_version.id,
      evidence_version.evidence_id,
      evidence_version.blob_object_id,
      evidence_version.version_number,
      evidence_version.file_name,
      evidence_version.mime_type,
      evidence_version.byte_size,
      evidence_version.checksum_sha256,
      evidence_version.created_at
    from public.evidence_versions evidence_version
    join snapshot on snapshot.household_id = evidence_version.household_id
    join selected_evidence evidence_record
      on evidence_record.id = evidence_version.evidence_id
  ),
  selected_blobs as (
    select
      blob.id,
      blob.expected_evidence_id,
      blob.expected_evidence_version_id,
      blob.checksum_sha256,
      blob.byte_size,
      blob.mime_type,
      blob.status,
      blob.created_at,
      blob.updated_at
    from public.blob_objects blob
    join snapshot on snapshot.household_id = blob.household_id
    where blob.deleted_at is null
      and exists (
        select 1
        from selected_evidence_versions evidence_version
        where evidence_version.blob_object_id = blob.id
      )
  )
  select jsonb_build_object(
    'snapshotFound', exists(select 1 from snapshot),
    'readAt', transaction_timestamp(),
    'requestedAssetCount', coalesce(
      (
        select jsonb_array_length(snapshot.scope->'assetIds')
        from snapshot
      ),
      0
    ),
    'household', (
      select to_jsonb(household_record)
      from household_record
    ),
    'assets', coalesce(
      (
        select jsonb_agg(to_jsonb(asset) order by asset.id)
        from selected_assets asset
      ),
      '[]'::jsonb
    ),
    'values', coalesce(
      (
        select jsonb_agg(to_jsonb(value_assertion) order by value_assertion.id)
        from selected_values value_assertion
      ),
      '[]'::jsonb
    ),
    'locations', coalesce(
      (
        select jsonb_agg(to_jsonb(location_revision) order by location_revision.id)
        from selected_locations location_revision
      ),
      '[]'::jsonb
    ),
    'evidence', coalesce(
      (
        select jsonb_agg(to_jsonb(evidence_record) order by evidence_record.id)
        from selected_evidence evidence_record
      ),
      '[]'::jsonb
    ),
    'evidenceVersions', coalesce(
      (
        select jsonb_agg(to_jsonb(evidence_version) order by evidence_version.id)
        from selected_evidence_versions evidence_version
      ),
      '[]'::jsonb
    ),
    'blobs', coalesce(
      (
        select jsonb_agg(to_jsonb(blob) order by blob.id)
        from selected_blobs blob
      ),
      '[]'::jsonb
    ),
    'places', coalesce(
      (
        select jsonb_agg(to_jsonb(place) order by place.id)
        from household_places place
      ),
      '[]'::jsonb
    ),
    'spaces', coalesce(
      (
        select jsonb_agg(to_jsonb(space) order by space.id)
        from household_spaces space
      ),
      '[]'::jsonb
    )
  )
$$;

revoke all on function public.read_export_manifest_source(uuid, text, uuid)
  from public, anon;
grant execute on function public.read_export_manifest_source(uuid, text, uuid)
  to authenticated;
