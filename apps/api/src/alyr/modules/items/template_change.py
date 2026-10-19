"""Changing a shop's type: re-applying another template to a shop that exists (D-039 "As built
(feature engine)", ALY-148, `specs/012-feature-engine/spec.md`).

Switching from a bakery to a shop, or adding a perfume counter's template to a shop that began as
a general one, must be safe to do at any time, so it is **additive** and it is **previewed**:

* a feature the new template has on and the shop has off is switched on, unless the owner
  switched it off themselves, in which case it stays as they set it;
* nothing is switched off, nothing is removed, no item, price, stock, photo, setting, price group
  or custom field is changed;
* the new template's starter categories and fields the shop does not have are added (a field
  the shop already has, even one it archived or changed, is left exactly as it is);
* the shop's section name and layout follow the new template where the owner has not written
  their own, and the preview says so;
* how a new item runs out, the low-stock number and the unit stay as the shop has them.

The preview lists exactly what the apply will do and carries a hash; the apply must carry the
hash, so only what was seen is done. Both read the shop and the template in one transaction. Every
function takes a tenant-scoped connection.
"""

import hashlib
import json

import asyncpg

from alyr import capabilities, presets, shop_templates
from alyr.catalog import Text
from alyr.config import get_settings
from alyr.core import team
from alyr.core.team import Actor
from alyr.modules.items import changes, features, fields, service, template, templates
from alyr.modules.items.service import BilingualError
from alyr.shop_templates import ShopTemplate


class ChangeError(BilingualError):
    """A change of type that cannot be made."""


def _text(value: Text) -> dict:
    return {"en": value.en, "ar": value.ar}


def _named(key: str) -> dict:
    cap = capabilities.BY_KEY[key]
    return {"key": key, "name": cap.name.en, "name_ar": cap.name.ar}


