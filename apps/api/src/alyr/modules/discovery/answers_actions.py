"""The Answers check's actions (spec 068, D-168), on `core/actions.py`.

`discovery.answers` is a read for every role. `discovery.set_answers` changes the check's settings
(switch, trade, city, which engines) and is for the owner and an admin; it is on the activity
record with its channel. The engine role is in neither. What a trade and a city may be is a closed
list, so nothing typed can become a question.
"""

import asyncpg

from alyr.core.actions import ALL_ROLES, Caller, register
from alyr.modules.discovery import actions
from alyr.modules.discovery.answers import engines, questions
from alyr.modules.discovery.answers import service as answers_service
from alyr.modules.discovery.connectors import sample as sample_connector
from alyr.modules.discovery.errors import DiscoveryError

SAMPLE_TRADE, SAMPLE_CITY = "car_care", "doha"


@register("discovery.answers", ALL_ROLES, actions.MODULE)
async def get_answers(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    lang = await actions._lang(conn, args.get("lang"))
    return await answers_service.answers_view(conn, lang)


@register("discovery.set_answers", actions.CHANGERS, actions.MODULE)
async def set_answers(conn: asyncpg.Connection, caller: Caller, args: dict) -> dict:
    """Any of `enabled`, `trade`, `city`, `engines`. Everything is checked against the closed
    lists before anything is written."""
    lang = await actions._lang(conn, args.get("lang"))
    current = await answers_service.load_settings(conn)
    trade = args["trade"] if "trade" in args and args["trade"] is not None else current.trade
    city = args["city"] if "city" in args and args["city"] is not None else current.city
    if trade is not None and trade not in questions.TRADES:
        raise DiscoveryError("bad_trade")
    if city is not None and city not in questions.CITIES:
        raise DiscoveryError("bad_city")
    chosen = args.get("engines")
    wanted = tuple(chosen) if chosen is not None else current.engines
    if (
        not wanted or len(wanted) > answers_service.MAX_ENGINES
        or len(set(wanted)) != len(wanted) or any(k not in engines.AVAILABLE for k in wanted)
    ):
        raise DiscoveryError("bad_engine")
    enabled = bool(args["enabled"]) if args.get("enabled") is not None else current.enabled
    if enabled and (trade is None or city is None):
        # The sample business knows its own trade and city; nothing else is guessed.
        sample_on = await conn.fetchval(
            "select exists (select 1 from discovery_connections "
            "where kind = $1 and status = 'on')",
            sample_connector.KIND,
        )
        if not sample_on:
            raise DiscoveryError("needs_trade")
        trade, city = trade or SAMPLE_TRADE, city or SAMPLE_CITY
    if wanted == ("sample",) and (
        trade not in (None, SAMPLE_TRADE) or city not in (None, SAMPLE_CITY)
    ):
        raise DiscoveryError("sample_only")
    changed = (enabled, trade, city, wanted) != (
        current.enabled, current.trade, current.city, current.engines,
    )
    if changed:
        await conn.execute(
            "insert into discovery_answer_settings (enabled, trade, city, engines) "
            "values ($1, $2, $3, $4) on conflict (tenant_id) do update set "
            "enabled = excluded.enabled, trade = excluded.trade, city = excluded.city, "
            "engines = excluded.engines, updated_at = now()",
            enabled, trade, city, list(wanted),
        )
        await actions._record(
            conn, caller, await conn.fetchval(f"select {actions._TENANT}"), "answers.settings",
            {"enabled": enabled, "trade": trade or "", "city": city or "",
             "engines": ",".join(wanted)},
        )
    return await answers_service.answers_view(conn, lang)
