"""What a shop has switched on (D-039 "As built (feature engine)", ALY-148).

`capabilities.py` says what each feature is; `shop_templates.py` says what a kind of business
starts with; this file reads and writes what one shop actually has, in `shop_features`, and
answers the question every other part of the Catalog asks: *is this on for this shop?*

* **One answer.** `load(conn)` gives a `Features` with `on(key)`, `mode(key)` and helpers for
  the questions that recur (which rules may a new item use, which columns does a file have).
  Every consumer asks it; none looks at the business type.
* **A shop with no row for a feature gets its template's value.** The migration (0034) gave
  every shop a row for every feature, and onboarding seeds a new shop, so this is only for a
  feature a later version adds.
* **A feature that needs another is off when the other is off**, whatever its own row says.
* **Off hides and stops, it never deletes.** What an item already has stays and works; the
  guards below only refuse *new use*: an item created with a part whose feature is off, or an
  edit that adds one (`guard_item`).
* **Every change is on the activity record** (`subject = 'catalog'`, action `features`), with
  who and from-to, and the features that moved because another did.

Every function takes a tenant-scoped connection.
"""

from dataclasses import dataclass
from typing import Any

import asyncpg

from alyr import capabilities, shop_templates
from alyr.catalog import Text
from alyr.core import team
from alyr.core.team import Actor
from alyr.core.words import ITEMS, counted
from alyr.modules.items import changes
from alyr.modules.items.service import ItemError

SET_BY = ("template", "owner")


class FeatureError(ItemError):
    """A feature change that cannot be made, or a use of a feature that is off. `code` is
    stable; the message is safe to show. It is an `ItemError`, so every route that answers one
    already answers this."""

    def __init__(self, code: str, message: str, message_ar: str = "") -> None:
        super().__init__(code, message)
        self.message_ar = message_ar or message


_TENANT = "nullif(current_setting('app.tenant_id', true), '')::uuid"


@dataclass(frozen=True)
class Row:
    enabled: bool
    config: dict[str, Any]
    set_by: str
    updated_by: str = ""
    updated_at: str = ""


class Features:
    """A shop's features as they are now. Immutable; load again after a change."""

    def __init__(self, rows: dict[str, Row], template: shop_templates.ShopTemplate) -> None:
        self.rows = rows
        self.template = template

    # ── asking ──

    def _own(self, key: str) -> bool:
        row = self.rows.get(key)
        if row is not None:
            return row.enabled
        return self.template.features.get(key, (capabilities.BY_KEY[key].default, {}))[0]

    def on(self, key: str) -> bool:
        cap = capabilities.BY_KEY.get(key)
        if cap is None or not cap.built:
            return False  # a feature that is not built is never on
        if cap.core or cap.always_on:
            return True
        return self._own(key) and all(self.on(dep) for dep in cap.depends_on)

    def config(self, key: str) -> dict[str, Any]:
        cap = capabilities.BY_KEY[key]
        row = self.rows.get(key)
        stored = row.config if row is not None else self.template.features.get(key, (0, {}))[1]
        return {**cap.config, **stored}

    def mode(self, key: str, name: str = "mode") -> Any:
        return self.config(key).get(name)

    def snapshot(self) -> dict[str, bool]:
        return {cap.key: self.on(cap.key) for cap in capabilities.SHOWN}

    # ── the questions that recur ──

    @property
    def sold_out_mode(self) -> str:
        mode = self.mode("sold_out_display")
        return mode if mode in capabilities.SOLD_OUT_MODES else "grey"

    def rules(self) -> tuple[str, ...]:
        """The ways a new item may run out: the rules whose features are on, and always."""
        return ("always", *(r for r, k in capabilities.RULE_FEATURE.items() if self.on(k)))

    def allows_rule(self, rule: str) -> bool:
        return rule == "always" or self.on(capabilities.RULE_FEATURE.get(rule, ""))

    def counts_stock(self) -> bool:
        return any(self.on(k) for k in capabilities.COUNTING)

    def can_run_out(self) -> bool:
        return any(self.on(k) for k in capabilities.RUNS_OUT)

    def layout(self, style: str) -> dict[str, Any]:
        """The order page's layout: the style, and the four things it can offer."""
        return {
            "style": style, "pickup_date": self.on("pickup_date"),
            "quick_quantity": self.on("quick_quantity"), "same_as_last": self.on("same_as_last"),
            "show_sku": self.on("show_sku"),
        }

    def new_item_rule(self, wanted: str) -> str:
        """The rule a new item starts with: the shop's choice if its feature is still on."""
        return wanted if self.allows_rule(wanted) else "always"


