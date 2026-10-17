-- Product photos (ALY-103, decision D-039): what the shop has stored, where each photo is
-- used, the monthly meters, and the queue that keeps the object store in step.
--
-- A photo is processed and checked before any of this is written (core/images.py). Its
-- three WebP sizes live in the object store (Cloudflare R2, or local disk in development)
-- under names made from the upload's hash, inside one folder per shop. These tables hold
-- the shop's side of it. Every table is tenant-owned, with the same forced row-level
-- security as 0001.

-- One row per distinct photo a shop uploaded. Uploading the same file twice finds this
-- row instead of storing it again.
create table media_assets (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    -- SHA-256 of the file as uploaded; it names the stored files.
    source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
    -- Of the largest size we kept.
    width integer not null check (width > 0),
    height integer not null check (height > 0),
    -- [{"key", "width", "height", "bytes"}], smallest first.
    variants jsonb not null,
    bytes_total bigint not null check (bytes_total >= 0),
    -- pending: accepted, being written to the store. ready: served. failed: the store
    -- never took it (a person can retry the job). removed: taken down under the listing
    -- policy; the row stays so the same file cannot be put back.
    state text not null default 'pending'
        check (state in ('pending', 'ready', 'failed', 'removed')),
    created_by text not null default '',
    created_at timestamptz not null default now(),
    removed_at timestamptz,
    removed_reason text,
    removed_by text,
    unique (tenant_id, source_sha256),
    unique (tenant_id, id)
);
create index media_assets_live on media_assets (tenant_id) where state <> 'removed';

-- Which thing a photo belongs to. The owner is named by kind and id and is not a foreign
-- key, so any package can attach photos: 'item' and 'variant' for the catalog, others
-- later. The composite key keeps a link inside its own shop.
create table media_links (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    asset_id uuid not null,
    owner_kind text not null check (owner_kind ~ '^[a-z][a-z_]{0,29}$'),
    owner_id uuid not null,
    -- Lowest first; the first is the cover.
    position integer not null default 0,
    created_at timestamptz not null default now(),
    primary key (asset_id, owner_kind, owner_id),
    foreign key (tenant_id, asset_id) references media_assets (tenant_id, id) on delete cascade
);
create index media_links_owner on media_links (tenant_id, owner_kind, owner_id, position);

-- Writes and deletes the object store still owes, in order. A row is written in the same
-- transaction as the change it belongs to, and the job `media.sync` carries it out with
-- retries, so a store that is down delays a photo and never loses or half-saves one.
create table media_ops (
    seq bigint generated always as identity primary key,
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    asset_id uuid not null,
    op text not null check (op in ('put', 'delete')),
    key text not null,
    content_type text not null default 'image/webp',
    data bytea,
    created_at timestamptz not null default now(),
    check ((op = 'put') = (data is not null)),
    -- A shop's queue can only touch that shop's folder.
    check (key like 'shops/' || tenant_id::text || '/%')
);
create index media_ops_asset on media_ops (tenant_id, asset_id, seq);

-- The meters, one row per shop per month (month is the first day, in shop time).
-- Counts of what happened accumulate; the stored figures are a snapshot taken at the last
-- change in the month, with the month's peak, because R2 bills on the daily peak.
create table media_usage (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    month date not null,
    uploads integer not null default 0,
    duplicates integer not null default 0,
    refused integer not null default 0,
    photos integer not null default 0,
    bytes_stored bigint not null default 0,
    peak_bytes_stored bigint not null default 0,
    active_items integer not null default 0,
    updated_at timestamptz not null default now(),
    primary key (tenant_id, month)
);

do $$
declare t text;
begin
    foreach t in array array['media_assets', 'media_links', 'media_ops', 'media_usage'] loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);
        execute format(
            'create policy tenant_isolation on %I
               using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
               with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
            t);
        execute format('grant select, insert, update, delete on %I to alyr_app', t);
    end loop;
end $$;

-- Add to this month's meters for the shop in scope and refresh the stored figures. Runs
-- as the caller, so row-level security applies. `p_items` is the shop's active item count
-- from the catalog (null: keep the last one).
create function media_record_usage(
    p_uploads integer default 0, p_duplicates integer default 0, p_refused integer default 0,
    p_items integer default null
) returns void
language plpgsql as $$
declare
    v_month date := date_trunc('month', now() at time zone 'Asia/Qatar')::date;
    v_photos integer;
    v_bytes bigint;
