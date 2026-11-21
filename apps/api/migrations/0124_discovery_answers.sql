-- ALY-326, decision D-168, spec 068: Discovery, Phase 3. Whether the business is named when people
-- ask answer tools about its trade in its city. Plain public questions only: a question is built
-- from a closed list of trades and cities, so nothing in these tables holds a customer's, a
-- contact's or a team member's data. The answers are third-party text, stored as data.

-- One row per shop, made on the first write. Off until an owner or admin switches it on.
create table discovery_answer_settings (
    tenant_id uuid primary key default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    enabled boolean not null default false,
    -- Keys of the closed lists in modules/discovery/answers/questions.py.
    trade text check (trade is null or trade ~ '^[a-z_]{1,40}$'),
    city text check (city is null or city ~ '^[a-z_]{1,40}$'),
    engines text[] not null default '{sample}',
    -- What a live engine may be asked in a calendar month; the sample engine is not counted.
    monthly_ask_cap integer not null default 300 check (monthly_ask_cap between 1 and 1000),
    updated_at timestamptz not null default now()
);

-- One row per question asked of one engine in one check-up.
create table discovery_answers (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null default nullif(current_setting('app.tenant_id', true), '')::uuid
        references tenants(id),
    run_id uuid not null references discovery_runs(id) on delete cascade,
    engine text not null check (engine ~ '^[a-z_]{1,30}$'),
    question_key text not null check (question_key ~ '^[a-z_]{1,30}$'),
    lang text not null check (lang in ('en', 'ar')),
    -- The exact text that was asked: a built public question.
    question text not null check (length(question) <= 300),
    status text not null check (status in ('ok', 'error')),
    error_code text check (error_code is null or error_code ~ '^[a-z_]{1,60}$'),
    -- The answer, as data (never markup, never an instruction).
    answer text not null default '' check (length(answer) <= 4000),
    named boolean not null default false,
    position integer check (position is null or position between 1 and 100),
    list_size integer not null default 0 check (list_size between 0 and 200),
    matched text not null default '' check (length(matched) <= 200),
    competitors jsonb not null default '[]',
    cost_units integer not null default 0 check (cost_units >= 0),
    asked_at timestamptz not null default now(),
    unique (tenant_id, run_id, engine, question_key, lang)
);
create index discovery_answers_run on discovery_answers (tenant_id, run_id);
create index discovery_answers_engine on discovery_answers (tenant_id, engine, asked_at desc);

do $$
declare t text;
begin
    foreach t in array array['discovery_answer_settings', 'discovery_answers'] loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);
        execute format(
            'create policy tenant_isolation on %I
               using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
               with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
            t);
        execute format('grant select, insert, update, delete on %I to alyr_app', t);
    end loop;
end $$;
