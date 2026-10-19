-- Documents: receipts, invoices, quotes and the rest, issued at the moment of sale (ALY-138,
-- decision D-042, spec 010).
--
-- The rule this file exists to keep: once a document is issued, nobody can change it. Not the
-- app, not a bug, not a later migration's careless UPDATE. The database refuses, by trigger
-- (the app role cannot switch a trigger off). What a document says is copied into it at issue
-- time (the seller, the customer, every line), so a later change to a price, a customer or the
-- shop's registration number never rewrites a paper someone already holds.
--
-- Amounts are integers in the currency's smallest unit (dirhams for QAR, as everywhere in ALYR:
-- 1 QAR = 100). Never a float. The rounding rule (half up, per line) is a CHECK on the line,
-- so a total that does not add up cannot be stored.
--
-- Every table is tenant-owned with the same forced row-level security as 0001.

-- The activity record learns a subject for documents (who drafted, issued, credited).
alter table activity drop constraint activity_subject_check;
alter table activity add constraint activity_subject_check
    check (subject in ('conversation', 'order', 'booking', 'account', 'item', 'catalog', 'document'));

-- ── Settings: one row per shop ────────────────────────────────────────────────────────────
-- Who is selling, how its documents look, and the rules around them. Created on first use
-- (`modules/documents/settings.py`). `tenants` is global and read-only to the app, so the
-- seller's registration numbers live here.
create table document_settings (
    tenant_id uuid primary key default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),

    -- The seller, as it will be copied onto each document at issue.
    business_name text not null default '' check (length(business_name) <= 120),
    business_name_ar text not null default '' check (length(business_name_ar) <= 120),
    -- Commercial registration (CR). Without one the shop issues receipts, not invoices.
    commercial_registration text not null default '' check (length(commercial_registration) <= 40),
    tax_id text not null default '' check (length(tax_id) <= 40),
    licence_number text not null default '' check (length(licence_number) <= 40),
    address text not null default '' check (length(address) <= 300),
    address_ar text not null default '' check (length(address_ar) <= 300),
    phone text not null default '' check (length(phone) <= 40),
    email text not null default '' check (length(email) <= 120),

    currency text not null default 'QAR' check (currency ~ '^[A-Z]{3}$'),
    -- Tax is present in the model and off by default: Qatar has no VAT today (D-008).
    tax_enabled boolean not null default false,
    tax_rate_bp integer not null default 0 check (tax_rate_bp between 0 and 10000),

    -- Look. The first language named is the one the page leads with. A document sold to a
    -- consumer in Qatar always carries Arabic (enforced in the service, with a message).
    languages text not null default 'ar_en' check (languages in ('ar_en', 'en_ar', 'ar', 'en')),
    default_audience text not null default 'consumer' check (default_audience in ('consumer', 'business')),
    layout text not null default 'a4' check (layout in ('a4', 'a5', 'thermal80')),
    brand_color text check (brand_color is null or brand_color ~ '^#[0-9a-f]{6}$'),
    show_sku boolean not null default false,
    show_discounts boolean not null default true,
    show_customer_tax_id boolean not null default true,
    show_bank boolean not null default false,
    show_signature boolean not null default false,
    show_alyr_mark boolean not null default true,
    bank_details text not null default '' check (length(bank_details) <= 400),
    header_en text not null default '' check (length(header_en) <= 200),
    header_ar text not null default '' check (length(header_ar) <= 200),
    footer_en text not null default '' check (length(footer_en) <= 300),
    footer_ar text not null default '' check (length(footer_ar) <= 300),
    -- {kind: {"en": "...", "ar": "..."}}, each at most 600 characters (checked in the service).
    terms jsonb not null default '{}' check (jsonb_typeof(terms) = 'object'),
    notes jsonb not null default '{}' check (jsonb_typeof(notes) = 'object'),

    -- Who may issue. Owners and admins always may; an agent only when this is on.
    agents_may_issue boolean not null default false,

    -- Pictures, already checked and re-encoded as PNG by core/images.py. They are kept in the
    -- row (small, and never fetched from a store at render time, so a document renders the
    -- same with the network off). `*_sha256` is what a document remembers of them.
    logo_png bytea,
    logo_sha256 text check (logo_sha256 is null or logo_sha256 ~ '^[0-9a-f]{64}$'),
    stamp_png bytea,
    stamp_sha256 text check (stamp_sha256 is null or stamp_sha256 ~ '^[0-9a-f]{64}$'),

    updated_at timestamptz not null default now(),
    updated_by text not null default ''
);

