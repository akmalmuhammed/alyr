"use client";

// Photo-first adding (ALY-104): take or choose several photos, each is shrunk here and sent
// with its own progress and retry, ALYR makes a draft item for each stored photo, and then
// the owner is walked through the drafts one by one, filling in a name, a price and a
// category. Nothing is half-saved: a photo is a draft or it is a failed tile to try again.

import { useEffect, useRef, useState } from "react";
import { ApiError, api, sayError, toDirhams, toInt, fromDirhams, type Category, type Item } from "./catalogApi";
import { COPY, type Lang } from "./catalogCopy";
import { Field, Icon, Sheet, Tile } from "./CatalogUi";
import { usePhotoQueue } from "./usePhotoQueue";

type Made = {
  created: Item[]; skipped: { photo_id: string; reason: string }[];
  stopped: { code: string; detail: string; message_ar: string } | null;
};

export function AddSheet({ lang, onClose, onTyped, onFill }: {
  lang: Lang; onClose: () => void; onTyped: () => void; onFill: (ids: string[]) => void;
}) {
  const t = COPY[lang];
  const [made, setMade] = useState<string[]>([]);
  const [leaving, setLeaving] = useState(false);
  const choose = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  const queue = usePhotoQueue({
    lang, t,
    after: async (photo) => {
      if (!photo.id) return;
      const answer = await api<Made>("/api/items/drafts", "POST", { photo_ids: [photo.id] });
      if (answer.stopped) {
        const error = new ApiError(409, answer.stopped.code, answer.stopped.detail, answer);
        (error as ApiError & { ar?: string }).ar = answer.stopped.message_ar;
        throw error;
      }
      if (answer.created.length === 0) return t.alreadyUsed;
      setMade((ids) => [...ids, answer.created[0].id]);
      return t.draftMade;
    },
  });

  const { uploads } = queue;
  const done = uploads.filter((u) => u.status === "done").length;
  const settled = uploads.length > 0 && !queue.busy;

  function pick(files: FileList | null) {
    if (files && files.length) queue.add(files);
  }

  function close() {
    if (queue.busy) setLeaving(true);
    else onClose();
  }

  const footer = leaving ? (
    <div className="ct-confirm" role="alertdialog" aria-label={t.leaveTitle}>
      <span>{t.uploadsRunning}</span>
      <span className="ct-confirm-btns">
        <button type="button" className="btn ct-btn" data-autofocus onClick={() => setLeaving(false)}>{t.leaveKeep}</button>
        <button type="button" className="btn ct-btn danger" onClick={onClose}>{t.leaveGo}</button>
      </span>
    </div>
  ) : (
    <>
      <button type="button" className="btn ct-btn" onClick={close}>{made.length ? t.later_ : t.close}</button>
      {settled && made.length > 0 && (
        <button type="button" className="btn primary ct-btn ct-grow" onClick={() => onFill(made)}>
          {t.fillInNow(made.length)}<Icon name="arrow" className="sh-ico arrow" />
        </button>
      )}
    </>
  );

  return (
    <Sheet title={t.addTitle} onClose={close} closeLabel={t.close} footer={footer} wide>
      <p className="ct-intro">{t.addIntro}</p>
      <div className="ct-addbtns">
        <button type="button" className="btn volt ct-big" onClick={() => camera.current?.click()}><Icon name="camera" />{t.takePhoto}</button>
        <button type="button" className="btn ct-big" onClick={() => choose.current?.click()}><Icon name="image" />{t.choosePhotos}</button>
      </div>
      <input ref={choose} className="ct-file" type="file" accept="image/*" multiple tabIndex={-1} aria-hidden="true"
        onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <input ref={camera} className="ct-file" type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />

      {uploads.length > 0 && (
        <>
          <p className="ct-progress" role="status">
            <b className="num">{t.progress(done, uploads.length)}</b>
            {made.length > 0 && <span> · {t.draftsMade(made.length)}</span>}
          </p>
          <ul className="ct-uploads">
            {uploads.map((u) => (
              <li key={u.key} className={`ct-up ${u.status}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a preview of the file just chosen */}
                <img src={u.preview} alt="" />
                <span className="ct-up-over">
                  {(u.status === "queued" || u.status === "shrinking") && <span className="ct-up-line" role="status">{t.getting}</span>}
                  {u.status === "uploading" && (
                    <span className="ct-up-line" role="status">
                      <span className="ct-bar-track"><span style={{ width: `${u.progress}%` }} /></span>
                      {t.uploading(u.progress)}
                    </span>
                  )}
                  {u.status === "saving" && <span className="ct-up-line" role="status">{t.photoSaving}</span>}
                  {u.status === "done" && <span className="ct-up-line ok" role="status"><Icon name="check" />{u.note}</span>}
                  {u.status === "failed" && (
                    <span className="ct-up-fail" role="alert">
                      <span>{u.error}</span>
                      <span className="ct-up-btns">
                        <button type="button" className="btn small" onClick={() => queue.retry(u.key)}><Icon name="retry" />{t.retryPhoto}</button>
                        <button type="button" className="btn small ghost" onClick={() => queue.drop(u.key)}>{t.skipPhoto}</button>
                      </span>
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="ct-or">
        <span>{t.orType}</span>
        <button type="button" className="btn ct-btn" onClick={onTyped}><Icon name="plus" />{t.typeOne}</button>
      </div>
    </Sheet>
  );
}

type Walk = {
  name: string; name_ar: string; price: string; category: string; live: boolean; opening: string;
};
type Problems = Partial<Record<"name" | "name_ar" | "price" | "opening", string>>;

function walkForm(item: Item): Walk {
  return {
    name: item.name, name_ar: item.name_ar, price: fromDirhams(item.price || null), category: item.category,
    live: true, opening: "",
  };
}

/** The owner's tour of the drafts, one at a time: a name, a price, a category, and whether it goes on sale. */
export function WalkThrough({ lang, ids, categories, onClose }: {
  lang: Lang; ids: string[]; categories: Category[]; onClose: () => void;
}) {
  const t = COPY[lang];
  const [index, setIndex] = useState(0);
  const [item, setItem] = useState<Item | null>(null);
  const [form, setForm] = useState<Walk | null>(null);
  const [problems, setProblems] = useState<Problems>({});
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);
  const [tally, setTally] = useState({ live: 0, drafts: 0 });
  const [finished, setFinished] = useState(false);
  const total = ids.length;
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (finished || index >= total) return;
    let live = true;
    api<Item>(`/api/items/${ids[index]}`).then((fresh) => {
      if (!live) return;
      setItem(fresh);
      setForm(walkForm(fresh));
      setProblems({});
      setFailure("");
    }).catch((error) => { if (live) setFailure(sayError(error, lang, t)); });
    return () => { live = false; };
  }, [index, ids, total, finished, lang, t]);

  function next(counted: "live" | "drafts" | null) {
    if (counted) setTally((x) => ({ ...x, [counted]: x[counted] + 1 }));
    setItem(null);
    setForm(null);
    if (index + 1 >= total) setFinished(true);
    else setIndex(index + 1);
    body.current?.scrollTo?.({ top: 0 });
  }

  async function save() {
    if (!form || !item) return;
    const price = toDirhams(form.price);
    const found: Problems = {};
    const name = form.name.trim() || form.name_ar.trim();
    if (form.live) {
      if (!name) found.name = t.errors.name_needed;
      if (!form.name_ar.trim()) found.name_ar = t.errors.arabic_needed;
      if (price === null || price <= 0) found.price = t.errors.bad_price;
    }
    if (form.price.trim() && price === null) found.price = t.errors.bad_price;
    // A shop whose items are counted (a grocery, a fashion seller) says how many it has.
    const counted = item.stock_rule === "count" && item.variants.length === 1;
    const opening = toInt(form.opening);
    if (counted && form.opening.trim() && (opening === null || opening < 0)) found.opening = t.errors.bad_quantity;
    setProblems(found);
    if (Object.keys(found).length) return;
    const empty = !name && !form.name_ar.trim() && !form.price.trim() && !form.category.trim();
    if (empty) { next(null); return; }
    setSaving(true);
    setFailure("");
    try {
      await api(`/api/items/${item.id}`, "PUT", {
        ...(name ? { name } : {}), name_ar: form.name_ar.trim(), price: price ?? 0, category: form.category.trim(),
        status: form.live ? "live" : "draft",
      });
      if (counted && opening) {
        await api(`/api/items/${item.id}/stock`, "POST", { kind: "opening", quantity: opening, reason: "Opening count" });
      }
      next(form.live ? "live" : "drafts");
    } catch (error) {
      setFailure(sayError(error, lang, t));
    } finally {
      setSaving(false);
    }
  }

  const last = index + 1 >= total;
  const footer = finished ? (
    <button type="button" className="btn primary ct-btn ct-grow" onClick={onClose}>{t.walkClose}</button>
  ) : (
    <>
      <button type="button" className="btn ct-btn" onClick={() => next("drafts")} disabled={saving || (!form && !failure)}>{t.walkSkip}</button>
      <button type="submit" form="ct-walk-form" className="btn primary ct-btn ct-grow" disabled={saving || !form}>
        {saving ? t.saving : last ? t.walkLast : t.walkSave}
      </button>
    </>
  );

  return (
    <Sheet title={finished ? t.walkDone : t.walkTitle(index + 1, total)} onClose={onClose} closeLabel={t.close} footer={footer} wide>
      <div ref={body} />
      {!finished && (
        <div className="ct-steps" role="img" aria-label={t.walkTitle(index + 1, total)}>
          {ids.map((id, i) => <span key={id} className={i < index ? "done" : i === index ? "now" : ""} />)}
        </div>
      )}
      {failure && <p className="ct-alert" role="alert"><Icon name="warn" />{failure}</p>}
      {finished && (
        <div className="ct-finish" role="status">
          <span className="sh-check"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.5 5 9l4.5-6" /></svg></span>
          <p>{t.walkDoneText(tally.live, tally.drafts)}</p>
        </div>
      )}
      {!finished && !form && !failure && <p className="ct-quiet" role="status">{t.loading}</p>}
      {!finished && form && item && (
        <form id="ct-walk-form" className="ct-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
          <div className="ct-walk-photo"><Tile photo={item.cover} sizes="(max-width: 56rem) 90vw, 480px" labels={{ pending: t.photoSaving, failed: t.photoFailed, missing: t.addPhoto }} /></div>
          <Field label={t.nameEn} hint={t.nameEnHint} error={problems.name}>
            <input value={form.name} dir="auto" maxLength={120} autoComplete="off" data-autofocus onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label={t.nameAr} error={problems.name_ar}>
            <input value={form.name_ar} dir="rtl" lang="ar" maxLength={120} autoComplete="off" onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
          </Field>
          <Field label={t.walkPrice} error={problems.price}>
            <input value={form.price} inputMode="decimal" dir="ltr" autoComplete="off" onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </Field>
          <Field label={t.category}>
            <input value={form.category} dir="auto" maxLength={60} list="ct-walk-categories" autoComplete="off" onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </Field>
          <datalist id="ct-walk-categories">{categories.map((c) => <option key={c.name} value={c.name} />)}</datalist>
          {categories.length > 0 && (
            <div className="ct-chips wrap" role="group" aria-label={t.category}>
              {categories.slice(0, 8).map((c) => (
                <button key={c.name} type="button" className="ct-chip" aria-pressed={form.category === c.name}
                  onClick={() => setForm({ ...form, category: form.category === c.name ? "" : c.name })}>
                  {form.category === c.name && <Icon name="check" className="sh-ico ct-chip-tick" />}{lang === "ar" && c.name_ar ? c.name_ar : c.name}
                </button>
              ))}
            </div>
          )}
          {item.stock_rule === "count" && item.variants.length === 1 && (
            <Field label={t.openingStock} error={problems.opening}>
              <input value={form.opening} inputMode="numeric" dir="ltr" autoComplete="off" onChange={(e) => setForm({ ...form, opening: e.target.value })} />
            </Field>
          )}
          <label className="ct-toggle">
            <span className="ct-toggle-text"><b>{t.walkOnSale}</b><small>{t.walkOnSaleHint}</small></span>
            <button type="button" role="switch" aria-checked={form.live} aria-label={t.walkOnSale} className="sh-switch ct-hit"
              onClick={() => setForm({ ...form, live: !form.live })} />
          </label>
        </form>
      )}
    </Sheet>
  );
}