# ── reading ───────────────────────────────────────────────────────────────────────────


async def template_key(conn: asyncpg.Connection) -> str:
    """The template this shop uses: its own choice, else the one for its business type."""
    row = await conn.fetchrow(
        f"select coalesce(nullif(s.template_key, ''), t.business_type) as key "
        f"from tenants t left join shop_settings s on s.tenant_id = t.id where t.id = {_TENANT}"
    )
    return (row["key"] if row else "") or ""


async def template_of(conn: asyncpg.Connection) -> shop_templates.ShopTemplate:
    """The shop's template: the built-in one for its business type (travel and the rest with
    no catalog of their own get the plain Catalog)."""
    return shop_templates.builtin_for(await template_key(conn))


async def load(conn: asyncpg.Connection) -> Features:
    rows = {
        r["key"]: Row(r["enabled"], dict(r["config"]) if r["config"] else {}, r["set_by"],
                      r["updated_by"], r["updated_at"].isoformat())
        for r in await conn.fetch(
            "select key, enabled, config, set_by, updated_by, updated_at from shop_features"
        )
    }
    return Features(rows, await template_of(conn))


async def enabled(conn: asyncpg.Connection, key: str) -> bool:
    return (await load(conn)).on(key)


async def file_columns(conn: asyncpg.Connection) -> tuple[str, ...]:
    """The columns of this shop's import and export files: those of its features that are on,
    and those of a feature that is off but that an item still uses."""
    from alyr.modules.items import (
        columns,  # (columns is plain data; imported here to keep cycles out)
    )

    feats = await load(conn)
    used = await in_use(conn)
    return columns.allowed(lambda key: feats.on(key) or used.get(key, 0) > 0)


def hidden_cards(feats: Features) -> list[str]:
    """The home and dashboard cards (`catalog.py`, by their `count`) with nothing to count in
    this shop: "sold out" where nothing can run out, "low stock" where stock is not counted."""
    out = []
    if not feats.can_run_out():
        out.append("sold_out")
    if not feats.counts_stock():
        out.append("low_stock")
    return out


# ── the screen ────────────────────────────────────────────────────────────────────────


async def in_use(conn: asyncpg.Connection) -> dict[str, int]:
    """How many items use each feature now, so the owner can be told "12 items use this, and
    they keep it". Counts items that are not archived; a feature with nothing to count is
    absent."""
    row = await conn.fetchrow(
        "select "
        "(select count(*) from items where status <> 'archived' and stock_rule = 'switch') "
        "  as rule_switch, "
        "(select count(*) from items where status <> 'archived' and stock_rule = 'count') "
        "  as rule_count, "
        "(select count(*) from items where status <> 'archived' and stock_rule = 'daily_limit') "
        "  as rule_daily_limit, "
        "(select count(distinct item_id) from item_schedules s join items i on i.id = s.item_id "
        "  where i.status <> 'archived') as schedule, "
        "(select count(distinct item_id) from item_schedules s join items i on i.id = s.item_id "
        "  where i.status <> 'archived' and (s.lead_days > 0 or s.cutoff is not null)) "
        "  as pickup_date, "
        "(select count(distinct v.item_id) from item_variants v join items i on i.id = v.item_id "
        "  where i.status <> 'archived' and not v.is_default and v.active) as variants, "
        "(select count(distinct g.item_id) from item_option_groups g join items i "
        "  on i.id = g.item_id where i.status <> 'archived') as options, "
        "(select count(distinct item_id) from item_group_prices p join price_groups g "
        "  on g.id = p.group_id and g.archived_at is null) as price_groups, "
        "(select count(*) from items where status <> 'archived' "
        "  and (pack_size is not null or min_order > 1)) as pack_rules, "
        "(select count(*) from items where status <> 'archived' and cardinality(tags) > 0) "
        "  as tags"
    )
    return {k: int(v) for k, v in dict(row).items() if v}