-- ── Numbering: one counter per shop, document kind and series ─────────────────────────────
-- A number is allocated inside the transaction that issues the document, under a row lock on
-- this row (`modules/documents/numbering.py`), so two issuances never read the same counter and
-- a failed issuance gives its number back by rolling back. The trigger below makes sure the
-- counter can only ever go up by one (or start again at 1 in a new year when the series says
-- so): it cannot be wound back, so a number cannot be handed out twice.
create table document_series (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    kind text not null check (kind in (
        'receipt', 'invoice', 'quote', 'delivery_note', 'statement', 'credit_note',
        'deposit_receipt', 'proforma')),
    series_key text not null default 'main' check (series_key ~ '^[a-z0-9]{1,12}$'),
    -- Letters and digits only, so a number reads the same in either direction.
    prefix text not null check (prefix ~ '^[A-Z0-9]{1,8}$'),
    pad smallint not null default 4 check (pad between 1 and 10),
    yearly_reset boolean not null default false,
    -- The year of the last number; only meaningful with yearly_reset.
    number_year integer check (number_year is null or number_year between 2000 and 9999),
    last_number bigint not null default 0 check (last_number >= 0),
    created_at timestamptz not null default now(),
    primary key (tenant_id, kind, series_key),
    unique (tenant_id, prefix)
);

create function document_series_guard() returns trigger language plpgsql as $$
begin
    if new.kind <> old.kind or new.series_key <> old.series_key then
        raise exception 'a numbering series cannot change what it numbers'
            using errcode = 'restrict_violation';
    end if;
    -- A new year starts again at 1, once per year at most: the year can only go forward.
    if new.yearly_reset and new.last_number = 1
       and new.number_year > coalesce(old.number_year, 0) then
        return new;
    end if;
    if new.last_number <> old.last_number then
        if new.last_number = old.last_number + 1
           and new.number_year is not distinct from old.number_year then
            return new;                                  -- the next number
        end if;
        raise exception 'document numbers only count up by one'
            using errcode = 'restrict_violation';
    end if;
    if new.number_year is distinct from old.number_year then
        raise exception 'the year of a series moves only with its numbers'
            using errcode = 'restrict_violation';
    end if;
    return new;
end $$;
create trigger document_series_guard before update on document_series
    for each row execute function document_series_guard();

