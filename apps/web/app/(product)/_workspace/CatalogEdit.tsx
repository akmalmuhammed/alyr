"use client";

// One item, edited or added: names in both languages, photos, price and sale, category, status,
// how it runs out, sizes and colours, choices and extras, when it can be ordered, tags, and
// its history. A bottom sheet on a phone, a side panel on a laptop. An agent without the right
// to edit sees it read-only; the API refuses them anyway.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  activityText, api, fromDirhams, nameOf, sayError, stamp, toDirhams, toInt, toQty, toSignedDirhams, whoIs,
  type ActivityRow, type Access, type Category, type CustomField, type FieldsView, type GroupPriceRow, type Group, type Item, type Photo, type PriceGroup, type PriceRow, type Rule, type Setup, type Status, type Window,
} from "./catalogApi";
import { fmtQty, fmtQtyUnit, isMeasure, qtyForApi, sumQty, UNITS as ALL_UNITS, unitOf, unitShort } from "../_customer/qty";
import { COPY, type Copy, type Lang } from "./catalogCopy";
import { CatalogPhotos } from "./CatalogPhotos";
import { CodeBox } from "./CatalogCode";
import { FEAT } from "./featuresCopy";
import { Field, Fold, Icon, Sheet, type Toast } from "./CatalogUi";

type Push = (text: string, options?: { tone?: Toast["tone"]; undo?: () => void }) => number;

type VariantForm = {
  id?: string; name: string; name_ar: string; sku: string; delta: string; limit: string; active: boolean;
  opening: string; onHand: number | null;
  // The owner's own fields for this size, as typed (ALY-148): field key to text.
  custom: Record<string, string>;
};
type OptionForm = { id?: string; name: string; name_ar: string; price: string; active: boolean };
type GroupForm = { id?: string; name: string; name_ar: string; required: boolean; max: string; options: OptionForm[] };
type WindowForm = {
  weekdays: number[]; kind: "now" | "dated"; opens: string; closes: string; lead: string; cutoff: string;
  ranged: boolean; from: string; to: string; closed: boolean;
};
export type Form = {
  name: string; name_ar: string; sku: string; description: string; description_ar: string; category: string;
  price: string; sale: string; saleEnds: string; unit: string; packSize: string; minOrder: string;
  status: Status; rule: Rule; dailyLimit: string; lowStock: string; opening: string; scheduled: boolean;
  variants: VariantForm[]; groups: GroupForm[]; windows: WindowForm[]; tags: string[];
  // What each price group pays, as typed: "group id|size id" (the size empty for the item's own) to a price.
  groupPrices: Record<string, string>;
  // The owner's own fields for this item, as typed (ALY-148): field key to text.
  custom: Record<string, string>;
};

/** Values as an input holds them: a number as its digits, yes or no as a word. */
const strings = (custom?: Record<string, string | number | boolean>): Record<string, string> =>
  Object.fromEntries(Object.entries(custom ?? {}).map(([k, v]) => [k, typeof v === "boolean" ? (v ? "yes" : "no") : String(v)]));

const priceKey = (groupId: string, variantId: string | null) => `${groupId}|${variantId ?? ""}`;

const STATUSES: Status[] = ["draft", "live", "hidden", "archived"];
const RULES: Rule[] = ["always", "switch", "count", "daily_limit"];
const UNITS = ALL_UNITS.map((u) => u.key);
// The units a shop had before "Sold by weight or volume": always offered. The others need the feature.
const LEGACY_UNITS = ["piece", "kg", "box", "pack", "portion", "hour"];
// The feature each way of running out belongs to ("always" needs none): a way whose feature is
// off is not offered for a new choice, but an item that already runs that way keeps it.
const RULE_FEATURE: Record<string, string> = { switch: "rule_switch", count: "rule_count", daily_limit: "rule_daily_limit" };

