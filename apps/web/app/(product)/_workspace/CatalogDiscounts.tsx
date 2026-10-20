"use client";

// Discounts and coupon codes (ALY-150, specs/014-pricing-pack): the rules a shop gives its
// customers, in the Catalog beside Features and Settings. Owners and admins only, and only
// while the shop has the feature on (the button is not drawn otherwise). A list of the rules
// with where each stands and what it has given away, and one form for a coupon code or an
// automatic discount. Ending asks first and is for good; a copy starts a new one. Phone first,
// English and Arabic, saved with the button; the API's own sentence is shown beside Save.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatPrice } from "../_customer/price";
import {
  api, nameOf, sayError, stamp,
  type Category, type DiscountBody, type DiscountRule, type DiscountsView, type Item, type ListResult, type PriceGroup,
} from "./catalogApi";
import { COPY, type Lang } from "./catalogCopy";
import { Field, Icon, Sheet, Switch, type Toast } from "./CatalogUi";
import { PRICING, type PricingCopy } from "./pricingCopy";
import {
  codeOk, dirhamsToRiyals, percentText, riyalsToDirhams, shownCode, toLocalInput, wholeNumber,
} from "./pricingMoney";
import "./pricing.css";

type Push = (text: string, options?: { tone?: Toast["tone"]; undo?: () => void }) => number;
type Value = "percent" | "amount" | "free_units";

type Draft = {
  kind: "coupon" | "auto"; code: string; name: string; nameAr: string; value: Value;
  percent: string; amount: string; buy: string; get: string;
  scope: "order" | "selected"; itemIds: string[]; cats: string[];
  minOrder: string; usage: string; each: string; starts: string; ends: string; group: string; stackable: boolean;
};
type Errors = Partial<Record<"code" | "percent" | "amount" | "buy" | "get" | "scope" | "minOrder" | "usage" | "each" | "dates", string>>;

const blank = (): Draft => ({
  kind: "coupon", code: "", name: "", nameAr: "", value: "percent", percent: "", amount: "", buy: "2", get: "1",
  scope: "order", itemIds: [], cats: [], minOrder: "", usage: "", each: "", starts: "", ends: "", group: "", stackable: false,
});

function draftOf(rule: DiscountRule, copy: boolean): Draft {
  // A copy keeps what the rule gives and who it is for, and takes a new code. The dates of one
  // that has ended would end the copy before it began, so they are left empty.
  const dates = !(copy && rule.state === "ended");
  return {
    kind: rule.kind, code: copy ? "" : rule.code, name: rule.name, nameAr: rule.name_ar, value: rule.value_type,
    percent: rule.percent ?? "", amount: dirhamsToRiyals(rule.amount), buy: String(rule.buy_qty ?? 2), get: String(rule.get_qty ?? 1),
    scope: rule.scope, itemIds: rule.items.map((i) => i.id), cats: [...rule.categories],
    minOrder: rule.min_order ? dirhamsToRiyals(rule.min_order) : "",
    usage: rule.usage_limit === null ? "" : String(rule.usage_limit), each: rule.per_customer_limit === null ? "" : String(rule.per_customer_limit),
    starts: dates ? toLocalInput(rule.starts_at) : "", ends: dates ? toLocalInput(rule.ends_at) : "",
    group: rule.group_id ?? "", stackable: rule.stackable,
  };
}

/** What the person typed, checked. An empty list means it can be sent. */
function check(d: Draft, p: PricingCopy): Errors {
  const e: Errors = {};
  if (d.kind === "coupon" && !codeOk(d.code)) e.code = p.err.code;
  if (d.value === "percent" && percentText(d.percent) === null) e.percent = p.err.percent;
  if (d.value === "amount") {
    const dirhams = riyalsToDirhams(d.amount);
    if (dirhams === null || dirhams < 1) e.amount = p.err.amount;
  }
  if (d.value === "free_units") {
    if (wholeNumber(d.buy, 99) === null) e.buy = p.err.buy;
    if (wholeNumber(d.get, 99) === null) e.get = p.err.get;
  }
  if (d.scope === "selected" && d.itemIds.length + d.cats.length === 0) e.scope = p.err.scope;
  if (d.minOrder.trim() && riyalsToDirhams(d.minOrder) === null) e.minOrder = p.err.minOrder;
  if (d.usage.trim() && wholeNumber(d.usage, 1_000_000) === null) e.usage = p.err.limit;
  if (d.each.trim() && wholeNumber(d.each, 1_000_000) === null) e.each = p.err.limit;
  if (d.starts && d.ends && d.ends <= d.starts) e.dates = p.err.dates;
  return e;
}

