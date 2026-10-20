-- Documents, package 5: connected mode (ALY-142, epic ALY-137, decision D-042, spec 016).
--
-- A shop that keeps another POS, accounting or invoicing tool sends its sales to ALYR so ALYR can
-- hand the customer a digital receipt or invoice. Two systems must never both number the same
-- kind of paper, so each shop says, per kind of document, who owns the numbers
-- (`document_authority`). When the other system owns them, ALYR never allocates a number for
-- that kind: the document carries the other system's own number (series "EXT"), is marked on its
-- face as issued by the shop's own system, and is not counted by ALYR's gapless counters.
--
-- Everything in 0034 still holds for ALYR-numbered paper. The immutability guard below is the
-- same function with the external path added beside the ALYR one, and one more way a row may
-- change: an external document that was never delivered can be WITHDRAWN (kept, marked, never
-- deleted), which is what undoing a wrong CSV import needs.
--
-- Every table is tenant-owned with the same forced row-level security as 0001.

-- ── Who owns the numbers, per kind ───────────────────────────────────────────────────────
-- No row means ALYR. `statement` is not here: ALYR draws it from its own ledger.
create table document_authority (
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    kind text not null check (kind in (
        'receipt', 'invoice', 'quote', 'delivery_note', 'credit_note', 'deposit_receipt',
        'proforma')),
    authority text not null check (authority in ('alyr', 'external')),
    changed_by text not null default '',
    changed_at timestamptz not null default now(),
    primary key (tenant_id, kind)
);

-- ── What the shop agreed to before connecting another system ─────────────────────────────
-- The shop confirms it has each customer's permission to send them their receipt or invoice on
-- WhatsApp. The version is the wording they saw (`modules/connect/terms.py`).
alter table document_settings
    add column connect_terms_version integer,
    add column connect_terms_accepted_by text,
    add column connect_terms_accepted_at timestamptz;

-- ── Documents: whose number it is, and withdrawal ────────────────────────────────────────
alter table documents
    add column number_authority text not null default 'alyr'
        check (number_authority in ('alyr', 'external')),
    add column withdrawn_at timestamptz,
    add column withdrawn_by text,
    add column withdrawn_reason text check (length(withdrawn_reason) <= 300),
    add constraint documents_external_has_no_seq
        check (number_authority = 'alyr' or (seq is null and number_year is null)),
    add constraint documents_withdrawal_complete
        check (withdrawn_at is null
               or (number_authority = 'external' and withdrawn_by is not null
                   and withdrawn_reason is not null));

-- An external number is the other system's own: no counter, series "EXT".
alter table documents drop constraint documents_check1;
alter table documents add constraint documents_series_matches_branch
    check (series_key is null or series_key = branch_key
           or (number_authority = 'external' and series_key = 'EXT'));
alter table documents drop constraint documents_check4;
alter table documents add constraint documents_issued_is_complete
    check (status = 'draft' or (
        number is not null and series_key is not null and issued_at is not null
        and issue_date is not null and content_hash is not null and hash_version is not null
        and pdf_sha256 is not null and seller is not null
        and (number_authority = 'external' or seq is not null)));

-- A number is never used twice in a shop, whoever numbered it (ALYR's counter or the shop's
-- other system); a withdrawn document gives its number back so a corrected import can use it.
drop index documents_number;
create unique index documents_number on documents (tenant_id, number)
    where number is not null and withdrawn_at is null;

