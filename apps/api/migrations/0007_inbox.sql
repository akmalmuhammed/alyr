-- The shared inbox (ALY-28): every customer conversation in one place, where staff can
-- read, answer by hand, and take over from the automatic assistant.

alter table contacts
    -- An open conversation needs attention; a closed one is finished until the customer
    -- writes again, which reopens it.
    add column inbox_status text not null default 'open'
        check (inbox_status in ('open', 'closed')),
    -- Customer messages newer than this are unread.
    add column inbox_read_at timestamptz,
    -- Set when a person answers from the inbox. While set, the assistant does not answer
    -- this customer's typed messages, so the two never talk over each other.
    add column assistant_paused boolean not null default false;

-- Who wrote an outgoing message: empty for the assistant, otherwise the staff member.
alter table messages add column sent_by text not null default '';
