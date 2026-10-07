-- Contacts are identified by WhatsApp's business-scoped user ID (BSUID). Phone becomes
-- optional: a customer who uses a WhatsApp username may reach us with no phone number.
-- See docs/decisions.md D-009.

alter table contacts
    add column wa_user_id text,
    add column username text,
    alter column phone drop not null,
    add constraint contacts_reachable check (phone is not null or wa_user_id is not null);

create unique index contacts_wa_user on contacts (tenant_id, wa_user_id)
    where wa_user_id is not null;

-- Messages belong to a contact, not to a phone number.
alter table messages add column contact_id uuid references contacts(id) on delete cascade;
update messages m set contact_id = c.id
    from contacts c where c.tenant_id = m.tenant_id and c.phone = m.phone;
delete from messages where contact_id is null;
alter table messages alter column contact_id set not null;
drop index messages_phone;
alter table messages drop column phone;
create index messages_contact on messages (tenant_id, contact_id, created_at);

-- Meta's ID-change webhook names the WhatsApp Business Account, not the phone number.
alter table channel_numbers add column waba_id text;
