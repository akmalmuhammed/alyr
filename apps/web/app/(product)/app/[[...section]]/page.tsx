"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Screens, type WorkspaceTab } from "../../_workspace/Screens";
import "../../_workspace/shell.css";

type Text = { en: string; ar: string };
type NavItem = { key: string; label: Text; icon: string };
type Step = { key: string; label: Text; done: boolean; screen: string; connection: string; asked: boolean };
type Product = { key: string; name: Text; summary: Text; status: "active" | "available" | "coming"; modules: string[]; steps: Step[] };
type Connection = { key: string; name: Text; detail: Text; connected: boolean; available: boolean };
type State = {
  business: { name: string; name_ar: string; slug: string };
  me: { name: string; role: string; signed_in: boolean };
  can_manage: boolean;
  modules: string[];
  nav: { core: NavItem[]; products: NavItem[]; account: NavItem[] };
  products: Product[];
  connections: Connection[];
};
type Card = { key: string; module: string; label: Text; value: number; text: string };
type Lang = "en" | "ar";

const WORK_SCREENS: WorkspaceTab[] = ["inbox", "ledger", "orders", "bookings", "team"];

const T = {
  en: {
    loading: "Loading your workspace…", offline: "Cannot reach ALYR right now. This page will try again by itself.",
    signIn: "Sign in", signOut: "Sign out", openDemo: "Open demo, not signed in",
    yourProducts: "Your products", account: "Account", add: "Add a product", lang: "العربية",
    hello: (name: string) => `Hello, ${name}`, today: "Today",
    setup: (name: string, done: number, total: number) => `Finish setting up ${name} · ${done} of ${total} done`,
    doIt: "Do it now", ask: "Ask ALYR", asked: "ALYR is on it", allSet: "Everything is set up.",
    productsTitle: "Products", productsSub: "Switch on what your business needs. Your records are kept if you switch something off.",
    active: "Active", available: "Available", coming: "Coming", turnOn: "Switch on", turnOff: "Switch off",
    confirmOff: (name: string) => `Switch off ${name}? Its screens disappear for your team. Nothing is deleted.`,
    managersOnly: "Only an owner or admin can change products.",
    connectionsTitle: "Connections", connectionsSub: "The accounts ALYR works through for you.",
    connected: "Connected", notConnected: "Not connected", notYet: "Not available yet",
    askSetup: "Ask ALYR to set it up",
    notOn: "This isn't switched on for your shop.", seeProducts: "See products",
    helpTitle: "Need a hand?", helpBody: "Tell us what you need and a person from ALYR will do it with you.",
    helpPlaceholder: "What should we help with?", send: "Send to ALYR", sent: "Sent. We will reply on WhatsApp or by email.",
  },
  ar: {
    loading: "جارٍ تحميل مساحة العمل…", offline: "تعذّر الوصول إلى ALYR الآن. ستحاول الصفحة مجدداً تلقائياً.",
    signIn: "تسجيل الدخول", signOut: "تسجيل الخروج", openDemo: "عرض تجريبي دون تسجيل دخول",
    yourProducts: "منتجاتك", account: "الحساب", add: "أضف منتجاً", lang: "English",
    hello: (name: string) => `أهلاً، ${name}`, today: "اليوم",
    setup: (name: string, done: number, total: number) => `أكمل إعداد ${name} · ${done} من ${total}`,
    doIt: "نفّذها الآن", ask: "اطلب من ALYR", asked: "ALYR تعمل عليها", allSet: "كل شيء جاهز.",
    productsTitle: "المنتجات", productsSub: "فعّل ما يحتاجه عملك. تبقى سجلاتك محفوظة إذا أوقفت أي منتج.",
    active: "مفعّل", available: "متاح", coming: "قريباً", turnOn: "تفعيل", turnOff: "إيقاف",
    confirmOff: (name: string) => `إيقاف ${name}؟ ستختفي شاشاته عن فريقك، ولن يُحذف شيء.`,
    managersOnly: "تغيير المنتجات متاح للمالك أو المدير فقط.",
    connectionsTitle: "الاتصالات", connectionsSub: "الحسابات التي تعمل ALYR من خلالها نيابة عنك.",
    connected: "متصل", notConnected: "غير متصل", notYet: "غير متاح بعد",
    askSetup: "اطلب من ALYR إعداده",
    notOn: "هذا غير مفعّل لمتجرك.", seeProducts: "عرض المنتجات",
    helpTitle: "تحتاج مساعدة؟", helpBody: "أخبرنا بما تحتاجه وسيعمل معك شخص من ALYR.",
    helpPlaceholder: "بماذا نساعدك؟", send: "أرسل إلى ALYR", sent: "تم الإرسال. سنرد عبر واتساب أو البريد.",
  },
};

