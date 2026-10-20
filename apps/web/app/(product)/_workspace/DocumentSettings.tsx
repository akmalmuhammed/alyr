"use client";

// The shop's document settings (owners and admins; ALY-146, spec 014): who is selling, how the
// paper looks, the language, the notes and terms of each kind, the numbering, the money and what
// happens by itself. Beside the form, a preview drawn by the engine itself from the settings as
// they are typed, before they are saved, taking no number. Phone-first: the preview is a small
// live picture at the corner that opens to full size.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api, refusalOf, sayRefusal, type Branch, type Meta, type Series, type Settings, type SettingsChange,
} from "./documentsApi";
import { COPY, kindLabel, type Lang } from "./documentsCopy";
import { cleanColour, plain, settingsDiff, whenText } from "./documentsLogic";
import { Field, Fold, Icon, Layer, Sheet, Switch } from "./CatalogUi";
import { color } from "../../_tokens/tokens";
import type { Push } from "./DocumentSheets";

// What a person can change here: the fields the API takes (`SettingsIn`).
const EDITABLE = [
  "business_name", "business_name_ar", "commercial_registration", "tax_id", "licence_number", "address",
  "address_ar", "phone", "email", "currency", "cash_rounding_minor", "languages", "default_audience",
  "layout", "brand_color", "show_sku", "show_discounts", "show_customer_tax_id", "show_bank",
  "show_signature", "show_alyr_mark", "bank_details", "header_en", "header_ar", "footer_en", "footer_ar",
  "terms", "notes", "agents_may_issue", "auto_receipt_on_payment", "auto_invoice_credit_sales",
  "auto_deposit_receipt", "auto_send_whatsapp", "auto_send_email", "send_mode", "agents_may_record_payments",
] as const;
type Editable = (typeof EDITABLE)[number];
type Form = Pick<Settings, Editable>;

const TEXT_KINDS = ["receipt", "invoice", "quote", "delivery_note", "proforma", "deposit_receipt", "statement", "credit_note"] as const;
const PREVIEW_KINDS = ["receipt", "invoice", "quote", "delivery_note", "credit_note", "proforma", "deposit_receipt"] as const;
const LANGUAGES = ["ar_en", "en_ar", "ar", "en"] as const;
const SECTION_OF: Record<string, string> = {
  business_name: "business", business_name_ar: "business", commercial_registration: "business", tax_id: "business",
  licence_number: "business", address: "business", address_ar: "business", phone: "business", email: "business",
  layout: "look", brand_color: "look", bank_details: "look", header_en: "look", footer_en: "look",
  languages: "language", default_audience: "language", currency: "money", cash_rounding_minor: "money",
};

function pick(saved: Settings): Form {
  return Object.fromEntries(EDITABLE.map((k) => [k, saved[k]])) as unknown as Form;
}

