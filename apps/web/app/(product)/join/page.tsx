"use client";

// The page a sales link opens (ALY-216, D-105, specs/041-sales-link): an owner proves their email,
// reads the price ALYR prepared on the visit, accepts the terms and lands on the go-live list,
// where the first payment is asked. The link's token comes from the address and goes back to the
// API in the body of every call; nothing else about the offer is kept in the browser.

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Logo } from "../../_site/brand";
import { formatPrice } from "../_customer/price";
import { codeDigits } from "../login/code";
import { call } from "../start/api";
import { COPY as START, type Lang as StartLang } from "../start/copy";
import { COPY, type Lang } from "./copy";
import "../start/start.css";
import "./join.css";

type Fault = { detail?: string | { code?: string; message?: string } };
type Terms = { id: string; kind: "agreement" | "privacy"; title: string; title_ar: string; url: string; url_ar: string; changes: string; changes_ar: string };
type Line = { id: string; name: string; name_ar: string; kind: "monthly" | "one_time"; quantity: number; amount: number };
type Quote =
  | { status: "preparing" }
  | {
      status: "published"; id: string; period_months: number; discount_pct: number; note: string; lines: Line[];
      totals: { monthly_subtotal: number; monthly_total: number; period_total: number; one_time_total: number };
      together: { alone: number; saving: number; saving_pct: number } | null;
      promise: { en: string; ar: string } | null;
    };
type Opened = { business: { name: string; name_ar: string; type: string; type_name: { en: string; ar: string } }; email_hint: string };
type Offer = { signup_token: string; terms: Terms[]; quote: Quote; products: { en: string; ar: string }[]; owner_name: string };
type Phase = "loading" | "gone" | "open" | "code" | "offer";

const codeOf = (fault: Fault) => (typeof fault.detail === "object" ? fault.detail?.code : undefined);

/** A line with `{name}`-style slots filled by nodes, each in <bdi>, so a Latin name or address
 * sits right inside an Arabic sentence. */
function fill(template: string, slots: Record<string, string>) {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    return key && key in slots ? <bdi key={i}>{slots[key]}</bdi> : <Fragment key={i}>{part}</Fragment>;
  });
}

function Arrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14" /><path d="m14 7 5 5-5 5" />
    </svg>
  );
}

