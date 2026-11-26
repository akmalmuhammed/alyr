"""The packs' actions, on `core/actions.py`, and the counts the overview shows.

* `discovery.packs`: every pack with its titles in both languages, its trades and how many checks
  it brings. A read for every role.
* `discovery.pack`: this business's family and trade, and what that gives. Owner and admin only
  (the agent role is refused with 403, like the other settings).
* `discovery.set_pack`: change them. Owner and admin only; on the activity record with its
  channel. Open findings of checks the new pack leaves out are set aside, with their waiting
  changes, so nothing stays open that no check-up will look at again.

"N of M checks match" (`checks_block`) is read from the last finished check-up: `matched` of
`measured`, and what could not be told (`not_measured`) is left out of both, never counted as a
pass or a miss.
"""

import asyncpg

from alyr.core.actions import ALL_ROLES, Caller, register
from alyr.modules.discovery import actions, engine, proposals
from alyr.modules.discovery.errors import DiscoveryError
from alyr.modules.discovery.packs import registry as reg
from alyr.modules.discovery.packs import store

MAX_KEY = 40


def _registry() -> reg.Registry:
    return engine.PACKS  # read at call time: see engine.PACKS


def _trade_view(trade: reg.Trade, lang: str) -> dict:
    return {
        "key": trade.key,
        "title": trade.title(lang),
        "title_en": trade.title_en,
        "title_ar": trade.title_ar,
        "overlays": list(trade.overlays),
    }


def pack_view(registry: reg.Registry, pack: reg.Pack, lang: str) -> dict:
    """A pack as the picker reads it. `checks` is how many rules the pack itself adds;
    `total_checks` how many a business of this family is checked against (the core, the family,
    the family's overlays; a trade's overlay may add or skip more), for the core and families."""
    total = None
    if pack.kind == "core":
        total = len(registry.select(None).rule_ids)
    elif pack.kind == "family":
        total = len(registry.select(pack.id).rule_ids)
    return {
        "id": pack.id,
        "kind": pack.kind,
        "family": pack.family,
        "title": pack.title(lang),
        "title_en": pack.title_en,
        "title_ar": pack.title_ar,
        "trades": [_trade_view(t, lang) for t in pack.trades],
        "rules": list(registry.expand(pack)),
        "checks": len(registry.expand(pack)),
        "total_checks": total,
        "overlays": list(pack.overlays),
        "skip": list(pack.skip),
        "never_edit": list(pack.never_edit),
    }


def selection_view(registry: reg.Registry, selection: reg.Selection, chosen: bool,
                   business_type: str, lang: str) -> dict:
    family = registry.by_id.get(selection.family) if selection.family else None
    trade = family.trade(selection.trade) if family else None
    return {
        "family": selection.family,
        "trade": selection.trade,
        "family_title": family.title(lang) if family else None,
        "trade_title": trade.title(lang) if trade else None,
        # False while it comes from the business type, not from a person's choice.
        "chosen": chosen,
        "business_type": business_type,
        "packs": [{"id": p.id, "kind": p.kind, "title": p.title(lang)} for p in selection.packs],
        "overlays": list(selection.overlays),
        "rules": list(selection.rule_ids),
        "checks": len(selection.rule_ids),
        "never_edit": sorted(selection.never_edit),
    }


async def _current(conn: asyncpg.Connection, lang: str) -> dict:
    registry = _registry()
    family, trade, chosen = await store.choice(conn, registry)
    selection = await store.selection(conn, registry)
    if (selection.family, selection.trade) != (family, trade):
        chosen = False  # what was stored is no longer in the packs: the fallback is shown
    return selection_view(registry, selection, chosen, await store.business_type(conn), lang)


@register("discovery.packs", ALL_ROLES, actions.MODULE)
async def list_packs(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    lang = await actions._lang(conn, args.get("lang"))
    registry = _registry()
    return {"items": [pack_view(registry, p, lang) for p in registry.packs]}


@register("discovery.pack", actions.CHANGERS, actions.MODULE)
async def get_pack(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    return await _current(conn, await actions._lang(conn, args.get("lang")))


@register("discovery.set_pack", actions.CHANGERS, actions.MODULE)
async def set_pack(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """`family` (required) and `trade` (one of the family's, or none). Checked against the packs
    before anything is written."""
    lang = await actions._lang(conn, args.get("lang"))
    registry = _registry()
    family, trade = args.get("family"), args.get("trade") or None
    if not isinstance(family, str) or len(family) > MAX_KEY:
        raise DiscoveryError("bad_family")
    pack = registry.by_id.get(family)
    if pack is None or pack.kind != "family":
        raise DiscoveryError("bad_family")
    if trade is not None and (not isinstance(trade, str) or pack.trade(trade) is None):
        raise DiscoveryError("bad_trade")
    before = await store.selection(conn, registry)
    after = registry.select(family, trade)
    _, _, was_chosen = await store.choice(conn, registry)
    if was_chosen and (before.family, before.trade) == (family, trade):
        return await _current(conn, lang)
    await store.save(conn, family, trade)
    # Findings of checks this pack leaves out: no check-up will look at them again.
    left_out = [r for r in before.rule_ids if r not in after.rule_ids]
    set_aside = 0
    if left_out:
        rows = await conn.fetch(
            "update discovery_findings set status = 'skipped', updated_at = now() "
            "where status = 'open' and rule_id = any($1) returning id",
            left_out,
        )
        for row in rows:
            await proposals.expire_for_finding(conn, row["id"], "finding_skipped")
        set_aside = len(rows)
    await actions._record(
        conn, caller, await conn.fetchval(f"select {actions._TENANT}"), "pack.set",
        {"family": family, "trade": trade or "", "from_family": before.family or "",
         "from_trade": before.trade or "", "set_aside": set_aside},
    )
    return await _current(conn, lang)


async def checks_block(conn: asyncpg.Connection) -> dict:
    """"N of M checks match" from the last finished check-up, for the business's whole pack and
    for each pack in it. Before any check-up, every count is 0 and `run_id` is None."""
    registry = _registry()
    run = await conn.fetchrow(
        "select id, checks, pack from discovery_runs where status = 'done' "
        "order by created_at desc limit 1"
    )
    if run is not None and isinstance(run["pack"], dict):
        ran = run["pack"]
        order = [p for p in ran.get("packs") or [] if isinstance(p, str)] or ["core"]
        family, trade = ran.get("family"), ran.get("trade")
    else:
        # Not run yet, or run before the packs: shown as the business's pack today, all core.
        selection = await store.selection(conn, registry)
        order, family, trade = [p.id for p in selection.packs], selection.family, selection.trade
    entries = [
        e for e in ((run["checks"] if run else None) or [])
        if isinstance(e, dict) and e.get("rule") in engine.RULE_BY_ID
    ]
    by_pack = []
    for pack_id in order:
        mine = [e for e in entries if (e.get("pack") or "core") == pack_id]
        pack = registry.by_id.get(pack_id)
        by_pack.append({"id": pack_id, "kind": pack.kind if pack else None} | reg.tally(mine))
    return {
        "run_id": str(run["id"]) if run else None,
        "family": family,
        "trade": trade,
        **reg.tally(entries),
        "by_pack": by_pack,
    }
