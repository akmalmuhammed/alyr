"use client";

// Bulk actions (ALY-104): mark sold out or available, change prices by a percentage, move to
// a category, archive. The owner chooses, then sees exactly what would change and which items
// cannot take it, and only then applies; the apply carries the preview's hash, so nothing but
// what was seen is applied. The newest change can be undone once, from a toast and from the
// screen.

import { useState } from "react";
import { ApiError, api, nameOf, sayError, toInt, type BulkPlan, type Category, type Change } from "./catalogApi";
import { COPY, type Copy, type Lang } from "./catalogCopy";
import { Field, Fold, Icon, Sheet, type Toast } from "./CatalogUi";

type Push = (text: string, options?: { tone?: Toast["tone"]; undo?: () => void }) => number;
const ALL = ["sold_out", "back", "price_percent", "move_category", "archive"] as const;
const AVAILABILITY = ["sold_out", "back"];

function describe(change: Change, action: string, t: Copy) {
  if (action === "price_percent") return [change.before_text ?? "", change.after_text ?? ""];
  if (action === "sold_out" || action === "back") {
    const on = t.available;
    return action === "sold_out" ? [on, t.soldOut] : [t.soldOut, on];
  }
  if (action === "archive") return [t.status[String(change.before.status)] ?? "", t.status.archived];
  const was = String(change.before.category ?? "");
  const now = String(change.after.category ?? "");
  return [was || t.noCategory, now || t.noCategory];
}

