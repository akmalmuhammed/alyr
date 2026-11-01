-- The message templates on a business's WhatsApp account, and where each one stands (ALY-172,
-- spec 061, D-146).
--
-- A template belongs to a WhatsApp Business Account, and Meta must approve its wording before ALYR
-- may send it outside a customer's 24-hour window. ALYR's own wording is `core/templates.py`; this
-- table is what Meta says about each of them on the account a business's number is on: not
-- submitted yet (a draft: ALYR keeps no row for those, the screen works them out), submitted,
-- approved, rejected with Meta's reason, paused, flagged, disabled or deleted.
--
-- Shops on ALYR's own account share it, so each business holds its own copy of what Meta says
-- about that account (the same truth, kept per business, so row-level security stays the plain
-- rule: no query reads another business's rows). The webhook and the sync write every copy.
-- Wording is never stored here, only names, languages, categories, statuses and Meta's reasons.

create table whatsapp_templates (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    waba_id text not null,
    name text not null,
    -- Meta's own language code: ALYR sends "en" and "ar".
    language text not null,
    -- utility, marketing or authentication, as Meta has it now (Meta may re-categorise).
    category text not null default '',
    status text not null check (status in (
        'submitted', 'approved', 'rejected', 'paused', 'flagged', 'disabled', 'deleted')),
    -- Meta's own word for the status (PENDING, IN_APPEAL, ...), kept for the person reading.
    meta_status text not null default '',
    meta_id text not null default '',
    -- Why Meta refused or paused it, in Meta's words (a code such as INVALID_FORMAT or
    -- INCORRECT_CATEGORY, and the recommendation Meta gave, when it gave one).
    reason text not null default '',
    advice text not null default '',
    -- false: Meta has it and ALYR's catalogue does not (made by hand in WhatsApp Manager).
    in_catalogue boolean not null default true,
    submitted_at timestamptz,
    status_at timestamptz not null default now(),
    synced_at timestamptz,
    primary key (tenant_id, waba_id, name, language)
);

alter table whatsapp_templates enable row level security;
alter table whatsapp_templates force row level security;
create policy tenant_isolation on whatsapp_templates
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update, delete on whatsapp_templates to alyr_app;

-- How many of each business's templates stand where, for the back office's WhatsApp screen.
-- Counts only; staff only, like the other admin_* functions.
create function admin_whatsapp_template_counts()
returns table (tenant_id uuid, status text, n bigint)
language plpgsql security definer set search_path = public as $$
begin
    perform assert_platform_admin();
    return query
    select t.tenant_id, t.status, count(*)
    from whatsapp_templates t
    join channel_numbers c on c.tenant_id = t.tenant_id and c.channel = 'meta'
        and c.waba_id is not distinct from t.waba_id
    where t.in_catalogue
    group by t.tenant_id, t.status;
end $$;
revoke all on function admin_whatsapp_template_counts() from public;
grant execute on function admin_whatsapp_template_counts() to alyr_app;
