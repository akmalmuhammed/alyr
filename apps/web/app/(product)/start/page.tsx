"use client";

// Self-serve onboarding (ALY-76, D-031), as designed in the Figma prototype: one spine
// of steps, the starting setup chosen by the type of business, a private test line to
// try it as a customer, then the plan and the go-live checklist. One page, two layouts:
// a single column on a phone, a step rail with a live WhatsApp preview on a laptop.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "../../_site/brand";
import { Chat, initialsOf, type ChatMessage, type Choice } from "./Chat";
import { COPY, type Lang } from "./copy";
import "./start.css";

type Text = { en: string; ar: string };
type BusinessType = { key: string; name: Text; hint: Text; icon: string; way: "appointments" | "assisted" };
type Service = { id: string; name: string; name_ar: string; duration_minutes: number; price: number; price_text: string; active?: boolean };
type Period = { weekday: number; opens: string; closes: string };
// What the shop's type of business gives its Catalog, in plain words (null where it has none).
type CatalogReview = {
  section: { name: string; name_ar: string }; optional: boolean; samples: number;
  gets: Text[]; starting_categories: { name: string; name_ar: string }[];
};
type State = {
  business: { name: string; name_ar: string; slug: string; type: string; area: string; reminders: boolean };
  owner: { name: string; email: string };
  way: "appointments" | "assisted";
  steps: string[];
  step: string;
  finished: boolean;
  services: Service[];
  hours: Period[];
  quote: Quote;
  areas: string[];
  catalog: CatalogReview | null;
};
type QuoteLine = { id: string; business: string; business_ar: string; name: string; name_ar: string; kind: "monthly" | "one_time"; quantity: number; amount_text: string };
type Quote = {
  status: "preparing" | "published" | "accepted";
  id?: string; number?: number; period_months?: number; discount_pct?: number; note?: string;
  lines?: QuoteLine[];
  totals?: { monthly_subtotal_text: string; monthly_total_text: string; period_total_text: string; one_time_total: number; one_time_total_text: string };
  promise?: Text | null; accepted_at?: string | null;
};
type WsStep = { key: string; done: boolean; asked: boolean; connection: string };
type Workspace = { products: { key: string; steps: WsStep[] }[]; connections: { key: string; connected: boolean }[] };
type Booking = { customer: string; service: string; when_text: string; status: string };
type Step = "loading" | "account" | "code" | "type" | "basics" | "services" | "hours" | "assisted" | "try" | "plan" | "golive" | "finished";

const ORDER = [6, 0, 1, 2, 3, 4, 5]; // Saturday first, as the week runs in Qatar
const MINUTES = [15, 20, 30, 45, 60, 75, 90, 120, 150, 180];
const NOUN: Record<string, string> = { salon: "salon", spa: "spa", clinic: "clinic", home: "business", restaurant: "restaurant", bakery: "bakery", grocery: "shop", shop: "shop", fashion: "shop", wholesale: "business", travel: "office" };
const ICON: Record<string, string[]> = {
  scissors: ["M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z", "M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z", "M20 4 8.1 15.9", "M14.5 14.5 20 20", "M8.1 8.1 12 12"],
  leaf: ["M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z", "M2 21c0-3 1.9-5.4 5.2-6"],
  medical: ["M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"],
  wrench: ["M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"],
  cup: ["M17 8h1a4 4 0 1 1 0 8h-1", "M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z", "M6 2v2", "M10 2v2", "M14 2v2"],
  bag: ["M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z", "M3 6h18", "M16 10a4 4 0 0 1-8 0"],
  boxes: ["M21 8 12 3 3 8v8l9 5 9-5Z", "M3 8l9 5 9-5", "M12 13v8"],
  cake: ["M4 20h16", "M5 20v-8h14v8", "M5 15.5c1.5 1.5 2.5 1.5 3.5 0s2-1.5 3.5 0 2.5 1.5 3.5 0 2-1.5 3.5 0", "M12 11V8", "M12 6.5c.8-.9.8-1.6 0-2.5-.8.9-.8 1.6 0 2.5Z"],
  basket: ["M4 10h16l-1.5 9a2 2 0 0 1-2 1.7H7.5a2 2 0 0 1-2-1.7L4 10Z", "M8 10l3-6", "M16 10l-3-6", "M9 14v3", "M12 14v3", "M15 14v3"],
  shirt: ["M9 4 4 6.5l2 4 2-1V20h8V9.5l2 1 2-4L15 4a3 3 0 0 1-6 0Z"],
  plane: ["M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"],
  check: ["m5 12 4 4L19 6"],
  lock: ["M6 11h12v10H6z", "M8 11V7a4 4 0 0 1 8 0v4"],
  chat: ["M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.5 8.5 0 1 1 21 11.5Z"],
  plus: ["M12 5v14", "M5 12h14"],
  arrow: ["M5 12h14", "m14 7 5 5-5 5"],
  shield: ["M12 3 4 6v5c0 5.2 3.4 8.4 8 10 4.6-1.6 8-4.8 8-10V6z", "m8.5 12 2.2 2.2 4.8-5"],
};