def _use_text(key: str, n: int) -> Text:
    things = Text(counted(n, ITEMS, "en"), counted(n, ITEMS, "ar"))
    if key == "price_groups":
        return Text(f"{things.en} have a group price. They keep it.",
                    f"لدى {things.ar} سعر خاص بمجموعة. وتحتفظ به.")
    return Text(f"{things.en} use this. They keep it.",
                f"يستخدمها {things.ar}. وتحتفظ بها.")


def _row_view(cap: capabilities.Capability, feats: Features, used: dict[str, int]) -> dict:
    row = feats.rows.get(cap.key)
    n = used.get(cap.key, 0)
    needed_by = [d.key for d in capabilities.SWITCHABLE if cap.key in d.depends_on]
    on = feats.on(cap.key)
    out: dict[str, Any] = {
        "key": cap.key, "name": cap.name.en, "name_ar": cap.name.ar,
        "hint": cap.hint.en, "hint_ar": cap.hint.ar,
        "changes": cap.changes.en, "changes_ar": cap.changes.ar,
        "group": cap.group, "affects": list(cap.affects),
        "enabled": on, "own": feats._own(cap.key),  # its own switch, apart from what it needs
        "depends_on": list(cap.depends_on), "needed_by": needed_by,
        "set_by": row.set_by if row else "template",
        "updated_by": row.updated_by if row else "", "updated_at": row.updated_at if row else "",
        "kind": "choice" if cap.always_on else "switch",
        "config": feats.config(cap.key) if cap.config else {},
        "choices": {k: list(v) for k, v in cap.choices.items()},
        "in_use": None,
    }
    if n:
        text = _use_text(cap.key, n)
        out["in_use"] = {"count": n, "text": text.en, "text_ar": text.ar}
    return out


async def view(conn: asyncpg.Connection) -> dict:
    """The Features screen: groups of features with where they act, what turning each on does,
    how many items use it, and who last set it; the always-on core; the template."""
    feats = await load(conn)
    used = await in_use(conn)
    groups = []
    for group in capabilities.GROUPS:
        rows = [_row_view(c, feats, used) for c in capabilities.SHOWN if c.group == group.key]
        if rows:
            groups.append({
                "key": group.key, "name": group.name.en, "name_ar": group.name.ar,
                "hint": group.hint.en, "hint_ar": group.hint.ar, "features": rows,
            })
    return {
        "groups": groups,
        "core": [
            {"key": c.key, "name": c.name.en, "name_ar": c.name.ar,
             "hint": c.hint.en, "hint_ar": c.hint.ar}
            for c in capabilities.CORE
        ],
        "template": {
            "key": feats.template.key, "name": feats.template.name.en,
            "name_ar": feats.template.name.ar, "builtin": feats.template.builtin,
        },
    }


# ── writing ───────────────────────────────────────────────────────────────────────────


def _cascade(feats: Features, key: str, wanted: bool) -> dict[str, bool]:
    """Every feature that must change for `key` to become `wanted`, `key` included: turning one
    on turns on what it needs; turning one off turns off what needs it."""
    want: dict[str, bool] = {key: wanted}
    if wanted:
        pending = list(capabilities.BY_KEY[key].depends_on)
        while pending:
            dep = pending.pop()
            if not feats._own(dep) or not feats.on(dep):
                want[dep] = True
                pending += list(capabilities.BY_KEY[dep].depends_on)
    else:
        pending = [key]
        while pending:
            current = pending.pop()
            for other in capabilities.SWITCHABLE:
                if current in other.depends_on and feats._own(other.key) and other.key not in want:
                    want[other.key] = False
                    pending.append(other.key)
    return want


def _valid_config(cap: capabilities.Capability, config: dict[str, Any]) -> dict[str, Any]:
    out = dict(cap.config)
    for name, value in config.items():
        allowed = cap.choices.get(name)
        if name not in cap.config or (allowed is not None and value not in allowed):
            raise FeatureError(
                "bad_choice", "Choose one of the options shown.", "اختر أحد الخيارات المعروضة."
            )
        out[name] = value
    return out


