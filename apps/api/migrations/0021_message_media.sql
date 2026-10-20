-- An image that goes with an outgoing message (ALY-99, the weekly report card).
--
-- The Sunday report is a branded card image with a short text under it. The outbound
-- layer keeps the image here, beside the message it belongs to, and the job that
-- delivers the message uploads it to the channel at send time (Meta's Media API), so the
-- image never needs public hosting. One image per message. Tenant-owned, with the same
-- row-level security as every other business table (0001).

create table message_media (
    message_id uuid primary key references messages(id) on delete cascade,
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    content_type text not null check (content_type in ('image/png', 'image/jpeg')),
    data bytea not null,
    created_at timestamptz not null default now()
);

alter table message_media enable row level security;
alter table message_media force row level security;
create policy tenant_isolation on message_media
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update, delete on message_media to alyr_app;
