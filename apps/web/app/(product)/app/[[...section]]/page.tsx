"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Screens, type WorkspaceTab } from "../../_workspace/Screens";
import { TeamReport } from "../../_workspace/Team";
import { Catalog } from "../../_workspace/Catalog";
import { Documents } from "../../_workspace/Documents";
import { ConnectLink, ConnectSettings } from "../../_workspace/ConnectSettings";
import { AgentDashboard } from "../../../_agent/AgentDashboard";
import type { AgentView } from "../../../_agent/types";
import { color } from "../../../_tokens/tokens";
import "../../_workspace/shell.css";

type Text = { en: string; ar: string };
type NavItem = { key: string; label: Text; icon: string };
type Step = { key: string; label: Text; done: boolean; screen: string; connection: string; asked: boolean };
type Product = {
  key: string; name: Text; descriptor: Text; summary: Text;
  // included: every business has it (ALYR Agent); it has no switch.
  status: "active" | "available" | "included";
  modules: string[]; includes: { key: string; label: Text }[]; steps: Step[];
};
type Connection = { key: string; name: Text; detail: Text; connected: boolean; available: boolean };
type State = {
  business: { name: string; name_ar: string; slug: string };
  me: { name: string; role: string; signed_in: boolean };
  can_manage: boolean;
  modules: string[];
  nav: { core: NavItem[]; products: NavItem[]; account: NavItem[] };
  products: Product[];
  connections: Connection[];
  plan: { status: "preparing" | "published" | "accepted"; monthly_total_text?: string } | null;
};
type Card = { key: string; module: string; label: Text; value: number; text: string };
type Lang = "en" | "ar";
type Command = { id: string; group: string; label: string; icon: string; run: () => void };

const WORK_SCREENS: WorkspaceTab[] = ["inbox", "ledger", "orders", "bookings", "team"];
const LANG_KEY = "alyr-workspace-lang";

