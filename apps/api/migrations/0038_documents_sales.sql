-- Documents, package 2: receipts and invoices from ALYR's own sales, manual payments, and
-- delivery to the customer (ALY-139, epic ALY-137, decision D-042, spec 013).
--
-- Issued paper cannot change (0034), so everything that happens to a document AFTER it is
-- issued lives in tables of its own: who was sent it and whether it arrived
-- (`document_deliveries`), and the payments staff recorded by hand (`manual_payments`).
--
-- Every table is tenant-owned with the same forced row-level security as 0001.

-- ── A message can carry a PDF (a receipt sent as a WhatsApp document) ─────────────────────
alter table message_media drop constraint message_media_content_type_check;
alter table message_media add constraint message_media_content_type_check
    check (content_type in ('image/png', 'image/jpeg', 'application/pdf'));

-- ── The customer's email, when the shop has it ───────────────────────────────────────────
-- Nothing collects one yet (a contacts screen is ALY-53); a document is emailed only to an
-- address held here or typed by staff when they send it.
alter table contacts add column email text
    check (email is null or (length(email) <= 120 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));

-- ── What the shop wants to happen on its own ─────────────────────────────────────────────
alter table document_settings
    -- Which sales make a document without anyone pressing a button.
    add column auto_receipt_on_payment boolean not null default true,
    add column auto_invoice_credit_sales boolean not null default true,
    add column auto_deposit_receipt boolean not null default true,
    -- Which ways a new document goes to the customer on its own (email only when the customer
    -- has an address), and whether it goes at once or only when staff press send.
    add column auto_send_whatsapp boolean not null default true,
    add column auto_send_email boolean not null default true,
    add column send_mode text not null default 'automatic'
        check (send_mode in ('automatic', 'manual')),
    -- Owners and admins record payments by hand; an agent only when this is on.
    add column agents_may_record_payments boolean not null default false;

-- ── Payments staff record by hand ────────────────────────────────────────────────────────
-- Cash, a bank transfer, a cheque or a card terminal: money the shop took itself. ALYR never
-- holds money (hard rule 3); this is a record that the shop did, with a reference, who wrote
-- it down and when. It is the audit record of "marked as paid", and the receipt (if one was
-- made) points back here. Append-only: the one thing that may be written later is the receipt
-- it produced.
create table manual_payments (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    -- What was paid: an order, a booking, an issued invoice, or a customer's credit balance
    -- (subject_id is that order's, booking's, invoice's or contact's ID).
    subject text not null check (subject in ('order', 'booking', 'invoice', 'credit')),
    subject_id uuid not null,
    contact_id uuid,
    amount_minor bigint not null check (amount_minor > 0),
    method text not null check (method in ('cash', 'bank_transfer', 'cheque', 'card_terminal')),
    reference text not null default '' check (length(reference) <= 80),
    -- A retried request finds the payment it already recorded.
    idempotency_key text not null check (length(idempotency_key) between 8 and 80),
    recorded_by text not null,
    recorded_by_user uuid,
    recorded_at timestamptz not null default now(),
    receipt_document_id uuid,
    unique (tenant_id, idempotency_key),
    foreign key (tenant_id, receipt_document_id) references documents (tenant_id, id)
);
create index manual_payments_subject on manual_payments (tenant_id, subject, subject_id);

create function manual_payments_guard() returns trigger language plpgsql as $$
begin
    if tg_op = 'DELETE' then
        raise exception 'a recorded payment is never deleted' using errcode = 'restrict_violation';
    end if;
    if old.receipt_document_id is null
       and (to_jsonb(new) - 'receipt_document_id') = (to_jsonb(old) - 'receipt_document_id') then
        return new;                              -- the receipt it produced, written once
    end if;
    raise exception 'a recorded payment cannot be changed' using errcode = 'restrict_violation';
end $$;
create trigger manual_payments_guard before update or delete on manual_payments
    for each row execute function manual_payments_guard();

-- ── Who was sent a document, and did it arrive ───────────────────────────────────────────
-- One row per attempt to send a document by one channel to one recipient. A WhatsApp row's
-- state is read from its `messages` row (queued, sent, delivered, read, failed, blocked), which
-- Meta's reports already keep up to date; an email row keeps its own state, because nothing
-- reports back on an email.
create table document_deliveries (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    document_id uuid not null,
    channel text not null check (channel in ('whatsapp', 'email')),
    -- auto: the shop's settings sent it; staff: a person pressed send or resend.
    trigger text not null check (trigger in ('auto', 'staff')),
    -- The customer's contact, when it went to them; null when staff typed another number or
    -- address.
    contact_id uuid,
    recipient text not null default '' check (length(recipient) <= 120),
    language text not null check (language in ('ar', 'en')),
    status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'blocked')),
    error text not null default '' check (length(error) <= 200),
    message_id uuid references messages (id),
    link_expires_at timestamptz,
    requested_by text not null default '',
    requested_by_user uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    foreign key (tenant_id, document_id) references documents (tenant_id, id)
);
create index document_deliveries_document on document_deliveries (tenant_id, document_id, created_at desc);
-- The shop's automatic settings send a document by a channel at most once, whatever fires the
-- event twice (the database says so, not just the code). A person pressing send again is a
-- different thing: trigger 'staff', any number of times, audited.
create unique index document_deliveries_auto_once
    on document_deliveries (tenant_id, document_id, channel) where trigger = 'auto';

-- ── Row-level security and grants ────────────────────────────────────────────────────────
do $$
declare t text;
begin
    foreach t in array array['manual_payments', 'document_deliveries'] loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);
        execute format(
            'create policy tenant_isolation on %I
               using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
               with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
            t);
    end loop;
end $$;

grant select, insert, update on manual_payments, document_deliveries to alyr_app;