export function CatalogBulk({ lang, ids, canEdit, categories, push, onClose, onDone }: {
  lang: Lang; ids: string[]; canEdit: boolean; categories: Category[]; push: Push;
  onClose: () => void; onDone: () => void;
}) {
  const t = COPY[lang];
  const actions = ALL.filter((a) => canEdit || AVAILABILITY.includes(a));
  const [action, setAction] = useState<(typeof ALL)[number]>(actions[0]);
  const [percent, setPercent] = useState("");
  const [category, setCategory] = useState("");
  const [plan, setPlan] = useState<BulkPlan | null>(null);
  const [step, setStep] = useState<"choose" | "preview">("choose");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  const pct = toInt(percent);
  const ready = action === "price_percent" ? pct !== null && pct !== 0 && pct >= -90 && pct <= 300 : true;

  function params() {
    return action === "price_percent" ? { percent: pct } : action === "move_category" ? { category: category.trim() } : {};
  }

  async function look() {
    setBusy(true);
    setFailure("");
    try {
      const shown = await api<BulkPlan>("/api/items/bulk/preview", "POST", { action, item_ids: ids, ...params() });
      setPlan(shown);
      setStep("preview");
    } catch (error) {
      setFailure(sayError(error, lang, t));
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    try {
      const done = await api<{ restored: number; left: unknown[] }>("/api/items/bulk/undo", "POST");
      push(done.left.length ? `${t.undone(done.restored)}. ${t.undoLeft(done.left.length)}` : t.undone(done.restored));
    } catch (error) {
      push(sayError(error, lang, t), { tone: "bad" });
    }
    onDone();
  }

  async function apply() {
    if (!plan) return;
    setBusy(true);
    setFailure("");
    try {
      const done = await api<{ changed: number }>("/api/items/bulk/apply", "POST", { action, item_ids: ids, ...params(), preview: plan.hash });
      push(t.bulkDone(action, done.changed), { undo: () => void undo() });
      onDone();
    } catch (error) {
      const stale = error instanceof ApiError && error.code === "changed_since_preview";
      setFailure(sayError(error, lang, t));
      if (stale) await look(); // show what it is now, and let them decide again
    } finally {
      setBusy(false);
    }
  }

  const footer = step === "choose" ? (
    <>
      <button type="button" className="btn ct-btn" onClick={onClose}>{t.cancel}</button>
      <button type="button" className="btn primary ct-btn ct-grow" disabled={!ready || busy} onClick={() => void look()}>{busy ? t.applying : t.preview}</button>
    </>
  ) : (
    <>
      <button type="button" className="btn ct-btn" disabled={busy} onClick={() => { setStep("choose"); setFailure(""); }}>{t.back}</button>
      <button type="button" className="btn volt ct-btn ct-grow" disabled={busy || !plan || plan.changes.length === 0} onClick={() => void apply()}>
        {busy ? t.applying : t.apply(plan?.changes.length ?? 0)}
      </button>
    </>
  );

  return (
    <Sheet title={step === "choose" ? t.bulkTitle : t.previewTitle} subtitle={t.bulkFor(ids.length)} onClose={onClose} closeLabel={t.close} footer={footer}>
      {failure && <p className="ct-alert" role="alert"><Icon name="warn" />{failure}</p>}

      {step === "choose" && (
        <div className="ct-form">
          <fieldset className="ct-choices">
            <legend className="ct-sr">{t.chooseAction}</legend>
            {actions.map((a) => (
              <label key={a} className={`ct-choice ${action === a ? "on" : ""}`}>
                <input type="radio" name="action" checked={action === a} onChange={() => setAction(a)} />
                <span className="ct-choice-mark" aria-hidden="true" />
                <span className="ct-choice-text"><b>{t.actions[a][0]}</b><small>{t.actions[a][1]}</small></span>
              </label>
            ))}
          </fieldset>

          {action === "price_percent" && (
            <>
              <Field label={t.percent} hint={t.percentHint}>
                <input value={percent} inputMode="numeric" dir="ltr" autoComplete="off" placeholder="10" onChange={(e) => setPercent(e.target.value)} />
              </Field>
              <div className="ct-chips wrap" role="group" aria-label={t.percent}>
                {t.percentPresets.map((p) => (
                  <button key={p} type="button" className="ct-chip" aria-pressed={pct === p} onClick={() => setPercent(String(p))}>
                    <Icon name={p > 0 ? "up" : "low"} className="sh-ico ct-chip-tick" /><bdi dir="ltr">{p > 0 ? `+${p}` : `−${Math.abs(p)}`}%</bdi>
                  </button>
                ))}
              </div>
            </>
          )}

          {action === "move_category" && (
            <>
              <Field label={t.categoryTo}>
                <input value={category} dir="auto" maxLength={60} list="ct-bulk-categories" autoComplete="off" onChange={(e) => setCategory(e.target.value)} />
              </Field>
              <datalist id="ct-bulk-categories">{categories.map((c) => <option key={c.name} value={c.name} />)}</datalist>
              <div className="ct-chips wrap" role="group" aria-label={t.categoryTo}>
                {categories.map((c) => (
                  <button key={c.name} type="button" className="ct-chip" aria-pressed={category === c.name} onClick={() => setCategory(c.name)}>
                    {category === c.name && <Icon name="check" className="sh-ico ct-chip-tick" />}{lang === "ar" && c.name_ar ? c.name_ar : c.name}
                  </button>
                ))}
                <button type="button" className="ct-chip" aria-pressed={category === ""} onClick={() => setCategory("")}>
                  {category === "" && <Icon name="check" className="sh-ico ct-chip-tick" />}{t.noCategory}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {step === "preview" && plan && (
        <div className="ct-form">
          <p className="ct-progress" role="status">
            <b>{t.willChange(plan.changes.length)}</b>
            {plan.skipped.length > 0 && <span> · {t.leftOut(plan.skipped.length)}</span>}
          </p>
          {plan.changes.length === 0 && <p className="ct-quiet">{t.nothingToDo}</p>}
          {plan.changes.length > 0 && (
            <ul className="ct-preview">
              {plan.changes.map((c) => {
                const [from, to] = describe(c, plan.action, t);
                return (
                  <li key={c.id}>
                    <span className="ct-pv-name" dir="auto">{nameOf(c, lang) || t.untitled}</span>
                    <span className="ct-pv-change">
                      <span className="ct-pv-from num" dir="auto">{from}</span>
                      <Icon name="arrow" className="sh-ico ct-flip ct-pv-arrow" />
                      <b className="ct-pv-to num" dir="auto">{to}</b>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {plan.skipped.length > 0 && (
            <Fold title={t.leftOut(plan.skipped.length)} open={plan.changes.length === 0 ? true : undefined}>
              <ul className="ct-preview quiet">
                {plan.skipped.map((s) => (
                  <li key={s.id}>
                    <span className="ct-pv-name" dir="auto">{nameOf(s, lang) || t.untitled}</span>
                    <span className="ct-pv-why">{t.skipReasons[s.code] ?? (lang === "ar" ? s.message_ar : s.message)}</span>
                  </li>
                ))}
              </ul>
            </Fold>
          )}
        </div>
      )}
    </Sheet>
  );
}