function qatarDay(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
const hhmm = (value: string | null) => (value ? value.slice(0, 5) : "");

function windowForm(w: Window): WindowForm {
  return {
    weekdays: w.weekdays, kind: w.lead_days > 0 || w.cutoff ? "dated" : "now", opens: hhmm(w.opens), closes: hhmm(w.closes),
    lead: String(w.lead_days), cutoff: hhmm(w.cutoff), ranged: Boolean(w.valid_from || w.valid_to),
    from: w.valid_from ?? "", to: w.valid_to ?? "", closed: w.closed,
  };
}

/** A new item starts the way the shop's type of business says (how it runs out, what it is sold by, and a bakery's notice and cutoff). */
export function blankForm(status: Status = "live", setup?: Setup | null): Form {
  const start = setup?.new_item;
  const dated = start?.lead_days != null;
  return {
    name: "", name_ar: "", sku: "", description: "", description_ar: "", category: "", price: "", sale: "", saleEnds: "",
    unit: start?.unit ?? "piece", packSize: "", minOrder: "1", status, rule: start?.rule ?? "switch", dailyLimit: "", lowStock: "", opening: "",
    scheduled: dated,
    variants: [], groups: [],
    windows: dated
      ? [{ weekdays: [0, 1, 2, 3, 4, 5, 6], kind: "dated", opens: "", closes: "", lead: String(start?.lead_days ?? 1), cutoff: start?.cutoff ?? "", ranged: false, from: "", to: "", closed: false }]
      : [],
    tags: [], groupPrices: {}, custom: {},
  };
}

export function formOf(item: Item): Form {
  const named = item.variants.filter((v) => !v.is_default);
  const only = item.variants.find((v) => v.is_default) ?? item.variants[0];
  return {
    name: item.name, name_ar: item.name_ar, sku: item.sku ?? "", description: item.description, description_ar: item.description_ar,
    category: item.category, price: fromDirhams(item.price || null), sale: fromDirhams(item.sale_price),
    saleEnds: qatarDay(item.sale_ends_at), unit: item.unit, packSize: item.pack_size ? fmtQty(item.pack_size) : "",
    minOrder: fmtQty(item.min_order), status: item.status, rule: item.stock_rule,
    dailyLimit: only?.daily_limit !== null && only?.daily_limit !== undefined && named.length === 0 ? fmtQty(only.daily_limit) : "",
    lowStock: item.low_stock_at === null || item.low_stock_at === undefined ? "" : fmtQty(item.low_stock_at),
    opening: "", scheduled: item.schedule.length > 0,
    variants: named.map((v) => ({
      id: v.id, name: v.name, name_ar: v.name_ar, sku: v.sku ?? "", delta: fromDirhams(v.price_delta) || "", limit: v.daily_limit === null ? "" : fmtQty(v.daily_limit),
      active: v.active, opening: "", onHand: v.on_hand, custom: strings(v.custom),
    })),
    groups: item.option_groups.map((g: Group) => ({
      id: g.id, name: g.name, name_ar: g.name_ar, required: g.required, max: String(g.max_choices),
      options: g.options.map((o) => ({ id: o.id, name: o.name, name_ar: o.name_ar, price: fromDirhams(o.price_delta) || "", active: o.active })),
    })),
    windows: item.schedule.map(windowForm), tags: item.tags,
    groupPrices: Object.fromEntries((item.group_prices ?? []).map((p) => [priceKey(p.group_id, p.variant_id), fromDirhams(p.price)])),
    custom: strings(item.custom),
  };
}

type Problems = Partial<Record<"name" | "name_ar" | "price" | "sale" | "variants" | "limit" | "low" | "schedule" | "groups" | "min" | "step" | "opening" | "sku" | "groupPrices", string>>;

/** What the person typed, as the API wants it, or what is wrong with it. */
function build(form: Form, t: Copy, existing: Item | null, defs: CustomField[] = []): { body?: Record<string, unknown>; problems: Problems } {
  const problems: Problems = {};
  const unfinished = form.status === "draft" || form.status === "archived";
  const price = toDirhams(form.price);
  // A new item is made by typing, so it needs a name; a draft made from a photo does not yet.
  // A shop that writes only Arabic leaves the English name empty and the Arabic one is used.
  const name = form.name.trim() || form.name_ar.trim();
  if (!name && (!unfinished || !existing)) problems.name = t.errors.name_needed;
  if (form.status === "live" && !form.name_ar.trim()) problems.name_ar = t.errors.arabic_needed;
  if (form.price.trim() && price === null) problems.price = t.errors.bad_price;
  else if (!unfinished && (price === null || price <= 0)) problems.price = t.errors.bad_price;
  const sale = form.sale.trim() ? toDirhams(form.sale) : null;
  if (form.sale.trim() && (sale === null || sale <= 0 || (price !== null && sale >= price))) problems.sale = t.errors.bad_sale;
  // A quantity is a whole number, or up to three decimals for something sold by weight or volume.
  const measure = isMeasure(form.unit);
  const q = (x: number | null) => (x === null ? null : qtyForApi(x));
  const minOrder = toQty(form.minOrder, form.unit);
  if (minOrder === null || minOrder > 999 || (measure ? minOrder <= 0 : minOrder < 1)) {
    problems.min = measure ? t.errors.bad_amount : t.errors.bad_minimum;
  }
  const packSize = form.packSize.trim() ? toQty(form.packSize, form.unit) : null;
  if (form.packSize.trim() && (packSize === null || packSize <= 0 || packSize > 100000)) {
    problems.step = measure ? t.errors.bad_amount : t.errors.bad_pack;
  }

  const named = form.variants;
  if (named.length > 1 && named.some((v) => !v.name.trim())) problems.variants = t.errors.variant_name_needed;
  const seen = new Set<string>();
  for (const v of named) {
    const key = v.name.trim().toLowerCase();
    if (key && seen.has(key)) problems.variants = t.errors.duplicate_variant;
    seen.add(key);
    if (toSignedDirhams(v.delta) === null) problems.variants = t.errors.bad_price;
  }
  const lowStock = form.lowStock.trim() ? toQty(form.lowStock, form.unit) : null;
  if (form.lowStock.trim() && (lowStock === null || lowStock < 0 || lowStock > 100000)) problems.low = t.errors.bad_low_stock;
  if (form.rule === "daily_limit") {
    const need = named.length ? named.filter((v) => v.active) : [{ limit: form.dailyLimit }];
    if (need.some((v) => toQty(v.limit, form.unit) === null)) problems.limit = t.errors.limit_needed;
  }
  for (const g of form.groups) {
    if (!g.name.trim()) problems.groups = t.errors.group_name_needed;
    else if (g.options.some((o) => !o.name.trim())) problems.groups = t.errors.option_name_needed;
    else if (g.required && !g.options.some((o) => o.active)) problems.groups = t.errors.options_needed;
    if ((toInt(g.max) ?? 0) < 1) problems.groups = t.errors.bad_max;
    if (g.options.some((o) => toDirhams(o.price || "0") === null)) problems.groups = t.errors.bad_price;
  }
  if (form.scheduled) {
    for (const w of form.windows) {
      if (w.weekdays.length === 0 || (w.opens && w.closes && w.closes <= w.opens) || (w.ranged && w.from && w.to && w.to < w.from)) {
        problems.schedule = t.errors.bad_schedule;
      }
    }
  }
  if (!form.opening.trim() || toQty(form.opening, form.unit) !== null) { /* ok */ } else problems.opening = t.errors.bad_quantity;
  if (form.sku.trim().length > 40 || form.variants.some((v) => v.sku.trim().length > 40)) problems.sku = t.errors.bad_sku;
  // What each group pays: a changed price is sent, an emptied one removes the group's price.
  const groupRows: { group_id: string; variant_id: string | null; price: number | null }[] = [];
  const known = new Map((existing?.group_prices ?? []).map((p) => [priceKey(p.group_id, p.variant_id), p.price]));
  for (const key of new Set([...Object.keys(form.groupPrices), ...known.keys()])) {
    const [groupId, variantId] = key.split("|");
    const typed = (form.groupPrices[key] ?? "").trim();
    const before = known.get(key) ?? null;
    if (!typed) {
      if (before !== null) groupRows.push({ group_id: groupId, variant_id: variantId || null, price: null });
      continue;
    }
    const value = toDirhams(typed);
    if (value === null || value <= 0) problems.groupPrices = t.errors.bad_group_price;
    else if (value !== before) groupRows.push({ group_id: groupId, variant_id: variantId || null, price: value });
  }
  if (Object.keys(problems).length) return { problems };

  const body: Record<string, unknown> = {
    name: name || undefined,
    name_ar: form.name_ar.trim(),
    sku: form.sku.trim(),
    description: form.description.trim(),
    description_ar: form.description_ar.trim(),
    category: form.category.trim(),
    price: price ?? 0,
    sale_price: sale,
    sale_ends_at: sale !== null && form.saleEnds ? `${form.saleEnds}T23:59:59+03:00` : null,
    unit: form.unit,
    pack_size: q(packSize),
    min_order: q(minOrder),
    // Empty clears the item's own number, so the shop's applies again.
    low_stock_at: q(lowStock),
    tags: form.tags,
    stock_rule: form.rule,
    status: form.status,
    option_groups: form.groups.map((g) => ({
      ...(g.id ? { id: g.id } : {}), name: g.name.trim(), name_ar: g.name_ar.trim(), required: g.required,
      max_choices: toInt(g.max) ?? 1,
      options: g.options.map((o) => ({
        ...(o.id ? { id: o.id } : {}), name: o.name.trim(), name_ar: o.name_ar.trim(),
        price_delta: toDirhams(o.price || "0") ?? 0, active: o.active,
      })),
    })),
    schedule: form.scheduled
      ? form.windows.map((w) => ({
        weekdays: w.weekdays, opens: w.kind === "now" && !w.closed ? w.opens || null : null,
        closes: w.kind === "now" && !w.closed ? w.closes || null : null,
        lead_days: w.kind === "dated" && !w.closed ? toInt(w.lead) ?? 0 : 0,
        cutoff: w.kind === "dated" && !w.closed ? w.cutoff || null : null,
        valid_from: w.ranged ? w.from || null : null, valid_to: w.ranged ? w.to || null : null, closed: w.closed,
      }))
      : [],
  };
  if (!body.name) delete body.name;
  if (groupRows.length) body.group_prices = groupRows;
  // The owner's own fields: what is typed is sent for the API to read; one emptied that had a
  // value is sent as null, which removes it.
  const mine = (values: Record<string, string>, had: Record<string, unknown> | undefined, place: string) => {
    const out: Record<string, unknown> = {};
    for (const d of defs) {
      if (d.applies_to !== place || d.archived) continue;
      const raw = (values[d.key] ?? "").trim();
      if (raw !== "") out[d.key] = raw;
      else if (had && d.key in had) out[d.key] = null;
    }
    return out;
  };
  const ownItem = mine(form.custom, existing?.custom, "item");
  if (Object.keys(ownItem).length) body.custom = ownItem;
  if (named.length) {
    body.variants = named.map((v) => ({
      ...(v.id ? { id: v.id } : {}), name: v.name.trim(), name_ar: v.name_ar.trim(), sku: v.sku.trim(),
      price_delta: toSignedDirhams(v.delta) ?? 0,
      daily_limit: form.rule === "daily_limit" ? q(toQty(v.limit, form.unit)) : null, active: v.active,
      ...(!v.id && form.rule === "count" && toQty(v.opening, form.unit) ? { opening_stock: q(toQty(v.opening, form.unit)) } : {}),
      ...((c) => (Object.keys(c).length ? { custom: c } : {}))(mine(v.custom, existing?.variants.find((x) => x.id === v.id)?.custom, "variant")),
    }));
  } else {
    if (form.rule === "daily_limit") body.daily_limit = q(toQty(form.dailyLimit, form.unit));
    if (!existing && form.rule === "count" && toQty(form.opening, form.unit)) body.opening_stock = q(toQty(form.opening, form.unit));
  }
  return { body, problems };
}

export function CatalogEdit({ lang, itemId, initial, categories, access, setup, push, onClose, onChanged }: {
  lang: Lang; itemId: string | null; initial: Item | null; categories: Category[]; access: Access; setup: Setup | null;
  push: Push; onClose: () => void; onChanged: () => void;
}) {
  const t = COPY[lang];
  const readOnly = !access.can_edit;
  const [item, setItem] = useState<Item | null>(initial);
  const [form, setForm] = useState<Form>(() => (initial ? formOf(initial) : blankForm("live", setup)));
  const [start, setStart] = useState(() => JSON.stringify(initial ? formOf(initial) : blankForm("live", setup)));
  const [photos, setPhotos] = useState<Photo[]>(initial?.photos ?? []);
  const [problems, setProblems] = useState<Problems>({});
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [removing, setRemoving] = useState<"" | "archive" | "delete">("");
  const [tagDraft, setTagDraft] = useState("");
  const [history, setHistory] = useState<{ did: ActivityRow[]; prices: PriceRow[]; groups: GroupPriceRow[] } | null>(null);
  // The shop's price groups, once the API has answered (it does not for a shop without the Catalog).
  const [priceGroups, setPriceGroups] = useState<PriceGroup[] | null>(null);
  // The shop's own fields (ALY-148), once the API has answered; none while the feature is off.
  const [defs, setDefs] = useState<CustomField[]>([]);
  const top = useRef<HTMLDivElement>(null);
  const now = useRef({ form, start });
  useEffect(() => { now.current = { form, start }; });

  // Fresh from the API, in case the list was a little old.
  useEffect(() => {
    if (!itemId) return;
    let live = true;
    api<Item>(`/api/items/${itemId}`).then((fresh) => {
      if (!live) return;
      setItem(fresh);
      setPhotos(fresh.photos);
      // What is on screen is replaced only if nothing has been typed yet.
      if (JSON.stringify(now.current.form) === now.current.start) {
        const next = formOf(fresh);
        setForm(next);
        setStart(JSON.stringify(next));
      }
    }).catch(() => undefined);
    return () => { live = false; };
  }, [itemId]);

  useEffect(() => {
    let live = true;
    api<{ groups: PriceGroup[] }>("/api/price-groups").then((r) => { if (live) setPriceGroups(r.groups); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    if (setup && setup.features.custom_fields === false) return;
    api<FieldsView>("/api/custom-fields").then((r) => { if (live) setDefs(r.fields.filter((x) => !x.archived)); }).catch(() => undefined);
    return () => { live = false; };
  }, [setup]);

  // The parts of the form the shop's type cares about start open on a new item.
  const focused = (part: string) => (!itemId && setup?.focus.includes(part) ? true : undefined);
  const isSample = Boolean(item?.sample);
  // A part of the form is there when its feature is on (ALY-148), or when this item already
  // uses it: switching a feature off hides it for new things and never takes it from an item.
  const feats = setup?.features;
  const allowed = (key: string, used = false) => !feats || feats[key] === true || used;

  // Choosing a measure when "Sold by weight or volume" is on starts the item at the unit's usual step
  // (a quarter kilo) if the owner has not set one; counted units go back to whole numbers.
  const changeUnit = (unit: string) => {
    const next: Partial<Form> = { unit };
    if (isMeasure(unit) && allowed("decimal_quantity") && form.packSize.trim() === "" && form.minOrder === "1") {
      next.packSize = fmtQty(unitOf(unit)?.step ?? 1);
      next.minOrder = fmtQty(unitOf(unit)?.step ?? 1);
    }
    if (!isMeasure(unit) && isMeasure(form.unit)) {
      if (form.packSize.trim() !== "" && Number(form.packSize) < 1) next.packSize = "";
      if (Number(form.minOrder) < 1) next.minOrder = "1";
    }
    set(next);
  };

  const dirty = useMemo(() => JSON.stringify(form) !== start, [form, start]);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const photoLabel = nameOf(form, lang) || t.untitled;

  function close() {
    if (dirty && !readOnly) setLeaving(true);
    else onClose();
  }

  async function save() {
    // A tag that was typed and not yet added is not lost.
    const typed = tagDraft.trim();
    const filled = typed && !form.tags.some((x) => x.toLowerCase() === typed.toLowerCase()) && form.tags.length < 20
      ? { ...form, tags: [...form.tags, typed] }
      : form;
    const { body, problems: found } = build(filled, t, item, defs);
    setProblems(found);
    if (!body) {
      setFailure(Object.values(found)[0] ?? "");
      top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    setFailure("");
    setSaving(true);
    try {
      let saved: { item: Item; warnings?: { name: string }[] };
      if (itemId) {
        saved = await api(`/api/items/${itemId}`, "PUT", body);
      } else {
        saved = await api("/api/items", "POST", body);
        // The photos chosen before the item existed go on it now, in order.
        for (const photo of photos) {
          if (photo.id) await api(`/api/items/${saved.item.id}/photos`, "POST", { asset_id: photo.id }).catch(() => undefined);
        }
        // An item counted in stock starts from the number typed.
      }
      if (itemId && form.rule === "count" && toQty(form.opening, form.unit) && form.variants.length === 0) {
        await api(`/api/items/${itemId}/stock`, "POST", { kind: "opening", quantity: qtyForApi(toQty(form.opening, form.unit) as number), reason: "Opening count" }).catch(() => undefined);
      }
      push(itemId ? t.toastSaved : t.toastAdded);
      const dup = saved.warnings?.[0];
      if (dup) push(t.duplicate(dup.name));
      onChanged();
      onClose();
    } catch (error) {
      setFailure(sayError(error, lang, t));
      top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  }

  /** The owner keeps a sample as their own, without changing it. */
  async function keep() {
    if (!itemId) return;
    setSaving(true);
    try {
      const mine = await api<Item>(`/api/items/${itemId}/adopt`, "POST");
      setItem(mine);
      push(t.sampleKept);
      onChanged();
    } catch (error) {
      setFailure(sayError(error, lang, t));
    } finally {
      setSaving(false);
    }
  }

  async function remove(kind: "archive" | "delete") {
    if (!itemId) return;
    setSaving(true);
    try {
      if (kind === "archive") await api(`/api/items/${itemId}/status`, "POST", { status: "archived" });
      else await api(`/api/items/${itemId}`, "DELETE");
      push(kind === "archive" ? t.toastArchived : t.toastDeleted);
      onChanged();
      onClose();
    } catch (error) {
      setFailure(sayError(error, lang, t));
      setRemoving("");
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(open: boolean) {
    if (!open || history || !itemId) return;
    try {
      const [did, prices, groups] = await Promise.all([
        api<{ activity: ActivityRow[] }>(`/api/items/${itemId}/activity`),
        api<{ history: PriceRow[] }>(`/api/items/${itemId}/price-history`),
        api<{ history: GroupPriceRow[] }>(`/api/items/${itemId}/group-price-history`).catch(() => ({ history: [] as GroupPriceRow[] })),
      ]);
      setHistory({ did: did.activity, prices: prices.history, groups: groups.history });
    } catch {
      setHistory({ did: [], prices: [], groups: [] });
    }
  }

  const categoryNames = categories.map((c) => c.name);

  function variantRow(v: VariantForm, i: number) {
    const patch = (change: Partial<VariantForm>) => set({ variants: form.variants.map((x, k) => (k === i ? { ...x, ...change } : x)) });
    return (
      <li key={v.id ?? `new-${i}`} className="ct-card-form">
        <div className="ct-grid2 names">
          <Field label={t.variantName}><input value={v.name} dir="auto" maxLength={80} onChange={(e) => patch({ name: e.target.value })} /></Field>
          <Field label={t.variantNameAr}><input value={v.name_ar} dir="rtl" lang="ar" maxLength={80} onChange={(e) => patch({ name_ar: e.target.value })} /></Field>
        </div>
        <div className="ct-grid2">
          <Field label={t.variantSku}><input value={v.sku} dir="ltr" maxLength={40} autoComplete="off" onChange={(e) => patch({ sku: e.target.value })} /></Field>
        </div>
        {sizeFields.length > 0 && (
          <div className="ct-grid2">{sizeFields.map((d) => ownField(d, v.custom, (next) => patch({ custom: next }), `v${i}`))}</div>
        )}
        <div className="ct-grid2">
          <Field label={t.variantExtra} hint={t.variantExtraHint}>
            <input value={v.delta} inputMode="decimal" dir="ltr" onChange={(e) => patch({ delta: e.target.value })} />
          </Field>
          {form.rule === "count" && (v.id
            ? <div className="ct-field"><span className="ct-label">{t.stockNow}</span><p className="ct-static num" dir="auto">{fmtQtyUnit(v.onHand ?? 0, form.unit, lang)}</p></div>
            : <Field label={t.openingStock}><input value={v.opening} inputMode={isMeasure(form.unit) ? "decimal" : "numeric"} dir="ltr" onChange={(e) => patch({ opening: e.target.value })} /></Field>)}
          {form.rule === "daily_limit" && (
            <Field label={t.dailyLimit}><input value={v.limit} inputMode={isMeasure(form.unit) ? "decimal" : "numeric"} dir="ltr" onChange={(e) => patch({ limit: e.target.value })} /></Field>
          )}
        </div>
        <div className="ct-row-between">
          <label className="ct-check"><input type="checkbox" checked={v.active} onChange={(e) => patch({ active: e.target.checked })} />{t.variantActive}</label>
          <button type="button" className="btn small ghost" onClick={() => set({ variants: form.variants.filter((_, k) => k !== i) })}><Icon name="trash" />{t.variantRemove}</button>
        </div>
      </li>
    );
  }

  const fe = FEAT[lang];
  /** One of the shop's own fields, drawn for its kind: a text, a number, a date, a choice from its list or yes and no. */
  function ownField(d: CustomField, values: Record<string, string>, change: (next: Record<string, string>) => void, scope: string) {
    const label = (lang === "ar" && d.label_ar ? d.label_ar : d.label || d.label_ar) + (d.required ? " *" : "");
    const value = values[d.key] ?? "";
    const put = (v: string) => change({ ...values, [d.key]: v });
    return (
      <Field key={`${scope}-${d.key}`} label={label} hint={d.required ? fe.neededBeforeSale : d.unit || undefined}>
        {d.kind === "choice" || d.kind === "yes_no" ? (
          <select value={value} onChange={(ev) => put(ev.target.value)}>
            <option value="">{fe.notSet}</option>
            {d.kind === "yes_no"
              ? [<option key="y" value="yes">{fe.yes}</option>, <option key="n" value="no">{fe.no}</option>]
              : d.choices.filter((c) => c.active || c.value === value).map((c) => <option key={c.value} value={c.value}>{lang === "ar" && c.label_ar ? c.label_ar : c.label || c.label_ar}</option>)}
          </select>
        ) : (
          <input value={value} type={d.kind === "date" ? "date" : "text"} inputMode={d.kind === "number" ? "decimal" : undefined}
            dir={d.kind === "text" ? "auto" : "ltr"} maxLength={200} autoComplete="off" onChange={(ev) => put(ev.target.value)} />
        )}
      </Field>
    );
  }
  const itemFields = defs.filter((d) => d.applies_to === "item");
  const sizeFields = defs.filter((d) => d.applies_to === "variant");

  const otherGroups = (priceGroups ?? []).filter((g) => !g.is_default);
  const pricedCount = Object.values(form.groupPrices).filter((v) => v.trim() !== "").length;
  const normalPrice = toDirhams(form.price);

  function setGroupPrice(key: string, value: string) {
    const next = { ...form.groupPrices };
    if (value === "") delete next[key];
    else next[key] = value;
    set({ groupPrices: next });
  }

  function groupPriceBox(g: PriceGroup) {
    const sizes = form.variants.filter((v) => v.id);
    return (
      <li key={g.id} className="ct-card-form">
        <b dir="auto">{nameOf(g, lang)}</b>
        <Field label={t.groupItemPrice} hint={normalPrice ? t.groupNormal(`QAR ${fromDirhams(normalPrice)}`) : undefined}>
          <input value={form.groupPrices[priceKey(g.id, null)] ?? ""} inputMode="decimal" dir="ltr" autoComplete="off"
            onChange={(e) => setGroupPrice(priceKey(g.id, null), e.target.value)} />
        </Field>
        {sizes.length > 0 && (
          <>
            <h4>{t.groupPricesSizes}</h4>
            <p className="ct-hint">{t.groupPricesSizesHint}</p>
            {sizes.map((v) => (
              <Field key={v.id} label={t.groupSizePrice(nameOf(v, lang) || t.untitled)}>
                <input value={form.groupPrices[priceKey(g.id, v.id ?? null)] ?? ""} inputMode="decimal" dir="ltr" autoComplete="off"
                  onChange={(e) => setGroupPrice(priceKey(g.id, v.id ?? null), e.target.value)} />
              </Field>
            ))}
          </>
        )}
        {form.variants.some((v) => !v.id) && <p className="ct-hint">{t.groupPricesSaveFirst}</p>}
      </li>
    );
  }

  function groupBox(g: GroupForm, gi: number) {
    const patch = (change: Partial<GroupForm>) => set({ groups: form.groups.map((x, k) => (k === gi ? { ...x, ...change } : x)) });
    const patchOption = (oi: number, change: Partial<OptionForm>) =>
      patch({ options: g.options.map((o, k) => (k === oi ? { ...o, ...change } : o)) });
    return (
      <li key={g.id ?? `group-${gi}`} className="ct-card-form">
        <div className="ct-grid2 names">
          <Field label={t.groupName}><input value={g.name} dir="auto" maxLength={80} onChange={(e) => patch({ name: e.target.value })} /></Field>
          <Field label={t.groupNameAr}><input value={g.name_ar} dir="rtl" lang="ar" maxLength={80} onChange={(e) => patch({ name_ar: e.target.value })} /></Field>
        </div>
        <div className="ct-grid2">
          <label className="ct-check"><input type="checkbox" checked={g.required} onChange={(e) => patch({ required: e.target.checked })} />{t.groupRequired}</label>
          <Field label={t.groupMax}><input value={g.max} inputMode="numeric" dir="ltr" onChange={(e) => patch({ max: e.target.value })} /></Field>
        </div>
        <ul className="ct-subs">
          {g.options.map((o, oi) => (
            <li key={o.id ?? `opt-${oi}`} className="ct-sub">
              <div className="ct-grid3">
                <Field label={t.optionName}><input value={o.name} dir="auto" maxLength={80} onChange={(e) => patchOption(oi, { name: e.target.value })} /></Field>
                <Field label={t.optionNameAr}><input value={o.name_ar} dir="rtl" lang="ar" maxLength={80} onChange={(e) => patchOption(oi, { name_ar: e.target.value })} /></Field>
                <Field label={t.optionExtra}><input value={o.price} inputMode="decimal" dir="ltr" onChange={(e) => patchOption(oi, { price: e.target.value })} /></Field>
              </div>
              <div className="ct-row-between">
                <label className="ct-check"><input type="checkbox" checked={o.active} onChange={(e) => patchOption(oi, { active: e.target.checked })} />{t.variantActive}</label>
                <button type="button" className="btn small ghost" onClick={() => patch({ options: g.options.filter((_, k) => k !== oi) })}>{t.removeOption}</button>
              </div>
            </li>
          ))}
        </ul>
        <div className="ct-row-between">
          <button type="button" className="btn small" onClick={() => patch({ options: [...g.options, { name: "", name_ar: "", price: "", active: true }] })}><Icon name="plus" />{t.addOption}</button>
          <button type="button" className="btn small ghost" onClick={() => set({ groups: form.groups.filter((_, k) => k !== gi) })}><Icon name="trash" />{t.removeGroup}</button>
        </div>
      </li>
    );
  }

  function windowBox(w: WindowForm, wi: number) {
    const patch = (change: Partial<WindowForm>) => set({ windows: form.windows.map((x, k) => (k === wi ? { ...x, ...change } : x)) });
    return (
      <li key={wi} className="ct-card-form">
        <div className="ct-row-between">
          <b>{t.windowTitle(wi + 1)}</b>
          <button type="button" className="btn small ghost" onClick={() => set({ windows: form.windows.filter((_, k) => k !== wi) })}><Icon name="trash" />{t.removeWindow}</button>
        </div>
        <div className="ct-days" role="group" aria-label={t.scheduleTitle}>
          {t.days.map((d, n) => (
            <button key={n} type="button" className="ct-chip" aria-pressed={w.weekdays.includes(n)}
              onClick={() => patch({ weekdays: w.weekdays.includes(n) ? w.weekdays.filter((x) => x !== n) : [...w.weekdays, n].sort() })}>
              {w.weekdays.includes(n) && <Icon name="check" className="sh-ico ct-chip-tick" />}{d}
            </button>
          ))}
        </div>
        {!w.closed && (
          <fieldset className="ct-choices small">
            <legend className="ct-sr">{t.windowKind}</legend>
            {(["now", "dated"] as const).filter((kind) => kind === "now" || allowed("pickup_date", w.kind === "dated")).map((kind) => (
              <label key={kind} className={`ct-choice ${w.kind === kind ? "on" : ""}`}>
                <input type="radio" name={`kind-${wi}`} checked={w.kind === kind} onChange={() => patch({ kind })} />
                <span className="ct-choice-mark" aria-hidden="true" />
                <span className="ct-choice-text"><b>{kind === "now" ? t.windowNow : t.windowDated}</b></span>
              </label>
            ))}
          </fieldset>
        )}
        {!w.closed && w.kind === "now" && (
          <div className="ct-grid2">
            <Field label={t.opens}><input type="time" value={w.opens} dir="ltr" onChange={(e) => patch({ opens: e.target.value })} /></Field>
            <Field label={t.closes}><input type="time" value={w.closes} dir="ltr" onChange={(e) => patch({ closes: e.target.value })} /></Field>
          </div>
        )}
        {!w.closed && w.kind === "dated" && (
          <div className="ct-grid2">
            <Field label={t.leadDays}><input value={w.lead} inputMode="numeric" dir="ltr" onChange={(e) => patch({ lead: e.target.value })} /></Field>
            <Field label={t.cutoff} hint={t.cutoffHint}><input type="time" value={w.cutoff} dir="ltr" onChange={(e) => patch({ cutoff: e.target.value })} /></Field>
          </div>
        )}
        <label className="ct-check"><input type="checkbox" checked={w.ranged} onChange={(e) => patch({ ranged: e.target.checked })} />{t.between}</label>
        {w.ranged && (
          <div className="ct-grid2">
            <Field label={t.validFrom}><input type="date" value={w.from} dir="ltr" onChange={(e) => patch({ from: e.target.value })} /></Field>
            <Field label={t.validTo}><input type="date" value={w.to} dir="ltr" onChange={(e) => patch({ to: e.target.value })} /></Field>
          </div>
        )}
        <label className="ct-check"><input type="checkbox" checked={w.closed} onChange={(e) => patch({ closed: e.target.checked })} />{t.closedThen}</label>
      </li>
    );
  }

  const title = itemId ? t.editItem : t.newItem;
  const subtitle = itemId ? photoLabel : undefined;
  const footer = readOnly ? (
    <button type="button" className="btn ct-btn" onClick={onClose}>{t.close}</button>
  ) : leaving ? (
    <div className="ct-confirm" role="alertdialog" aria-label={t.leaveTitle}>
      <span><b>{t.leaveTitle}</b> {t.leaveText}</span>
      <span className="ct-confirm-btns">
        <button type="button" className="btn ct-btn" data-autofocus onClick={() => setLeaving(false)}>{t.leaveKeep}</button>
        <button type="button" className="btn ct-btn danger" onClick={onClose}>{t.leaveGo}</button>
      </span>
    </div>
  ) : (
    <>
      <button type="button" className="btn ct-btn" onClick={close}>{t.cancel}</button>
      <button type="button" className="btn primary ct-btn ct-grow" disabled={saving} onClick={() => void save()}>{saving ? t.saving : t.save}</button>
    </>
  );

  return (
    <Sheet title={title} subtitle={subtitle} onClose={close} closeLabel={t.close} footer={footer} wide>
      <div ref={top} />
      {failure && <p className="ct-alert" role="alert"><Icon name="warn" />{failure}</p>}
      {readOnly && <p className="ct-banner"><span>{t.mustBeOwner}</span></p>}
      {isSample && (
        <section className="ct-sample-note" aria-labelledby="ct-sample-title">
          <h3 id="ct-sample-title"><span className="sh-pill ct-pill sample">{t.sampleTag}</span> {t.sampleSheetTitle}</h3>
          <p>{t.sampleSheetText}</p>
          <p>{t.codeSampleHint}</p>
          {!readOnly && <button type="button" className="btn small" disabled={saving} onClick={() => void keep()}>{t.sampleKeep}</button>}
        </section>
      )}
      {item && item.code !== null && <CodeBox code={item.code} name={form.name || form.name_ar} t={t} push={push} />}
      <fieldset className="ct-form" disabled={readOnly || saving}>
        <section className="ct-sec">
          <h3>{t.photosTitle}</h3>
          <CatalogPhotos lang={lang} t={t} itemId={itemId} photos={photos} readOnly={readOnly}
            onPhotos={(next) => { setPhotos(next); if (itemId) { onChanged(); void api<Item>(`/api/items/${itemId}`).then(setItem).catch(() => undefined); } }} push={push} />
        </section>

        <section className="ct-sec">
          <h3>{t.namesTitle}</h3>
          <Field label={t.nameEn} hint={t.nameEnHint} error={problems.name}>
            <input value={form.name} dir="auto" maxLength={120} autoComplete="off" onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label={t.nameAr} hint={t.nameArHint} error={problems.name_ar}>
            <input value={form.name_ar} dir="rtl" lang="ar" maxLength={120} autoComplete="off" onChange={(e) => set({ name_ar: e.target.value })} />
          </Field>
          <Field label={t.skuLabel} hint={t.skuHint} error={problems.sku}>
            <input value={form.sku} dir="ltr" maxLength={40} autoComplete="off" onChange={(e) => set({ sku: e.target.value })} />
          </Field>
        </section>

        <section className="ct-sec">
          <h3>{t.priceTitle}</h3>
          <div className="ct-grid2">
            <Field label={t.price} error={problems.price}>
              <input value={form.price} inputMode="decimal" dir="ltr" autoComplete="off" onChange={(e) => set({ price: e.target.value })} />
            </Field>
            <Field label={t.salePrice} hint={t.saleHint} error={problems.sale}>
              <input value={form.sale} inputMode="decimal" dir="ltr" autoComplete="off" onChange={(e) => set({ sale: e.target.value })} />
            </Field>
          </div>
          {form.sale.trim() !== "" && (
            <Field label={t.saleEnds}><input type="date" value={form.saleEnds} dir="ltr" onChange={(e) => set({ saleEnds: e.target.value })} /></Field>
          )}
          <div className="ct-grid2">
            <Field label={t.unit}>
              <select value={form.unit} onChange={(e) => changeUnit(e.target.value)}>
                {UNITS.filter((u) => LEGACY_UNITS.includes(u) || allowed("decimal_quantity", form.unit === u)).map((u) => (
                  <option key={u} value={u}>{t.units[u]}</option>
                ))}
              </select>
            </Field>
            {(isMeasure(form.unit)
              ? allowed("decimal_quantity", form.minOrder !== "1") || allowed("pack_rules", form.minOrder !== "1")
              : allowed("pack_rules", form.minOrder !== "1")) && (
              <Field label={t.minOrder} hint={isMeasure(form.unit) ? t.minOrderMeasureHint : undefined} error={problems.min}>
                <input value={form.minOrder} inputMode={isMeasure(form.unit) ? "decimal" : "numeric"} dir="ltr" onChange={(e) => set({ minOrder: e.target.value })} />
              </Field>
            )}
          </div>
          {isMeasure(form.unit) && (allowed("decimal_quantity", form.packSize !== "") || allowed("pack_rules", form.packSize !== "")) && (
            <Field label={t.stepLabel} hint={t.stepHint(unitShort(form.unit, lang))} error={problems.step}>
              <input value={form.packSize} inputMode="decimal" dir="ltr" onChange={(e) => set({ packSize: e.target.value })} />
            </Field>
          )}
          {!isMeasure(form.unit) && form.unit === "pack" && allowed("pack_rules", form.packSize !== "") && (
            <Field label={t.packSize} error={problems.step}><input value={form.packSize} inputMode="numeric" dir="ltr" onChange={(e) => set({ packSize: e.target.value })} /></Field>
          )}
        </section>

        <section className="ct-sec">
          <Field label={t.category} hint={t.categoryHint}>
            <input value={form.category} dir="auto" maxLength={60} list="ct-categories" autoComplete="off" onChange={(e) => set({ category: e.target.value })} />
          </Field>
          <datalist id="ct-categories">{categoryNames.map((c) => <option key={c} value={c} />)}</datalist>
          {categories.length > 0 && (
            <div className="ct-chips wrap" role="group" aria-label={t.category}>
              {categories.slice(0, 8).map((c) => (
                <button key={c.name} type="button" className="ct-chip" aria-pressed={form.category === c.name}
                  onClick={() => set({ category: form.category === c.name ? "" : c.name })}>
                  {form.category === c.name && <Icon name="check" className="sh-ico ct-chip-tick" />}{lang === "ar" && c.name_ar ? c.name_ar : c.name}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="ct-sec">
          <h3>{t.statusTitle}</h3>
          <fieldset className="ct-choices">
            <legend className="ct-sr">{t.statusTitle}</legend>
            {STATUSES.map((s) => (
              <label key={s} className={`ct-choice ${form.status === s ? "on" : ""}`}>
                <input type="radio" name="status" checked={form.status === s} onChange={() => set({ status: s })} />
                <span className="ct-choice-mark" aria-hidden="true" />
                <span className="ct-choice-text"><b>{t.status[s]}</b><small>{t.statusHints[s]}</small></span>
              </label>
            ))}
          </fieldset>
        </section>

        <section className="ct-sec">
          <h3>{t.ruleTitle}</h3>
          <fieldset className="ct-choices">
            <legend className="ct-sr">{t.ruleTitle}</legend>
            {RULES.filter((r) => r === "always" || allowed(RULE_FEATURE[r], form.rule === r)).map((r) => (
              <label key={r} className={`ct-choice ${form.rule === r ? "on" : ""}`}>
                <input type="radio" name="rule" checked={form.rule === r} onChange={() => set({ rule: r })} />
                <span className="ct-choice-mark" aria-hidden="true" />
                <span className="ct-choice-text"><b>{t.rules[r][0]}</b><small>{t.rules[r][1]}</small></span>
              </label>
            ))}
          </fieldset>
          {form.rule === "daily_limit" && form.variants.length === 0 && (
            <Field label={t.dailyLimit} error={problems.limit}>
              <input value={form.dailyLimit} inputMode={isMeasure(form.unit) ? "decimal" : "numeric"} dir="ltr" onChange={(e) => set({ dailyLimit: e.target.value })} />
            </Field>
          )}
          {form.rule === "count" && form.variants.length === 0 && (
            !itemId || (item && item.variants.every((v) => v.on_hand === 0))
              ? <Field label={t.openingStock} error={problems.opening}><input value={form.opening} inputMode={isMeasure(form.unit) ? "decimal" : "numeric"} dir="ltr" onChange={(e) => set({ opening: e.target.value })} /></Field>
              : <p className="ct-hint">{t.inStock(fmtQtyUnit(sumQty(item?.variants.map((v) => v.on_hand) ?? []), form.unit, lang))}. {t.changeInStock}</p>
          )}
          {form.rule === "count" && itemId && item && item.stock_rule !== "count" && form.variants.length > 0 && <p className="ct-hint">{t.stockLater}</p>}
          {(form.rule === "count" || form.rule === "daily_limit") && (
            <Field label={t.lowStockOwn} hint={t.lowStockOwnHint} error={problems.low}>
              <input value={form.lowStock} inputMode={isMeasure(form.unit) ? "decimal" : "numeric"} dir="ltr" onChange={(e) => set({ lowStock: e.target.value })} />
            </Field>
          )}
        </section>

        <Fold title={t.descTitle} summary={form.description || form.description_ar ? "✓" : undefined} open={form.description || form.description_ar ? true : undefined}>
          <Field label={t.descEn}><textarea value={form.description} dir="auto" rows={3} maxLength={1000} onChange={(e) => set({ description: e.target.value })} /></Field>
          <Field label={t.descAr}><textarea value={form.description_ar} dir="rtl" lang="ar" rows={3} maxLength={1000} onChange={(e) => set({ description_ar: e.target.value })} /></Field>
        </Fold>

        {allowed("variants", form.variants.length > 0) && <Fold title={t.variantsTitle} summary={form.variants.length ? String(form.variants.length) : undefined} open={form.variants.length > 0 ? true : focused("variants")}>
          <p className="ct-hint">{t.variantsHint}</p>
          {problems.variants && <p className="ct-error">{problems.variants}</p>}
          <ul className="ct-stack">{form.variants.map(variantRow)}</ul>
          <button type="button" className="btn ct-btn" onClick={() => set({ variants: [...form.variants, { name: "", name_ar: "", sku: "", delta: "", limit: form.dailyLimit, active: true, opening: "", onHand: null, custom: {} }] })}>
            <Icon name="plus" />{t.addVariant}
          </button>
          {form.variants.length > 0 && itemId && <p className="ct-hint">{t.variantKept}</p>}
        </Fold>}

        {priceGroups !== null && allowed("price_groups", pricedCount > 0) && (
          <Fold title={t.groupPricesTitle} summary={pricedCount ? t.groupPricesSummary(pricedCount) : undefined} open={pricedCount > 0 ? true : focused("groups")}>
            <p className="ct-hint">{t.groupPricesHint}</p>
            {problems.groupPrices && <p className="ct-error">{problems.groupPrices}</p>}
            {otherGroups.length === 0 ? <p className="ct-hint">{t.groupPricesNone}</p> : (
              <ul className="ct-stack">{otherGroups.map(groupPriceBox)}</ul>
            )}
          </Fold>
        )}

        {allowed("options", form.groups.length > 0) && <Fold title={t.optionsTitle} summary={form.groups.length ? String(form.groups.length) : undefined} open={form.groups.length > 0 ? true : focused("options")}>
          <p className="ct-hint">{t.optionsHint}</p>
          {problems.groups && <p className="ct-error">{problems.groups}</p>}
          <ul className="ct-stack">{form.groups.map(groupBox)}</ul>
          <button type="button" className="btn ct-btn" onClick={() => set({ groups: [...form.groups, { name: "", name_ar: "", required: false, max: "1", options: [{ name: "", name_ar: "", price: "", active: true }] }] })}>
            <Icon name="plus" />{t.addGroup}
          </button>
        </Fold>}

        {allowed("schedule", form.scheduled) && <Fold title={t.scheduleTitle} summary={form.scheduled ? t.scheduleSet : t.scheduleAny} open={form.scheduled ? true : focused("schedule")}>
          <fieldset className="ct-choices small">
            <legend className="ct-sr">{t.scheduleTitle}</legend>
            {[false, true].map((on) => (
              <label key={String(on)} className={`ct-choice ${form.scheduled === on ? "on" : ""}`}>
                <input type="radio" name="scheduled" checked={form.scheduled === on}
                  onChange={() => set({ scheduled: on, windows: on && form.windows.length === 0 ? [{ weekdays: [0, 1, 2, 3, 4, 5, 6], kind: "now", opens: "", closes: "", lead: "0", cutoff: "", ranged: false, from: "", to: "", closed: false }] : form.windows })} />
                <span className="ct-choice-mark" aria-hidden="true" />
                <span className="ct-choice-text"><b>{on ? t.scheduleSet : t.scheduleAny}</b></span>
              </label>
            ))}
          </fieldset>
          {form.scheduled && (
            <>
              {problems.schedule && <p className="ct-error">{problems.schedule}</p>}
              <ul className="ct-stack">{form.windows.map(windowBox)}</ul>
              <button type="button" className="btn ct-btn" onClick={() => set({ windows: [...form.windows, { weekdays: [0, 1, 2, 3, 4, 5, 6], kind: "now", opens: "", closes: "", lead: "0", cutoff: "", ranged: false, from: "", to: "", closed: false }] })}>
                <Icon name="plus" />{t.addWindow}
              </button>
            </>
          )}
        </Fold>}

        {itemFields.length > 0 && allowed("custom_fields", Object.keys(form.custom).length > 0) && (
          <Fold title={fe.moreDetails} summary={fe.moreDetailsSummary(Object.values(form.custom).filter((x) => x !== "").length)}
            open={Object.values(form.custom).some((x) => x !== "") || itemFields.some((d) => d.required) ? true : undefined}>
            {itemFields.map((d) => ownField(d, form.custom, (next) => set({ custom: next }), "item"))}
          </Fold>
        )}

        {allowed("tags", form.tags.length > 0) && <Fold title={t.tagsTitle} summary={form.tags.length ? String(form.tags.length) : undefined} open={form.tags.length > 0 ? true : undefined}>
          <p className="ct-hint">{t.tagsHint}</p>
          {form.tags.length > 0 && (
            <ul className="ct-tags">
              {form.tags.map((tag) => (
                <li key={tag}><span dir="auto">{tag}</span>
                  <button type="button" className="sh-iconbtn" aria-label={t.tagRemove(tag)} onClick={() => set({ tags: form.tags.filter((x) => x !== tag) })}><Icon name="x" /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="ct-tagadd">
            <Field label={t.addTag}>
              <input value={tagDraft} dir="auto" maxLength={30} autoComplete="off" onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tagDraft); } }} />
            </Field>
            <button type="button" className="btn ct-btn" disabled={!tagDraft.trim()} onClick={() => addTag(tagDraft)}>{t.tagAdd}</button>
          </div>
          <div className="ct-chips wrap" role="group" aria-label={t.tagsTitle}>
            {t.tagIdeas.filter((x) => !form.tags.some((y) => y.toLowerCase() === x.toLowerCase())).map((idea) => (
              <button key={idea} type="button" className="ct-chip" onClick={() => addTag(idea)}><Icon name="plus" className="sh-ico ct-chip-tick" />{idea}</button>
            ))}
          </div>
        </Fold>}

        {itemId && (
          <Fold title={t.historyTitle} onToggle={(o) => void openHistory(o)}>
            {!history ? <p className="ct-hint" role="status">{t.historyLoading}</p> : (
              <>
                <h4>{t.historyPrices}</h4>
                {history.prices.length === 0 ? <p className="ct-hint">{t.historyNone}</p> : (
                  <ul className="ct-log">
                    {history.prices.map((p, i) => (
                      <li key={i}><b className="num" dir="ltr">{p.price_text}{p.sale_price_text ? ` · ${p.sale_price_text}` : ""}</b>
                        <span>{whoIs(p.changed_by.name, t)}{p.reason ? ` · ${p.reason}` : ""}</span>
                        <time className="num" dateTime={p.at} dir="ltr">{stamp(p.at, lang)}</time></li>
                    ))}
                  </ul>
                )}
                {history.groups.length > 0 && (
                  <>
                    <h4>{t.historyGroups}</h4>
                    <ul className="ct-log">
                      {history.groups.map((p, i) => (
                        <li key={i}><b className="num" dir="ltr">{p.price_text ?? t.historyRemoved}</b>
                          <span><span dir="auto">{nameOf(p.group, lang)}</span>{p.variant ? <> · <span dir="auto">{nameOf(p.variant, lang)}</span></> : null} · {whoIs(p.changed_by.name, t)}{p.reason ? ` · ${p.reason}` : ""}</span>
                          <time className="num" dateTime={p.at} dir="ltr">{stamp(p.at, lang)}</time></li>
                      ))}
                    </ul>
                  </>
                )}
                <h4>{t.historyDid}</h4>
                {history.did.length === 0 ? <p className="ct-hint">{t.historyNone}</p> : (
                  <ul className="ct-log">
                    {history.did.map((a) => (
                      <li key={a.id}><span><b>{whoIs(a.actor.name, t)}</b> {activityText(a, t)}</span>
                        <time className="num" dateTime={a.at} dir="ltr">{stamp(a.at, lang)}</time></li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Fold>
        )}

        {itemId && !readOnly && item && item.status !== "archived" && (
          <section className="ct-sec danger">
            <h3>{t.dangerTitle}</h3>
            {removing ? (
              <div className="sh-confirm" role="alertdialog" aria-label={t.confirm}>
                <span>{t.confirm}</span>
                <button type="button" className="btn small" data-autofocus onClick={() => setRemoving("")}>{t.leaveKeep}</button>
                <button type="button" className="btn small danger" disabled={saving} onClick={() => void remove(removing)}>{t.confirmGo}</button>
              </div>
            ) : (
              <div className="ct-stack">
                {!isSample && <div><button type="button" className="btn ct-btn" onClick={() => setRemoving("archive")}><Icon name="stock" />{t.archive}</button><p className="ct-hint">{t.archiveText}</p></div>}
                <div><button type="button" className="btn ct-btn danger-line" onClick={() => setRemoving("delete")}><Icon name="trash" />{isSample ? t.sampleRemoveOne : t.deleteItem}</button>{!isSample && <p className="ct-hint">{t.deleteText}</p>}</div>
              </div>
            )}
          </section>
        )}
      </fieldset>
    </Sheet>
  );

  function addTag(text: string) {
    const tag = text.trim();
    if (!tag || form.tags.some((x) => x.toLowerCase() === tag.toLowerCase()) || form.tags.length >= 20) return;
    set({ tags: [...form.tags, tag] });
    setTagDraft("");
  }
}
