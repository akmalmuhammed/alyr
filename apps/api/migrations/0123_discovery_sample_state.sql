-- ALY-324, decision D-166, spec 066: Discovery, Phase 2. What the fictional owner of the sample
-- business changed by approving a proposal. The sample connector's script (spec 065) has no stored
-- state; these rows are overrides the script lets win for their field, so a re-run shows the
-- effect of an approval. Only the sample connector writes them, and they are the business's own
-- rows (erased with it, never read for another shop).

create table discovery_sample_state (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    location_id uuid not null references discovery_locations(id) on delete cascade,
    target text not null check (target in ('listing', 'website')),
    field text not null check (field in (
        'hours', 'phone', 'category', 'name', 'whatsapp_link', 'review_reply')),
    -- '' or the review's source_ref for a reply.
    subject_ref text not null default '' check (length(subject_ref) <= 200),
    value jsonb not null,
    proposal_id uuid references discovery_proposals(id) on delete set null,
    set_at timestamptz not null default now(),
    primary key (tenant_id, location_id, target, field, subject_ref)
);

alter table discovery_sample_state enable row level security;
alter table discovery_sample_state force row level security;
create policy tenant_isolation on discovery_sample_state
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update, delete on discovery_sample_state to alyr_app;