-- ── Documents ─────────────────────────────────────────────────────────────────────────────
create table documents (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    kind text not null check (kind in (
        'receipt', 'invoice', 'quote', 'delivery_note', 'statement', 'credit_note',
        'deposit_receipt', 'proforma')),
    -- draft: editable and unnumbered. issued: numbered and frozen. void: an issued document
    -- that a credit note has cancelled in full; it stays, and so does its number.
    status text not null default 'draft' check (status in ('draft', 'issued', 'void')),
    -- consumer: sold to a person, Arabic is always on the page. business: to a company.
    audience text not null default 'consumer' check (audience in ('consumer', 'business')),
    languages text not null default 'ar_en' check (languages in ('ar_en', 'en_ar', 'ar', 'en')),
    layout text not null default 'a4' check (layout in ('a4', 'a5', 'thermal80')),
    currency text not null default 'QAR' check (currency ~ '^[A-Z]{3}$'),
    -- Decimal places of the currency (QAR 2, KWD 3), kept so the document reads the same
    -- whatever the currency table says later.
    currency_exponent smallint not null default 2 check (currency_exponent between 0 and 3),

    -- Numbering. Null until the document is issued.
    series_key text,
    number text,
    number_year integer,
    seq bigint check (seq is null or seq >= 1),
    issued_at timestamptz,
    -- The calendar date in the shop's time zone when it was issued: what the paper shows.
    issue_date date,
    -- Due date of an invoice, valid-until date of a quote or proforma.
    due_date date,

    -- Who it is for and who sells. Copies, taken at issue; a draft's customer is what was typed.
    customer jsonb not null default '{}' check (jsonb_typeof(customer) = 'object'),
    seller jsonb check (seller is null or jsonb_typeof(seller) = 'object'),
    -- The customer's contact in the shop, when there is one. A plain reference, not a copy.
    contact_id uuid,

    -- Money, in minor units. gross - discount + tax = total, always.
    gross_minor bigint not null default 0 check (gross_minor >= 0),
    discount_minor bigint not null default 0 check (discount_minor >= 0),
    tax_minor bigint not null default 0 check (tax_minor >= 0),
    total_minor bigint not null default 0 check (total_minor >= 0),
    paid_minor bigint not null default 0 check (paid_minor >= 0),
    balance_minor bigint generated always as (total_minor - paid_minor) stored,
    -- [{"method", "amount_minor", "reference"}]; paid_minor is their sum (checked at issue).
    payments jsonb not null default '[]' check (jsonb_typeof(payments) = 'array'),

    notes jsonb not null default '{}' check (jsonb_typeof(notes) = 'object'),
    terms jsonb not null default '{}' check (jsonb_typeof(terms) = 'object'),
    -- Why, for a credit note.
    reason text not null default '' check (length(reason) <= 300),

    -- Where it came from: an order, a booking, a payment on a credit account, typed by hand,
    -- or another system. The reference is that thing's own ID, as text.
    source text not null default 'manual'
        check (source in ('order', 'booking', 'ledger_payment', 'manual', 'external')),
    source_ref text not null default '' check (length(source_ref) <= 120),
    -- A credit note points at the document it cancels (in whole or in part).
    related_document_id uuid,

    -- The record. The hash is SHA-256 of the issued content in canonical JSON
    -- (`modules/documents/canonical.py`); `hash_version` says which layout of that JSON.
    hash_version smallint,
    content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
    pdf_sha256 text check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$'),
    pdf_bytes integer check (pdf_bytes is null or pdf_bytes > 0),
    -- A retried request with the same key finds the document it already issued.
    issue_key text check (issue_key is null or length(issue_key) between 8 and 80),

    created_by text not null default '',
    created_by_user uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    issued_by text,
    issued_by_user uuid,
    voided_at timestamptz,
    voided_by_document_id uuid,

    unique (tenant_id, id),
    foreign key (tenant_id, related_document_id) references documents (tenant_id, id),
    foreign key (tenant_id, voided_by_document_id) references documents (tenant_id, id),
    check (gross_minor - discount_minor + tax_minor = total_minor),
    check (paid_minor <= total_minor),
    -- A draft has no number, no hash and no seller copy; an issued or void document has all.
    check (status <> 'draft' or (
        number is null and seq is null and series_key is null and issued_at is null
        and content_hash is null and pdf_sha256 is null and seller is null)),
    check (status = 'draft' or (
        number is not null and seq is not null and series_key is not null
        and issued_at is not null and issue_date is not null and content_hash is not null
        and hash_version is not null and pdf_sha256 is not null and seller is not null)),
    check ((status = 'void') = (voided_by_document_id is not null)),
    check (kind <> 'credit_note' or related_document_id is not null),
    check (related_document_id is null or related_document_id <> id)
);

-- A number is never used twice in a shop, whatever the prefix or the year.
create unique index documents_number on documents (tenant_id, number) where number is not null;
-- Gapless: one document per place in a series (the year restarts the count when asked to).
create unique index documents_series_seq
    on documents (tenant_id, kind, series_key, coalesce(number_year, 0), seq) where seq is not null;
-- A retried issuance finds its document.
create unique index documents_issue_key on documents (tenant_id, issue_key) where issue_key is not null;
create index documents_recent on documents (tenant_id, created_at desc);
create index documents_kind_status on documents (tenant_id, kind, status, created_at desc);
create index documents_related on documents (tenant_id, related_document_id)
    where related_document_id is not null;
create index documents_source on documents (tenant_id, source, source_ref) where source_ref <> '';

