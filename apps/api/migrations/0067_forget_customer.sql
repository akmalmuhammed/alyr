-- Forgetting a customer (go-live checklist item 19, ALY-119, specs/038).
--
-- The privacy notice says a business's customer can ask to be deleted, and that the business
-- decides. Forgetting deletes who the customer is and what they said: their number, WhatsApp ID,
-- name and email, their messages and the pictures in them, the staff's notes, their consent
-- record, their cart, the things they asked to be told about, and any job or event sent to
-- the business's own system that names them.
-- It keeps the business's sales records (orders, bookings, the credit account and its entries,
-- payment requests), cut loose from the person: the record stays, named "Forgotten customer"
-- in both languages, because the name is shown as it is in an English or Arabic workspace. An
-- issued receipt or invoice is never changed (D-042): the law requires the business to keep it.
--
-- Several of those tables are append-only for the app role (consents, notes, sold-out asks,
-- watches) and must stay so, so the work is one function that runs as the table owner, for the
-- business in scope only. The API decides who may call it (owners and admins).

alter table contacts add column forgotten_at timestamptz;

-- A forgotten customer has no number and no WhatsApp ID left.
alter table contacts drop constraint contacts_reachable;
alter table contacts add constraint contacts_reachable
    check (phone is not null or wa_user_id is not null or forgotten_at is not null);

create function forget_contact(p_contact uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_tenant uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
    v contacts%rowtype;
    v_names text[];
    v_count integer;
    v_done jsonb := '{}';
begin
    if v_tenant is null then
        raise exception 'no business in scope' using errcode = '42501';
    end if;
    select * into v from contacts where id = p_contact and tenant_id = v_tenant for update;
    if not found or v.role <> 'customer' then
        raise exception 'no such customer' using errcode = 'P0002';
    end if;
    if v.forgotten_at is not null then
        raise exception 'already forgotten' using errcode = 'P0002';
    end if;
    -- An order still to hand over, or a booking still to come, needs the person: finish or
    -- cancel it first.
    if exists (select 1 from orders where tenant_id = v_tenant and contact_id = p_contact
               and status in ('new', 'confirmed', 'ready'))
       or exists (select 1 from bookings where tenant_id = v_tenant and contact_id = p_contact
                  and status = 'booked' and starts_at > now()) then
        raise exception 'open orders or upcoming bookings' using errcode = '55000';
    end if;

    -- Every way a job's payload can name them: their record, number and WhatsApp ID, and the
    -- IDs of their messages, orders, bookings, payment requests, watches and deliveries. A job
    -- that is running now is left to finish.
    select array_agg('%' || x || '%') into v_names from (
        select p_contact::text as x
        union all select v.phone where v.phone is not null
        union all select v.wa_user_id where v.wa_user_id is not null
        union all select id::text from messages where tenant_id = v_tenant and contact_id = p_contact
        union all select id::text from orders where tenant_id = v_tenant and contact_id = p_contact
        union all select id::text from bookings where tenant_id = v_tenant and contact_id = p_contact
        union all select id::text from payment_requests
            where tenant_id = v_tenant and contact_id = p_contact
        union all select id::text from stock_watches
            where tenant_id = v_tenant and contact_id = p_contact
        union all select id::text from document_deliveries
            where tenant_id = v_tenant and contact_id = p_contact
    ) named;
    delete from jobs where tenant_id = v_tenant and status <> 'running'
        and payload::text like any (v_names);
    get diagnostics v_count = row_count;
    v_done := v_done || jsonb_build_object('jobs', v_count);
    -- Events already sent to the business's own system (connected mode) keep a copy of what
    -- they carried; one still being tried is left to finish, as a running job is.
    delete from webhook_deliveries where tenant_id = v_tenant and status <> 'pending'
        and payload::text like any (v_names);

    -- A message that carried a receipt or invoice is part of that document's record of
    -- delivery: it stays, emptied. Every other message goes, with its picture.
    delete from message_media where tenant_id = v_tenant and message_id in (
        select id from messages where tenant_id = v_tenant and contact_id = p_contact);
    update messages set body = '', payload = '{}', error = null
        where tenant_id = v_tenant and contact_id = p_contact
        and id in (select message_id from document_deliveries
                   where tenant_id = v_tenant and message_id is not null);
    delete from messages m where m.tenant_id = v_tenant and m.contact_id = p_contact
        and not exists (select 1 from document_deliveries d where d.message_id = m.id);
    get diagnostics v_count = row_count;
    v_done := v_done || jsonb_build_object('messages', v_count);

    delete from inbox_notes where tenant_id = v_tenant and contact_id = p_contact;
    get diagnostics v_count = row_count;
    v_done := v_done || jsonb_build_object('notes', v_count);
    delete from consents where tenant_id = v_tenant and contact_id = p_contact;
    get diagnostics v_count = row_count;
    v_done := v_done || jsonb_build_object('consents', v_count);
    delete from chat_carts where tenant_id = v_tenant and contact_id = p_contact;
    delete from stock_watches where tenant_id = v_tenant and contact_id = p_contact;
    delete from sold_out_asks where tenant_id = v_tenant and contact_id = p_contact;

    -- A receipt or invoice not issued yet is only a draft, with their name on it: it goes.
    delete from documents where tenant_id = v_tenant and contact_id = p_contact
        and status = 'draft';

    -- The sales records stay; what they said about the person goes.
    update orders set delivery_address = '', delivery_note = ''
        where tenant_id = v_tenant and contact_id = p_contact;
    update bookings set note = '' where tenant_id = v_tenant and contact_id = p_contact;

    update contacts set
        name = 'Forgotten customer · عميل محذوف', phone = null, wa_user_id = null, username = null,
        email = null, last_inbound_at = null, inbox_status = 'closed', inbox_read_at = null,
        assistant_paused = true, assigned_to = null, price_group_id = null,
        verified_at = null, consent_service = 'revoked', consent_marketing = 'revoked',
        consent_back_in_stock = 'revoked', forgotten_at = now()
    where id = p_contact;
    return v_done;
end $$;
revoke all on function forget_contact(uuid) from public;
grant execute on function forget_contact(uuid) to alyr_app;
