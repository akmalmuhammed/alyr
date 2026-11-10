-- ALY-333, spec 065 "Checks per place": a check-up keeps what each rule found at each place.
-- Until now a run kept only its findings (the fails) and its score, so a screen could not tell a
-- check that passed from one that was not measured. One column on the run, written with the score:
-- a list of {rule, location, state}, where location is a place's id or null for the whole business
-- and state is pass, fail or not_measured. Null for every run made before this migration: the API
-- then says "not measured", never a guess. No new table, so the row-level security, the grants, the
-- erasure rule and the owner's download of discovery_runs cover it as they are. 0124 is taken by the
-- Answers check (ALY-326).

alter table discovery_runs add column checks jsonb;
