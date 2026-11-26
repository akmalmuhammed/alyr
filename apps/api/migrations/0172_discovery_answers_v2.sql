-- Discovery 2.0, the Answers check, version 2 (DECISIONS 6 and 7, research R4).
--
-- 1. Pooled runs. The questions are built from closed lists (trade, city, area, language) and hold
--    nothing of any business, so every business with the same trade, city, area and language
--    shares ONE asking of each answer tool: `discovery_answer_pool_runs` is that asking, and
--    `discovery_answer_pool` its answers (third-party text, the sources the tool cited and the
--    searches it ran). They have no tenant_id on purpose: nothing in them belongs to a business.
--    Each business's check-up then counts the shared answers against its own name and its own
--    confirmed facts, and keeps that count in its own `discovery_answers` rows (row-level security
--    unchanged), with a pointer to the shared answer.
-- 2. `discovery_answers` gains the sources as this business's check saw them (host, title, and
--    whether a phone number beside its name matches what the owner confirmed), the searches, the
--    repeat number, and the pointer.
-- 3. `discovery_answer_settings.area`: a key of the closed list of areas, passed to an answer
--    tool as the asker's location, never in the question's text.

create table discovery_answer_pool_runs (
    id uuid primary key default gen_random_uuid(),
    -- Keys of the closed lists in modules/discovery/answers/questions.py.
    trade text not null check (trade ~ '^[a-z_]{1,40}$'),
    city text not null check (city ~ '^[a-z_]{1,40}$'),
    area text not null default '' check (area ~ '^[a-z_]{0,40}$'),
    lang text not null check (lang in ('en', 'ar')),
    engine text not null check (engine ~ '^[a-z_]{1,30}$'),
    -- What the answers depend on besides the question: a live tool's model, the sample's stage.
    -- A new variant starts a new pooled run (R4, "drift control").
    variant text not null default '' check (length(variant) <= 80),
    -- Every question was asked and answered: only a complete run is shared with another business.
    -- Written once with the run and its answers, in one transaction.
    complete boolean not null default false,
    started_at timestamptz not null default now()
);
create index discovery_answer_pool_runs_cell on discovery_answer_pool_runs
    (trade, city, area, lang, engine, variant, started_at desc);

create table discovery_answer_pool (
    id uuid primary key default gen_random_uuid(),
    pool_run_id uuid not null references discovery_answer_pool_runs(id) on delete cascade,
    question_key text not null check (question_key ~ '^[a-z_]{1,30}$'),
    lang text not null check (lang in ('en', 'ar')),
    question text not null check (length(question) <= 300),
    repeat integer not null default 1 check (repeat between 1 and 20),
    status text not null check (status in ('ok', 'error')),
    error_code text check (error_code is null or error_code ~ '^[a-z_]{1,60}$'),
    answer text not null default '' check (length(answer) <= 4000),
    -- [{host, title, snippet}] as the tool returned them, cut to size; [] when it returned none.
    sources jsonb not null default '[]',
    -- The searches the tool said it ran, as text.
    searches jsonb not null default '[]',
    model text not null default '' check (length(model) <= 80),
    cost_units integer not null default 0 check (cost_units >= 0),
    asked_at timestamptz not null default now(),
    unique (pool_run_id, question_key, repeat)
);

-- Global tables with forced row-level security: any check-up may read the pool; only a check-up
-- (a transaction scoped to a business) may add to it; nobody through the app may change or delete
-- a row.
do $$
declare t text;
begin
    foreach t in array array['discovery_answer_pool_runs', 'discovery_answer_pool'] loop
        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);
        execute format('create policy pool_read on %I for select using (true)', t);
        execute format(
            'create policy pool_add on %I for insert
               with check (nullif(current_setting(''app.tenant_id'', true), '''') is not null)', t);
        execute format('grant select, insert on %I to alyr_app', t);
    end loop;
end $$;

alter table discovery_answer_settings
    add column area text check (area is null or area ~ '^[a-z_]{1,40}$');

alter table discovery_answers
    add column pool_answer_id uuid references discovery_answer_pool(id) on delete set null,
    add column repeat integer not null default 1 check (repeat between 1 and 20),
    add column area text not null default '' check (area ~ '^[a-z_]{0,40}$'),
    -- [{host, title, check}] where check is matches, differs or not_read (spec: research R4).
    add column sources jsonb not null default '[]',
    add column searches jsonb not null default '[]';

-- One row per question, repeat and engine in a check-up (the repeat joins the old key).
do $$
declare c text;
begin
    select conname into c from pg_constraint
     where conrelid = 'discovery_answers'::regclass and contype = 'u';
    execute format('alter table discovery_answers drop constraint %I', c);
end $$;
alter table discovery_answers add constraint discovery_answers_one
    unique (tenant_id, run_id, engine, question_key, lang, repeat);
