"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

type Product = { id: string; name: string; name_ar: string; category: string; price: number; price_text: string };
type Store = {
  shop: { name: string; name_ar: string };
  products: Product[];
  customer: { name: string; can_use_account: boolean } | null;
};
type Placed = { number: number; total_text: string; payment: string; pay_url: string | null };

const T = {
  en: {
    order: "Order from", hello: (n: string) => `Ordering as ${n}`, noCustomer: "Open this page from the link in your chat so we know who is ordering.",
    cart: (n: number) => `${n} in cart`, total: "Total", pay: "Pay now", account: "Put on my account",
    placed: (n: number) => `Order #${n} received`, backToChat: "You can return to the chat. We will message you as the order moves along.",
    onAccount: "It has been added to your account.", notFound: "This shop's order page was not found.", lang: "العربية", add: "Add",
  },
  ar: {
    order: "اطلب من", hello: (n: string) => `الطلب باسم ${n}`, noCustomer: "افتح هذه الصفحة من الرابط في المحادثة لنعرف صاحب الطلب.",
    cart: (n: number) => `${n} في السلة`, total: "الإجمالي", pay: "ادفع الآن", account: "سجّله على حسابي",
    placed: (n: number) => `تم استلام الطلب رقم ${n}`, backToChat: "يمكنك العودة إلى المحادثة. سنراسلك عند تحديث الطلب.",
    onAccount: "تمت إضافته إلى حسابك.", notFound: "لم يتم العثور على صفحة الطلب لهذا المتجر.", lang: "English", add: "أضف",
  },
};

const qar = (dirhams: number) => "QAR " + (dirhams / 100).toLocaleString("en", { maximumFractionDigits: 2 });

function StorePage() {
  const { slug } = useParams<{ slug: string }>();
  const contact = useSearchParams().get("c");
  const [store, setStore] = useState<Store | null>(null);
  const [missing, setMissing] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [placed, setPlaced] = useState<Placed | null>(null);
  const t = T[lang];

  useEffect(() => {
    fetch(`/api/store/${slug}${contact ? `?c=${contact}` : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setStore)
      .catch(() => setMissing(true));
  }, [slug, contact]);

  const categories = useMemo(() => {
    const groups = new Map<string, Product[]>();
    for (const p of store?.products ?? []) groups.set(p.category, [...(groups.get(p.category) ?? []), p]);
    return [...groups.entries()];
  }, [store]);

  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const total = (store?.products ?? []).reduce((sum, p) => sum + p.price * (cart[p.id] ?? 0), 0);

  function change(id: string, by: number) {
    setCart((c) => {
      const next = Math.max(0, Math.min(999, (c[id] ?? 0) + by));
      const copy = { ...c, [id]: next };
      if (!next) delete copy[id];
      return copy;
    });
  }

  async function checkout(payment: "link" | "account") {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/store/${slug}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contact_id: contact, payment,
        items: Object.entries(cart).map(([product_id, quantity]) => ({ product_id, quantity })),
      }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(data?.detail?.message ?? "The order could not be placed. Please try again.");
      return;
    }
    if (data.pay_url) {
      window.location.href = data.pay_url;
      return;
    }
    setPlaced(data);
  }

  if (missing) return <div className="pay"><div className="paycard"><p>{t.notFound}</p></div></div>;
  if (!store) return null;

  if (placed) {
    return (
      <div className="pay" dir={lang === "ar" ? "rtl" : "ltr"}>
        <div className="paycard">
          <p className="paid">{t.placed(placed.number)}</p>
          <div className="row"><span>{t.total}</span><b dir="ltr">{placed.total_text}</b></div>
          <p>{t.onAccount}</p>
          <p style={{ color: "var(--muted)" }}>{t.backToChat}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="store" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <header className="store-head">
        <div>
          <span className="label">{t.order}</span>
          <h1>{lang === "ar" && store.shop.name_ar ? store.shop.name_ar : store.shop.name}</h1>
          <p>{store.customer ? t.hello(store.customer.name) : t.noCustomer}</p>
        </div>
        <button className="btn" onClick={() => setLang(lang === "en" ? "ar" : "en")}>{t.lang}</button>
      </header>

      {categories.map(([category, products]) => (
        <section key={category} className="store-cat">
          <h2>{category}</h2>
          <ul>
            {products.map((p) => (
              <li key={p.id}>
                <div>
                  <b>{lang === "ar" && p.name_ar ? p.name_ar : p.name}</b>
                  <span className="num" dir="ltr">{p.price_text}</span>
                </div>
                {cart[p.id] ? (
                  <div className="stepper">
                    <button aria-label="Remove one" onClick={() => change(p.id, -1)}>−</button>
                    <span className="num">{cart[p.id]}</span>
                    <button aria-label="Add one" onClick={() => change(p.id, 1)}>+</button>
                  </div>
                ) : (
                  <button className="btn" onClick={() => change(p.id, 1)}>{t.add}</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {count > 0 && (
        <footer className="cartbar">
          {error && <div className="error">{error}</div>}
          <div className="cart-total">
            <span>{t.cart(count)}</span>
            <b className="num" dir="ltr">{t.total}: {qar(total)}</b>
          </div>
          <div className="cart-actions">
            <button className="btn primary" disabled={busy || !store.customer} onClick={() => checkout("link")}>{t.pay}</button>
            {store.customer?.can_use_account && (
              <button className="btn" disabled={busy} onClick={() => checkout("account")}>{t.account}</button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <StorePage />
    </Suspense>
  );
}