-- ── Lines: copies, one row each ───────────────────────────────────────────────────────────
create table document_lines (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    document_id uuid not null,
    position integer not null check (position >= 1),
    description text not null default '' check (length(description) <= 300),
    description_ar text not null default '' check (length(description_ar) <= 300),
    sku text not null default '' check (length(sku) <= 40),
    -- Thousandths: half a kilo, 2.5 hours.
    quantity numeric(12, 3) not null check (quantity > 0),
    unit text not null default 'piece' check (unit in
        ('piece', 'kg', 'g', 'l', 'm', 'box', 'pack', 'portion', 'hour', 'day', 'service')),
    unit_price_minor bigint not null check (unit_price_minor >= 0),
    -- An amount taken off this line, in minor units.
    discount_minor bigint not null default 0 check (discount_minor >= 0),
    -- Basis points: 500 is 5%. Zero while tax is off.
    tax_rate_bp integer not null default 0 check (tax_rate_bp between 0 and 10000),
    line_net_minor bigint not null check (line_net_minor >= 0),
    tax_minor bigint not null check (tax_minor >= 0),
    line_total_minor bigint not null check (line_total_minor >= 0),
    primary key (document_id, position),
    foreign key (tenant_id, document_id) references documents (tenant_id, id) on delete cascade,
    check (description <> '' or description_ar <> ''),
    -- The rounding rule, kept by the database: price times quantity, rounded half up to a
    -- whole minor unit, less the discount; then tax on that, rounded the same way.
    check (line_net_minor = round(quantity * unit_price_minor)::bigint - discount_minor),
    check (tax_minor = round(line_net_minor::numeric * tax_rate_bp / 10000)::bigint),
    check (line_total_minor = line_net_minor + tax_minor)
);

-- ── The issued PDF ────────────────────────────────────────────────────────────────────────
-- In the database, not the photo store: a document carries a customer's name and phone number,
-- the photo bucket is outside Qatar (hard rule 2, data-residency.md), and the number, the PDF
-- and the hash must commit together or not at all. Insert-only: the app role has no UPDATE or
-- DELETE here, and the trigger refuses them for anyone else.
create table document_files (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    document_id uuid primary key,
    content_type text not null default 'application/pdf' check (content_type = 'application/pdf'),
    content bytea not null,
    sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
    bytes integer not null check (bytes > 0 and bytes = octet_length(content)),
    created_at timestamptz not null default now(),
    foreign key (tenant_id, document_id) references documents (tenant_id, id)
);

-- ── The guards ────────────────────────────────────────────────────────────────────────────

create function documents_guard() returns trigger language plpgsql as $$
declare
    related documents;
    credited bigint;
    lines_gross bigint;
    lines_discount bigint;
    lines_tax bigint;
    line_count integer;
    paid bigint;
