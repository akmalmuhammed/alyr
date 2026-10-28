"use client";

// The order page as it was before the Catalog (ALY-73), for a shop that has not switched the
// Catalog on: a list of what is for sale, by category, with + and - and a bar at the bottom.
// Same pages, same steps, same look. Two things changed because they had to: the customer
// is identified by the signed token in their link (`?t=`) and not by their bare contact ID
// (`core/links.py`), and amounts are written the way the page's language writes them
// («24 ر.ق» in Arabic, never "QAR"), which Qatar's consumer-protection law asks for.

import { useMemo, useState } from "react";
import { Done, Frame, Glyph, Who } from "../Frame";
import { formatPrice, type Lang } from "../price";
import type { Item, Placed, Store } from "./types";

type Props = { slug: string; token: string | null; initial: Store; lang: Lang };

const T = {
  en: {
    context: "Order", title: "What would you like?", eyebrow: "Order from your chat",
    hello: (n: string) => <>Ordering as <b>{n}</b></>,
    noCustomer: "Open this page from the link in your chat so we know who is ordering.",
    items: (n: number) => `${n} ${n === 1 ? "item" : "items"}`, pay: (amount: string) => `Pay ${amount}`, placeOrder: "Place order",
    account: "Put it on my account", placed: (n: number) => `Order #${n} received`,
    onAccount: "It has been added to your account.",
    backToChat: "You can go back to WhatsApp. We will message you as your order moves along.",
    track: "Track this order", failed: "The order could not be placed. Please try again.",
    add: "Add", remove: "Remove one", more: "Add one",
  },
  ar: {
    context: "طلب", title: "ماذا تود أن تطلب؟", eyebrow: "طلب من المحادثة",
    hello: (n: string) => <>الطلب باسم <b>{n}</b></>,
    noCustomer: "افتح هذه الصفحة من الرابط في المحادثة لنعرف صاحب الطلب.",
    items: (n: number) => `${n} صنف`, pay: (amount: string) => `ادفع ${amount}`, placeOrder: "أرسل الطلب",
    account: "سجّله على حسابي", placed: (n: number) => `تم استلام الطلب رقم ${n}`,
    onAccount: "تمت إضافته إلى حسابك.",
    backToChat: "يمكنك العودة إلى واتساب. سنراسلك عند كل تحديث لطلبك.",
    track: "تتبّع هذا الطلب", failed: "تعذّر إرسال الطلب. حاول مرة أخرى.",
    add: "أضف", remove: "إزالة واحد", more: "إضافة واحد",
  },
};

export default function LegacyOrder({ slug, token, initial, lang: first }: Props) {
  const store = initial;
  const [cart, setCart] = useState<Record<string, number>>({});
  const [lang, setLang] = useState<Lang>(first);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [placed, setPlaced] = useState<Placed | null>(null);
  const t = T[lang];

  const categories = useMemo(() => {
    const groups = new Map<string, Item[]>();
    for (const p of store.items.filter((i) => i.orderable)) groups.set(p.category, [...(groups.get(p.category) ?? []), p]);
    return [...groups.entries()];
  }, [store]);

  const products = store.items.filter((i) => i.orderable);
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const total = products.reduce((sum, p) => sum + p.price * (cart[p.id] ?? 0), 0);

  function change(id: string, by: number) {
    setCart((c) => {
      const next = Math.max(0, Math.min(999, (c[id] ?? 0) + by));
      const copy = { ...c, [id]: next };
      if (!next) delete copy[id];
      return copy;
    });
  }

  async function checkout(payment: "link" | "account") {
    if (!token) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/store/${slug}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token, payment,
        items: Object.entries(cart).map(([product_id, quantity]) => ({ product_id, quantity })),
      }),
    }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    setBusy(false);
    if (!response || !response.ok) {
      const detail = data?.detail;
      setError((lang === "ar" ? detail?.message_ar : detail?.message) ?? t.failed);
      return;
    }
    if (data.pay_url) {
      window.location.href = data.pay_url;
      return;
    }
    setPlaced(data);
  }

  const shop = lang === "ar" && store.shop.name_ar ? store.shop.name_ar : store.shop.name;
  const toggle = () => setLang(lang === "en" ? "ar" : "en");

  if (placed) {
    return (
      <Frame lang={lang} onLang={toggle} shop={shop} context={t.context} short>
        <Done title={t.placed(placed.number)}>
          <p><b className="num"><bdi>{formatPrice(placed.total, lang)}</bdi></b> · {t.onAccount}</p>
          <p>{t.backToChat}</p>
        </Done>
        {placed.track_url && (
          <a className="cx-btn ink" href={new URL(placed.track_url).pathname}>{t.track}<Glyph name="arrow" className="flip" /></a>
        )}
      </Frame>
    );
  }

  return (
    <Frame lang={lang} onLang={toggle} shop={shop} context={t.context}>
      <section className="cx-hero" style={{ "--i": 0 } as React.CSSProperties}>
        <span className="cx-eyebrow">{t.eyebrow}</span>
        <h1>{t.title}</h1>
        {store.customer ? <Who label={t.hello(store.customer.name)} /> : <p className="cx-warn">{t.noCustomer}</p>}
      </section>

      {categories.length > 1 && (
        <nav className="cx-cats" aria-label={t.title} style={{ "--i": 1 } as React.CSSProperties}>
          {categories.map(([category], i) => <a key={category} href={`#cat-${i}`}>{category}</a>)}
        </nav>
      )}

      {categories.map(([category, list], i) => (
        <section key={category} id={`cat-${i}`} className="cx-section" style={{ "--i": i + 2, scrollMarginTop: 120 } as React.CSSProperties}>
          <h2>{category}</h2>
          <div className="cx-card">
            {list.map((p) => (
              <div key={p.id} className="cx-row">
                <div className="cx-row-text">
                  <b>{lang === "ar" && p.name_ar ? p.name_ar : p.name}</b>
                  <span className="num"><bdi>{formatPrice(p.price, lang)}</bdi></span>
                </div>
                {cart[p.id] ? (
                  <div className="cx-stepper">
                    <button aria-label={t.remove} onClick={() => change(p.id, -1)}><Glyph name="minus" /></button>
                    <span className="num" aria-live="polite">{cart[p.id]}</span>
                    <button aria-label={t.more} onClick={() => change(p.id, 1)}><Glyph name="plus" /></button>
                  </div>
                ) : (
                  <button className="cx-add" aria-label={`${t.add}: ${p.name}`} onClick={() => change(p.id, 1)}><Glyph name="plus" /></button>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {count > 0 && (
        <div className="cx-bar">
          <div className="cx-bar-in">
            {error && <div className="cx-error" role="alert">{error}</div>}
            <div className="cx-sum">
              <span>{t.items(count)}</span>
              <b className="num"><bdi>{formatPrice(total, lang)}</bdi></b>
            </div>
            <button className="cx-btn" disabled={busy || !store.customer} onClick={() => checkout("link")}>
              <Glyph name={store.settings.pay?.online === false ? "check" : "card"} />{store.settings.pay?.online === false ? t.placeOrder : t.pay(formatPrice(total, lang))}
            </button>
            {store.customer?.can_use_account && (
              <button className="cx-btn ghost" disabled={busy} onClick={() => checkout("account")}>{t.account}</button>
            )}
          </div>
        </div>
      )}
    </Frame>
  );
}
