-- Documents, package 4: standalone mode, invoicing without any other ALYR product (ALY-141,
-- epic ALY-137, decision D-042 "As built (ALY-141)", specs/016-documents-standalone/spec.md).
--
-- A shop that signs up only for invoices has no orders, no Catalog and perhaps no WhatsApp
-- number connected to ALYR. It still needs its customers (with a company, a registration and
-- tax number and an address), the lines it writes again and again, a payment link on an
-- invoice, and a way to make an invoice by a message from its own phone.
--
-- Nothing here changes a shop that does not use it: every column has a default, every table
-- starts empty, and the new rules apply only to documents made by hand.
--
-- Every new table is tenant-owned with the same forced row-level security as 0001.

-- ── Customers: what an invoice needs to know about who it is for ─────────────────────────
-- `contacts` already holds the shop's customers (chat, credit accounts). An invoice also wants
-- a name in Arabic, a company, the company's registration and tax numbers and an address, so a
-- customer is written once and found again by name or phone. A customer made for an invoice
-- always has a phone number (a contact is found by one), and the unique (shop, phone) key means
-- a customer who also writes to the shop's chat is one person, not two.
alter table contacts
    add column name_ar text not null default '' check (length(name_ar) <= 120),
    add column company text not null default '' check (length(company) <= 120),
    add column registration_number text not null default ''
        check (length(registration_number) <= 40),
    add column tax_id text not null default '' check (length(tax_id) <= 40),
    add column address text not null default '' check (length(address) <= 300),
    add column address_ar text not null default '' check (length(address_ar) <= 300);

-- ── Saved lines: what the shop writes on its invoices again and again ────────────────────
-- A name in each language, a usual price and a unit. NOT the Catalog: no stock, no photos, no
-- codes, nothing a customer sees. A line is a seed: the form copies it, and from then on the
-- line belongs to the document (issued paper never reads a price from here again).
create table saved_lines (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    name text not null default '' check (length(name) <= 300),
    name_ar text not null default '' check (length(name_ar) <= 300),
    unit text not null default 'piece',
    price_minor bigint not null default 0 check (price_minor >= 0 and price_minor <= 100000000000),
    -- How often it has been put on a document, and when last: the most used come first.
    uses integer not null default 0 check (uses >= 0),
    last_used_at timestamptz,
    archived boolean not null default false,
    created_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (name <> '' or name_ar <> '')
);
-- Saving the same line twice finds the line that is there (the price is updated), whichever
-- letter case it was typed in.
create unique index saved_lines_one on saved_lines
    (tenant_id, lower(name), lower(name_ar)) where not archived;
create index saved_lines_order on saved_lines (tenant_id, uses desc, last_used_at desc nulls last)
    where not archived;

-- ── A payment link on an invoice ─────────────────────────────────────────────────────────
-- A payment request may belong to a document (an invoice made by hand): the customer pays it,
-- the invoice is paid, a receipt follows (`documents/links.py`). At most one request per
-- document, so the QR printed on the paper and the button on the hosted page are one link.
alter table payment_requests add column document_id uuid;
alter table payment_requests add constraint payment_requests_document_fk
    foreign key (tenant_id, document_id) references documents (tenant_id, id);
create unique index payment_requests_one_per_document on payment_requests (document_id)
    where document_id is not null;

-- A payment that came through a link is on the same record as one written down by hand (the
-- paper of an invoice never changes, so what it has been paid since lives here).
alter table manual_payments drop constraint manual_payments_method_check;
alter table manual_payments add constraint manual_payments_method_check
    check (method in ('cash', 'bank_transfer', 'cheque', 'card_terminal', 'link'));

-- ── Invoices by a message from the owner's or a member of staff's own phone ─────────────
-- "invoice Ahmed 500 for AC repair": the numbers registered as staff may say it (never a
-- customer). The command waits for a Yes (or a question's answer) and, once issued, for an
-- Undo for ten minutes. One open command per staff number; a new one replaces it.
create table document_commands (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    contact_id uuid not null references contacts(id) on delete cascade,
    -- asking: waiting for an answer to a question (which customer?); confirm: waiting for
    -- Yes; issued: made (and undoable for a while); undone: cancelled by Undo; cancelled: the
    -- person said no or sent something else; expired: nobody answered.
    state text not null check (state in ('asking', 'confirm', 'issued', 'undone', 'cancelled',
                                         'expired')),
    kind text not null check (kind in ('invoice', 'receipt')),
    payload jsonb not null default '{}',
    document_id uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    foreign key (tenant_id, document_id) references documents (tenant_id, id)
);
create unique index document_commands_one_open on document_commands (contact_id)
    where state in ('asking', 'confirm');
create index document_commands_recent on document_commands (tenant_id, contact_id, created_at desc);

-- ── Row-level security and grants ────────────────────────────────────────────────────────
do $$
declare t text;
begin
    foreach t in array array['saved_lines', 'document_commands'] loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);
        execute format(
            'create policy tenant_isolation on %I
               using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
               with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
            t);
    end loop;
end $$;

grant select, insert, update, delete on saved_lines to alyr_app;
grant select, insert, update on document_commands to alyr_app;
