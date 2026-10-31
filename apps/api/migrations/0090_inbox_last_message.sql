-- The inbox found a customer's latest message by looking at every customer the shop has ever
-- had, on every refresh of every open tab (D-130, the load test of 31 Oct 2026). With 1,500
-- customers a shop that took 120 ms; it grew with every customer, and 250 open tabs kept the
-- database at its limit with nothing else happening.
--
-- Each customer now carries the time of their latest message and of their latest message from
-- them, kept by the database as messages are written. The inbox reads the newest conversations
-- off an index and counts "waiting for a reply" from these two columns, so the work no longer
-- grows with the number of customers the shop has had.

alter table contacts
    add column last_message_at timestamptz,
    add column last_in_message_at timestamptz;

-- What is there already.
update contacts c
set last_message_at = m.last_any, last_in_message_at = m.last_in
from (select contact_id, max(created_at) as last_any,
             max(created_at) filter (where direction = 'in') as last_in
      from messages group by contact_id) m
where m.contact_id = c.id;

create function messages_note_on_contact() returns trigger language plpgsql as $$
begin
    update contacts
    set last_message_at = greatest(last_message_at, new.created_at),
        last_in_message_at = case when new.direction = 'in'
                                  then greatest(last_in_message_at, new.created_at)
                                  else last_in_message_at end
    where id = new.contact_id;
    return null;
end $$;

-- Also when messages move to another customer record (two records of one customer merged,
-- ALY-115): the record that survives takes the later times.
create trigger messages_note_on_contact
    after insert or update of contact_id on messages
    for each row execute function messages_note_on_contact();

-- The newest conversations first, for one shop: the order the inbox shows them in.
create index contacts_inbox on contacts (tenant_id, last_message_at desc)
    where role = 'customer' and last_inbound_at is not null;