-- ── The guard, with the external path beside ALYR's ──────────────────────────────────────
create or replace function documents_guard() returns trigger language plpgsql as $$
declare
    related documents;
    credited bigint;
    lines_gross bigint;
    lines_discount bigint;
    lines_tax bigint;
    line_count integer;
    paid bigint;
    external_kind boolean;
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

        -- Who numbers this kind? The shop says (document_authority), and the database holds
        -- both systems to it: ALYR never numbers what the other system owns, and a number from
        -- the other system is only taken for a kind that is theirs.
        select exists (select 1 from document_authority a
                        where a.tenant_id = new.tenant_id and a.kind = new.kind
                          and a.authority = 'external') into external_kind;
        if new.number_authority = 'alyr' then
            if external_kind then
                raise exception 'the shop''s other system numbers this kind of document'
                    using errcode = 'check_violation';
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
        else
            if not external_kind then
                raise exception 'ALYR numbers this kind of document; an outside number is refused'
                    using errcode = 'check_violation';
            end if;
            if new.source <> 'external' or btrim(new.number) = '' or new.series_key <> 'EXT' then
                raise exception 'an outside number comes with its source and the series EXT'
                    using errcode = 'check_violation';
            end if;
        end if;

        if new.kind = 'credit_note' then
            select * into related from documents
             where tenant_id = new.tenant_id and id = new.related_document_id for update;
            if related.id is null or related.status <> 'issued'
               or related.withdrawn_at is not null
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
               and kind = 'credit_note' and status = 'issued' and id <> new.id
               and withdrawn_at is null;
            if credited + new.total_minor > related.total_minor then
                raise exception 'credit notes cannot add up to more than the invoice'
                    using errcode = 'check_violation';
            end if;
        end if;
        return new;
    end if;

    if old.status = 'issued' and new.status = 'issued'
       and old.withdrawn_at is null and new.withdrawn_at is not null then
        -- Withdrawing an outside document that nobody was ever sent. Only the three withdrawal
        -- columns may change; the paper itself, its number and its PDF stay exactly as they were.
        if old.number_authority <> 'external' then
            raise exception 'only a document numbered by another system can be withdrawn (%)',
                old.number using errcode = 'restrict_violation';
        end if;
        if (to_jsonb(new) - 'withdrawn_at' - 'withdrawn_by' - 'withdrawn_reason' - 'balance_minor')
           <> (to_jsonb(old) - 'withdrawn_at' - 'withdrawn_by' - 'withdrawn_reason'
               - 'balance_minor') then
            raise exception 'a withdrawal changes nothing but its own record (%)', old.number
                using errcode = 'restrict_violation';
        end if;
        if exists (select 1 from document_deliveries d
                    where d.document_id = old.id and d.status <> 'blocked') then
            raise exception 'a document that was sent cannot be withdrawn (%)', old.number
                using errcode = 'restrict_violation';
        end if;
        if exists (select 1 from documents c
                    where c.tenant_id = old.tenant_id and c.related_document_id = old.id
                      and c.status <> 'draft') then
            raise exception 'a document with a credit note cannot be withdrawn (%)', old.number
                using errcode = 'restrict_violation';
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
           and kind = 'credit_note' and status = 'issued' and withdrawn_at is null;
        if credited < old.total_minor then
            raise exception 'credit notes cover less than the whole of %', old.number
                using errcode = 'restrict_violation';
        end if;
        return new;
    end if;

    raise exception 'an issued document cannot be changed (%)', old.number
        using errcode = 'restrict_violation';
end $$;