begin
    if tg_op = 'DELETE' then
        if old.status <> 'draft' then
            raise exception 'an issued document is never deleted (%)', old.number
                using errcode = 'restrict_violation';
        end if;
        return old;
    end if;

    if old.status = 'draft' then
        if new.status = 'draft' then
            return new;                                   -- editing a draft
        end if;
        if new.status <> 'issued' then
            raise exception 'a draft can only be issued' using errcode = 'restrict_violation';
        end if;
        -- Issuing: everything the paper says must already agree with itself.
        select count(*), coalesce(sum(line_net_minor + discount_minor), 0),
               coalesce(sum(discount_minor), 0), coalesce(sum(tax_minor), 0)
          into line_count, lines_gross, lines_discount, lines_tax
          from document_lines where document_id = new.id;
        if line_count = 0 then
            raise exception 'a document with no lines cannot be issued'
                using errcode = 'check_violation';
        end if;
        if lines_gross <> new.gross_minor or lines_discount <> new.discount_minor
           or lines_tax <> new.tax_minor then
            raise exception 'the totals do not match the lines' using errcode = 'check_violation';
        end if;
        select coalesce(sum((p ->> 'amount_minor')::bigint), 0) into paid
          from jsonb_array_elements(new.payments) p;
        if paid <> new.paid_minor then
            raise exception 'the payments do not add up to the amount paid'
                using errcode = 'check_violation';
        end if;
        if not exists (select 1 from document_files f
                        where f.document_id = new.id and f.sha256 = new.pdf_sha256) then
            raise exception 'a document is issued with its PDF' using errcode = 'check_violation';
        end if;
        -- The number is the counter's current value: it was taken under the lock, in this
        -- transaction, and nothing else may have been written for it.
        if not exists (select 1 from document_series s
                        where s.tenant_id = new.tenant_id and s.kind = new.kind
                          and s.series_key = new.series_key and s.last_number = new.seq
                          and s.number_year is not distinct from new.number_year) then
            raise exception 'the number was not taken from its series'
                using errcode = 'check_violation';
        end if;
        if new.kind = 'credit_note' then
            select * into related from documents
             where tenant_id = new.tenant_id and id = new.related_document_id for update;
            if related.id is null or related.status <> 'issued'
               or related.kind not in ('invoice', 'receipt', 'deposit_receipt') then
                raise exception 'a credit note needs an issued invoice or receipt'
                    using errcode = 'check_violation';
            end if;
            if related.currency <> new.currency then
                raise exception 'a credit note is in the currency of its invoice'
                    using errcode = 'check_violation';
            end if;
            select coalesce(sum(total_minor), 0) into credited from documents
             where tenant_id = new.tenant_id and related_document_id = related.id
               and kind = 'credit_note' and status = 'issued' and id <> new.id;
            if credited + new.total_minor > related.total_minor then
                raise exception 'credit notes cannot add up to more than the invoice'
                    using errcode = 'check_violation';
            end if;
        end if;
        return new;
    end if;

    if old.status = 'issued' and new.status = 'void' then
        -- Only the three columns of a cancellation may change, and only when credit notes
        -- that are themselves issued add up to the whole of this document.
        -- (balance_minor is generated after this trigger runs, so it is left out of the
        -- comparison: it can only follow total and paid, which are compared.)
        if (to_jsonb(new) - 'status' - 'voided_at' - 'voided_by_document_id' - 'balance_minor')
           <> (to_jsonb(old) - 'status' - 'voided_at' - 'voided_by_document_id'
               - 'balance_minor') then
            raise exception 'only the cancellation of an issued document may be recorded (%)',
                old.number using errcode = 'restrict_violation';
        end if;
        if not exists (select 1 from documents c
                        where c.tenant_id = old.tenant_id and c.id = new.voided_by_document_id
                          and c.kind = 'credit_note' and c.status = 'issued'
                          and c.related_document_id = old.id) then
            raise exception 'a document is cancelled by a credit note that points at it'
                using errcode = 'restrict_violation';
        end if;
        select coalesce(sum(total_minor), 0) into credited from documents
         where tenant_id = old.tenant_id and related_document_id = old.id
           and kind = 'credit_note' and status = 'issued';
        if credited < old.total_minor then
            raise exception 'credit notes cover less than the whole of %', old.number
                using errcode = 'restrict_violation';
        end if;
        return new;
    end if;

    raise exception 'an issued document cannot be changed (%)', old.number
        using errcode = 'restrict_violation';
end $$;
create trigger documents_guard before update or delete on documents
    for each row execute function documents_guard();

-- Lines belong to a draft. The parent row is locked in share mode so a line cannot slip in
-- while the document is being issued by another transaction.
create function document_lines_guard() returns trigger language plpgsql as $$
declare
    parent text;
begin
    select status into parent from documents
     where id = case when tg_op = 'DELETE' then old.document_id else new.document_id end
       for share;
    if parent is null and tg_op = 'DELETE' then
        return old;                                       -- the draft itself is being deleted
    end if;
    if parent is distinct from 'draft' then
        raise exception 'the lines of an issued document cannot change'
            using errcode = 'restrict_violation';
    end if;
    if tg_op = 'UPDATE' and new.document_id <> old.document_id then
        raise exception 'a line cannot move to another document' using errcode = 'restrict_violation';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger document_lines_guard before insert or update or delete on document_lines
    for each row execute function document_lines_guard();

create function document_files_guard() returns trigger language plpgsql as $$
begin
    raise exception 'an issued PDF is never changed or removed' using errcode = 'restrict_violation';
end $$;
create trigger document_files_guard before update or delete on document_files
    for each row execute function document_files_guard();

-- ── Row-level security and grants ─────────────────────────────────────────────────────────
do $$
declare t text;
begin
    foreach t in array array[
        'document_settings', 'document_series', 'documents', 'document_lines', 'document_files'
    ] loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);
        execute format(
            'create policy tenant_isolation on %I
               using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
               with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
            t);
    end loop;
end $$;

grant select, insert, update on document_settings, document_series to alyr_app;
-- Drafts are edited and discarded by the app; the triggers above stop it for anything issued.
grant select, insert, update, delete on documents, document_lines to alyr_app;
grant select, insert on document_files to alyr_app;