async def set_feature(
    conn: asyncpg.Connection, actor: Actor, key: str, *, enabled: bool | None = None,
    config: dict[str, Any] | None = None, by: str = "owner", record: bool = True,
) -> list[dict]:
    """Switch a feature on or off, or change its value. Returns what changed (`[{key, from,
    to}]`, the feature itself and any it needed or that needed it). Writes the record. A change
    that changes nothing writes nothing. `record=False` leaves the activity line to the caller
    (the setup screen writes its own, in the older flat form)."""
    cap = capabilities.BY_KEY.get(key)
    if cap is None or not cap.built or cap.core or key not in capabilities.SHOWN_KEYS:
        # A feature that is not built is as good as unknown: it is not listed anywhere.
        raise FeatureError("unknown_feature", "There is no such feature.", "لا توجد هذه الميزة.")
    if enabled is not None and cap.always_on:
        raise FeatureError(
            "always_on", "This one is always on. Choose how it looks instead.",
            "هذه الميزة تعمل دائماً. اختر شكلها بدلاً من ذلك.",
        )
    feats = await load(conn)
    moves = _cascade(feats, key, enabled) if enabled is not None else {}
    want: dict[str, tuple[bool, dict[str, Any]]] = {
        k: (on, feats.config(k)) for k, on in moves.items()
    }
    if config is not None:
        on = want[key][0] if key in want else feats._own(key)
        want[key] = (on, _valid_config(cap, {**feats.config(key), **config}))
    changed: list[dict] = []
    before = feats.snapshot()
    for target, (new_enabled, new_config) in want.items():
        old_enabled, old_config = feats._own(target), feats.config(target)
        if (
            target in feats.rows and new_enabled == old_enabled and new_config == old_config
        ):
            continue
        await conn.execute(
            "insert into shop_features (key, enabled, config, set_by, updated_by) "
            "values ($1, $2, $3::jsonb, $4, $5) "
            "on conflict (tenant_id, key) do update set enabled = excluded.enabled, "
            "config = excluded.config, set_by = excluded.set_by, "
            "updated_by = excluded.updated_by, updated_at = now()",
            target, new_enabled, new_config, by, actor.name,
        )
        if new_enabled != old_enabled:
            changed.append({"key": target, "from": old_enabled, "to": new_enabled})
        if new_config != old_config:
            changed.append({"key": target, "from": old_config, "to": new_config})
    if changed and record:
        after = (await load(conn)).snapshot()
        await team.record(
            conn, changes.SUBJECT, await changes.shop_id(conn), "features", actor, None,
            {"changes": [
                {"field": c["key"], "from": c["from"], "to": c["to"]} for c in changed
            ], "also": sorted(k for k in after if after[k] != before[k] and k != key)},
        )
    return changed


# ── seeding ───────────────────────────────────────────────────────────────────────────


async def seed(
    conn: asyncpg.Connection, template: shop_templates.ShopTemplate, by: str = "ALYR",
    *, only_template_set: bool = False,
) -> list[str]:
    """Write a template's features for the shop. A new shop gets every row; a re-apply
    (`only_template_set`) writes only features the owner has not chosen themselves. Returns
    the keys written."""
    owned = {
        r["key"] for r in await conn.fetch("select key from shop_features where set_by = 'owner'")
    }
    written = []
    for key, (on, config) in template.features.items():
        if only_template_set and key in owned:
            continue
        await conn.execute(
            "insert into shop_features (key, enabled, config, set_by, updated_by) "
            "values ($1, $2, $3::jsonb, 'template', $4) "
            "on conflict (tenant_id, key) do update set enabled = excluded.enabled, "
            "config = excluded.config, updated_by = excluded.updated_by, updated_at = now() "
            "where shop_features.set_by = 'template'",
            key, on, config, by,
        )
        written.append(key)
    return written


