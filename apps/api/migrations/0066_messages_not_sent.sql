-- Messages that did not reach a customer (specs/036): the workspace's "Not sent" screen and
-- ALYR Agent read outgoing messages that failed or were refused. Few rows ever match, so a
-- partial index keeps both cheap however many messages a shop sends.
create index messages_not_sent on messages (tenant_id, created_at)
    where direction = 'out' and status in ('failed', 'blocked');

-- Why messages failed, per business, over the last 7 days, so the back office's Today item
-- says what is wrong and not only how many. Counts and the recorded error only: ALYR's own
-- "could not be delivered" or WhatsApp's error title. The back office never reads what
-- customers wrote or were sent.
create function admin_delivery_reasons()
returns table (tenant_id uuid, error text, n bigint)
language plpgsql security definer set search_path = public as $$
begin
    perform assert_platform_admin();
    return query
    select m.tenant_id, coalesce(m.error, ''), count(*)
    from messages m
    where m.direction = 'out' and m.status = 'failed'
      and m.created_at > now() - interval '7 days'
    group by m.tenant_id, coalesce(m.error, '');
end $$;

revoke all on function admin_delivery_reasons() from public;
grant execute on function admin_delivery_reasons() to alyr_app;