/** The body the API takes: riyals as whole dirhams, a percentage as a number, empty as nothing. */
function bodyOf(d: Draft): DiscountBody {
  const body: DiscountBody = {
    kind: d.kind, code: d.kind === "coupon" ? d.code : "", name: d.name.trim(), name_ar: d.nameAr.trim(),
    value_type: d.value, scope: d.scope,
    item_ids: d.scope === "selected" ? d.itemIds : [], categories: d.scope === "selected" ? d.cats : [],
    min_order: d.minOrder.trim() ? riyalsToDirhams(d.minOrder) ?? 0 : 0,
    usage_limit: d.usage.trim() ? wholeNumber(d.usage, 1_000_000) : null,
    per_customer_limit: d.each.trim() ? wholeNumber(d.each, 1_000_000) : null,
    starts_at: d.starts || null, ends_at: d.ends || null, stackable: d.stackable, group_id: d.group || null,
  };
  if (d.value === "percent") body.percent = Number(percentText(d.percent));
  if (d.value === "amount") body.amount = riyalsToDirhams(d.amount) ?? 0;
  if (d.value === "free_units") {
    body.buy_qty = wholeNumber(d.buy, 99) ?? 1;
    body.get_qty = wholeNumber(d.get, 99) ?? 1;
  }
  return body;
}

function labelOf(rule: DiscountRule, lang: Lang, p: PricingCopy): string {
  if (rule.kind === "coupon") return rule.code;
  return (lang === "ar" ? rule.name_ar || rule.name : rule.name || rule.name_ar).trim() || p.unnamed;
}

const TONE: Record<string, string> = { active: "active", scheduled: "wait", paused: "wait", used_up: "quiet", ended: "quiet" };

// ── the sheet ───────────────────────────────────────────

type Mode = { kind: "list" } | { kind: "form"; rule: DiscountRule | null; copy: boolean };