export default function Join() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("en");
  const [phase, setPhase] = useState<Phase>("loading");
  const [gone, setGone] = useState<keyof typeof COPY.en.gone>("unknown");
  const [token, setToken] = useState("");
  const [opened, setOpened] = useState<Opened | null>(null);
  const [hint, setHint] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [owner, setOwner] = useState("");
  const [ticked, setTicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = COPY[lang];
  const s = START[lang as StartLang];
  const ar = lang === "ar";

  useEffect(() => {
    let alive = true;
    const first = setTimeout(async () => {
      try {
        const saved = localStorage.getItem("alyr-lang");
        if (saved === "ar" || saved === "en") setLang(saved);
        else if (navigator.language.startsWith("ar")) setLang("ar");
      } catch { /* storage may be blocked */ }
      // The token is the address's fragment, which the browser never sends to a server.
      const given = window.location.hash.slice(1);
      setToken(given);
      const answer = await call<Opened & Fault>("/api/join/open", "POST", { t: given }).catch(() => null);
      if (!alive) return;
      if (!answer) { setError(COPY.en.offline); return setPhase("gone"); }
      if (!answer.ok) {
        const reason = codeOf(answer.data) as keyof typeof COPY.en.gone | undefined;
        setGone(reason && reason in COPY.en.gone ? reason : "unknown");
        return setPhase("gone");
      }
      setOpened(answer.data);
      setHint(answer.data.email_hint);
      setPhase("open");
    }, 0);
    return () => { alive = false; clearTimeout(first); };
  }, []);

  function switchLang() {
    const next = lang === "en" ? "ar" : "en";
    setLang(next);
    try { localStorage.setItem("alyr-lang", next); } catch { /* fine */ }
  }

  async function guard(work: () => Promise<void>) {
    setBusy(true); setError("");
    try { await work(); } catch { setError(t.offline); } finally { setBusy(false); }
  }

  const ended = (data: Fault, status: number) => {
    // A link that ended while the owner was here (revoked, run out): say so, not "wrong code".
    const reason = codeOf(data);
    // "The price changed" is not the end of the link: the owner asks for a new code to see it.
    if (reason === "changed") return false;
    if (status === 404 || status === 410) {
      setGone(reason && reason in COPY.en.gone ? (reason as keyof typeof COPY.en.gone) : "unknown");
      setPhase("gone");
      return true;
    }
    return false;
  };

  const sendCode = () => guard(async () => {
    const answer = await call<{ dev_code?: string; email_hint?: string } & Fault>("/api/join/code", "POST", { t: token });
    if (ended(answer.data, answer.status)) return;
    if (answer.status === 429) return setError(t.code.tooMany);
    if (!answer.ok) return setError(t.code.cannotSend);
    setDevCode(answer.data.dev_code ?? null);
    setHint(answer.data.email_hint ?? hint);
    setCode("");
    setPhase("code");
  });

  const verify = () => guard(async () => {
    const answer = await call<Offer & Fault>("/api/join/verify", "POST", { t: token, code });
    if (ended(answer.data, answer.status)) return;
    if (answer.status === 429) return setError(t.code.tooMany);
    if (!answer.ok) return setError(t.code.wrong);
    setOffer(answer.data);
    setOwner(answer.data.owner_name);
    setTicked([]);
    setPhase("offer");
  });

  const accept = () => guard(async () => {
    if (!offer || offer.quote.status !== "published") return;
    const answer = await call<{ next?: string } & Fault>("/api/join/accept", "POST", {
      t: token, signup_token: offer.signup_token, owner_name: owner, accepted_terms: ticked, quote_id: offer.quote.id, lang,
    });
    if (ended(answer.data, answer.status)) return;
    if (answer.status === 429) return setError(t.code.tooMany);
    if (answer.status === 401) { setPhase("code"); setDevCode(null); return setError(t.code.expired); }
    if (answer.status === 410) { setPhase("code"); setDevCode(null); return setError(t.code.changed); }
    if (!answer.ok) return setError(t.offer.failed);
    // The link is used and the owner is signed in: replace this page, so Back never reopens it.
    router.replace(answer.data.next ?? "/start");
  });

  const termsTitle = (v: Terms) => (ar ? v.title_ar : v.title);
  const termsUrl = (v: Terms) => (ar ? v.url_ar : v.url);
  const everyTermTicked = !!offer && offer.terms.every((v) => ticked.includes(v.id));
  const shop = opened ? (ar && opened.business.name_ar ? opened.business.name_ar : opened.business.name) : "";

  const price = useMemo(() => {
    if (!offer || offer.quote.status !== "published") return null;
    const q = offer.quote;
    const p = s.plan;
    return (
      <div className="ob-plan">
        <section className="ob-price" aria-label={t.offer.title}>
          <p><b className="num"><bdi>{formatPrice(q.totals.monthly_total, lang)}</bdi></b> <span>{p.perMonth}</span></p>
          {q.discount_pct > 0 && <small>{p.discount(q.discount_pct, formatPrice(q.totals.monthly_subtotal, lang))}</small>}
          {q.period_months > 1 && <small>{p.paidEvery(q.period_months, formatPrice(q.totals.period_total, lang))}</small>}
          {q.totals.one_time_total > 0 && <small>{p.oneTime(formatPrice(q.totals.one_time_total, lang))}</small>}
          {q.together && <small className="ob-saving">{p.together(formatPrice(q.together.saving, lang), formatPrice(q.together.alone, lang), q.together.saving_pct)}</small>}
          <ul className="ob-lines">
            {q.lines.map((l) => (
              <li key={l.id}>
                <span>
                  {ar && l.name_ar ? l.name_ar : l.name}
                  {l.quantity > 1 && <span className="num"> × {l.quantity}</span>}
                </span>
                <b className="num"><bdi>{formatPrice(l.amount, lang)}</bdi>{l.kind === "one_time" && <small> · {p.once}</small>}</b>
              </li>
            ))}
          </ul>
          {q.note && <p className="ob-quote-note" dir="auto">{q.note}</p>}
        </section>
        {q.promise?.[lang] && <section className="ob-promise"><b>{p.promise}</b><p>{q.promise[lang]}</p></section>}
      </div>
    );
  }, [offer, lang, ar, s.plan, t.offer.title]);

  let main: React.ReactNode = null;
  let actions: React.ReactNode = null;

  if (phase === "loading") {
    main = <p className="ob-sub" role="status">{t.working}</p>;
  } else if (phase === "gone") {
    const g = t.gone[gone];
    main = (
      <>
        <h1>{g.title}</h1>
        <p className="ob-sub" role="status">{g.body}</p>
      </>
    );
    if (gone === "used") actions = <a className="ob-btn primary" href="/login">{(t.gone.used as { action: string }).action}<Arrow /></a>;
  } else if (phase === "open" && opened) {
    main = (
      <>
        <p className="ob-kicker">{t.open.kicker}</p>
        <h1>{fill(t.open.title, { name: shop })}</h1>
        <p className="ob-sub">{fill(t.open.sub, { type: opened.business.type_name[lang] })}</p>
        <p className="ob-sub">{fill(t.open.codeTo, { hint })}</p>
      </>
    );
    actions = <button className="ob-btn primary" type="button" disabled={busy} onClick={sendCode}>{busy ? t.open.sending : t.open.send}<Arrow /></button>;
  } else if (phase === "code") {
    main = (
      <>
        <p className="ob-kicker">{t.open.kicker}</p>
        <h1>{t.code.title}</h1>
        <p className="ob-sub">{fill(t.code.sub, { hint })}</p>
        {devCode && <p className="ob-devcode" dir="ltr">{t.code.devCode(devCode)}</p>}
        <form id="ob-form" className="ob-fields" onSubmit={(e) => { e.preventDefault(); verify(); }}>
          <label className="ob-field">
            <span>{t.code.label}</span>
            <input className="ob-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus value={code} dir="ltr" onChange={(e) => setCode(codeDigits(e.target.value))} />
          </label>
        </form>
        <button className="ob-link" type="button" disabled={busy} onClick={sendCode}>{t.code.again}</button>
      </>
    );
    actions = <button className="ob-btn primary" form="ob-form" type="submit" disabled={busy || code.length < 6}>{t.code.verify}<Arrow /></button>;
  } else if (phase === "offer" && offer) {
    const ready = offer.quote.status === "published";
    main = (
      <>
        <p className="ob-kicker">{t.offer.kicker}</p>
        <h1>{t.offer.title}</h1>
        <p className="ob-sub">{t.offer.sub}</p>
        {ready ? price : (
          <section className="ob-price preparing">
            <p className="ob-preparing"><b>{s.plan.preparing}</b></p>
            <small>{s.plan.preparingSub}</small>
          </section>
        )}
        {offer.products.length > 0 && (
          <section className="ob-note-card">
            <b>{t.offer.gets}</b>
            <small>{offer.products.map((p) => p[lang]).join(" · ")}</small>
          </section>
        )}
        {ready && (
          <form id="ob-form" className="ob-fields" onSubmit={(e) => { e.preventDefault(); accept(); }}>
            <label className="ob-field">
              <span>{t.offer.name}</span>
              <input required value={owner} autoComplete="name" dir="auto" onChange={(e) => setOwner(e.target.value)} />
            </label>
            <fieldset className="ob-terms">
              <legend>{s.terms.legend}</legend>
              {offer.terms.map((v) => (
                <div className="ob-term" key={v.id}>
                  <label>
                    <input type="checkbox" checked={ticked.includes(v.id)}
                      onChange={(e) => setTicked(e.target.checked ? [...ticked, v.id] : ticked.filter((x) => x !== v.id))} />
                    <span>{s.terms[v.kind](termsTitle(v))}</span>
                  </label>
                  <a className="ob-link" href={termsUrl(v)} target="_blank" rel="noopener noreferrer">{s.terms.read}</a>
                </div>
              ))}
              {!everyTermTicked && <p className="ob-note" role="status">{s.terms.needed}</p>}
            </fieldset>
          </form>
        )}
      </>
    );
    actions = (
      <button className="ob-btn primary" form="ob-form" type="submit" disabled={busy || !ready || !owner.trim() || !everyTermTicked}>
        {busy ? t.offer.accepting : t.offer.accept}<Arrow />
      </button>
    );
  }

  return (
    <div className="ob ob-solo" dir={ar ? "rtl" : "ltr"} lang={lang}>
      <aside className="ob-rail"><Logo label="ALYR" className="ob-logo" /></aside>
      <header className="ob-top">
        <Logo label="ALYR" className="ob-logo" />
        <span />
        <button className="ob-lang" type="button" onClick={switchLang}>{t.lang}</button>
      </header>
      <main className="ob-main">
        <div className="ob-content">{main}</div>
        {error && <p className="ob-error" role="alert">{error}</p>}
        <div className="ob-actions">{actions}</div>
      </main>
    </div>
  );
}