async def plan(conn: asyncpg.Connection, target: ShopTemplate) -> dict:
    """What re-applying `target` would do to this shop. Writes nothing."""
    feats = await features.load(conn)
    current = feats.template
    turn_on, stay_off, stays_on = [], [], []
    for cap in capabilities.SWITCHABLE:
        wanted = target.features[cap.key][0]
        row = feats.rows.get(cap.key)
        if wanted and not feats.on(cap.key):
            # What the owner set stays as they set it, and so does a feature that needs one
            # they switched off.
            blocked = any(
                not feats.on(dep) and (feats.rows.get(dep) is not None
                                       and feats.rows[dep].set_by == "owner")
                for dep in cap.depends_on
            )
            if (row is not None and row.set_by == "owner") or blocked:
                stay_off.append(_named(cap.key))
            else:
                turn_on.append({**_named(cap.key), "hint": cap.hint.en, "hint_ar": cap.hint.ar})
        elif not wanted and feats.on(cap.key):
            stays_on.append(_named(cap.key))
    have = {c["name"].lower() for c in await service.categories(conn)}
    new_categories = [{"name": n, "name_ar": a} for n, a in target.setup.categories
                      if n.lower() not in have]
    have_fields = {r["key"] for r in await conn.fetch("select key from custom_fields")}
    new_fields = [
        {"key": f.key, "label": f.label.en, "label_ar": f.label.ar, "kind": f.kind}
        for f in target.fields if f.key not in have_fields
    ]
    room = fields.MAX_FIELDS - await conn.fetchval(
        "select count(*) from custom_fields where archived_at is null")
    skipped_fields = new_fields[max(room, 0):]
    new_fields = new_fields[:max(room, 0)]
    mine = await template._shop_values(conn)
    wording = {}
    now_name = template.section_of(current.setup, mine)
    new_name = template.section_of(target.setup, mine)
    if (now_name.en, now_name.ar) != (new_name.en, new_name.ar):
        wording["section"] = {"from": _text(now_name), "to": _text(new_name)}
    now_style = mine["layout_style"] or current.setup.layout.style
    new_style = mine["layout_style"] or target.setup.layout.style
    if now_style != new_style:
        wording["layout"] = {"from": now_style, "to": new_style}
    body = {
        "from": {"key": current.key, "name": current.name.en, "name_ar": current.name.ar},
        "to": {"key": target.key, "name": target.name.en, "name_ar": target.name.ar,
               "builtin": target.builtin},
        "turn_on": turn_on, "stay_off": stay_off, "stays_on": stays_on,
        "categories": new_categories, "fields": new_fields, "fields_skipped": skipped_fields,
        "wording": wording,
    }
    body["nothing"] = not (turn_on or new_categories or new_fields or wording) and (
        current.key == target.key)
    body["hash"] = hashlib.sha256(
        json.dumps(body, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()[:16]
    return body


async def apply(
    conn: asyncpg.Connection, actor: Actor, target: ShopTemplate, expected: str,
    *, by: str = "owner",
) -> dict:
    """Re-apply the template, doing exactly what `plan` said (`expected` is its hash)."""
    seen = await plan(conn, target)
    if seen["hash"] != expected:
        raise ChangeError(
            "preview_changed", "Something changed since you looked. Look at the preview again.",
            "تغيّر شيء منذ نظرتَ. اطّلع على المعاينة مجدداً.")
    for item in seen["turn_on"]:
        await features.set_feature(conn, actor, item["key"], enabled=True, by="template",
                                   record=False)
    existing = {c["name"].lower() for c in await service.categories(conn)}
    top = await conn.fetchval("select coalesce(max(sort), -1) from item_categories")
    for n, cat in enumerate(seen["categories"], start=1):
        if cat["name"].lower() in existing:
            continue
        await conn.execute(
            "insert into item_categories (name, name_ar, sort) values ($1, $2, $3) "
            "on conflict (tenant_id, name) do nothing", cat["name"], cat["name_ar"], top + n)
    await fields.seed(conn, actor, [f for f in target.fields
                                    if f.key in {x["key"] for x in seen["fields"]}])
    kind = await template.business_type(conn)
    own_key = "" if target.key == kind else target.key
    await conn.execute(
        "insert into shop_settings (template_key) values ($1) "
        "on conflict (tenant_id) do update set template_key = $1", own_key)
    await team.record(
        conn, changes.SUBJECT, await changes.shop_id(conn), "template_applied", actor, None,
        {"from": seen["from"]["key"], "to": seen["to"]["key"], "by": by,
         "turned_on": [i["key"] for i in seen["turn_on"]],
         "categories": [c["name"] for c in seen["categories"]],
         "fields": [f["key"] for f in seen["fields"]]},
    )
    return {"applied": True, **await plan(conn, target)}


async def find(
    conn: asyncpg.Connection, key: str, *, usable: bool = False
) -> ShopTemplate | None:
    """A template by its key: one of ALYR's own, or one made in the back office. With `usable`,
    one that has been archived is not found (it is not offered to anyone new)."""
    if key in shop_templates.BUILTIN:
        return shop_templates.BUILTIN[key]
    found = await templates.get(conn, key)
    if found is not None and usable and await templates.archived(conn, key):
        return None
    return found


def business_type_of(target: ShopTemplate) -> str:
    """The business type that goes with a template: its own for a built-in type, the one a made
    template stands on, none for the plain one."""
    if target.builtin:
        return target.key if target.key in presets.PRESET_BY_KEY else ""
    return target.based_on


async def choices(conn: asyncpg.Connection, *, everything: bool) -> list[ShopTemplate]:
    """The templates a shop may switch to. An owner: the types ALYR offers owners (those with a
    catalog) and the templates made in the back office that say so. The back office
    (`everything`): every built-in and every made template that is not archived."""
    catalog_on = get_settings().catalog_for_new_shops
    built = [
        t for t in shop_templates.BUILTIN.values()
        if everything or t.key == shop_templates.GENERIC_KEY
        or ((p := presets.PRESET_BY_KEY.get(t.key)) is not None and p.offered(catalog_on))
    ]
    made = await templates.every(conn) if everything else await templates.offered(conn)
    return [*built, *made]