export function CatalogDiscounts({ lang, push, groupsOn, categories, onClose, onChanged }: {
  lang: Lang; push: Push; groupsOn: boolean; categories: Category[]; onClose: () => void; onChanged?: () => void;
}) {
  const p = PRICING[lang];
  const t = COPY[lang];
  const [view, setView] = useState<DiscountsView | null>(null);
  const [failure, setFailure] = useState("");
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api<DiscountsView>("/api/discounts").then((v) => { setView(v); setFailure(""); }).catch((error) => setFailure(sayError(error, lang, t)));
  }, [lang, t]);
  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  async function change(rule: DiscountRule, action: "pause" | "resume" | "end") {
    setBusy(rule.id);
    setFailure("");
    try {
      await api<{ rule: DiscountRule }>(`/api/discounts/${rule.id}/${action}`, "POST");
      push(action === "pause" ? p.paused : action === "resume" ? p.resumed : p.ended);
      setAsking(null);
      load();
      onChanged?.();
    } catch (error) {
      setFailure(sayError(error, lang, t));
    } finally {
      setBusy(null);
    }
  }

  if (mode.kind === "form") {
    return (
      <DiscountForm lang={lang} rule={mode.rule} copy={mode.copy} groupsOn={groupsOn} categories={categories} push={push}
        onCancel={() => setMode({ kind: "list" })}
        onSaved={() => { setMode({ kind: "list" }); load(); onChanged?.(); }} />
    );
  }

  const rules = view?.rules ?? [];

  function row(rule: DiscountRule) {
    const label = labelOf(rule, lang, p);
    const finished = rule.state === "ended";
    const names = [
      ...rule.items.map((i) => nameOf(i, lang)),
      ...rule.categories,
    ];
    const when = rule.starts_at && rule.ends_at ? p.fromTo(stamp(rule.starts_at, lang), stamp(rule.ends_at, lang))
      : rule.starts_at ? p.from(stamp(rule.starts_at, lang)) : rule.ends_at ? p.until(stamp(rule.ends_at, lang)) : "";
    const busyNow = busy === rule.id;
    const named = rule.kind === "coupon" ? (lang === "ar" ? rule.name_ar || rule.name : rule.name || rule.name_ar).trim() : "";
    return (
      <li key={rule.id} className={`ct-card-form pr-rule ${finished ? "over" : ""}`} data-rule={rule.id}>
        <div className="pr-head">
          <span className="ct-toggle-text">
            <b dir="auto" className={rule.kind === "coupon" ? "pr-code" : ""}>{label}</b>
            <small>{p.kinds[rule.kind]}{named ? ` · ${named}` : ""}</small>
          </span>
          <span className={`sh-pill ct-pill ${TONE[rule.state] ?? "quiet"}`}>{p.states[rule.state] ?? rule.state}</span>
        </div>
        <p className="pr-words" dir="auto">{lang === "ar" ? rule.text_ar || rule.text : rule.text}</p>
        <ul className="pr-meta">
          <li>{rule.uses > 0 ? p.used(rule.uses, formatPrice(rule.given, lang)) : p.usedNone}</li>
          {when && <li>{when}</li>}
          {rule.usage_limit !== null && <li>{p.limitTotal(rule.usage_limit)}</li>}
          {rule.per_customer_limit !== null && <li>{p.limitEach(rule.per_customer_limit)}</li>}
          {rule.scope === "selected" && names.length > 0 && (
            <li dir="auto">{p.onlyItems(names.slice(0, 3).join(lang === "ar" ? "، " : ", "))}{names.length > 3 ? ` ${p.moreItems(names.length - 3)}` : ""}</li>
          )}
          {rule.group && <li dir="auto">{p.onlyGroup((lang === "ar" ? rule.group.name_ar || rule.group.name : rule.group.name || rule.group.name_ar))}</li>}
          {rule.stackable && <li>{p.combinable}</li>}
        </ul>
        <div className="ct-row-btns pr-acts">
          {rule.status !== "ended" && (
            <button type="button" className="btn small" aria-label={p.editNamed(label)} disabled={busyNow}
              onClick={() => setMode({ kind: "form", rule, copy: false })}>{p.edit}</button>
          )}
          {!finished && rule.status === "active" && (
            <button type="button" className="btn small" aria-label={p.pauseNamed(label)} disabled={busyNow}
              onClick={() => void change(rule, "pause")}>{p.pause}</button>
          )}
          {!finished && rule.status === "paused" && (
            <button type="button" className="btn small" aria-label={p.resumeNamed(label)} disabled={busyNow}
              onClick={() => void change(rule, "resume")}>{p.resume}</button>
          )}
          <button type="button" className="btn small" aria-label={p.copyNamed(label)} disabled={busyNow}
            onClick={() => setMode({ kind: "form", rule, copy: true })}>{p.copy}</button>
          {!finished && (
            <button type="button" className="btn small ghost" aria-label={p.endNamed(label)} aria-expanded={asking === rule.id} disabled={busyNow}
              onClick={() => setAsking(asking === rule.id ? null : rule.id)}><Icon name="trash" />{p.end}</button>
          )}
        </div>
        {asking === rule.id && (
          <div className="sh-confirm" role="alertdialog" aria-label={p.endNamed(label)}>
            <span>{p.endAsk(label)}</span>
            <button type="button" className="btn small" data-autofocus onClick={() => setAsking(null)}>{p.endKeep}</button>
            <button type="button" className="btn small danger" disabled={busyNow} onClick={() => void change(rule, "end")}>{p.endConfirm}</button>
          </div>
        )}
      </li>
    );
  }

  return (
    <Sheet title={p.title} subtitle={view ? (view.given_total > 0 ? p.given(formatPrice(view.given_total, lang)) : p.givenNone) : undefined}
      onClose={onClose} closeLabel={p.close} wide
      footer={<button type="button" className="btn primary ct-btn ct-grow" onClick={onClose}>{p.close}</button>}>
      <div ref={root} className="pr-body">
        {failure && <p className="ct-alert" role="alert"><Icon name="warn" />{failure}</p>}
        <p className="ct-hint pr-intro">{p.intro}</p>
        {!view && !failure && <p className="ct-quiet" role="status">{p.loading}</p>}
        {view && (
          <>
            <button type="button" className="btn primary ct-btn pr-add" data-autofocus
              disabled={rules.filter((r) => r.state !== "ended").length >= view.limits.rules}
              onClick={() => setMode({ kind: "form", rule: null, copy: false })}><Icon name="plus" />{p.add}</button>
            {rules.length === 0 ? (
              <div className="pr-slot">
                <b>{p.emptySlot}</b>
                <span>{p.emptyText}</span>
              </div>
            ) : (
              <ul className="ct-stack">{rules.map(row)}</ul>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

// ── the form ────────────────────────────────────────────

function DiscountForm({ lang, rule, copy, groupsOn, categories, push, onCancel, onSaved }: {
  lang: Lang; rule: DiscountRule | null; copy: boolean; groupsOn: boolean; categories: Category[]; push: Push;
  onCancel: () => void; onSaved: () => void;
}) {
  const p = PRICING[lang];
  const t = COPY[lang];
  const editing = rule !== null && !copy;
  const [d, setD] = useState<Draft>(() => (rule ? draftOf(rule, copy) : blank()));
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [itemsFailed, setItemsFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<PriceGroup[]>([]);
  const form = useRef<HTMLFormElement>(null);
  const set = (patch: Partial<Draft>) => { setD((x) => ({ ...x, ...patch })); };

  // The items to choose from: asked for only when "chosen items" is picked.
  const wantItems = d.scope === "selected";
  useEffect(() => {
    if (!wantItems || items !== null || itemsFailed) return;
    let live = true;
    api<ListResult>("/api/items?limit=500").then((r) => { if (live) setItems(r.items); }).catch(() => { if (live) setItemsFailed(true); });
    return () => { live = false; };
  }, [wantItems, items, itemsFailed]);

  useEffect(() => {
    if (!groupsOn && !rule?.group_id) return;
    let live = true;
    api<{ groups: PriceGroup[] }>("/api/price-groups").then((r) => { if (live) setGroups(r.groups); }).catch(() => undefined);
    return () => { live = false; };
  }, [groupsOn, rule?.group_id]);

  const known = useMemo(() => {
    const map = new Map<string, { name: string; name_ar: string }>();
    rule?.items.forEach((i) => map.set(i.id, i));
    items?.forEach((i) => map.set(i.id, i));
    return map;
  }, [rule, items]);
  const shownItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((i) => !q || `${i.name} ${i.name_ar}`.toLowerCase().includes(q));
  }, [items, query]);
  const categoryNames = useMemo(() => {
    const own = categories.map((c) => ({ value: c.name, label: lang === "ar" && c.name_ar ? c.name_ar : c.name }));
    const extra = d.cats.filter((c) => !own.some((o) => o.value.toLowerCase() === c.toLowerCase())).map((c) => ({ value: c, label: c }));
    return [...own, ...extra];
  }, [categories, d.cats, lang]);
  const groupChoices = groups.filter((g) => !g.is_default);

  const toggle = (list: string[], value: string, on: boolean) => (on ? [...list, value] : list.filter((x) => x !== value));
  const lockedCode = editing && (rule?.uses ?? 0) > 0;

  async function save() {
    const found = check(d, p);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFailure(p.fixFields);
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    setFailure("");
    try {
      if (editing && rule) await api(`/api/discounts/${rule.id}`, "PUT", bodyOf(d));
      else await api("/api/discounts", "POST", bodyOf(d));
      push(editing ? p.saved : p.added);
      onSaved();
    } catch (error) {
      setFailure(sayError(error, lang, t));
      setBusy(false);
    }
  }

  const title = editing ? p.editTitle : copy ? p.copyTitle : p.newTitle;
  const radio = (name: string, value: string, current: string, on: () => void, words: string[] | readonly string[]) => (
    <label key={value} className={`ct-choice ${current === value ? "on" : ""}`}>
      <input type="radio" name={name} checked={current === value} onChange={on} />
      <span className="ct-choice-mark" aria-hidden="true" />
      <span className="ct-choice-text"><b>{words[0]}</b>{words[1] && <small>{words[1]}</small>}</span>
    </label>
  );

  return (
    <Sheet title={title} onClose={onCancel} closeLabel={p.close} wide
      footer={(
        <div className="pr-foot">
          {failure && <p className="ct-alert pr-foot-alert" role="alert"><Icon name="warn" />{failure}</p>}
          <div className="pr-foot-btns">
            <button type="button" className="btn ct-btn" onClick={onCancel}>{p.cancel}</button>
            <button type="submit" form="pr-form" className="btn primary ct-btn ct-grow" disabled={busy}>{busy ? p.saving : p.save}</button>
          </div>
        </div>
      )}>
      <form id="pr-form" ref={form} className="ct-form" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        {copy && (
          <p className="ct-hint" role="status">
            {p.copyHint}{rule && rule.state === "ended" ? ` ${p.copyDatesCleared}` : ""}
          </p>
        )}

        <fieldset className="ct-choices small">
          <legend>{p.kindLegend}</legend>
          {radio("pr-kind", "coupon", d.kind, () => set({ kind: "coupon" }), p.kindCoupon)}
          {radio("pr-kind", "auto", d.kind, () => set({ kind: "auto" }), p.kindAuto)}
        </fieldset>

        {d.kind === "coupon" && (
          <Field label={p.code} hint={lockedCode ? p.codeLocked : p.codeHint} error={errors.code}>
            <input value={d.code} dir="ltr" lang="en" maxLength={24} autoComplete="off" autoCapitalize="characters" spellCheck={false}
              autoFocus={!editing} disabled={lockedCode} className="pr-codefield"
              onChange={(e) => set({ code: shownCode(e.target.value) })} />
          </Field>
        )}

        <div className="ct-grid2 names">
          <Field label={p.name}><input value={d.name} dir="auto" maxLength={60} autoComplete="off" onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label={p.nameAr}><input value={d.nameAr} dir="rtl" lang="ar" maxLength={60} autoComplete="off" onChange={(e) => set({ nameAr: e.target.value })} /></Field>
        </div>
        <p className="ct-hint pr-tight">{p.nameHint}</p>

        <fieldset className="ct-choices small">
          <legend>{p.givesLegend}</legend>
          {(["percent", "amount", "free_units"] as const).map((v) => radio("pr-value", v, d.value, () => set({ value: v }), p.gives[v]))}
        </fieldset>
        {d.value === "percent" && (
          <Field label={p.percent} hint={p.percentHint} error={errors.percent}>
            <input value={d.percent} inputMode="decimal" dir="ltr" autoComplete="off" onChange={(e) => set({ percent: e.target.value })} />
          </Field>
        )}
        {d.value === "amount" && (
          <Field label={p.amount} hint={p.amountHint} error={errors.amount}>
            <input value={d.amount} inputMode="decimal" dir="ltr" autoComplete="off" onChange={(e) => set({ amount: e.target.value })} />
          </Field>
        )}
        {d.value === "free_units" && (
          <>
            <div className="ct-grid2">
              <Field label={p.buy} error={errors.buy}>
                <input value={d.buy} inputMode="numeric" dir="ltr" autoComplete="off" onChange={(e) => set({ buy: e.target.value })} />
              </Field>
              <Field label={p.get} error={errors.get}>
                <input value={d.get} inputMode="numeric" dir="ltr" autoComplete="off" onChange={(e) => set({ get: e.target.value })} />
              </Field>
            </div>
            <p className="ct-hint pr-tight">{p.freeHint}</p>
          </>
        )}

        <fieldset className="ct-choices small">
          <legend>{p.scopeLegend}</legend>
          {radio("pr-scope", "order", d.scope, () => set({ scope: "order" }), p.scopeOrder)}
          {radio("pr-scope", "selected", d.scope, () => set({ scope: "selected" }), p.scopeSelected)}
        </fieldset>
        {d.scope === "selected" && (
          <div className={`pr-pick ${errors.scope ? "bad" : ""}`}>
            {categoryNames.length > 0 && (
              <fieldset className="pr-picklist">
                <legend>{p.categoriesTitle}</legend>
                <div className="pr-cats">
                  {categoryNames.map((c) => {
                    const on = d.cats.some((x) => x.toLowerCase() === c.value.toLowerCase());
                    return (
                      <label key={c.value} className="pr-cat">
                        <input type="checkbox" checked={on}
                          onChange={(e) => set({ cats: e.target.checked ? [...d.cats, c.value] : d.cats.filter((x) => x.toLowerCase() !== c.value.toLowerCase()) })} />
                        <span dir="auto">{c.label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}
            <fieldset className="pr-picklist">
              <legend>{p.itemsTitle} <span className="pr-count">{d.itemIds.length > 0 ? p.chosen(d.itemIds.length) : ""}</span></legend>
              {items === null && !itemsFailed && <p className="ct-hint" role="status">{p.itemsLoading}</p>}
              {itemsFailed && <p className="ct-error" role="alert">{t.failed}</p>}
              {items !== null && (
                <>
                  <input type="search" className="pr-itemsearch" value={query} dir="auto" autoComplete="off" aria-label={p.itemsSearch} placeholder={p.itemsSearch}
                    onChange={(e) => setQuery(e.target.value)} />
                  <ul className="pr-items">
                    {shownItems.map((i) => (
                      <li key={i.id}>
                        <label className="ct-check">
                          <input type="checkbox" checked={d.itemIds.includes(i.id)}
                            onChange={(e) => set({ itemIds: toggle(d.itemIds, i.id, e.target.checked) })} />
                          <span dir="auto">{nameOf(i, lang) || t.untitled}</span>
                        </label>
                      </li>
                    ))}
                    {shownItems.length === 0 && <li className="ct-hint">{p.itemsNone}</li>}
                  </ul>
                </>
              )}
              {/* items chosen earlier that the list does not show (archived, or not loaded) stay visible and removable */}
              {d.itemIds.filter((id) => !(items ?? []).some((i) => i.id === id)).map((id) => (
                <label key={id} className="ct-check">
                  <input type="checkbox" checked onChange={() => set({ itemIds: d.itemIds.filter((x) => x !== id) })} />
                  <span dir="auto">{known.get(id) ? nameOf(known.get(id) as { name: string; name_ar: string }, lang) : id}</span>
                </label>
              ))}
            </fieldset>
            {errors.scope && <p className="ct-error" role="alert" data-invalid="true" tabIndex={-1}>{errors.scope}</p>}
          </div>
        )}

        <Field label={p.minOrder} hint={p.minOrderHint} error={errors.minOrder}>
          <input value={d.minOrder} inputMode="decimal" dir="ltr" autoComplete="off" onChange={(e) => set({ minOrder: e.target.value })} />
        </Field>
        <div className="ct-grid2">
          <Field label={p.usageLimit} hint={p.usageLimitHint} error={errors.usage}>
            <input value={d.usage} inputMode="numeric" dir="ltr" autoComplete="off" onChange={(e) => set({ usage: e.target.value })} />
          </Field>
          <Field label={p.perCustomer} hint={p.perCustomerHint} error={errors.each}>
            <input value={d.each} inputMode="numeric" dir="ltr" autoComplete="off" onChange={(e) => set({ each: e.target.value })} />
          </Field>
        </div>
        <div className="pr-dates">
          <Field label={p.starts} error={errors.dates}>
            <input type="datetime-local" value={d.starts} dir="ltr" onChange={(e) => set({ starts: e.target.value })} />
          </Field>
          <Field label={p.ends}>
            <input type="datetime-local" value={d.ends} dir="ltr" onChange={(e) => set({ ends: e.target.value })} />
          </Field>
        </div>
        <p className="ct-hint pr-tight">{p.datesHint}</p>

        {(groupChoices.length > 0 || d.group) && (
          <Field label={p.group} hint={p.groupHint}>
            <select value={d.group} onChange={(e) => set({ group: e.target.value })}>
              <option value="">{p.groupEveryone}</option>
              {groupChoices.map((g) => <option key={g.id} value={g.id}>{nameOf(g, lang)}</option>)}
              {d.group && !groupChoices.some((g) => g.id === d.group) && <option value={d.group}>{rule?.group ? (lang === "ar" ? rule.group.name_ar || rule.group.name : rule.group.name) : d.group}</option>}
            </select>
          </Field>
        )}

        <div className="ct-toggle">
          <span className="ct-toggle-text"><b>{p.stackable}</b><small>{p.stackableHint}</small></span>
          <Switch on={d.stackable} label={p.stackable} onChange={(v) => set({ stackable: v })} />
        </div>
      </form>
    </Sheet>
  );
}