const ICON: Record<string, string> = {
  home: "M4 11 12 4l8 7v9H4z M10 20v-5h4v5",
  inbox: "M4 5h16v10H14l-2 3-2-3H4z",
  calendar: "M5 4h14v16H5z M8 2v4 M16 2v4 M5 9h14",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6",
  book: "M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h10",
  apps: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z",
  plug: "M9 3v5 M15 3v5 M6 8h12v3a6 6 0 0 1-12 0z M12 17v4",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M3 21v-2a6 6 0 0 1 12 0v2 M16 4.5a3.5 3.5 0 0 1 0 6.5 M17 15a5 5 0 0 1 4 4.9V21",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7 M12 17h.01",
  plus: "M12 5v14 M5 12h14",
};

function Icon({ name }: { name: string }) {
  return (
    <svg className="sh-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="square" strokeLinejoin="miter">
      {(ICON[name] ?? ICON.apps).split(" M").map((d, i) => <path key={i} d={i ? `M${d}` : d} />)}
    </svg>
  );
}

function Mark() {
  return (
    <svg className="sh-mark" viewBox="0 0 190 160" aria-hidden="true">
      <polygon fill="currentColor" points="50,0 180,0 130,62 0,62" />
      <polygon fill="currentColor" points="0,72 126,72 39,160" />
      <polygon fill="#B7F34A" points="134,72 190,72 142,160 46,160" />
    </svg>
  );
}