export function DocumentSettings({ lang, meta, branches, push, onBack, onBranches, focus }: {
  lang: Lang; meta: Meta; branches: Branch[]; push: Push; onBack: () => void; onBranches: () => void; focus: string;
}) {
  const t = COPY[lang];
  const [saved, setSaved] = useState<Settings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [series, setSeries] = useState<Series[]>([]);
  const [changes, setChanges] = useState<SettingsChange[]>([]);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [leaving, setLeaving] = useState(false);
  const [colourText, setColourText] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({ business: true, look: true });
  const fallback = useMemo(() => ({ failed: t.failed, offline: t.offline, forbidden: t.forbidden, gone: t.gone }), [t]);

  const loadAll = useCallback(async () => {
    try {
      const [s, sr, ch] = await Promise.all([
        api<{ settings: Settings }>("/api/documents/settings"),
        api<{ series: Series[] }>("/api/documents/series"),
        api<{ changes: SettingsChange[] }>("/api/documents/settings/activity"),
      ]);
      setSaved(s.settings);
      setForm((cur) => cur ?? pick(s.settings));
      setSeries(sr.series);
      setChanges(ch.changes);
    } catch (error) {
      setLoadError(sayRefusal(error, lang, fallback));
    }
  }, [lang, fallback]);
  useEffect(() => {
    const first = setTimeout(() => void loadAll(), 0);
    return () => clearTimeout(first);
  }, [loadAll]);

  // Coming here from a refusal ("add your registration number") opens that part and puts the
  // cursor in the field.
  const focused = useRef(false);
  useEffect(() => {
    if (!form || !focus || focused.current) return;
    focused.current = true;
    const section = SECTION_OF[focus];
    setTimeout(() => {
      if (section) setOpen((cur) => ({ ...cur, [section]: true }));
    }, 0);
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-field="${focus}"]`);
      el?.scrollIntoView({ block: "center" });
      el?.focus({ preventScroll: true });
    }, 120);
  }, [form, focus]);

  const diff = useMemo(() => (saved && form ? settingsDiff(pick(saved) as Record<string, unknown>, form as Record<string, unknown>) : {}), [saved, form]);
  const dirty = Object.keys(diff).length > 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function set<K extends Editable>(key: K, value: Form[K]) {
    setForm((cur) => (cur ? { ...cur, [key]: value } : cur));
    setFieldError((cur) => (cur[key] ? { ...cur, [key]: "" } : cur));
  }

  const consumerNoArabic = form !== null && form.default_audience === "consumer" && !form.languages.includes("ar");

  async function save() {
    if (!dirty || consumerNoArabic) return;
    setBusy(true);
    setFailure("");
    setFieldError({});
    try {
      const done = await api<{ settings: Settings }>("/api/documents/settings", "PUT", diff as Record<string, unknown>);
      setSaved(done.settings);
      setForm(pick(done.settings));
      setColourText(null);
      push(t.setSaved);
      void loadAll();
    } catch (error) {
      const r = refusalOf(error);
      const text = sayRefusal(error, lang, fallback);
      if (r?.field) setFieldError({ [r.field]: text });
      setFailure(text);
    } finally {
      setBusy(false);
    }
  }

  // ── the preview ──
  const [previewKind, setPreviewKind] = useState<(typeof PREVIEW_KINDS)[number]>("receipt");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<"idle" | "busy" | "error">("idle");
  const [previewError, setPreviewError] = useState("");
  const [peek, setPeek] = useState(false);
  const diffKey = JSON.stringify(diff);
  const layoutNow = form?.layout ?? "a4";
  useEffect(() => {
    if (!form) return;
    const controller = new AbortController();
    const wait = setTimeout(async () => {
      setPreviewState("busy");
      try {
        const response = await fetch(`/api/documents/preview?format=png&width=${layoutNow === "thermal80" ? 520 : 900}`, {
          method: "POST", cache: "no-store", signal: controller.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: previewKind, ...(dirty ? { settings: diff } : {}) }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const words = lang === "ar" ? data.message_ar : data.detail;
          setPreviewError(typeof words === "string" && words ? words : t.previewFailed);
          if (data.field) setFieldError((cur) => ({ ...cur, [data.field]: typeof words === "string" ? words : "" }));
          setPreviewState("error");
          return;
        }
        const url = URL.createObjectURL(await response.blob());
        setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return url; });
        setPreviewError("");
        setPreviewState("idle");
      } catch (error) {
        if ((error as Error).name !== "AbortError") { setPreviewError(t.previewFailed); setPreviewState("error"); }
      }
    }, 450);
    return () => { clearTimeout(wait); controller.abort(); };
    // `diff` is represented by `diffKey`; `form` only matters once it has loaded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diffKey, previewKind, layoutNow, form === null, lang, saved?.logo_sha256, saved?.stamp_sha256]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  // ── the pictures (saved as soon as they are chosen) ──
  const [pictureBusy, setPictureBusy] = useState("");
  async function upload(which: "logo" | "stamp", file: File | undefined) {
    if (!file) return;
    setPictureBusy(which);
    setFailure("");
    try {
      const response = await fetch(`/api/documents/settings/${which}`, {
        method: "PUT", cache: "no-store", headers: { "content-type": file.type || "application/octet-stream" }, body: file,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw Object.assign(new Error(String(data.detail ?? "")), { ar: data.message_ar });
      }
      push(which === "logo" ? t.logoSaved : t.stampSaved);
      await loadAll();
    } catch (error) {
      const words = lang === "ar" ? (error as { ar?: string }).ar : (error as Error).message;
      setFailure(words || t.failed);
    } finally {
      setPictureBusy("");
    }
  }
  async function removePicture(which: "logo" | "stamp") {
    setPictureBusy(which);
    try {
      await api(`/api/documents/settings/${which}`, "DELETE");
      push(which === "logo" ? t.logoRemoved : t.stampRemoved);
      await loadAll();
    } catch (error) {
      setFailure(sayRefusal(error, lang, fallback));
    } finally {
      setPictureBusy("");
    }
  }

  if (loadError) {
    return (
      <div className="ct dc" lang={lang}>
        <button type="button" className="btn ghost ct-btn dc-back" onClick={onBack}><Icon name="start" className="sh-ico ct-flip" />{t.back}</button>
        <p className="ct-alert" role="alert"><Icon name="warn" />{loadError}</p>
      </div>
    );
  }
  if (!saved || !form) {
    return <div className="ct dc" lang={lang}><p className="ct-quiet ct-pad" role="status">{t.loading}</p></div>;
  }

  const section = (key: string, title: string, hint: string | undefined, children: React.ReactNode, summary?: string) => (
    <Fold title={title} summary={summary} open={open[key] ?? false} onToggle={(o) => setOpen((cur) => ({ ...cur, [key]: o }))}>
      {hint && <p className="ct-hint">{hint}</p>}
      {children}
    </Fold>
  );
  const text = (key: Editable, label: string, options: { dir?: "ltr" | "rtl" | "auto"; hint?: string; max?: number; type?: string } = {}) => (
    <Field label={label} hint={options.hint} error={fieldError[key] || undefined}>
      <input data-field={key} type={options.type ?? "text"} value={String(form[key] ?? "")} dir={options.dir ?? "auto"} maxLength={options.max}
        autoComplete="off" onChange={(e) => set(key, e.target.value as never)} />
    </Field>
  );
  const toggle = (key: Editable, label: string, hint?: string) => (
    <div className="ct-toggle">
      <span className="ct-toggle-text"><b>{label}</b>{hint && <small>{hint}</small>}</span>
      <Switch on={Boolean(form[key])} label={label} onChange={(next) => set(key, next as never)} />
    </div>
  );
  const colour = colourText ?? (form.brand_color ?? "");
  const colourBad = colour.trim() !== "" && cleanColour(colour) === "";
  // What is typed may be half a colour: the form takes it only when it is a whole one.
  const typeColour = (value: string) => {
    setColourText(value);
    const clean = cleanColour(value);
    if (value.trim() === "") set("brand_color", null as never);
    else if (clean) set("brand_color", clean as never);
  };

  const preview = (
    <div className="dc-preview" aria-live="polite">
      <div className="dc-preview-head">
        <h2>{t.preview}</h2>
        <select className="ct-select" aria-label={t.previewOf} value={previewKind} onChange={(e) => setPreviewKind(e.target.value as (typeof PREVIEW_KINDS)[number])}>
          {PREVIEW_KINDS.map((k) => <option key={k} value={k}>{kindLabel(lang, k)}</option>)}
        </select>
      </div>
      <p className="ct-hint">{t.previewSample}{dirty ? ` ${t.previewTryingUnsaved}` : ""}</p>
      <div className={`dc-preview-sheet ${layoutNow} ${previewState === "busy" ? "busy" : ""}`}>
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- a picture of this shop's own preview, made for this view
          <img src={previewUrl} alt={`${t.preview}: ${kindLabel(lang, previewKind)}`} />
        )}
        {previewState === "error" && <p className="ct-alert" role="alert"><Icon name="warn" />{previewError || t.previewFailed}</p>}
        {!previewUrl && previewState !== "error" && <span className="ct-sr" role="status">{t.previewUpdating}</span>}
      </div>
      <p className="ct-hint">{t.previewLogoNote}</p>
    </div>
  );

  return (
    <div className="ct dc dc-settings" lang={lang}>
      <button type="button" className="btn ghost ct-btn dc-back" onClick={() => (dirty ? setLeaving(true) : onBack())}>
        <Icon name="start" className="sh-ico ct-flip" />{t.back}
      </button>
      <header className="sh-head">
        <span className="sh-eyebrow">{t.title}</span>
        <h1>{t.setTitle}</h1>
        <p>{t.setSub}</p>
      </header>
      {leaving && (
        <div className="ct-banner" role="alertdialog" aria-label={t.leaveAsk}>
          <span>{t.unsaved} {t.leaveAsk}</span>
          <span className="dc-ask">
            <button type="button" className="btn small" onClick={() => setLeaving(false)}>{t.leaveStay}</button>
            <button type="button" className="btn small danger" onClick={onBack}>{t.leaveGo}</button>
          </span>
        </div>
      )}
      {failure && <p className="ct-alert" role="alert"><Icon name="warn" />{failure}</p>}

      <div className="dc-set">
        <form className="dc-set-form ct-form" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
          {section("business", t.secBusiness, t.secBusinessHint, (
            <>
              <div className="ct-grid2 names">
                {text("business_name", t.businessName, { max: 120 })}
                {text("business_name_ar", t.businessNameAr, { dir: "rtl", max: 120 })}
              </div>
              {text("commercial_registration", t.commercialRegistration, { dir: "ltr", max: 40, hint: t.crHint })}
              {!form.commercial_registration.trim() && <p className="ct-banner" role="note"><span>{t.crMissing}</span></p>}
              <div className="ct-grid2">
                {text("tax_id", t.taxIdField, { dir: "ltr", max: 40 })}
                {text("licence_number", t.licenceNumber, { dir: "ltr", max: 40 })}
              </div>
              {text("address", t.businessAddress, { max: 300 })}
              {text("address_ar", t.businessAddressAr, { dir: "rtl", max: 300 })}
              <div className="ct-grid2">
                {text("phone", t.businessPhone, { dir: "ltr", max: 40, type: "tel" })}
                {text("email", t.businessEmail, { dir: "ltr", max: 120, type: "email" })}
              </div>
            </>
          ), form.business_name || undefined)}

          {section("look", t.secLook, undefined, (
            <>
              <fieldset className="ct-choices small">
                <legend className="ct-label">{t.layout}</legend>
                {(["a4", "a5", "thermal80"] as const).map((value) => (
                  <label key={value} className={`ct-choice ${form.layout === value ? "on" : ""}`}>
                    <input type="radio" name="dc-layout" data-field={value === "a4" ? "layout" : undefined} checked={form.layout === value} onChange={() => set("layout", value)} />
                    <span className="ct-choice-mark" aria-hidden="true" />
                    <span className="ct-choice-text"><b>{t.layouts[value]}</b><small>{t.layoutHints[value]}</small></span>
                  </label>
                ))}
              </fieldset>

              <Field label={t.brandColour} hint={t.brandColourHint} error={fieldError.brand_color || (colourBad ? t.brandColourBad : undefined)}>
                <input data-field="brand_color" dir="ltr" value={colour} placeholder="8a1c2b" autoComplete="off" maxLength={7}
                  onChange={(e) => typeColour(e.target.value)} />
              </Field>
              <div className="dc-colour">
                <label className="dc-swatch-pick">
                  <span className="ct-label">{t.brandColour}</span>
                  <input type="color" value={cleanColour(colour) || color.brand.carbon} onChange={(e) => { setColourText(null); set("brand_color", e.target.value as never); }} aria-label={t.brandColour} />
                </label>
                {colour !== "" && <button type="button" className="btn small ghost" onClick={() => { setColourText(null); set("brand_color", null as never); }}>{t.brandColourNone}</button>}
              </div>

              <Picture which="logo" label={t.logo} hint={t.logoHint} has={saved.has_logo} sha={saved.logo_sha256}
                chooseText={t.logoChoose} changeText={t.logoChange} removeText={t.logoRemove} noneText={t.logoNone}
                busy={pictureBusy === "logo"} onFile={(f) => void upload("logo", f)} onRemove={() => void removePicture("logo")} />
              <Picture which="stamp" label={t.stamp} hint={t.stampHint} has={saved.has_stamp} sha={saved.stamp_sha256}
                chooseText={t.stampChoose} changeText={t.stampChange} removeText={t.stampRemove} noneText={t.logoNone}
                busy={pictureBusy === "stamp"} onFile={(f) => void upload("stamp", f)} onRemove={() => void removePicture("stamp")} />

              <p className="dc-subhead">{t.secShow}</p>
              {toggle("show_sku", t.showSku)}
              {toggle("show_discounts", t.showDiscounts)}
              {toggle("show_customer_tax_id", t.showCustomerTaxId)}
              {toggle("show_signature", t.showSignature)}
              {toggle("show_bank", t.showBank)}
              {form.show_bank && (
                <Field label={t.bankDetails} hint={t.bankDetailsHint} error={fieldError.bank_details || undefined}>
                  <textarea data-field="bank_details" value={form.bank_details} maxLength={400} dir="auto" onChange={(e) => set("bank_details", e.target.value)} />
                </Field>
              )}
              {toggle("show_alyr_mark", t.showAlyrMark, t.showAlyrMarkHint)}
              <div className="ct-grid2">
                {text("header_en", t.headerText, { max: 200 })}
                {text("header_ar", t.headerTextAr, { dir: "rtl", max: 200 })}
              </div>
              <div className="ct-grid2">
                {text("footer_en", t.footerText, { max: 300 })}
                {text("footer_ar", t.footerTextAr, { dir: "rtl", max: 300 })}
              </div>
            </>
          ), t.layouts[form.layout])}

          {section("language", t.secLanguage, t.languageHint, (
            <>
              <fieldset className="ct-choices small">
                <legend className="ct-label">{t.languageOrder}</legend>
                {LANGUAGES.map((value) => (
                  <label key={value} className={`ct-choice ${form.languages === value ? "on" : ""}`}>
                    <input type="radio" name="dc-languages" data-field={value === "ar_en" ? "languages" : undefined} checked={form.languages === value} onChange={() => set("languages", value)} />
                    <span className="ct-choice-mark" aria-hidden="true" />
                    <span className="ct-choice-text"><b>{t.languagesName[value]}</b></span>
                  </label>
                ))}
              </fieldset>
              <fieldset className="ct-choices small">
                <legend className="ct-label">{t.audience}</legend>
                {(["consumer", "business"] as const).map((value) => (
                  <label key={value} className={`ct-choice ${form.default_audience === value ? "on" : ""}`}>
                    <input type="radio" name="dc-audience" checked={form.default_audience === value} onChange={() => set("default_audience", value)} />
                    <span className="ct-choice-mark" aria-hidden="true" />
                    <span className="ct-choice-text"><b>{t.audiences[value]}</b></span>
                  </label>
                ))}
              </fieldset>
              {(consumerNoArabic || fieldError.languages) && <p className="ct-alert" role="alert"><Icon name="warn" />{fieldError.languages || t.consumerRule}</p>}
            </>
          ), t.languagesName[form.languages])}

          {section("texts", t.secTexts, t.textsHint, <KindTexts lang={lang} form={form} set={set} />)}

          {section("numbering", t.secNumbering, t.numberingWarn, (
            <Numbering lang={lang} series={series} branches={branches} push={push} onSaved={() => void loadAll()} onBranches={onBranches} />
          ))}

          {section("money", t.secMoney, undefined, (
            <>
              <Field label={t.currency}>
                <select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                  {Object.keys(meta.currencies).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label={t.rounding_} hint={t.roundingHint}>
                <select value={form.cash_rounding_minor} onChange={(e) => set("cash_rounding_minor", Number(e.target.value) as never)}>
                  {meta.cash_rounding_steps.map((step) => (
                    <option key={step} value={step}>
                      {step === 0 ? t.roundingOff : t.roundingStep(step, plain(step, meta.currencies[form.currency]?.exponent ?? 2))}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ), form.cash_rounding_minor ? undefined : t.roundingOff)}

          {section("auto", t.secAuto, undefined, (
            <>
              <p className="dc-subhead">{t.autoCreate}</p>
              {toggle("auto_receipt_on_payment", t.autoReceipt)}
              {toggle("auto_invoice_credit_sales", t.autoInvoice)}
              {toggle("auto_deposit_receipt", t.autoDeposit)}
              <p className="dc-subhead">{t.autoSend}</p>
              {toggle("auto_send_whatsapp", t.autoWhatsapp)}
              {toggle("auto_send_email", t.autoEmail)}
              <fieldset className="ct-choices small">
                <legend className="ct-label">{t.sendMode}</legend>
                {(["automatic", "manual"] as const).map((value) => (
                  <label key={value} className={`ct-choice ${form.send_mode === value ? "on" : ""}`}>
                    <input type="radio" name="dc-sendmode" checked={form.send_mode === value} onChange={() => set("send_mode", value)} />
                    <span className="ct-choice-mark" aria-hidden="true" />
                    <span className="ct-choice-text"><b>{value === "automatic" ? t.sendAutomatic : t.sendManual}</b></span>
                  </label>
                ))}
              </fieldset>
            </>
          ))}

          {section("team", t.secTeam, undefined, (
            <>
              {toggle("agents_may_issue", t.agentsIssue, t.agentsIssueHint)}
              {toggle("agents_may_record_payments", t.agentsPayments, t.agentsPaymentsHint)}
            </>
          ))}

          {section("changes", t.secChanges, undefined, (
            changes.length === 0 ? <p className="ct-quiet">{t.changesNone}</p> : (
              <ol className="ct-log dc-log">
                {changes.map((c, i) => {
                  const fields = (c.detail.changes ?? []).map((x) => t.fieldNames[x.field] ?? x.field);
                  const kind = String(c.detail.kind ?? "");
                  return (
                    <li key={i}>
                      <span>{t.changeWhat({ action: c.action, fields, kind: kind ? kindLabel(lang, kind) : "" })}</span>
                      <time dateTime={c.at}><bdi>{c.actor}</bdi> · <bdi>{whenText(c.at, lang)}</bdi></time>
                    </li>
                  );
                })}
              </ol>
            )
          ))}
        </form>

        <aside className="dc-set-side" aria-label={t.preview}>{preview}</aside>
      </div>

      <Layer>
        <button type="button" className="dc-peek" onClick={() => setPeek(true)} aria-label={t.previewOpen}>
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- a small copy of the preview
            <img src={previewUrl} alt="" />
          )}
          <span>{t.preview}</span>
        </button>
        <div className="dc-bar" role="region" aria-label={t.setTitle}>
          {dirty ? <span className="dc-dirty" role="status">{t.setUnsaved}</span> : <span className="ct-quiet" role="status">{t.setNothing}</span>}
          <span className="ct-grow" />
          {dirty && <button type="button" className="btn ct-btn" onClick={() => { setForm(pick(saved)); setColourText(null); setFieldError({}); setFailure(""); }}>{t.setDiscard}</button>}
          <button type="button" className="btn volt ct-btn" disabled={!dirty || busy || consumerNoArabic} onClick={() => void save()}>
            {busy ? t.saving : t.setSave}
          </button>
        </div>
      </Layer>
      {peek && (
        <Sheet title={t.preview} onClose={() => setPeek(false)} closeLabel={t.close} wide>
          {preview}
        </Sheet>
      )}
    </div>
  );
}

// ── one picture (the logo, the stamp) ───────────────────

function Picture({ which, label, hint, has, sha, chooseText, changeText, removeText, noneText, busy, onFile, onRemove }: {
  which: "logo" | "stamp"; label: string; hint: string; has: boolean; sha: string | null; chooseText: string; changeText: string;
  removeText: string; noneText: string; busy: boolean; onFile: (file: File | undefined) => void; onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="dc-picture">
      <span className="ct-label">{label}</span>
      <div className="dc-picture-row">
        <span className="dc-picture-box">
          {has
            // eslint-disable-next-line @next/next/no-img-element -- the shop's own saved picture
            ? <img src={`/api/documents/settings/${which}?v=${sha ?? ""}`} alt={label} />
            : <span className="ct-quiet">{noneText}</span>}
        </span>
        <span className="dc-picture-btns">
          <input ref={input} className="ct-file" type="file" accept="image/png,image/jpeg,image/webp" aria-label={has ? changeText : chooseText}
            onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" className="btn ct-btn" disabled={busy} onClick={() => input.current?.click()}>
            <Icon name="upload" />{has ? changeText : chooseText}
          </button>
          {has && <button type="button" className="btn ghost ct-btn" disabled={busy} onClick={onRemove}><Icon name="trash" />{removeText}</button>}
        </span>
      </div>
      <p className="ct-hint">{hint}</p>
    </div>
  );
}

// ── notes and terms of each kind ────────────────────────

function KindTexts({ lang, form, set }: { lang: Lang; form: Form; set: <K extends Editable>(key: K, value: Form[K]) => void }) {
  const t = COPY[lang];
  const [kind, setKind] = useState<(typeof TEXT_KINDS)[number]>("receipt");
  function put(field: "notes" | "terms", language: "en" | "ar", value: string) {
    const all = { ...form[field] };
    const pair = { ...all[kind], [language]: value };
    if (!pair.en && !pair.ar) delete all[kind];
    else all[kind] = pair;
    set(field, all as never);
  }
  return (
    <>
      <Field label={t.textsKind}>
        <select value={kind} onChange={(e) => setKind(e.target.value as (typeof TEXT_KINDS)[number])}>
          {TEXT_KINDS.map((k) => <option key={k} value={k}>{kindLabel(lang, k)}</option>)}
        </select>
      </Field>
      <Field label={t.notesEn}><textarea value={form.notes[kind]?.en ?? ""} maxLength={600} dir="auto" onChange={(e) => put("notes", "en", e.target.value)} /></Field>
      <Field label={t.notesAr}><textarea value={form.notes[kind]?.ar ?? ""} maxLength={600} dir="rtl" onChange={(e) => put("notes", "ar", e.target.value)} /></Field>
      <Field label={t.termsEn}><textarea value={form.terms[kind]?.en ?? ""} maxLength={600} dir="auto" onChange={(e) => put("terms", "en", e.target.value)} /></Field>
      <Field label={t.termsAr}><textarea value={form.terms[kind]?.ar ?? ""} maxLength={600} dir="rtl" onChange={(e) => put("terms", "ar", e.target.value)} /></Field>
    </>
  );
}

// ── numbering and branches ──────────────────────────────

type SeriesEdit = { prefix: string; pad: string; yearly: boolean };

function Numbering({ lang, series, branches, push, onSaved, onBranches }: {
  lang: Lang; series: Series[]; branches: Branch[]; push: Push; onSaved: () => void; onBranches: () => void;
}) {
  const t = COPY[lang];
  const key = (s: Series) => `${s.kind}/${s.series_key}`;
  const [edits, setEdits] = useState<Record<string, SeriesEdit>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const fallback = { failed: t.failed, offline: t.offline, forbidden: t.forbidden, gone: t.gone };
  const branchName = (k: string) => {
    if (k === "main") return t.branchMain;
    const b = branches.find((x) => x.branch_key === k);
    return (lang === "ar" && b?.name_ar ? b.name_ar : b?.name) || k;
  };
  const view = (s: Series): SeriesEdit => edits[key(s)] ?? { prefix: s.prefix, pad: String(s.pad), yearly: s.yearly_reset };
  const changed = series.filter((s) => {
    const v = view(s);
    return v.prefix !== s.prefix || Number(v.pad) !== s.pad || v.yearly !== s.yearly_reset;
  });
  async function saveAll() {
    setBusy(true);
    setFailure("");
    try {
      for (const s of changed) {
        const v = view(s);
        await api(`/api/documents/series/${s.kind}/${s.series_key}`, "PUT", {
          prefix: v.prefix.trim().toUpperCase(), pad: Number(v.pad), yearly_reset: v.yearly,
        });
      }
      setEdits({});
      push(t.seriesSaved);
      onSaved();
    } catch (error) {
      setFailure(sayRefusal(error, lang, fallback));
    } finally {
      setBusy(false);
    }
  }
  const keys = Array.from(new Set(series.map((s) => s.series_key)));
  return (
    <>
      {failure && <p className="ct-alert" role="alert"><Icon name="warn" />{failure}</p>}
      {keys.map((branch) => (
        <section key={branch} className="dc-series" aria-label={branchName(branch)}>
          <p className="dc-subhead">{branchName(branch)}</p>
          <ul className="ct-stack">
            {series.filter((s) => s.series_key === branch).map((s) => {
              const v = view(s);
              const put = (patch: Partial<SeriesEdit>) => setEdits((cur) => ({ ...cur, [key(s)]: { ...v, ...patch } }));
              return (
                <li key={key(s)} className="ct-card-form">
                  <div className="ct-row-between">
                    <b>{t.seriesFor(kindLabel(lang, s.kind), "")}</b>
                    <span className="dc-next num"><span className="ct-quiet">{t.nextNumber} </span><bdi dir="ltr">{s.next_number}</bdi></span>
                  </div>
                  <div className="ct-grid2">
                    <Field label={t.prefix} hint={t.prefixHint}>
                      <input dir="ltr" value={v.prefix} maxLength={8} autoCapitalize="characters" autoComplete="off" onChange={(e) => put({ prefix: e.target.value.toUpperCase() })} />
                    </Field>
                    <Field label={t.padding}>
                      <select value={v.pad} onChange={(e) => put({ pad: e.target.value })}>
                        {[3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div className="ct-toggle">
                    <span className="ct-toggle-text"><b>{t.yearly}</b><small>{t.yearlyHint}</small></span>
                    <Switch on={v.yearly} label={t.yearly} onChange={(next) => put({ yearly: next })} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <button type="button" className="btn ct-btn" disabled={busy || changed.length === 0} onClick={() => void saveAll()}>
        <Icon name="check" />{busy ? t.saving : t.seriesSave}
      </button>
      <BranchList lang={lang} branches={branches} push={push} onChanged={() => { onSaved(); onBranches(); }} />
    </>
  );
}

function BranchList({ lang, branches, push, onChanged }: { lang: Lang; branches: Branch[]; push: Push; onChanged: () => void }) {
  const t = COPY[lang];
  const [adding, setAdding] = useState({ key: "", code: "", name: "", name_ar: "", address: "", address_ar: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const fallback = { failed: t.failed, offline: t.offline, forbidden: t.forbidden, gone: t.gone };

  async function add() {
    setBusy(true);
    setFailure("");
    try {
      const { key, ...rest } = adding;
      await api(`/api/documents/branches/${key.trim().toLowerCase()}`, "PUT", { ...rest, code: rest.code.trim().toUpperCase() });
      push(t.branchSaved);
      setAdding({ key: "", code: "", name: "", name_ar: "", address: "", address_ar: "", phone: "" });
      onChanged();
    } catch (error) {
      setFailure(sayRefusal(error, lang, fallback));
    } finally {
      setBusy(false);
    }
  }
  async function change(branch: Branch, patch: Record<string, unknown>) {
    try {
      await api(`/api/documents/branches/${branch.branch_key}`, "PUT", patch);
      push(t.branchSaved);
      onChanged();
    } catch (error) {
      setFailure(sayRefusal(error, lang, fallback));
    }
  }

  return (
    <section className="dc-branches" aria-labelledby="dc-branches-title">
      <p className="dc-subhead" id="dc-branches-title">{t.branches}</p>
      <p className="ct-hint">{t.branchesHint}</p>
      {failure && <p className="ct-alert" role="alert"><Icon name="warn" />{failure}</p>}
      <ul className="ct-stack">
        {branches.filter((b) => b.branch_key !== "main").map((b) => (
          <li key={b.branch_key} className="ct-card-form">
            <div className="ct-row-between">
              <b dir="auto">{(lang === "ar" && b.name_ar ? b.name_ar : b.name) || b.branch_key} <span className="ct-quiet num" dir="ltr">{b.code}</span></b>
              <Switch on={b.active} label={`${t.branchActive}: ${b.name || b.branch_key}`} onChange={(next) => void change(b, { active: next })} />
            </div>
            {!b.active && <p className="ct-hint">{t.branchOffHint}</p>}
          </li>
        ))}
      </ul>
      <div className="ct-card-form" role="group" aria-label={t.branchAdd}>
        <b>{t.branchAdd}</b>
        <div className="ct-grid2">
          <Field label={t.branchKey}><input dir="ltr" value={adding.key} maxLength={12} autoComplete="off" onChange={(e) => setAdding({ ...adding, key: e.target.value })} /></Field>
          <Field label={t.branchCode}><input dir="ltr" value={adding.code} maxLength={4} autoCapitalize="characters" autoComplete="off" onChange={(e) => setAdding({ ...adding, code: e.target.value.toUpperCase() })} /></Field>
        </div>
        <div className="ct-grid2 names">
          <Field label={t.branchName}><input dir="auto" value={adding.name} maxLength={80} onChange={(e) => setAdding({ ...adding, name: e.target.value })} /></Field>
          <Field label={t.branchNameAr}><input dir="rtl" value={adding.name_ar} maxLength={80} onChange={(e) => setAdding({ ...adding, name_ar: e.target.value })} /></Field>
        </div>
        <Field label={t.branchAddress}><input dir="auto" value={adding.address} maxLength={300} onChange={(e) => setAdding({ ...adding, address: e.target.value })} /></Field>
        <Field label={t.branchAddressAr}><input dir="rtl" value={adding.address_ar} maxLength={300} onChange={(e) => setAdding({ ...adding, address_ar: e.target.value })} /></Field>
        <Field label={t.branchPhone}><input type="tel" dir="ltr" value={adding.phone} maxLength={40} onChange={(e) => setAdding({ ...adding, phone: e.target.value })} /></Field>
        <button type="button" className="btn ct-btn" disabled={busy || !adding.key.trim() || !adding.code.trim()} onClick={() => void add()}><Icon name="plus" />{busy ? t.saving : t.branchSave}</button>
      </div>
    </section>
  );
}
