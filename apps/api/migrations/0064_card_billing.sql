-- Clients pay ALYR by card through Paddle (ALY-180, decision D-074, spec 035).
--
-- This is the client paying ALYR for ALYR's own service, never a shop's customer paying the
-- shop (hard rule 3). Paddle is the merchant of record for the card payment and charges in US
-- dollars (it has no Qatari riyal), so a card checkout keeps both sides: what it covers of the
-- price the client accepted, in dirhams, and what Paddle was asked to charge, in US cents.
-- Bank transfers, cash and cheques are still recorded by hand from the back office.
--
-- A checkout is started by the owner (who can only say "I want to pay by card"); the amounts
-- are filled in by ALYR's job from the accepted quote, on a back-office connection, so an
-- owner can never choose what Paddle charges.

-- A card payment is a payment of its own kind, and remembers which provider took it and what
-- it charged there. The provider's reference is unique, so a webhook that arrives twice can
-- never record a payment twice.
alter table client_payments drop constraint client_payments_method_check;
alter table client_payments add constraint client_payments_method_check
    check (method in ('bank_transfer', 'cash', 'cheque', 'link', 'card'));
alter table client_payments
    add column provider text not null default '' check (provider in ('', 'paddle')),
    add column provider_ref text check (length(provider_ref) <= 80),
    add column paid_currency text not null default 'QAR' check (paid_currency ~ '^[A-Z]{3}$'),
    -- What the provider took, in that currency's smallest unit, tax included. Null for a
    -- payment recorded by hand, whose `amount` is what was paid.
    add column paid_amount integer check (paid_amount > 0);
create unique index client_payments_provider_ref on client_payments (provider, provider_ref)
    where provider_ref is not null;

-- Which card provider a client is offered. Null: the platform's setting (ALYR_CARD_BILLING).
-- 'off': this client pays by transfer only. ALYR's staff switch it in the back office.
alter table clients add column card_billing text check (card_billing in ('off', 'paddle'));

create table card_checkouts (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references clients(id),
    -- The business whose owner started it; the jobs for it run there.
    business_id uuid not null references tenants(id),
    provider text not null default 'paddle' check (provider in ('paddle')),
    -- creating: ALYR is asking the provider for a checkout. open: the owner can pay.
    -- paid: the first payment arrived and matched. failed: no checkout could be made.
    -- mismatch: the provider took a different amount than ALYR asked; nothing is recorded
    -- and ALYR's staff look at it.
    status text not null default 'creating'
        check (status in ('creating', 'open', 'paid', 'failed', 'mismatch')),
    problem text not null default '' check (length(problem) <= 200),
    quote_id uuid references quotes(id),
    -- What the first payment covers (the setup fee and the first period) and what each later
    -- period covers, in dirhams.
    amount integer check (amount > 0),
    period_amount integer check (period_amount > 0),
    period_months integer check (period_months in (1, 3, 6, 12)),
    -- What the provider is asked to charge for the same, in its currency's smallest unit,
    -- before tax.
    charge_currency text not null default 'USD' check (charge_currency ~ '^[A-Z]{3}$'),
    charge_amount integer check (charge_amount > 0),
    period_charge integer check (period_charge > 0),
    -- The provider's transaction (Paddle: txn_...) and the subscription it made (sub_...).
    provider_ref text unique check (length(provider_ref) <= 80),
    checkout_url text check (length(checkout_url) <= 500),
    subscription_ref text unique check (length(subscription_ref) <= 80),
    subscription_status text not null default '' check (length(subscription_status) <= 40),
    created_by text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index card_checkouts_client on card_checkouts (client_id, created_at);

-- The owner reads their own client's checkouts and may start one with nothing filled in;
-- everything else is the back office (the jobs and the webhook declare it, as in 0015).
alter table card_checkouts enable row level security;
alter table card_checkouts force row level security;
create policy card_checkouts_own on card_checkouts for select using (client_id = own_client());
create policy card_checkouts_start on card_checkouts for insert with check (
    client_id = own_client()
    and business_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    and status = 'creating' and quote_id is null and amount is null and charge_amount is null
    and provider_ref is null and checkout_url is null and subscription_ref is null
);
create policy card_checkouts_back_office on card_checkouts for all
    using (is_back_office()) with check (is_back_office());
grant select, insert, update on card_checkouts to alyr_app;