-- ── Sales that came from another system ──────────────────────────────────────────────────
-- One row per sale accepted through the open API or a CSV import. It is what makes a sale posted
-- twice produce one document: the same Idempotency-Key with the same body returns the first
-- answer, the same key with another body is refused, and the same sale (kind and the other
-- system's sale id) can only be on paper once. `request` is the body as it was sent, kept so a
-- retry can be compared and an import can be undone; it holds the customer, so it is private to
-- the shop like everything else here.
create table connect_sales (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    -- The machine that sent it (null for a CSV import, which a person applies).
    api_key_id uuid,
    via text not null check (via in ('api', 'csv')),
    import_id uuid,
    idempotency_key text not null check (length(idempotency_key) between 8 and 120),
    request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
    external_sale_id text not null check (length(external_sale_id) between 1 and 120),
    kind text not null,
    external_number text check (external_number is null or length(external_number) <= 80),
    document_id uuid not null,
    contact_id uuid,
    request jsonb not null,
    -- Where a line's SKU matched an item of the Catalog: [{position, sku, item_id, variant_id}].
    -- A link only. ALYR does not move stock for another system's sale.
    matches jsonb not null default '[]' check (jsonb_typeof(matches) = 'array'),
    -- Whether the sale asked for delivery, and what became of the ask.
    delivery jsonb not null default '{}' check (jsonb_typeof(delivery) = 'object'),
    created_at timestamptz not null default now(),
    -- A withdrawn document frees its sale to be sent again.
    released_at timestamptz,
    unique (tenant_id, idempotency_key),
    foreign key (tenant_id, document_id) references documents (tenant_id, id)
);
create unique index connect_sales_once on connect_sales (tenant_id, kind, external_sale_id)
    where released_at is null;
create index connect_sales_import on connect_sales (tenant_id, import_id) where import_id is not null;
create index connect_sales_document on connect_sales (tenant_id, document_id);

-- ── API keys ─────────────────────────────────────────────────────────────────────────────
-- A key authenticates a machine, never a person. Only a hash of the secret is stored; the
-- prefix (eight characters, visible in the list) finds the row. Lookup happens before the shop
-- is known, so the policy lets one row be read by its prefix, the way `memberships` lets sign-in
-- read a person's shops; writing stays inside the shop. The counters at the end are the per-key
-- rate limit: one window of a minute, one row, one atomic update.
create table api_keys (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    name text not null check (length(name) between 1 and 60),
    prefix text not null unique check (prefix ~ '^[a-z0-9]{8}$'),
    secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
    scopes text[] not null check (
        cardinality(scopes) >= 1
        and scopes <@ array['sales:write', 'documents:read', 'webhooks']::text[]),
    rate_limit_per_minute integer not null default 120
        check (rate_limit_per_minute between 1 and 1000),
    created_by text not null default '',
    created_by_user uuid,
    created_at timestamptz not null default now(),
    last_used_at timestamptz,
    revoked_at timestamptz,
    revoked_by text,
    window_start timestamptz,
    window_count integer not null default 0
);
create index api_keys_tenant on api_keys (tenant_id, created_at desc);

alter table connect_sales add foreign key (api_key_id) references api_keys (id);

-- ── Outgoing webhooks ────────────────────────────────────────────────────────────────────
create table webhook_endpoints (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    name text not null default '' check (length(name) <= 60),
    url text not null check (length(url) between 8 and 500),
    events text[] not null check (
        cardinality(events) >= 1
        and events <@ array['document.issued', 'document.delivered', 'document.failed',
                            'document.cancelled', 'payment.recorded']::text[]),
    -- The HMAC key the body is signed with. The server needs it to sign, so it cannot be
    -- hashed; it is shown to the owner once and can be replaced at any time.
    secret text not null check (length(secret) >= 32),
    enabled boolean not null default true,
    disabled_at timestamptz,
    disabled_reason text check (disabled_reason is null or length(disabled_reason) <= 200),
    -- Sustained failure: since when it has failed without a success, and how many tries.
    failing_since timestamptz,
    consecutive_failures integer not null default 0,
    last_success_at timestamptz,
    last_failure_at timestamptz,
    last_status integer,
    last_error text check (last_error is null or length(last_error) <= 200),
    created_by text not null default '',
    created_by_user uuid,
    created_at timestamptz not null default now(),
    deleted_at timestamptz
);
create index webhook_endpoints_tenant on webhook_endpoints (tenant_id, created_at desc)
    where deleted_at is null;

create table webhook_deliveries (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    endpoint_id uuid not null references webhook_endpoints (id),
    -- The event's own ID, the same on every retry, so a receiver can ignore a repeat.
    event_id uuid not null default gen_random_uuid(),
    event text not null,
    payload jsonb not null,
    status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
    attempts integer not null default 0,
    next_attempt_at timestamptz,
    last_attempt_at timestamptz,
    response_status integer,
    -- The first bytes of what the receiver answered, never more than 500 characters.
    response_snippet text check (response_snippet is null or length(response_snippet) <= 500),
    error text check (error is null or length(error) <= 200),
    created_at timestamptz not null default now(),
    delivered_at timestamptz
);
create index webhook_deliveries_endpoint on webhook_deliveries (tenant_id, endpoint_id, created_at desc);

-- ── CSV import of sales ──────────────────────────────────────────────────────────────────
-- Like `item_imports`: uploaded and previewed first (the file kept so the shop applies exactly
-- what it saw), then applied as one transaction, then perhaps undone once (the newest import
-- only, and only while none of its documents was sent: the documents are withdrawn, kept and
-- marked, never deleted).
create table sale_imports (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    status text not null default 'preview' check (status in ('preview', 'applied', 'undone')),
    filename text not null,
    file bytea,
    -- Which column of the file is which field, and what the shop chose: kind, send, template.
    mapping jsonb not null default '{}',
    options jsonb not null default '{}',
    summary jsonb not null default '{}',
    actor_id uuid references users(id) on delete set null,
    actor_name text not null,
    created_at timestamptz not null default clock_timestamp(),
    applied_at timestamptz,
    undone_at timestamptz,
    undone_by text
);
create index sale_imports_recent on sale_imports (tenant_id, created_at desc);

create table sale_import_templates (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    name text not null check (length(name) between 1 and 60),
    mapping jsonb not null,
    options jsonb not null default '{}',
    created_by text not null default '',
    updated_at timestamptz not null default now(),
    unique (tenant_id, name)
);

-- A consent can now come from a sale another system reported (source `connected_sale`); the
-- table already takes any source text, nothing to change there.

-- ── Row-level security and grants ────────────────────────────────────────────────────────
do $$
declare t text;
begin
    foreach t in array array[
        'document_authority', 'connect_sales', 'webhook_endpoints', 'webhook_deliveries',
        'sale_imports', 'sale_import_templates'
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

alter table api_keys enable row level security;
alter table api_keys force row level security;
create policy tenant_isolation on api_keys
    using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
           or prefix = nullif(current_setting('app.api_key_prefix', true), ''))
    with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

grant select, insert, update on document_authority, connect_sales, webhook_endpoints,
    api_keys to alyr_app;
-- Old delivery records are cleared by the webhook job.
grant select, insert, update, delete on webhook_deliveries, sale_imports,
    sale_import_templates to alyr_app;