begin
    select count(*), coalesce(sum(a.bytes_total), 0) into v_photos, v_bytes
        from media_assets a where a.state <> 'removed';
    insert into media_usage (month, uploads, duplicates, refused, photos, bytes_stored,
                             peak_bytes_stored, active_items)
        values (v_month, p_uploads, p_duplicates, p_refused, v_photos, v_bytes, v_bytes,
                coalesce(p_items, 0))
        on conflict (tenant_id, month) do update set
            uploads = media_usage.uploads + excluded.uploads,
            duplicates = media_usage.duplicates + excluded.duplicates,
            refused = media_usage.refused + excluded.refused,
            photos = excluded.photos,
            bytes_stored = excluded.bytes_stored,
            peak_bytes_stored = greatest(media_usage.peak_bytes_stored, excluded.bytes_stored),
            active_items = coalesce(p_items, media_usage.active_items),
            updated_at = now();
end $$;

-- Bytes stored across every shop, for the alert at 80% of the free tier. One number, no
-- shop's data, so any shop's code may ask for it.
create function media_total_bytes() returns bigint
language sql stable security definer set search_path = public as $$
    select coalesce(sum(a.bytes_total), 0)::bigint from media_assets a where a.state <> 'removed'
$$;

-- Back office: every business's meters for a month, with what is stored right now.
create function admin_media_usage(p_month date)
returns table (
    tenant_id uuid, business text, photos integer, bytes_stored bigint,
    peak_bytes_stored bigint, uploads integer, duplicates integer, refused integer,
    active_items integer, live_photos bigint, live_bytes bigint
)
language plpgsql security definer set search_path = public as $$
begin
    perform assert_platform_admin();
    return query
    select t.id, t.name, coalesce(u.photos, 0), coalesce(u.bytes_stored, 0),
           coalesce(u.peak_bytes_stored, 0), coalesce(u.uploads, 0), coalesce(u.duplicates, 0),
           coalesce(u.refused, 0), coalesce(u.active_items, 0), coalesce(l.photos, 0),
           coalesce(l.bytes, 0)
    from tenants t
    left join media_usage u on u.tenant_id = t.id and u.month = p_month
    left join (select a.tenant_id, count(*) as photos, sum(a.bytes_total)::bigint as bytes
               from media_assets a where a.state <> 'removed' group by a.tenant_id) l
           on l.tenant_id = t.id
    order by coalesce(l.bytes, 0) desc, t.name;
end $$;

-- Back office: take a photo down under the listing policy. In one step it marks the photo
-- removed (the row stays, so the same file is refused if uploaded again), unlinks it
-- everywhere, and queues deletion of its stored files. The API writes the audit record in
-- the same transaction. Returns nothing when there is no such live photo.
create function admin_media_remove(p_tenant uuid, p_digest text, p_reason text, p_by text)
returns table (asset_id uuid, client_id uuid, business text, bytes bigint)
language plpgsql security definer set search_path = public as $$
declare
    v_old text := current_setting('app.tenant_id', true);
    v_asset media_assets%rowtype;
begin
    perform assert_platform_admin();
    -- Act inside the one shop's scope, as the worker does, then step back out.
    perform set_config('app.tenant_id', p_tenant::text, true);
    select * into v_asset from media_assets a
        where a.tenant_id = p_tenant and a.source_sha256 = p_digest for update;
    if not found or v_asset.state = 'removed' then
        perform set_config('app.tenant_id', coalesce(v_old, ''), true);
        return;
    end if;
    update media_assets set state = 'removed', removed_at = now(), removed_reason = p_reason,
        removed_by = p_by where id = v_asset.id;
    delete from media_links where media_links.asset_id = v_asset.id;
    delete from media_ops where media_ops.asset_id = v_asset.id and op = 'put';
    insert into media_ops (tenant_id, asset_id, op, key)
        select p_tenant, v_asset.id, 'delete', e.value ->> 'key'
        from jsonb_array_elements(v_asset.variants) e;
    insert into jobs (tenant_id, kind, payload, max_attempts)
        values (p_tenant, 'media.sync', jsonb_build_object('asset_id', v_asset.id), 48);
    perform media_record_usage();
    perform set_config('app.tenant_id', coalesce(v_old, ''), true);
    return query select v_asset.id, t.client_id, t.name, v_asset.bytes_total
        from tenants t where t.id = p_tenant;
end $$;

revoke all on function media_total_bytes() from public;
revoke all on function admin_media_usage(date) from public;
revoke all on function admin_media_remove(uuid, text, text, text) from public;
grant execute on function media_record_usage(integer, integer, integer, integer) to alyr_app;
grant execute on function media_total_bytes() to alyr_app;
grant execute on function admin_media_usage(date) to alyr_app;
grant execute on function admin_media_remove(uuid, text, text, text) to alyr_app;
