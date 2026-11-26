-- Discovery 2.0, check packs: the kind of business a shop is checked as, and which pack each
-- check-up ran.
--
-- `pack_family` and `pack_trade` hold what an owner or admin picked (`PUT /api/discovery/pack`);
-- both empty means "from the business type". They are checked by the API against the packs, which
-- are data in the code, so a new family or trade needs no migration. `discovery_runs.pack` keeps
-- what a check-up ran ({family, trade, overlays, packs}), so its counts read the same after the
-- owner changes the pack. Row-level security on both tables is unchanged (0120, 0122).

alter table discovery_settings
    add column pack_family text check (pack_family is null or length(pack_family) between 1 and 40),
    add column pack_trade text check (pack_trade is null or length(pack_trade) between 1 and 40);

alter table discovery_runs add column pack jsonb;