async function send(url: string, body?: object) {
  const response = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

export default function WorkspaceShell() {
  const router = useRouter();
  const params = useParams<{ section?: string[] }>();
  const section = params.section?.[0] ?? "home";
  const [state, setState] = useState<State | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [offline, setOffline] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [help, setHelp] = useState("");
  const [helpSent, setHelpSent] = useState(false);
  const t = T[lang];
  const pick = (text: Text) => text[lang];

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

  async function toggle(product: Product) {
    if (product.status === "active" && !window.confirm(t.confirmOff(pick(product.name)))) return;
    await send(`/api/workspace/products/${product.key}/${product.status === "active" ? "disable" : "enable"}`);
    load();
  }

  async function ask(productKey: string, stepKey: string, note = "") {
    await send("/api/workspace/setup-requests", { product: productKey, step: stepKey, note });
    load();
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (!state) {
    return <div className="sh-empty">{offline ? t.offline : t.loading}</div>;
  }

  const enabledScreens = new Set(
    [...state.nav.core, ...state.nav.products, ...state.nav.account].map((n) => n.key),
  );
  const shopName = lang === "ar" && state.business.name_ar ? state.business.name_ar : state.business.name;
  const pending = state.products.filter((p) => p.status === "active" && p.steps.some((s) => !s.done));

  const navLink = (item: NavItem) => (
    <Link key={item.key} href={item.key === "home" ? "/app" : `/app/${item.key}`}
      className={`sh-link ${section === item.key ? "on" : ""}`} aria-current={section === item.key ? "page" : undefined}>
      <Icon name={item.icon} />{pick(item.label)}
    </Link>
  );

  const stepAction = (product: Product, step: Step) => {
    if (step.done) return null;
    if (step.screen && enabledScreens.has(step.screen)) {
      return <Link className="btn small" href={`/app/${step.screen}`}>{t.doIt}</Link>;
    }
    if (step.asked) return <span className="sh-pill wait">{t.asked}</span>;
    return <button className="btn small" onClick={() => ask(product.key, step.key)}>{t.ask}</button>;
  };

  let body: React.ReactNode;
  if (section === "home") {
    body = (
      <>
        <header className="sh-head">
          <h1>{t.hello(state.me.name)}</h1>
          <p>{shopName} · {t.today}</p>
        </header>
        {pending.map((product) => {
          const done = product.steps.filter((s) => s.done).length;
          return (
            <section key={product.key} className="sh-setup" aria-label={t.setup(pick(product.name), done, product.steps.length)}>
              <h2>{t.setup(pick(product.name), done, product.steps.length)}</h2>
              <div className="sh-bar"><span style={{ width: `${(done / product.steps.length) * 100}%` }} /></div>
              <ul>
                {product.steps.map((step) => (
                  <li key={step.key} className={step.done ? "done" : ""}>
                    <span className="sh-check" aria-hidden="true" />
                    <span className="sh-step">{pick(step.label)}</span>
                    {stepAction(product, step)}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {pending.length === 0 && <p className="sh-note">{t.allSet}</p>}
        <section className="sh-cards">
          {cards.map((card) => (
            <div key={card.key} className="sh-card">
              <span>{pick(card.label)}</span>
              <b className="num" dir="ltr">{card.text}</b>
            </div>
          ))}
        </section>
        <section className="sh-help">
          <h2>{t.helpTitle}</h2>
          <p>{t.helpBody}</p>
          {helpSent ? <p className="sh-note">{t.sent}</p> : (
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!help.trim()) return;
              await ask("chat", "help", help);
              setHelp("");
              setHelpSent(true);
            }}>
              <input value={help} onChange={(e) => setHelp(e.target.value)} placeholder={t.helpPlaceholder}
                aria-label={t.helpPlaceholder} dir="auto" maxLength={500} />
              <button className="btn primary" type="submit">{t.send}</button>
            </form>
          )}
        </section>
      </>
    );
  } else if (section === "products") {
    body = (
      <>
        <header className="sh-head"><h1>{t.productsTitle}</h1><p>{t.productsSub}</p></header>
        {!state.can_manage && <p className="sh-note">{t.managersOnly}</p>}
        <ul className="sh-products">
          {state.products.map((product) => (
            <li key={product.key} className={product.status}>
              <div>
                <h2>{pick(product.name)} <span className={`sh-pill ${product.status}`}>{t[product.status]}</span></h2>
                <p>{pick(product.summary)}</p>
              </div>
              {state.can_manage && product.status !== "coming" && (
                <button className={`btn ${product.status === "active" ? "" : "primary"}`} onClick={() => toggle(product)}>
                  {product.status === "active" ? t.turnOff : t.turnOn}
                </button>
              )}
            </li>
          ))}
        </ul>
      </>
    );
  } else if (section === "connections") {
    body = (
      <>
        <header className="sh-head"><h1>{t.connectionsTitle}</h1><p>{t.connectionsSub}</p></header>
        <ul className="sh-products">
          {state.connections.map((c) => {
            const needer = state.products.find((p) => p.steps.some((s) => s.connection === c.key));
            const asked = needer?.steps.find((s) => s.connection === c.key)?.asked;
            return (
              <li key={c.key}>
                <div>
                  <h2>{pick(c.name)} <span className={`sh-pill ${c.connected ? "active" : "coming"}`}>
                    {c.connected ? t.connected : c.available ? t.notConnected : t.notYet}</span></h2>
                  <p>{pick(c.detail)}</p>
                </div>
                {!c.connected && needer && (asked
                  ? <span className="sh-pill wait">{t.asked}</span>
                  : <button className="btn" onClick={() => ask(needer.key, needer.steps.find((s) => s.connection === c.key)!.key)}>{t.askSetup}</button>)}
              </li>
            );
          })}
        </ul>
      </>
    );
  } else if ((WORK_SCREENS as string[]).includes(section) && enabledScreens.has(section)) {
    body = <Screens embedded section={section as WorkspaceTab} lang={lang} />;
  } else {
    body = (
      <div className="sh-empty-inline">
        <p>{t.notOn}</p>
        {state.can_manage && <Link className="btn primary" href="/app/products">{t.seeProducts}</Link>}
      </div>
    );
  }

  return (
    <div className="sh" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <aside className="sh-side">
        <div className="sh-brand"><Mark /><span>{shopName}</span></div>
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
          <button className="btn small" onClick={() => setLang(lang === "en" ? "ar" : "en")}>{t.lang}</button>
          {state.me.signed_in
            ? <button className="btn small" onClick={signOut}>{t.signOut}</button>
            : <a className="btn small" href="/login">{t.signIn}</a>}
        </div>
      </aside>
      <main className="sh-main">
        {offline && <div className="error" role="status">{t.offline}</div>}
        {body}
      </main>
    </div>
  );
}