const T = {
  en: {
    loading: "Loading your workspace…", offline: "Cannot reach ALYR right now. This page will try again by itself.",
    signIn: "Sign in", signOut: "Sign out", demo: "Demo, not signed in",
    yourProducts: "Your products", account: "Account", add: "Add a product", lang: "ع",
    langName: "Switch to Arabic", search: "Search or jump to", searchFull: "Search screens and actions…",
    greet: (h: number) => (h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"),
    shopToday: (shop: string) => `Here is ${shop} today.`,
    today: "Today", open: "Open",
    setup: (name: string) => `Finish setting up ${name}`,
    setupSub: (done: number, total: number) => `${done} of ${total} steps done. Each one you finish switches more of it on.`,
    doIt: "Do it now", ask: "Ask ALYR", asked: "ALYR is on it", allSet: "Everything is set up",
    allSetSub: "Every product you use is ready for customers.",
    planReady: "Your ALYR price is ready",
    planReadySub: (amount: string) => `${amount} a month. Review it and accept it to go ahead.`,
    planReview: "Review and accept",
    productsTitle: "Products", productsEyebrow: "Your plan",
    productsSub: "Switch on what your business needs. Switching off hides the screens and keeps every record.",
    active: "Active", available: "Available", on: "On", off: "Off",
    included: "Included", includedNote: "Included for every business.",
    confirmOff: "Hide its screens from your team? Nothing is deleted.", keep: "Keep on", turnOff: "Switch off",
    managersOnly: "Only an owner or admin can change products.", includes: "Includes",
    connectionsTitle: "Connections", connectionsEyebrow: "Accounts",
    connectionsSub: "The accounts ALYR works through on your behalf.",
    connected: "Connected", notConnected: "Not connected", setUpWithAlyr: "Set up with ALYR",
    askSetup: "Ask ALYR to set it up",
    notOn: "This isn't switched on for your shop.", seeProducts: "See products",
    helpTitle: "ALYR team", helpOnline: "A person from ALYR reads every message.",
    helpHello: "What should we set up or change for you?",
    helpPlaceholder: "Write to ALYR…", send: "Send to ALYR",
    sentReply: "Sent to the ALYR team. We answer on WhatsApp or by email.",
    suggestions: ["Connect our WhatsApp number", "Add our services and prices", "Add a team member"],
    live: "WhatsApp live", sim: "Simulator", seeAll: "See all",
    go: "Go to", actions: "Actions", noMatch: "Nothing matches that.", navigate: "Move", choose: "Open", close: "Close",
    more: "More", doha: "Doha",
  },
  ar: {
    loading: "جارٍ تحميل مساحة العمل…", offline: "تعذّر الوصول إلى ALYR الآن. ستحاول الصفحة مجدداً تلقائياً.",
    signIn: "تسجيل الدخول", signOut: "تسجيل الخروج", demo: "عرض تجريبي",
    yourProducts: "منتجاتك", account: "الحساب", add: "أضف منتجاً", lang: "EN",
    langName: "التبديل إلى الإنجليزية", search: "ابحث أو انتقل إلى", searchFull: "ابحث في الشاشات والإجراءات…",
    greet: (h: number) => (h < 12 ? "صباح الخير" : "مساء الخير"),
    shopToday: (shop: string) => `هذا ${shop} اليوم.`,
    today: "اليوم", open: "افتح",
    setup: (name: string) => `أكمل إعداد ${name}`,
    setupSub: (done: number, total: number) => `أنجزت ${done} من ${total}. كل خطوة تفعّل جزءاً أكبر.`,
    doIt: "نفّذها الآن", ask: "اطلب من ALYR", asked: "ALYR تعمل عليها", allSet: "كل شيء جاهز",
    allSetSub: "كل منتج تستخدمه جاهز لعملائك.",
    planReady: "سعرك من ALYR جاهز",
    planReadySub: (amount: string) => `${amount} شهرياً. راجعه واقبله للمتابعة.`,
    planReview: "راجع واقبل",
    productsTitle: "المنتجات", productsEyebrow: "خطتك",
    productsSub: "فعّل ما يحتاجه عملك. الإيقاف يخفي الشاشات ويحفظ كل السجلات.",
    active: "مفعّل", available: "متاح", on: "مفعّل", off: "متوقف",
    included: "مشمول", includedNote: "مشمول لكل منشأة.",
    confirmOff: "إخفاء شاشاته عن فريقك؟ لن يُحذف شيء.", keep: "أبقِه", turnOff: "إيقاف",
    managersOnly: "تغيير المنتجات متاح للمالك أو المدير فقط.", includes: "يشمل",
    connectionsTitle: "الاتصالات", connectionsEyebrow: "الحسابات",
    connectionsSub: "الحسابات التي تعمل ALYR من خلالها نيابة عنك.",
    connected: "متصل", notConnected: "غير متصل", setUpWithAlyr: "تُعدّ مع ALYR",
    askSetup: "اطلب من ALYR إعداده",
    notOn: "هذا غير مفعّل لمتجرك.", seeProducts: "عرض المنتجات",
    helpTitle: "فريق ALYR", helpOnline: "يقرأ كل رسالة شخص من فريق ALYR.",
    helpHello: "ماذا نُعدّ أو نغيّر لك؟",
    helpPlaceholder: "اكتب إلى ALYR…", send: "أرسل إلى ALYR",
    sentReply: "أُرسلت إلى فريق ALYR. نرد عبر واتساب أو البريد.",
    suggestions: ["اربطوا رقم واتساب", "أضيفوا خدماتنا وأسعارنا", "أضيفوا عضواً للفريق"],
    live: "واتساب يعمل", sim: "المحاكي", seeAll: "عرض الكل",
    go: "انتقل إلى", actions: "إجراءات", noMatch: "لا نتائج.", navigate: "تنقّل", choose: "افتح", close: "إغلاق",
    more: "المزيد", doha: "الدوحة",
  },
};

// Module and product names come from the catalogue (`catalog.py`) through the API.
const MODULE_ICON: Record<string, string> = {
  inbox: "inbox", bookings: "calendar", orders: "receipt", payments: "card", ledger: "book",
};
const PRODUCT_ICON: Record<string, string> = {
  chat: "chat", bookings: "calendar", agent: "chart", accounts: "book", invoices: "doc",
};
const CONNECTION_ICON: Record<string, string> = { whatsapp: "chat", payments: "card" };

// An included product (ALYR Agent) is in use and looks it, though it has no switch.
const inUse = (p: Product) => p.status === "active" || p.status === "included";
const pillClass = (p: Product) => (p.status === "included" ? "active" : p.status);

const ICON: Record<string, string> = {
  home: "M4 11 12 4l8 7v9H4z M10 20v-5h4v5",
  inbox: "M4 5h16v10H14l-2 3-2-3H4z",
  calendar: "M5 5h14v15H5z M8 3v4 M16 3v4 M5 10h14",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6",
  book: "M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h10",
  apps: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z",
  catalog: "M4 4h7v8H4z M13 4h7v5h-7z M13 11h7v9h-7z M4 14h7v6H4z",
  doc: "M7 3h8l4 4v14H7z M15 3v4h4 M10 12h6 M10 16h6",
  plug: "M9 3v5 M15 3v5 M6 8h12v3a6 6 0 0 1-12 0z M12 17v4",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M3 21v-2a6 6 0 0 1 12 0v2 M16 4.5a3.5 3.5 0 0 1 0 6.5 M17 15a5 5 0 0 1 4 4.9V21",
  plus: "M12 5v14 M5 12h14",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z M20 20l-4-4",
  chat: "M4 5h16v11H10l-6 4z M8 10h8",
  card: "M3 6h18v12H3z M3 10h18 M7 14h4",
  chart: "M3 20h18 M6 20v-6 M11 20V8 M16 20v-9 M21 4l-5 4-5-3-5 5",
  wallet: "M4 7h15v12H4z M4 7l11-3v3 M15 13h2",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  out: "M14 4h6v16h-6 M10 8l-4 4 4 4 M6 12h10",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M3 12h18 M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z",
  send: "M4 12 20 4l-6 16-3-7z",
  enter: "M20 5v7H6 M10 8l-4 4 4 4",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
};

function Icon({ name, className = "sh-ico" }: { name: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {(ICON[name] ?? ICON.apps).split(" M").map((d, i) => <path key={i} d={i ? `M${d}` : d} />)}
    </svg>
  );
}

function Mark({ volt = color.brand.volt }: { volt?: string }) {
  return (
    <svg className="sh-mark" viewBox="0 0 190 160" aria-hidden="true">
      <polygon fill="currentColor" points="50,0 180,0 130,62 0,62" />
      <polygon fill="currentColor" points="0,72 126,72 39,160" />
      <polygon fill={volt} points="134,72 190,72 142,160 46,160" />
    </svg>
  );
}

function Tick() {
  return <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.5 5 9l4.5-6" /></svg>;
}

async function send(url: string, body?: object) {
  const response = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "A";
}

export default function WorkspaceShell() {
  const router = useRouter();
  const params = useParams<{ section?: string[] }>();
  const section = params.section?.[0] ?? "home";
  const [state, setState] = useState<State | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [agent, setAgent] = useState<AgentView | null>(null);
  const [agentRise, setAgentRise] = useState(false);
  // ALYR Agent's links open a screen filtered to the rows a rule counted (`?show=`).
  const [show, setShow] = useState<string | null>(null);
  const agentLoaded = useRef(false);
  const [offline, setOffline] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [langReady, setLangReady] = useState(false);
  // The language a person chose is kept on this device. Each screen of the workspace is a new
  // page component, so without it a card on the home screen (or any link inside ALYR Agent)
  // would send an Arabic reader back to English.
  useEffect(() => {
    const read = setTimeout(() => {
      try {
        const saved = localStorage.getItem(LANG_KEY);
        if (saved === "ar" || saved === "en") setLang(saved);
      } catch {
        // A browser that refuses storage starts in English every time.
      }
      setLangReady(true);
    }, 0);
    return () => clearTimeout(read);
  }, []);
  const chooseLang = useCallback((next: Lang) => {
    setLang(next);
    try { localStorage.setItem(LANG_KEY, next); } catch { /* not remembered */ }
  }, []);
  const [help, setHelp] = useState("");
  const [helpSent, setHelpSent] = useState("");
  const [confirming, setConfirming] = useState("");
  const [busy, setBusy] = useState("");
  const [clock, setClock] = useState<{ hour: number; text: string } | null>(null);
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const t = T[lang];
  const pick = useCallback((text: Text) => text[lang], [lang]);

  const load = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([
        fetch("/api/workspace", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())),
        fetch("/api/workspace/home", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())),
      ]);
      setState(s);
      setCards(h.cards);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 15_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [load]);

  // ALYR Agent on the home screen. A poll replaces the numbers and never re-animates them;
  // they rise once a session, on the first load.
  const loadAgent = useCallback(async () => {
    try {
      const response = await fetch(`/api/agent?lang=${lang}`, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const view: AgentView = await response.json();
      if (!agentLoaded.current) {
        agentLoaded.current = true;
        let first = false;
        try {
          first = !sessionStorage.getItem("alyr-agent-rose");
          sessionStorage.setItem("alyr-agent-rose", "1");
        } catch {
          first = false;
        }
        setAgentRise(first);
        // Once a session: a later remount (a language switch) does not rise again.
        if (first) setTimeout(() => setAgentRise(false), 1500);
      }
      setAgent(view);
    } catch {
      // The last numbers stay on screen; the shell's offline line says why.
    }
  }, [lang]);

  useEffect(() => {
    // Not before the saved language is known, or an Arabic reader would first be sent English.
    if (section !== "home" || !langReady) return;
    const first = setTimeout(loadAgent, 0);
    const timer = setInterval(loadAgent, 15_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [loadAgent, section, langReady]);

  useEffect(() => {
    const read = setTimeout(() => setShow(new URLSearchParams(window.location.search).get("show")), 0);
    return () => clearTimeout(read);
  }, [section]);

  async function notNow(key: string, fingerprint: string) {
    await send("/api/agent/not-now", { key, fingerprint });
    await loadAgent();
  }

  // Shop time is Doha time, whatever the laptop says.
  useEffect(() => {
    const tickClock = () => {
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Qatar", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).formatToParts(now);
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
      setClock({ hour: Number(get("hour")), text: `${get("weekday")} ${get("day")} ${get("month")} · ${get("hour")}:${get("minute")}` });
    };
    const first = setTimeout(tickClock, 0);
    const timer = setInterval(tickClock, 30_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((open) => !open);
        setQuery("");
        setCursor(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function setProduct(product: Product, on: boolean) {
    setBusy(product.key);
    try {
      await send(`/api/workspace/products/${product.key}/${on ? "enable" : "disable"}`);
      setConfirming("");
      await load();
    } finally {
      setBusy("");
    }
  }

  async function ask(productKey: string, stepKey: string, note = "") {
    await send("/api/workspace/setup-requests", { product: productKey, step: stepKey, note });
    load();
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const allNav = useMemo(
    () => (state ? [...state.nav.core, ...state.nav.products, ...state.nav.account] : []),
    [state],
  );

  const commands: Command[] = useMemo(() => {
    const list: Command[] = allNav.map((item) => ({
      id: `go-${item.key}`, group: t.go, label: pick(item.label), icon: item.icon,
      run: () => router.push(item.key === "home" ? "/app" : `/app/${item.key}`),
    }));
    list.push(
      { id: "ask", group: t.actions, label: t.ask, icon: "chat", run: () => router.push("/app#ask") },
      { id: "lang", group: t.actions, label: t.langName, icon: "globe", run: () => chooseLang(lang === "en" ? "ar" : "en") },
    );
    if (state?.me.signed_in) list.push({ id: "out", group: t.actions, label: t.signOut, icon: "out", run: signOut });
    return list;
    // signOut only uses router, which is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allNav, lang, pick, router, state?.me.signed_in, t]);

  const matches = commands.filter((c) => c.label.toLowerCase().includes(query.trim().toLowerCase()));

  function runCommand(command: Command | undefined) {
    if (!command) return;
    setPalette(false);
    command.run();
  }

  if (!state) {
    return <div className="sh-empty">{offline ? t.offline : t.loading}</div>;
  }

  const enabledScreens = new Set(allNav.map((n) => n.key));
  const shopName = lang === "ar" && state.business.name_ar ? state.business.name_ar : state.business.name;
  const pending = state.products.filter((p) => p.status === "active" && p.steps.some((s) => !s.done));
  const whatsapp = state.connections.find((c) => c.key === "whatsapp");
  // The connection screen (ALY-142) lives under Connections in the breadcrumb.
  const current = allNav.find((n) => n.key === section)
    ?? (section === "connect" ? allNav.find((n) => n.key === "connections") : undefined);
  const documentsOn = state.modules.includes("documents");
  const activeProducts = state.products.filter((p) => p.status === "active");
  const roleLabel = state.me.signed_in ? state.me.role.charAt(0).toUpperCase() + state.me.role.slice(1) : t.demo;

  const navLink = (item: NavItem) => {
    const count = item.key === "inbox" ? cards.find((c) => c.key === "unanswered")?.value ?? 0 : 0;
    return (
      <Link key={item.key} href={item.key === "home" ? "/app" : `/app/${item.key}`}
        className={`sh-link ${section === item.key ? "on" : ""}`} aria-current={section === item.key ? "page" : undefined}>
        <Icon name={item.icon} />{pick(item.label)}
        {count > 0 && <span className="sh-count num">{count}</span>}
      </Link>
    );
  };

  const stepAction = (product: Product, step: Step) => {
    if (step.done) return null;
    if (step.screen && enabledScreens.has(step.screen)) {
      return <Link className="btn small" href={`/app/${step.screen}`}>{t.doIt}<Icon name="arrow" className="sh-ico arrow" /></Link>;
    }
    if (step.asked) return <span className="sh-pill wait">{t.asked}</span>;
    return <button className="btn small" onClick={() => ask(product.key, step.key)}>{t.ask}</button>;
  };

  const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

  // The full setup checklist leads only while nothing has happened yet, and only for people
  // who can act on it; after that it is one row in "Needs you now" (05-critique P1-2).
  const setupTiles = state.can_manage && (!agent || agent.state === "empty")
    ? pending.map((product) => {
      const done = product.steps.filter((s) => s.done).length;
      const total = product.steps.length;
      return (
        <section key={product.key} className="sh-tile raised folded sh-setup sh-home-row" aria-label={t.setup(pick(product.name))} style={stagger(0)}>
          <div className="sh-gauge" style={{ "--p": (done / total) * 100 } as React.CSSProperties}>
            <b className="num" dir="ltr">{done}<small>/{total}</small></b>
          </div>
          <div className="sh-setup-head">
            <span className="sh-eyebrow">{pick(product.name)}</span>
            <h2>{t.setup(pick(product.name))}</h2>
            <p>{t.setupSub(done, total)}</p>
          </div>
          <ul className="sh-steps">
            {product.steps.map((step) => (
              <li key={step.key} className={step.done ? "done" : ""}>
                <span className="sh-check"><Tick /></span>
                <span className="sh-step">{pick(step.label)}</span>
                {stepAction(product, step)}
              </li>
            ))}
          </ul>
        </section>
      );
      })
    : null;

  let body: React.ReactNode;
  if (section === "home") {
    body = (
      <>
        {state.plan?.status === "published" && (
          <section className="sh-tile raised sh-allset sh-plan-ready sh-home-row" style={stagger(0)}>
            <span className="sh-check"><Tick /></span>
            <div><h2>{t.planReady}</h2><p className="sh-note">{t.planReadySub(state.plan.monthly_total_text ?? "")}</p></div>
            <Link className="btn small" href="/start">{t.planReview}<Icon name="arrow" className="sh-ico arrow" /></Link>
          </section>
        )}
        {agent ? (
          <AgentDashboard view={agent} link={Link} animate={agentRise} onNotNow={state.can_manage ? notNow : undefined}
            stale={offline ? `${t.offline} ${agent.header.updated}` : null} setup={setupTiles} />
        ) : (
          <>
            {setupTiles}
            <p className="sh-note">{offline ? t.offline : t.loading}</p>
          </>
        )}

        <section id="ask" className="sh-tile sh-ask sh-home-ask">
          <div className="sh-ask-head">
            <span className="sh-avatar"><Mark volt={color.brand.volt} /></span>
            <div><b>{t.helpTitle}</b><small>{t.helpOnline}</small></div>
          </div>
          {/* No chat bubbles and no read ticks: nobody has answered yet, and no reply time is
              promised (05-critique P0-4). */}
          <p className="sh-ask-prompt">{t.helpHello}</p>
          {helpSent ? (
            <p className="sh-ask-sent" role="status">{t.sentReply}</p>
          ) : (
            <div className="sh-suggest">
              {t.suggestions.map((s) => <button key={s} type="button" onClick={() => setHelp(s)}>{s}</button>)}
            </div>
          )}
          <form className="sh-composer" onSubmit={async (e) => {
            e.preventDefault();
            const note = help.trim();
            if (!note) return;
            await ask("chat", "help", note);
            setHelp("");
            setHelpSent(note);
          }}>
            <input value={help} onChange={(e) => setHelp(e.target.value)} placeholder={t.helpPlaceholder}
              aria-label={t.helpPlaceholder} dir="auto" maxLength={500} />
            <button className="sh-send" type="submit" disabled={!help.trim()} aria-label={t.send}><Icon name="send" /></button>
          </form>
        </section>
      </>
    );
  } else if (section === "products") {
    body = (
      <>
        <header className="sh-head" style={stagger(0)}>
          <span className="sh-eyebrow">{t.productsEyebrow} · {activeProducts.length} {t.active.toLowerCase()}</span>
          <h1>{current ? pick(current.label) : t.productsTitle}</h1>
          <p>{t.productsSub}</p>
        </header>
        {!state.can_manage && <p className="sh-note">{t.managersOnly}</p>}
        <ul className="sh-products" style={stagger(1)}>
          {state.products.map((product) => {
            const on = product.status === "active";
            return (
              <li key={product.key} className={`sh-product ${pillClass(product)}`}>
                <div className="sh-product-top">
                  <span className={`sh-glyph ${inUse(product) ? "" : "idle"}`}><Icon name={PRODUCT_ICON[product.key] ?? "apps"} /></span>
                  <span className={`sh-pill ${pillClass(product)}`}>{t[product.status]}</span>
                </div>
                <div>
                  <span className="sh-eyebrow">{pick(product.descriptor)}</span>
                  <h2>{pick(product.name)}</h2>
                  <p>{pick(product.summary)}</p>
                </div>
                <div className="sh-modules" aria-label={t.includes}>
                  {product.includes.map((part) => (
                    <span key={part.key || part.label.en}>
                      <Icon name={MODULE_ICON[part.key] ?? PRODUCT_ICON[product.key] ?? "apps"} />{pick(part.label)}
                    </span>
                  ))}
                </div>
                <div className="sh-product-foot">
                  {product.status === "included" ? <span className="sh-note">{t.includedNote}</span>
                    : confirming === product.key ? (
                      <div className="sh-confirm" role="alertdialog" aria-label={t.confirmOff}>
                        <span>{t.confirmOff}</span>
                        <button className="btn small" onClick={() => setConfirming("")}>{t.keep}</button>
                        <button className="btn small danger" disabled={busy === product.key} onClick={() => setProduct(product, false)}>{t.turnOff}</button>
                      </div>
                    ) : (
                      <label className="sh-switch-row">
                        <button type="button" role="switch" className="sh-switch" aria-checked={on}
                          aria-label={pick(product.name)} disabled={!state.can_manage || busy === product.key}
                          onClick={() => (on ? setConfirming(product.key) : setProduct(product, true))} />
                        {on ? t.on : t.off}
                      </label>
                    )}
                </div>
              </li>
            );
          })}
        </ul>
      </>
    );
  } else if (section === "connections") {
    body = (
      <>
        <header className="sh-head" style={stagger(0)}>
          <span className="sh-eyebrow">{t.connectionsEyebrow}</span>
          <h1>{t.connectionsTitle}</h1>
          <p>{t.connectionsSub}</p>
        </header>
        <ul className="sh-conns" style={stagger(1)}>
          {state.connections.map((c) => {
            const needer = state.products.find((p) => p.steps.some((s) => s.connection === c.key));
            const step = needer?.steps.find((s) => s.connection === c.key);
            return (
              <li key={c.key} className={`sh-conn ${c.connected ? "on" : ""}`}>
                <span className="sh-glyph"><Icon name={CONNECTION_ICON[c.key] ?? "plug"} /></span>
                <div className="sh-conn-text">
                  <h2>{pick(c.name)} <span className={`sh-pill ${c.connected ? "active" : "idle"}`}>
                    {c.connected ? t.connected : c.available ? t.notConnected : t.setUpWithAlyr}</span></h2>
                  <p>{pick(c.detail)}</p>
                </div>
                {!c.connected && needer && step && (step.asked
                  ? <span className="sh-pill wait">{t.asked}</span>
                  : <button className="btn" onClick={() => ask(needer.key, step.key)}>{t.askSetup}</button>)}
              </li>
            );
          })}
        </ul>
        {documentsOn && state.can_manage && (
          <ConnectLink lang={lang} href="/app/connect" icon={<Icon name="plug" />} arrow={<Icon name="arrow" className="sh-ico" />} />
        )}
      </>
    );
  } else if (section === "connect" && documentsOn) {
    body = <ConnectSettings lang={lang} canManage={state.can_manage} />;
  } else if (section === "catalog" && enabledScreens.has("catalog")) {
    // Named by the shop's type of business: Menu, Products, Price list (D-039, ALY-107).
    body = <Catalog lang={lang} title={current ? pick(current.label) : t.productsTitle} show={show} onRenamed={() => void load()} />;
  } else if (section === "documents" && enabledScreens.has("documents")) {
    body = <Documents lang={lang} title={current ? pick(current.label) : t.productsTitle} show={show} />;
  } else if ((WORK_SCREENS as string[]).includes(section) && enabledScreens.has(section)) {
    body = (
      <Screens embedded section={section as WorkspaceTab} lang={lang} show={show}
        onClearShow={() => { setShow(null); router.replace(`/app/${section}`); }}
        intro={section === "team"
          ? <TeamReport lang={lang} canManage={state.can_manage} signer={state.me.signed_in ? state.me.name : "Ali"} />
          : undefined} />
    );
  } else {
    body = (
      <div className="sh-empty-inline">
        <p>{t.notOn}</p>
        {state.can_manage && <Link className="btn primary" href="/app/products">{t.seeProducts}</Link>}
      </div>
    );
  }

  const tabs = [...state.nav.core, ...state.nav.products].slice(0, 4);
  let lastGroup = "";

  return (
    <div className="sh" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <aside className="sh-side">
        <div className="sh-brand">
          <Mark />
          <span className="sh-brand-text"><b>{shopName}</b><small>ALYR</small></span>
        </div>
        <button className="sh-search" onClick={() => { setPalette(true); setQuery(""); setCursor(0); }}>
          <Icon name="search" /><span>{t.search}</span><kbd className="sh-kbd">Ctrl K</kbd>
        </button>
        <nav aria-label={shopName}>
          {state.nav.core.map(navLink)}
          {state.nav.products.length > 0 && <span className="sh-group">{t.yourProducts}</span>}
          {state.nav.products.map(navLink)}
          {state.can_manage && (
            <Link href="/app/products" className="sh-link sh-add"><Icon name="plus" />{t.add}</Link>
          )}
          <span className="sh-group">{t.account}</span>
          {state.nav.account.map(navLink)}
        </nav>
        <div className="sh-foot">
          <span className="sh-avatar">{initials(state.me.signed_in ? state.me.name : shopName)}</span>
          <span className="sh-me"><b>{state.me.signed_in ? state.me.name : shopName}</b><small>{roleLabel}</small></span>
          <button className="sh-lang" onClick={() => chooseLang(lang === "en" ? "ar" : "en")} aria-label={t.langName}>{t.lang}</button>
          {state.me.signed_in
            ? <button className="sh-iconbtn" onClick={signOut} aria-label={t.signOut} title={t.signOut}><Icon name="out" /></button>
            : <a className="sh-iconbtn" href="/login" aria-label={t.signIn} title={t.signIn}><Icon name="out" /></a>}
        </div>
      </aside>

      <div className="sh-sheet">
        <header className="sh-top">
          <div className="sh-crumbs">
            <span>{shopName}</span><i>/</i><b>{current ? pick(current.label) : t.productsTitle}</b>
          </div>
          <span className="spacer" />
          {clock && <span className="sh-clock" dir="ltr">{t.doha} {clock.text.split(" · ")[1]}</span>}
          <span className={`sh-live ${whatsapp?.connected ? "on" : ""}`}><span className="sh-dot" />{whatsapp?.connected ? t.live : t.sim}</span>
        </header>
        <header className="sh-mtop">
          <Mark />
          <span className="sh-brand-text"><b>{shopName}</b><small>{current ? pick(current.label) : "ALYR"}</small></span>
          <span className={`sh-live ${whatsapp?.connected ? "on" : ""}`}><span className="sh-dot" />{whatsapp?.connected ? t.live : t.sim}</span>
          <button className="sh-iconbtn" onClick={() => { setPalette(true); setQuery(""); setCursor(0); }} aria-label={t.search}><Icon name="search" /></button>
        </header>
        <div className="sh-scroll">
          <main className="sh-main sh-enter" key={`${section}-${lang}`}>
            {offline && <div className="error" role="status">{t.offline}</div>}
            {body}
          </main>
        </div>
      </div>

      <nav className="sh-tabbar" aria-label={shopName}>
        {tabs.map((item) => (
          <Link key={item.key} href={item.key === "home" ? "/app" : `/app/${item.key}`} className={section === item.key ? "on" : ""}>
            <Icon name={item.icon} /><span>{pick(item.label)}</span>
          </Link>
        ))}
        <button onClick={() => { setPalette(true); setQuery(""); setCursor(0); }}><Icon name="more" /><span>{t.more}</span></button>
      </nav>

      {palette && (
        <div className="sh-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setPalette(false); }}>
          <div className="sh-palette" role="dialog" aria-modal="true" aria-label={t.searchFull}>
            <div className="sh-palette-in">
              <Icon name="search" />
              <input autoFocus value={query} placeholder={t.searchFull} aria-label={t.searchFull}
                onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setPalette(false);
                  else if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, matches.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
                  else if (e.key === "Enter") { e.preventDefault(); runCommand(matches[cursor]); }
                }} />
              <kbd className="sh-kbd">Esc</kbd>
            </div>
            <ul role="listbox">
              {matches.length === 0 && <li className="none">{t.noMatch}</li>}
              {matches.map((command, i) => {
                const header = command.group !== lastGroup ? command.group : "";
                lastGroup = command.group;
                return (
                  <li key={command.id}>
                    {header && <div className="grp">{header}</div>}
                    <button role="option" aria-selected={i === cursor} onMouseEnter={() => setCursor(i)} onClick={() => runCommand(command)}>
                      <Icon name={command.icon} />{command.label}<Icon name="enter" className="sh-ico ret" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="sh-palette-foot">
              <span><kbd className="sh-kbd">↑↓</kbd>{t.navigate}</span>
              <span><kbd className="sh-kbd">Enter</kbd>{t.choose}</span>
              <span><kbd className="sh-kbd">Esc</kbd>{t.close}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