function Ico({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {(ICON[name] ?? []).map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

async function call<T>(url: string, method = "GET", body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const response = await fetch(url, {
    method, cache: "no-store",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status, data: (await response.json().catch(() => ({}))) as T };
}

const qar = (dirhams: number) => (dirhams / 100).toString();

// Sign-up so far, kept in this tab only, so a refresh before the business exists does
// not send the owner back for a new code. The token is single-use and expires in an hour.
type Draft = { step: "code" | "type" | "basics"; email: string; token: string; kind: string; form: { owner: string; name: string; nameAr: string; area: string } };
const DRAFT = "alyr-signup";
function readDraft(): Draft | null {
  try { const raw = sessionStorage.getItem(DRAFT); return raw ? (JSON.parse(raw) as Draft) : null; } catch { return null; }
}
function writeDraft(draft: Draft | null) {
  try { if (draft) sessionStorage.setItem(DRAFT, JSON.stringify(draft)); else sessionStorage.removeItem(DRAFT); } catch { /* storage may be blocked */ }
}

/** What the owner is getting for the type of business they chose, in plain words (ALY-107). */
function ReviewCard({ review, lang, t }: { review: CatalogReview; lang: Lang; t: (typeof COPY)[Lang] }) {
  const name = lang === "ar" ? review.section.name_ar : review.section.name;
  return (
    <section className="ob-review" aria-labelledby="ob-review-title">
      <p className="ob-kicker">{name}</p>
      <h2 id="ob-review-title">{t.review.title}</h2>
      <ul className="ob-gets">
        {review.gets.map((line) => <li key={line.en}><Ico name="check" size={16} />{line[lang]}</li>)}
      </ul>
      {review.samples > 0 && <p className="ob-note-card"><b>{t.review.samplesTitle(review.samples)}</b><small>{t.review.samples}</small></p>}
    </section>
  );
}

export default function Start() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("en");
  const t = COPY[lang];
  const [step, setStep] = useState<Step>("loading");
  const [types, setTypes] = useState<BusinessType[]>([]);
  const [signupOpen, setSignupOpen] = useState(true);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [kind, setKind] = useState("salon");
  const [form, setForm] = useState({ owner: "", name: "", nameAr: "", area: "Al Sadd" });
  const [state, setState] = useState<State | null>(null);
  const [rows, setRows] = useState<Service[]>([]);
  const [hours, setHours] = useState<Period[]>([]);
  const [newService, setNewService] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [tested, setTested] = useState<Booking | null>(null);
  const [ws, setWs] = useState<Workspace | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteFlash, setQuoteFlash] = useState(false);
  const quoteSeen = useRef("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const chosen = types.find((x) => x.key === (state?.business.type || kind));
  const way = state?.way ?? chosen?.way ?? "appointments";
  const rail = way === "assisted"
    ? (["account", "business", "assisted", "plan", "golive"] as const)
    : (["account", "business", "services", "hours", "try", "plan", "golive"] as const);
  const railKey = step === "code" ? "account" : step === "type" || step === "basics" ? "business" : step;
  const current = step === "finished" ? rail.length : Math.max(0, rail.indexOf(railKey as never));
  const shopName = state?.business.name || form.name;
  const shopShown = lang === "ar" && (state?.business.name_ar || form.nameAr) ? (state?.business.name_ar || form.nameAr) : shopName;

  const loadState = useCallback(async () => {
    const answer = await call<State>("/api/onboarding/state");
    if (!answer.ok) return null;
    setState(answer.data);
    setRows(answer.data.services);
    setHours(answer.data.hours);
    setQuote(answer.data.quote);
    quoteSeen.current = JSON.stringify(answer.data.quote);
    return answer.data;
  }, []);

  // Where to begin: a signed-in owner resumes at their saved step; anyone else starts
  // with their email. On a local machine an unsigned visitor is the demo shop, so the
  // sign-in flag decides, not whether the state loads.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        try { const saved = localStorage.getItem("alyr-lang"); if (saved === "ar" || saved === "en") setLang(saved); } catch { /* storage may be blocked */ }
        const [typesAnswer, me] = await Promise.all([
          call<{ types: BusinessType[]; signup_open: boolean }>("/api/onboarding/types"),
          call<{ signed_in: boolean }>("/api/auth/me"),
        ]);
        if (!alive) return;
        setTypes(typesAnswer.data.types ?? []);
        setSignupOpen(typesAnswer.data.signup_open ?? false);
        if (!me.ok || !me.data.signed_in) {
          const draft = readDraft();
          if (!draft) return setStep("account");
          setEmail(draft.email); setToken(draft.token); setKind(draft.kind); setForm(draft.form);
          return setStep(draft.step);
        }
        const loaded = await loadState();
        if (!alive) return;
        if (!loaded) return setStep("account");
        // A finished owner comes back here only to answer a price ALYR published since.
        if (loaded.finished && loaded.quote.status === "published") return setStep("plan");
        if (loaded.finished) router.replace("/app");
        setStep(loaded.finished ? "finished" : ((loaded.step || loaded.steps[0]) as Step));
      } catch {
        if (alive) { setError(COPY.en.offline); setStep("account"); }
      }
    })();
    return () => { alive = false; };
  }, [loadState, router]);

  useEffect(() => {
    if (step === "code" || step === "type" || step === "basics") writeDraft({ step, email, token, kind, form });
    else if (step !== "loading") writeDraft(null);
  }, [step, email, token, kind, form]);

  function switchLang() {
    const next = lang === "en" ? "ar" : "en";
    setLang(next);
    try { localStorage.setItem("alyr-lang", next); } catch { /* fine */ }
  }

  async function go(next: Step) {
    setError("");
    if (state && ["services", "hours", "assisted", "try", "plan", "golive"].includes(next)) {
      await call("/api/onboarding/state", "PATCH", { step: next });
    }
    setStep(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function guard(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await work(); } catch { setError(t.offline); } finally { setBusy(false); }
  }

  // ── account ──────────────────────────────────────────
  const sendCode = () => guard(async () => {
    const answer = await call<{ dev_code?: string | null }>("/api/onboarding/code", "POST", { email });
    if (answer.status === 429) return setError(t.account.tooMany);
    if (!answer.ok) return setError(t.account.cannotSend);
    setDevCode(answer.data.dev_code ?? null);
    setStep("code");
  });
  const verify = () => guard(async () => {
    const answer = await call<{ status: string; signup_token?: string }>("/api/onboarding/verify", "POST", { email, code });
    if (answer.status === 403) return setError(t.account.closedNew);
    if (!answer.ok) return setError(t.account.wrong);
    if (answer.data.status === "signed_in") {
      const loaded = await loadState();
      if (loaded && !loaded.finished) return setStep((loaded.step || loaded.steps[0]) as Step);
      return router.push("/app");
    }
    setToken(answer.data.signup_token ?? "");
    setStep("type");
  });

  // ── business ─────────────────────────────────────────
  const createBusiness = () => guard(async () => {
    const answer = await call("/api/onboarding/business", "POST", {
      signup_token: token, owner_name: form.owner, name: form.name, name_ar: form.nameAr, type: kind, area: form.area,
    });
    if (answer.status === 401) { setStep("account"); return setError(t.basics.expired); }
    if (!answer.ok) return setError(t.offline);
    const loaded = await loadState();
    if (loaded) setStep((loaded.step || loaded.steps[0]) as Step);
  });

  // ── services ─────────────────────────────────────────
  async function saveService(id: string, change: Partial<Service>) {
    const answer = await call<{ services: Service[] }>(`/api/services/${id}`, "PATCH", change);
    if (answer.ok) setRows(answer.data.services.filter((s) => s.active !== false));
  }
  const removeService = (id: string) => guard(async () => {
    await call(`/api/services/${id}/active`, "POST", { active: false });
    await loadState();
  });
  const addService = () => guard(async () => {
    if (!newService.trim()) return;
    await call("/api/services", "POST", { name: newService.trim(), duration_minutes: 30, price: 0 });
    setNewService("");
    await loadState();
  });

  // ── hours ────────────────────────────────────────────
  const dayPeriods = (day: number) => hours.map((p, i) => ({ ...p, i })).filter((p) => p.weekday === day);
  const setPeriod = (i: number, field: "opens" | "closes", value: string) => setHours((h) => h.map((p, k) => (k === i ? { ...p, [field]: value } : p)));
  const toggleDay = (day: number) => setHours((h) => (h.some((p) => p.weekday === day) ? h.filter((p) => p.weekday !== day) : [...h, { weekday: day, opens: "10:00", closes: "22:00" }]));
  // A break splits the day in two: the afternoon one most shops here take, or an hour
  // in the middle of a shorter day.
  const addBreak = (day: number) => setHours((h) => {
    const i = h.findIndex((p) => p.weekday === day);
    if (i < 0) return h;
    const p = h[i];
    const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const [opens, closes] = [minutes(p.opens), minutes(p.closes)];
    if (closes - opens < 120) return h;
    const middle = Math.round((opens + closes) / 60) * 30;
    const [stop, start] = opens < 780 && closes > 960 ? [780, 960] : [middle - 30, middle + 30];
    return [...h.slice(0, i), { ...p, closes: clock(stop) }, { weekday: day, opens: clock(start), closes: p.closes }, ...h.slice(i + 1)];
  });
  const removePeriod = (i: number) => setHours((h) => h.filter((_, k) => k !== i));
  const saveHours = () => guard(async () => {
    const answer = await call("/api/hours", "PUT", { periods: hours });
    if (!answer.ok) return setError(t.hours.badTimes);
    await go("try");
  });
  const setReminders = (on: boolean) => guard(async () => {
    const answer = await call<State>("/api/onboarding/state", "PATCH", { reminders: on });
    if (answer.ok) setState(answer.data);
  });

  // ── try it ───────────────────────────────────────────
  const refreshTry = useCallback(async () => {
    const [conversation, bookings] = await Promise.all([
      call<{ messages: ChatMessage[] }>("/api/onboarding/test-chat"),
      call<{ bookings: Booking[] }>("/api/bookings"),
    ]);
    if (conversation.ok) setChat(conversation.data.messages);
    if (bookings.ok) setTested(bookings.data.bookings.find((b) => b.customer.endsWith("(test)") && b.status === "booked") ?? null);
  }, []);
  useEffect(() => {
    if (way !== "appointments" || (step !== "try" && step !== "golive")) return;
    let alive = true;
    const tick = async () => { if (alive) await refreshTry().catch(() => undefined); };
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 2500);
    return () => { alive = false; clearTimeout(first); clearInterval(timer); };
  }, [step, way, refreshTry]);
  const say = (text: string, choice?: Choice) => guard(async () => {
    if (!text.trim() && !choice) return;
    setDraft("");
    const answer = await call<{ messages: ChatMessage[] }>("/api/onboarding/test-chat", "POST", { text: choice ? choice.title : text, reply_id: choice?.id ?? "" });
    if (answer.ok) setChat(answer.data.messages);
  });

  // ── the price ALYR prepared (D-032) ───────────────────
  // While the owner looks at the plan, ask again every few seconds: ALYR may publish or
  // change the price from the back office at that very moment.
  useEffect(() => {
    if (step !== "plan") return;
    let alive = true;
    const tick = async () => {
      const answer = await call<Quote>("/api/onboarding/quote").catch(() => null);
      if (!alive || !answer?.ok) return;
      const seen = JSON.stringify(answer.data);
      if (quoteSeen.current && seen !== quoteSeen.current && answer.data.status !== "preparing") {
        setQuoteFlash(true);
        setTimeout(() => setQuoteFlash(false), 5000);
      }
      quoteSeen.current = seen;
      setQuote(answer.data);
    };
    const timer = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(timer); };
  }, [step]);
  const acceptQuote = (then: () => void) => guard(async () => {
    if (!quote?.id) return;
    const answer = await call<Quote>("/api/onboarding/quote/accept", "POST", { quote_id: quote.id });
    if (answer.status === 409) {
      setError(t.plan.changed);
      const fresh = await call<Quote>("/api/onboarding/quote");
      if (fresh.ok) { quoteSeen.current = JSON.stringify(fresh.data); setQuote(fresh.data); }
      return;
    }
    if (!answer.ok) return setError(t.offline);
    quoteSeen.current = JSON.stringify(answer.data);
    setQuote(answer.data);
    then();
  });

  // ── go live ──────────────────────────────────────────
  const loadWorkspace = useCallback(async () => {
    const answer = await call<Workspace>("/api/workspace");
    if (answer.ok) setWs(answer.data);
  }, []);
  useEffect(() => {
    if (step !== "golive") return;
    const first = setTimeout(() => { loadWorkspace().catch(() => undefined); }, 0);
    return () => clearTimeout(first);
  }, [step, loadWorkspace]);
  const wsStep = (key: string) => ws?.products.flatMap((p) => p.steps).find((s) => s.key === key);
  const ask = (stepKey: string) => guard(async () => {
    // Filed under the product the step belongs to (a salon's steps are ALYR Bookings').
    const product = ws?.products.find((p) => p.steps.some((s) => s.key === stepKey))?.key ?? "chat";
    await call("/api/workspace/setup-requests", "POST", { product, step: stepKey, note: "" });
    await loadWorkspace();
  });
  const finish = () => guard(async () => {
    await call("/api/onboarding/finish", "POST");
    router.push("/app");
  });

  // ── the live preview on the right ─────────────────────
  const preview = useMemo((): ChatMessage[] => {
    const name = shopShown || t.yourBusiness;
    const ar = lang === "ar";
    const greeting: ChatMessage = {
      direction: "out", body: ar ? `أهلاً بك في ${name}. كيف نقدر نخدمك؟` : `Welcome to ${name}. How can we help?`,
      payload: { choices: (ar ? ["احجز موعداً", "حجزي", "الأسعار"] : ["Book a visit", "My booking", "Prices"]).map((title, i) => ({ id: `p${i}`, title })) },
    };
    if (step === "services") {
      const lines = rows.slice(0, 4).map((s) => `${ar && s.name_ar ? s.name_ar : s.name}${s.price ? `: QAR ${qar(s.price)}` : ""} (${s.duration_minutes} ${ar ? "دقيقة" : "min"})`);
      return [
        { direction: "in", body: ar ? "كم الأسعار؟" : "What are your prices?" },
        { direction: "out", body: [ar ? "خدماتنا:" : "Our services:", ...lines].join("\n"), payload: { choices: [{ id: "b", title: ar ? "احجز موعداً" : "Book a visit" }] } },
      ];
    }
    if (step === "hours") {
      const first = rows[0];
      return [{
        direction: "out",
        body: ar ? `تذكير: حجزك لدى ${name}، اليوم الساعة 7:30 مساءً.` : `Reminder: your ${first?.name.toLowerCase() ?? "visit"} at ${name} is today at 7:30 pm.`,
        payload: { choices: [{ id: "m", title: ar ? "حجزي" : "My booking" }] },
      }];
    }
    if (step === "account" || step === "code") {
      return [
        { direction: "in", body: ar ? "مرحبا، أبي أحجز حلاقة بكرة المسا" : "Hi, can I book a haircut tomorrow evening?" },
        { direction: "out", body: ar ? "أكيد. اختر الوقت ليوم الخميس:" : "Of course. Pick a time for Thursday:", payload: { choices: [{ id: "a", title: "6:00 pm" }, { id: "b", title: "7:30 pm" }] } },
        { direction: "in", body: "7:30 pm" },
        { direction: "out", body: ar ? "تم الحجز: حلاقة، الخميس 7:30 مساءً. سنذكّرك قبل ساعتين." : "Booked: haircut, Thursday 7:30 pm. We'll remind you 2 hours before." },
      ];
    }
    return [greeting];
  }, [step, rows, shopShown, lang, t]);

  // ── screens ──────────────────────────────────────────
  const total = rail.length;
  const head = (title: string, sub?: string) => (
    <>
      <p className="ob-kicker">{t.stepOf(current + 1, total)}</p>
      <h1>{title}</h1>
      {sub && <p className="ob-sub">{sub}</p>}
    </>
  );
  const testChat = (
    <Chat
      name={shopShown} initials={initialsOf(shopName)} messages={chat} live
      onChoice={(c) => say("", c)}
      footer={
        <form className="ob-compose" onSubmit={(e) => { e.preventDefault(); say(draft); }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t.try.placeholder} dir="auto" aria-label={t.try.placeholder} />
          <button type="submit" disabled={busy || !draft.trim()}>{t.try.send}</button>
        </form>
      }
    />
  );

  let main: React.ReactNode = null;
  let actions: React.ReactNode = null;

  if (step === "loading") {
    main = <p className="ob-sub">…</p>;
  } else if (step === "account") {
    main = (
      <>
        {head(t.account.title, signupOpen ? t.account.sub : t.account.closed)}
        <form id="ob-form" className="ob-fields" onSubmit={(e) => { e.preventDefault(); sendCode(); }}>
          <label className="ob-field">
            <span>{t.account.email}</span>
            <input type="email" required autoFocus value={email} dir="ltr" autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
          </label>
        </form>
        <ul className="ob-trust">{t.account.trust.map((x) => <li key={x}><Ico name="check" size={16} />{x}</li>)}</ul>
      </>
    );
    actions = <button className="ob-btn primary" form="ob-form" type="submit" disabled={busy}>{t.account.send}<Ico name="arrow" /></button>;
  } else if (step === "code") {
    main = (
      <>
        {head(t.account.codeTitle, t.account.codeSub(email))}
        {devCode && <p className="ob-devcode" dir="ltr">{t.account.devCode(devCode)}</p>}
        <form id="ob-form" className="ob-fields" onSubmit={(e) => { e.preventDefault(); verify(); }}>
          <label className="ob-field">
            <span>{t.account.code}</span>
            <input className="ob-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus value={code} dir="ltr" onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </label>
        </form>
        <button className="ob-link" type="button" onClick={() => { setStep("account"); setCode(""); setDevCode(null); }}>{t.account.other}</button>
      </>
    );
    actions = <button className="ob-btn primary" form="ob-form" type="submit" disabled={busy || code.length < 6}>{t.account.verify}<Ico name="arrow" /></button>;
  } else if (step === "type") {
    main = (
      <>
        {head(t.type.title, t.type.sub)}
        <div className="ob-tiles" role="radiogroup" aria-label={t.type.title}>
          {types.map((x) => (
            <button key={x.key} type="button" role="radio" aria-checked={kind === x.key} className={`ob-tile ${kind === x.key ? "on" : ""}`} onClick={() => setKind(x.key)}>
              <span className="ob-glyph"><Ico name={x.icon} /></span>
              <b>{x.name[lang]}</b>
              <small>{x.way === "assisted" ? t.type.assistedNote : x.hint[lang]}</small>
              {kind === x.key && <span className="ob-tick"><Ico name="check" size={14} /></span>}
            </button>
          ))}
        </div>
      </>
    );
    actions = <button className="ob-btn primary" type="button" onClick={() => setStep("basics")}>{t.continue}<Ico name="arrow" /></button>;
  } else if (step === "basics") {
    main = (
      <>
        {head(lang === "ar" ? t.basics.title("") : t.basics.title(NOUN[kind] ?? "business"), t.basics.sub)}
        <form id="ob-form" className="ob-fields" onSubmit={(e) => { e.preventDefault(); createBusiness(); }}>
          <label className="ob-field"><span>{t.basics.owner}</span><input required value={form.owner} autoComplete="name" onChange={(e) => setForm({ ...form, owner: e.target.value })} dir="auto" /></label>
          <div className="ob-two">
            <label className="ob-field"><span>{t.basics.name}</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} dir="auto" /><small>{t.basics.nameHint}</small></label>
            <label className="ob-field"><span>{t.basics.nameAr}</span><input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} dir="rtl" lang="ar" /><small>{t.basics.nameArHint}</small></label>
          </div>
          <fieldset className="ob-field">
            <legend>{t.basics.area}</legend>
            <div className="ob-chips">
              {(state?.areas ?? ["Al Sadd", "West Bay", "Bin Mahmoud", "Al Wakra", "Lusail", "The Pearl", "Al Rayyan"]).map((a) => (
                <button key={a} type="button" className={`ob-chip ${form.area === a ? "on" : ""}`} aria-pressed={form.area === a} onClick={() => setForm({ ...form, area: a })}>{a}</button>
              ))}
            </div>
          </fieldset>
        </form>
        <div className="ob-inline-preview"><p className="ob-kicker">{t.previewLabel}</p><Chat name={shopShown} initials={initialsOf(shopName)} messages={preview} /></div>
      </>
    );
    actions = (
      <>
        <button className="ob-btn ghost" type="button" onClick={() => setStep("type")}>{t.back}</button>
        <button className="ob-btn primary" form="ob-form" type="submit" disabled={busy || !form.owner.trim() || !form.name.trim()}>{t.basics.create}<Ico name="arrow" /></button>
      </>
    );
  } else if (step === "services") {
    main = (
      <>
        {head(t.services.title, t.services.sub)}
        <div className="ob-table" role="table">
          <div className="ob-tr ob-th" role="row"><span role="columnheader">{t.services.name}</span><span role="columnheader">{t.services.minutes}</span><span role="columnheader">{t.services.price}</span><span /></div>
          {rows.map((s) => (
            <div className="ob-tr" role="row" key={s.id}>
              <input aria-label={t.services.name} defaultValue={lang === "ar" && s.name_ar ? s.name_ar : s.name} dir="auto"
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.name && v !== s.name_ar) saveService(s.id, lang === "ar" ? { name_ar: v } : { name: v }); }} />
              <select aria-label={t.services.minutes} value={s.duration_minutes} onChange={(e) => saveService(s.id, { duration_minutes: Number(e.target.value) })}>
                {[...new Set([...MINUTES, s.duration_minutes])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m} {t.services.min}</option>)}
              </select>
              <input aria-label={t.services.price} inputMode="decimal" defaultValue={s.price ? qar(s.price) : ""} placeholder={t.services.noPrice} dir="ltr"
                onBlur={(e) => { const v = Math.round(Number(e.target.value || 0) * 100); if (!Number.isNaN(v) && v !== s.price && v >= 0) saveService(s.id, { price: v }); }} />
              <button type="button" className="ob-x" aria-label={`${t.services.remove}: ${s.name}`} onClick={() => removeService(s.id)}>×</button>
            </div>
          ))}
          <form className="ob-tr ob-add" onSubmit={(e) => { e.preventDefault(); addService(); }}>
            <input value={newService} placeholder={t.services.newName} onChange={(e) => setNewService(e.target.value)} dir="auto" aria-label={t.services.newName} />
            <button type="submit" className="ob-btn small" disabled={!newService.trim() || busy}><Ico name="plus" size={16} />{t.services.addIt}</button>
          </form>
        </div>
        {!rows.length && <p className="ob-note">{t.services.empty}</p>}
      </>
    );
    actions = <button className="ob-btn primary" type="button" disabled={!rows.length || busy} onClick={() => go("hours")}>{t.continue}<Ico name="arrow" /></button>;
  } else if (step === "hours") {
    main = (
      <>
        {head(t.hours.title, t.hours.sub)}
        <div className="ob-split">
          <section className="ob-card">
            <h2>{t.hours.hoursTitle}</h2>
            {ORDER.map((day, k) => {
              const periods = dayPeriods(day);
              return (
                <div className="ob-day" key={day}>
                  <label className="ob-daycheck"><input type="checkbox" checked={periods.length > 0} onChange={() => toggleDay(day)} />{t.hours.days[k]}</label>
                  <div className="ob-periods">
                    {periods.length === 0 && <span className="ob-muted">{t.hours.closed}</span>}
                    {periods.map((p) => (
                      <span className="ob-period" key={p.i} dir="ltr">
                        <input type="time" value={p.opens} aria-label={`${t.hours.days[k]} ${t.hours.open}`} onChange={(e) => setPeriod(p.i, "opens", e.target.value)} />
                        <span>–</span>
                        <input type="time" value={p.closes} aria-label={`${t.hours.days[k]} ${t.hours.closed}`} onChange={(e) => setPeriod(p.i, "closes", e.target.value)} />
                        {periods.length > 1 && <button type="button" className="ob-x" onClick={() => removePeriod(p.i)} aria-label={t.services.remove}>×</button>}
                      </span>
                    ))}
                    {periods.length === 1 && <button type="button" className="ob-link small" onClick={() => addBreak(day)}>{t.hours.addPeriod}</button>}
                  </div>
                </div>
              );
            })}
          </section>
          <section className="ob-card">
            <h2>{t.hours.rulesTitle}</h2>
            <label className="ob-rule">
              <span><b>{t.hours.reminders}</b><small>{t.hours.remindersSub}</small></span>
              <input type="checkbox" role="switch" className="ob-switch" checked={state?.business.reminders ?? true} onChange={(e) => setReminders(e.target.checked)} />
            </label>
            <div className="ob-rule"><span><b>{t.hours.cancel}</b><small>{t.hours.cancelSub}</small></span><em>{t.hours.always}</em></div>
            <div className="ob-rule locked"><span><b>{t.hours.deposit}</b><small>{t.hours.depositSub}</small></span><Ico name="lock" size={18} /></div>
            <div className="ob-rule locked"><span><b>{t.hours.capacity}</b><small>{t.hours.capacitySub}</small></span><Ico name="lock" size={18} /></div>
          </section>
        </div>
      </>
    );
    actions = (
      <>
        <button className="ob-btn ghost" type="button" onClick={() => go("services")}>{t.back}</button>
        <button className="ob-btn primary" type="button" disabled={busy} onClick={saveHours}>{t.continue}<Ico name="arrow" /></button>
      </>
    );
  } else if (step === "assisted") {
    const what = lang === "ar" ? (chosen?.name.ar ?? "") : (chosen?.name.en.toLowerCase() ?? "");
    const review = state?.catalog ?? null;
    main = review ? (
      <>
        {head(t.assisted.catalogTitle, t.assisted.catalogSub)}
        <ReviewCard review={review} lang={lang} t={t} />
        <p className="ob-note"><Ico name="chat" size={18} />{t.assisted.note}</p>
      </>
    ) : (
      <>
        {head(t.assisted.title, t.assisted.sub(what))}
        <p className="ob-note"><Ico name="chat" size={18} />{t.assisted.note}</p>
      </>
    );
    actions = <button className="ob-btn primary" type="button" onClick={() => go("plan")}>{t.continue}<Ico name="arrow" /></button>;
  } else if (step === "try") {
    main = (
      <>
        <p className="ob-kicker volt">{t.try.test}</p>
        <h1>{t.try.title}</h1>
        <p className="ob-sub">{t.try.sub}</p>
        <div className="ob-suggest">{t.try.suggestions.map((s) => <button key={s} type="button" className="ob-chip" onClick={() => say(s)} dir="auto">{s}</button>)}</div>
        {tested ? (
          <div className="ob-success" role="status"><span className="ob-signal"><Ico name="check" size={22} /></span><div><b>{t.try.worked(`${tested.service}, ${tested.when_text}`)}</b><small>{t.try.workedSub}</small></div></div>
        ) : (
          <p className="ob-waiting" role="status"><span className="ob-pulse" />{t.try.waiting}</p>
        )}
        <div className="ob-inline-chat">{testChat}</div>
      </>
    );
    actions = (
      <>
        <button className="ob-btn ghost" type="button" onClick={() => go("hours")}>{t.back}</button>
        {!tested && <button className="ob-link" type="button" onClick={() => go("plan")}>{t.try.skip}</button>}
        <button className="ob-btn primary" type="button" disabled={!tested} onClick={() => go("plan")}>{t.continue}<Ico name="arrow" /></button>
      </>
    );
  } else if (step === "plan") {
    const q = quote;
    const ready = q && q.status !== "preparing" && q.totals;
    const multi = new Set((q?.lines ?? []).map((l) => l.business).filter(Boolean)).size > 1;
    const promise = q?.promise?.[lang];
    const accepted = q?.status === "accepted";
    const acceptedOn = q?.accepted_at
      ? new Date(q.accepted_at).toLocaleDateString(lang === "ar" ? "ar-QA" : "en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "";
    main = (
      <>
        {head(t.plan.title, ready ? t.plan.sub : t.plan.preparingSub)}
        {quoteFlash && <p className="ob-flash" role="status"><Ico name="check" size={16} />{t.plan.updated}</p>}
        {ready && q.totals ? (
          <div className="ob-plan">
            <section className="ob-price">
              {accepted && <p className="ob-accepted"><Ico name="check" size={15} />{t.plan.acceptedOn(acceptedOn)}</p>}
              <p><b className="num"><bdi dir="ltr">{q.totals.monthly_total_text}</bdi></b> <span>{t.plan.perMonth}</span></p>
              {(q.discount_pct ?? 0) > 0 && <small>{t.plan.discount(q.discount_pct ?? 0, q.totals.monthly_subtotal_text)}</small>}
              {(q.period_months ?? 1) > 1 && <small>{t.plan.paidEvery(q.period_months ?? 1, q.totals.period_total_text)}</small>}
              {q.totals.one_time_total > 0 && <small>{t.plan.oneTime(q.totals.one_time_total_text)}</small>}
              <ul className="ob-lines">
                {(q.lines ?? []).map((l) => (
                  <li key={l.id}>
                    <span>
                      {lang === "ar" && l.name_ar ? l.name_ar : l.name}
                      {l.quantity > 1 && <span className="num"> × {l.quantity}</span>}
                      {multi && l.business && <small>{lang === "ar" && l.business_ar ? l.business_ar : l.business}</small>}
                    </span>
                    <b className="num"><bdi dir="ltr">{l.amount_text}</bdi>{l.kind === "one_time" && <small> · {t.plan.once}</small>}</b>
                  </li>
                ))}
              </ul>
              {q.note && <p className="ob-quote-note" dir="auto">{q.note}</p>}
            </section>
            {promise && <section className="ob-promise"><Ico name="shield" size={22} /><b>{t.plan.promise}</b><p>{promise}</p></section>}
          </div>
        ) : (
          <section className="ob-price preparing">
            <p className="ob-preparing"><span className="ob-pulse" /><b>{t.plan.preparing}</b></p>
            <small>{t.plan.preparingNote}</small>
            <ul>{t.plan.includes.map((x) => <li key={x}><Ico name="check" size={16} />{x}</li>)}</ul>
          </section>
        )}
        <section className="ob-note-card"><b>{t.plan.meta}</b><small>{t.plan.metaSub}</small></section>
      </>
    );
    const waiting = q?.status === "published";
    if (state?.finished) {
      actions = (
        <>
          <button className="ob-btn ghost" type="button" onClick={() => router.push("/app")}>{t.plan.backToWorkspace}</button>
          {waiting && <button className="ob-btn primary" type="button" disabled={busy} onClick={() => acceptQuote(() => router.push("/app"))}>{t.plan.acceptOnly}<Ico name="arrow" /></button>}
        </>
      );
    } else {
      actions = (
        <>
          <button className="ob-btn ghost" type="button" onClick={() => go(way === "assisted" ? "assisted" : "try")}>{t.back}</button>
          {waiting && <button className="ob-link" type="button" onClick={() => go("golive")}>{t.plan.later}</button>}
          {waiting
            ? <button className="ob-btn primary" type="button" disabled={busy} onClick={() => acceptQuote(() => go("golive"))}>{t.plan.accept}<Ico name="arrow" /></button>
            : <button className="ob-btn primary" type="button" onClick={() => go("golive")}>{t.continue}<Ico name="arrow" /></button>}
        </>
      );
    }
  } else if (step === "golive") {
    const whatsapp = wsStep("whatsapp");
    const provider = wsStep("provider");
    const item = (done: boolean | undefined, title: string, sub: string, action?: React.ReactNode, next?: boolean) => (
      <li className={`ob-check ${done ? "done" : next ? "next" : ""}`}>
        <span className="ob-dot">{done && <Ico name="check" size={14} />}</span>
        <span className="ob-check-text"><b>{title}</b><small>{sub}</small></span>
        {action}
      </li>
    );
    main = (
      <>
        {head(t.golive.title, t.golive.sub)}
        <ul className="ob-checks">
          {way === "appointments" && item(true, t.golive.setup, t.golive.setupSub(rows.length))}
          {way === "appointments" && item(Boolean(tested), tested ? t.golive.tried : t.golive.notTried, tested ? t.golive.triedSub : t.try.waiting)}
          {item(whatsapp?.done, t.golive.whatsapp, t.golive.whatsappSub,
            whatsapp?.done ? <em>{t.golive.connected}</em> : whatsapp?.asked ? <em>{t.golive.asked}</em> : <button type="button" className="ob-btn small" onClick={() => ask("whatsapp")} disabled={busy}>{t.golive.ask}</button>, true)}
          {item(provider?.done, t.golive.payments, t.golive.paymentsSub,
            provider?.done ? <em>{t.golive.connected}</em> : provider?.asked ? <em>{t.golive.asked}</em> : <button type="button" className="ob-btn small ghost" onClick={() => ask("provider")} disabled={busy}>{t.golive.ask}</button>)}
          {item(false, t.golive.team, t.golive.teamSub, <Link className="ob-btn small ghost" href="/app/team">{t.golive.invite}</Link>)}
          {way === "appointments" && state?.catalog && item(false, t.golive.catalog(state.catalog.section[lang === "ar" ? "name_ar" : "name"]), t.golive.catalogSub,
            <Link className="ob-btn small ghost" href="/app/catalog">{t.golive.open_}</Link>)}
        </ul>
      </>
    );
    actions = (
      <>
        <button className="ob-btn ghost" type="button" onClick={() => go("plan")}>{t.back}</button>
        <button className="ob-btn primary" type="button" disabled={busy} onClick={finish}>{t.golive.open}<Ico name="arrow" /></button>
      </>
    );
  } else if (step === "finished") {
    main = <><h1>{t.finished.title}</h1><p className="ob-sub">{t.finished.sub}</p></>;
    actions = <button className="ob-btn primary" type="button" onClick={() => router.push("/app")}>{t.finished.open}<Ico name="arrow" /></button>;
  }

  const showPreview = step !== "loading" && step !== "finished";
  const previewBody = step === "try"
    ? testChat
    : step === "plan" || step === "golive"
      ? (
        <div className="ob-summary">
          <span className="ob-avatar big">{initialsOf(shopName)}</span>
          <b>{shopShown}</b>
          <small>{[chosen?.name[lang], state?.business.area].filter(Boolean).join(" · ")}</small>
          {way === "appointments" && <small>{t.summary(rows.length, state?.business.reminders ?? true)}</small>}
        </div>
      )
      : <Chat name={shopShown} initials={initialsOf(shopName)} messages={preview} />;

  return (
    <div className={`ob${showPreview ? "" : " ob-solo"}`} dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <aside className="ob-rail">
        <Logo label="ALYR" className="ob-logo" />
        <ol className="ob-steps">
          {rail.map((key, i) => (
            <li key={key} className={i < current ? "done" : i === current ? "current" : ""} aria-current={i === current ? "step" : undefined}>
              <span className="ob-dot">{i < current && <Ico name="check" size={13} />}</span>
              {t.steps[key]}
            </li>
          ))}
        </ol>
        <div className="ob-help"><b><Ico name="chat" size={16} />{t.help}</b><small>{t.helpSub}</small></div>
        <button className="ob-lang" type="button" onClick={switchLang}>{t.lang}</button>
      </aside>

      <header className="ob-top">
        <Logo label="ALYR" className="ob-logo" />
        <div className="ob-progress" aria-hidden>{rail.map((key, i) => <span key={key} className={i < current ? "done" : i === current ? "current" : ""} />)}</div>
        <button className="ob-lang" type="button" onClick={switchLang}>{t.lang}</button>
      </header>

      <main className="ob-main">
        <div className="ob-content">{main}</div>
        {error && <p className="ob-error" role="alert">{error}</p>}
        <div className="ob-actions">{actions}</div>
      </main>

      {showPreview && (
        <aside className="ob-preview" aria-label={step === "try" ? t.liveLabel : t.previewLabel}>
          <p className="ob-kicker">{step === "try" ? t.liveLabel : t.previewLabel}</p>
          {previewBody}
        </aside>
      )}
    </div>
  );
}
