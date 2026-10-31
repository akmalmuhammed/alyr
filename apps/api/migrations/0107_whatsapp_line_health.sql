-- The health of a business's WhatsApp number, from Meta (ALY-166, spec 062, D-147).
--
-- Two kinds of fact arrive. About the number: its quality rating, its status (connected, flagged,
-- restricted), the messaging limit its tier allows, how its display name fared. About the account the
-- number is on: a restriction, a policy violation, a scheduled or lifted disable, a review decision, a
-- partner removed. Meta reports the first by reading (`GET /{number-id}`) and by notices
-- (`phone_number_quality_update`, `phone_number_name_update`, `account_alerts`); the second only by
-- notices (`account_update`, `account_review_update`).
--
-- Account facts are copied to every business whose number is on the account (ALYR's own account is
-- shared by many), as templates are (migration 0106), so row-level security stays the plain rule. The
-- row also keeps what ALYR made of it: `severity` (ok, attention, critical) and the `reasons` behind
-- it, each with a level and a scope (the number, or the whole account), so a restriction on a shared
-- account is one item for the founder and not one per shop.
--
-- States and Meta's own words only: no customer's name, number or message.

create table whatsapp_line_health (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    number_id text not null,
    -- About the number. Empty until Meta has told us.
    quality_rating text not null default '',
    number_status text not null default '',
    name_status text not null default '',
    name_decision text not null default '',
    name_reason text not null default '',
    messaging_limit text not null default '',
    throughput text not null default '',
    -- Meta's `health_status.can_send_message`: AVAILABLE, LIMITED or BLOCKED.
    health text not null default '',
    -- About the account: {"review": "", "restrictions": [{"type", "expires", "remediation"}],
    -- "violation": {"type", "at"}, "ban": {"state", "date"}, "state": "", "alerts": [{"type",
    -- "severity", "status", "description"}]}
    account jsonb not null default '{}',
    -- What ALYR makes of all that: ok, attention, critical, or unknown before Meta has said anything.
    severity text not null default 'unknown'
        check (severity in ('unknown', 'ok', 'attention', 'critical')),
    -- [{"code": "quality_red", "level": "critical", "scope": "number", "value": ""}, ...]
    reasons jsonb not null default '[]',
    -- When a restriction on the account runs out, so the severity is made again then.
    recheck_at timestamptz,
    polled_at timestamptz,
    event_at timestamptz,
    primary key (tenant_id, number_id)
);

alter table whatsapp_line_health enable row level security;
alter table whatsapp_line_health force row level security;
create policy tenant_isolation on whatsapp_line_health
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update, delete on whatsapp_line_health to alyr_app;

-- The back office's list of lines now carries each line's health. The columns of the function change,
-- so it is dropped and made again (0105 made it; nothing else calls it).
drop function admin_whatsapp_lines();
create function admin_whatsapp_lines()
returns table (
    tenant_id uuid, name text, slug text, client_id uuid, number_id text, waba_id text,
    display_phone text, attached_at timestamptz, attached_by text,
    checked_at timestamptz, check_ok boolean, checks jsonb,
    test_message_id uuid, test_at timestamptz, test_by text,
    test_status text, test_error text, last_inbound_at timestamptz, staff_numbers bigint,
    quality_rating text, number_status text, name_status text, name_decision text,
    name_reason text, messaging_limit text, throughput text, health text, account jsonb,
    severity text, reasons jsonb, polled_at timestamptz, event_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
    perform assert_platform_admin();
    return query
    select t.id, t.name, t.slug, t.client_id, c.number_id, c.waba_id, c.display_phone,
           c.attached_at, c.attached_by,
           s.checked_at, s.check_ok, coalesce(s.checks, '[]'::jsonb),
           s.test_message_id, s.test_at, coalesce(s.test_by, ''),
           m.status, m.error,
           (select max(k.last_inbound_at) from contacts k
             where k.tenant_id = t.id and k.number_id = c.number_id),
           (select count(*) from contacts k
             where k.tenant_id = t.id and k.number_id = c.number_id and k.role = 'staff'),
           coalesce(h.quality_rating, ''), coalesce(h.number_status, ''),
           coalesce(h.name_status, ''), coalesce(h.name_decision, ''), coalesce(h.name_reason, ''),
           coalesce(h.messaging_limit, ''), coalesce(h.throughput, ''), coalesce(h.health, ''),
           coalesce(h.account, '{}'::jsonb), coalesce(h.severity, 'unknown'),
           coalesce(h.reasons, '[]'::jsonb), h.polled_at, h.event_at
    from channel_numbers c
    join tenants t on t.id = c.tenant_id
    left join whatsapp_line_state s on s.tenant_id = c.tenant_id and s.number_id = c.number_id
    left join messages m on m.id = s.test_message_id and m.tenant_id = c.tenant_id
    left join whatsapp_line_health h on h.tenant_id = c.tenant_id and h.number_id = c.number_id
    where c.channel = 'meta'
    order by t.name;
end $$;
revoke all on function admin_whatsapp_lines() from public;
grant execute on function admin_whatsapp_lines() to alyr_app;

-- How many lines and accounts are in trouble, for the alert that reaches the founder's phone. Counts
-- only, like the other alert queries (core/alerts.py): an alert leaves ALYR, so it never carries a name
-- or a number. It runs without a signed-in person (the worker's watch has none), so it names nothing.
create function whatsapp_health_alert_counts()
returns table (lines_critical bigint, accounts_critical bigint)
language sql stable security definer set search_path = public as $$
    select
        (select count(*) from whatsapp_line_health h
          where exists (select 1 from jsonb_array_elements(h.reasons) r
                        where r->>'level' = 'critical' and r->>'scope' = 'number')),
        (select count(distinct c.waba_id) from whatsapp_line_health h
          join channel_numbers c on c.tenant_id = h.tenant_id and c.number_id = h.number_id
          where c.waba_id is not null
            and exists (select 1 from jsonb_array_elements(h.reasons) r
                        where r->>'level' = 'critical' and r->>'scope' = 'account'))
$$;
revoke all on function whatsapp_health_alert_counts() from public;
grant execute on function whatsapp_health_alert_counts() to alyr_app;