async def item_parts(conn: asyncpg.Connection, item_id) -> dict:
    """What an item holds now of each part a feature governs, for `guard_item_change`."""
    row = await conn.fetchrow(
        "select i.stock_rule, i.tags, i.pack_size, i.min_order, i.low_stock_at, "
        "(select count(*) from item_variants v where v.item_id = i.id and v.active "
        "  and not v.is_default) as variants, "
        "(select count(*) from item_option_groups g where g.item_id = i.id) as groups, "
        "(select count(*) from item_group_prices p where p.item_id = i.id) as prices "
        "from items i where i.id = $1",
        item_id,
    )
    if row is None:
        return {}
    schedule = await conn.fetch(
        "select lead_days, cutoff from item_schedules where item_id = $1", item_id
    )
    return {
        "stock_rule": row["stock_rule"], "tags": list(row["tags"]), "pack_size": row["pack_size"],
        "min_order": row["min_order"], "low_stock_at": row["low_stock_at"],
        "variants": row["variants"] > 0, "option_groups": row["groups"] > 0,
        "group_prices": row["prices"] > 0, "schedule": [dict(r) for r in schedule],
    }


# ── guards: off stops new use, never old data ─────────────────────────────────────────

_NEEDS = {
    "variants": "variants", "option_groups": "options", "schedule": "schedule",
    "group_prices": "price_groups",
}


def _refuse(cap_key: str) -> FeatureError:
    cap = capabilities.BY_KEY[cap_key]
    return FeatureError(
        "feature_off",
        f"“{cap.name.en}” is switched off for your shop. Switch it on in Features to use it.",
        f"«{cap.name.ar}» متوقفة في متجرك. شغّلها من «الميزات» لاستخدامها.",
    )


async def require(conn: asyncpg.Connection, key: str) -> None:
    """Refuse (a `FeatureError`) unless the feature is on. For things that are made new, such as
    a price group; what exists keeps working whatever this says."""
    if not (await load(conn)).on(key):
        raise _refuse(key)


def guard_new_item(feats: Features, data: dict) -> None:
    """A new item may not use a part whose feature is off. Raises `FeatureError`."""
    for part, key in _NEEDS.items():
        if data.get(part) and not feats.on(key):
            raise _refuse(key)
    rule = data.get("stock_rule")
    if rule and not feats.allows_rule(rule):
        raise _refuse(capabilities.RULE_FEATURE[rule])
    if (data.get("tags") and not feats.on("tags")):
        raise _refuse("tags")
    if not feats.on("pack_rules") and (
        data.get("pack_size") or (data.get("min_order") or 1) > 1
    ):
        raise _refuse("pack_rules")
    if not feats.on("pickup_date") and any(
        (w.get("lead_days") or 0) > 0 or w.get("cutoff") for w in data.get("schedule") or []
    ):
        raise _refuse("pickup_date")


def guard_item_change(feats: Features, current: dict, changes_: dict) -> None:
    """An edit may keep what an item has but not add to a part whose feature is off.

    `current` has what the item holds now: `stock_rule`, `tags`, `pack_size`, `min_order`,
    `low_stock_at`, `variants` (named, active), `option_groups`, `schedule` (with `lead_days`
    and `cutoff`), `group_prices`."""
    for part, key in _NEEDS.items():
        if changes_.get(part) and not feats.on(key) and not current.get(part):
            raise _refuse(key)
    rule = changes_.get("stock_rule")
    if rule and rule != current.get("stock_rule") and not feats.allows_rule(rule):
        raise _refuse(capabilities.RULE_FEATURE[rule])
    if changes_.get("tags") and not feats.on("tags") and not current.get("tags"):
        raise _refuse("tags")
    if not feats.on("pack_rules"):
        pack = changes_.get("pack_size")
        floor = changes_.get("min_order")
        if (pack and pack != current.get("pack_size")) or (
            floor and floor > 1 and floor != current.get("min_order")
        ):
            raise _refuse("pack_rules")
    if not feats.on("pickup_date"):
        had = any((w.get("lead_days") or 0) > 0 or w.get("cutoff")
                  for w in current.get("schedule") or [])
        adds = any((w.get("lead_days") or 0) > 0 or w.get("cutoff")
                   for w in changes_.get("schedule") or [])
        if adds and not had:
            raise _refuse("pickup_date")
