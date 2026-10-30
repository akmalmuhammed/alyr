"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Done, Empty, Frame, Glyph } from "../../_customer/Frame";
import { amount as amountOf, currency, formatPrice, type Lang } from "../../_customer/price";

// The payment page (ALY-73, ALY-112). `/pay/<shop>?t=<token>`: the token is made for this page
// only, names one payment at one shop and runs out (SEC-8, D-080). The page sends it to the API in
// the header `X-Order-Link`, never in the address of a request. A link that has expired, was
// edited or was made for another page shows a calm page that says to open the newest link in the
// chat or ask the shop for one; nothing in it names a payment.
// A payment link is pending, paid, or expired: a pay-link
// order that was not paid inside its hold (or was cancelled) is released, its items go back
// on the shelf, and the link stops paying. Such a link says so and offers the way back to
// the shop; it never keeps a Pay button that does nothing.
//
// A shop that has connected its own payment account (ALY-17, specs/033) gets the provider's
// page: the Pay button goes there. While ALYR is still asking the provider for it, the page
// waits and looks again. The test provider's page (a developer machine) is this same page with
// `?sim=<ref>`.

type LinkState = { state: "none" | "ok" | "invalid" | "expired"; message: string; message_ar: string };
// With a good link, the payment; with any other, only the shop and what to do (`link`).
type Answer = { shop: string; shop_ar: string | null; slug: string | null; link: LinkState };
type Payment = Answer & {
  customer: string; amount: number;
  status: "pending" | "paid" | "expired"; order_number: number | null; order_id: string | null; lang: Lang;
  stand_in: boolean; preparing: boolean; unavailable: boolean; checkout_url: string | null;
  /** The order's tracking page by a signed link of its own, as a path on this site. */
  track_path: string | null;
};

const T = {
  en: {
    context: "Payment", eyebrow: "Secure payment", pay: (shop: string) => `Pay ${shop}`,
    standIn: "Test payment page. No money moves.",
    customer: "Customer", for: "For", order: (n: number) => `Order #${n}`, account: "Your account",
    method: "Method", card: "Debit card (NAPS) · test", button: (a: string) => `Pay ${a}`,
    paid: (a: string) => `Paid ${a}`, back: "Thank you. You can go back to WhatsApp; your receipt is there.",
    track: "Track this order", invalid: "This payment link is not valid.",
    expiredTitle: "This order was released",
    expiredText: "It was not paid in time, so the items were put back for other customers. Nothing was charged.",
    again: "Order again", paying: "Paying…",
    failed: "The payment did not go through. Please try again.",
    preparing: "Getting your payment ready…",
    unavailableTitle: "This payment link no longer works",
    unavailableText: "Nothing was charged. Please ask the shop for a new link in your chat.",
    simulated: "Test provider page. No money moves.",
    expiredLink: "This link has expired", invalidLink: "This link is not valid",
    noneTitle: "Open this page from the link we sent you",
    noneText: "The shop sends this link in your chat.",
  },
  ar: {
    context: "دفع", eyebrow: "دفع آمن", pay: (shop: string) => `ادفع إلى ${shop}`,
    standIn: "صفحة دفع تجريبية. لا تُنقل أي أموال.",
    customer: "العميل", for: "مقابل", order: (n: number) => `الطلب رقم ${n}`, account: "حسابك",
    method: "طريقة الدفع", card: "بطاقة خصم (NAPS) · تجريبي", button: (a: string) => `ادفع ${a}`,
    paid: (a: string) => `تم دفع ${a}`, back: "شكراً لك. يمكنك العودة إلى واتساب؛ الإيصال هناك.",
    track: "تتبّع هذا الطلب", invalid: "رابط الدفع هذا غير صالح.",
    expiredTitle: "أُلغي هذا الطلب لانتهاء مهلة الدفع",
    expiredText: "لم يُدفع في الوقت المحدد، فأُعيدت الأصناف إلى القائمة. لم يُخصم أي مبلغ.",
    again: "اطلب مرة أخرى", paying: "جارٍ الدفع…",
    failed: "لم تتم عملية الدفع. حاول مرة أخرى.",
    preparing: "جارٍ تجهيز الدفع…",
    unavailableTitle: "رابط الدفع هذا لم يعد يعمل",
    unavailableText: "لم يُخصم أي مبلغ. اطلب من المتجر رابطاً جديداً في المحادثة.",
    simulated: "صفحة مزوّد تجريبية. لا تُنقل أي أموال.",
    expiredLink: "انتهت صلاحية هذا الرابط", invalidLink: "هذا الرابط غير صالح",
    noneTitle: "افتح هذه الصفحة من الرابط الذي أرسلناه لك",
    noneText: "يرسل المتجر هذا الرابط في محادثتك.",
  },
};

function preferred(): Lang {
  return typeof navigator !== "undefined" && /^ar/i.test(navigator.language) ? "ar" : "en";
}

/** The order page, with the customer's own link if this tab already has it (the order page
 *  keeps it for the tab), else the shop's public page. */
function shopPath(slug: string | null): string | null {
  if (!slug) return null;
  let token = "";
  try { token = sessionStorage.getItem(`alyr-link:${slug}`) ?? ""; } catch { /* no storage */ }
  return `/s/${slug}${token ? `?t=${encodeURIComponent(token)}` : ""}`;
}

// The search parameters are read on the client only, inside a Suspense boundary.
export default function PayPage() {
  return (
    <Suspense fallback={null}>
      <Pay />
    </Suspense>
  );
}

function Pay() {
  const { slug } = useParams<{ slug: string }>();
  const query = useSearchParams();
  const simRef = query.get("sim");
  const asked = query.get("t");
  // The link goes in a header, not in the address of a request, so no request log of ours holds
  // it. A token is plain ASCII; anything else cannot be a header and cannot be ours, so it is
  // sent as one the API will call invalid.
  const token = asked ? (/^[\w.-]{1,300}$/.test(asked) ? asked : "invalid") : null;
  const linked = token ? { "x-order-link": token } : undefined;
  const [data, setData] = useState<Answer | Payment | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [lang, setLang] = useState<Lang | null>(null);

  const [look, setLook] = useState(0);

  useEffect(() => {
    fetch(`/api/pay/${slug}`, { cache: "no-store", headers: token ? { "x-order-link": token } : undefined })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((p: Answer | Payment) => {
        setData(p);
        // The page opens in the language the customer chats in; with no payment, the phone's.
        setLang((current) => current ?? ("lang" in p ? (p.lang === "ar" ? "ar" : "en") : preferred()));
      })
      .catch(() => setMissing(true));
  }, [slug, token, look]);

  // The provider's page is being made: look again, for about half a minute.
  const preparing = data !== null && "status" in data && data.status === "pending" && data.preparing;
  useEffect(() => {
    if (!preparing || look >= 20) return;
    const timer = setTimeout(() => setLook((n) => n + 1), 1500);
    return () => clearTimeout(timer);
  }, [preparing, look]);

  async function pay() {
    setBusy(true);
    setError(false);
    if (simRef) {
      // The test provider takes the "payment" and sends ALYR its webhook; then read the result.
      const response = await fetch(`/sim/gateway/${encodeURIComponent(simRef)}/pay`, { method: "POST" }).catch(() => null);
      if (response?.ok) setLook((n) => n + 1);
      else setError(true);
      setBusy(false);
      return;
    }
    const response = await fetch(`/api/pay/${slug}/complete`, { method: "POST", headers: linked }).catch(() => null);
    if (response?.ok) setData((d) => (d && "status" in d ? { ...d, status: "paid" } : d));
    // The hold ran out while the page was open: the link is released, and it says so.
    else if (response?.status === 409) setData((d) => (d && "status" in d ? { ...d, status: "expired" } : d));
    // The link ran out while the page was open: look again, and the page says so.
    else if (response?.status === 403) setLook((n) => n + 1);
    else setError(true);
    setBusy(false);
  }

  const t = T[lang ?? "en"];
  if (missing) return <Empty text={t.invalid} />;
  if (!data || !lang) return null;
  const shop = lang === "ar" && data.shop_ar ? data.shop_ar : data.shop;
  const toggle = () => setLang(lang === "en" ? "ar" : "en");
  if (!("status" in data) || data.link.state !== "ok") {
    // No payment to show: the link ran out (while the page was open, too), was edited, or is not
    // this page's. Say what to do, in the customer's language; name no payment.
    const state = data.link.state === "ok" ? "invalid" : data.link.state;
    const title = state === "expired" ? t.expiredLink : state === "none" ? t.noneTitle : t.invalidLink;
    const text = state === "none" ? t.noneText : lang === "ar" ? data.link.message_ar : data.link.message;
    return (
      <Frame lang={lang} onLang={toggle} shop={shop} context={t.context} short>
        <section className="cx-hero" style={{ "--i": 0 } as React.CSSProperties}>
          <span className="cx-eyebrow">{t.context}</span>
          <h1>{title}</h1>
        </section>
        {text && <p className="cx-warn" role="alert" style={{ "--i": 1 } as React.CSSProperties}>{text}</p>}
      </Frame>
    );
  }
  const money = formatPrice(data.amount, lang);
  // The order's tracking page, by its own signed link (SEC-8, D-080).
  const trackLink = data.track_path;

  if (data.status === "paid") {
    return (
      <Frame lang={lang} onLang={toggle} shop={shop} context={t.context} short>
        <Done title={t.paid(money)}>
          {data.order_number && <p>{t.order(data.order_number)}</p>}
          <p>{t.back}</p>
        </Done>
        {trackLink && <a className="cx-btn ink" href={trackLink}>{t.track}<Glyph name="arrow" className="flip" /></a>}
      </Frame>
    );
  }

  if (data.status === "expired") {
    const again = shopPath(data.slug);
    return (
      <Frame lang={lang} onLang={toggle} shop={shop} context={t.context} short>
        <section className="cx-done" role="status">
          <h1>{t.expiredTitle}</h1>
          {data.order_number && <p>{t.order(data.order_number)}</p>}
          <p>{t.expiredText}</p>
        </section>
        {again && <a className="cx-btn" href={again}>{t.again}<Glyph name="arrow" className="flip" /></a>}
      </Frame>
    );
  }

  if (data.unavailable) {
    return (
      <Frame lang={lang} onLang={toggle} shop={shop} context={t.context} short>
        <section className="cx-done" role="status">
          <h1>{t.unavailableTitle}</h1>
          {data.order_number && <p>{t.order(data.order_number)}</p>}
          <p>{t.unavailableText}</p>
        </section>
      </Frame>
    );
  }

  // The stand-in and the test provider's page take the payment here; a real provider's page
  // is somewhere else, and the button goes there.
  const here = data.stand_in || Boolean(simRef);
  const notice = data.stand_in ? t.standIn : simRef ? t.simulated : null;
  const label = <><Glyph name="card" />{busy ? t.paying : t.button(money)}</>;

  return (
    <Frame lang={lang} onLang={toggle} shop={shop} context={t.context} short>
      {notice && <p className="cx-warn" style={{ "--i": 0 } as React.CSSProperties}>{notice}</p>}
      <section className="cx-card" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="cx-amount">
          <h1>{t.pay(shop)}</h1>
          <b className="num" dir={lang === "ar" ? undefined : "ltr"}>{amountOf(data.amount)}<small>{currency(lang)}</small></b>
        </div>
        {data.customer && <div className="cx-kv"><span>{t.customer}</span><b>{data.customer}</b></div>}
        <div className="cx-kv"><span>{t.for}</span><b>{data.order_number ? t.order(data.order_number) : t.account}</b></div>
        {data.stand_in && (
          <div className="cx-kv"><span>{t.method}</span><b className="cx-card-brand"><i aria-hidden="true" />{t.card}</b></div>
        )}
      </section>
      {error && <p className="cx-error" role="alert" style={{ "--i": 2 } as React.CSSProperties}>{t.failed}</p>}
      {preparing ? (
        <p className="cx-note" role="status" style={{ "--i": 2 } as React.CSSProperties}>{t.preparing}</p>
      ) : here ? (
        <button className="cx-btn" style={{ "--i": 2 } as React.CSSProperties} onClick={pay} disabled={busy}>{label}</button>
      ) : data.checkout_url ? (
        <a className="cx-btn" style={{ "--i": 2 } as React.CSSProperties} href={data.checkout_url}>{label}</a>
      ) : null}
      {trackLink && (
        <a className="cx-btn ghost" style={{ "--i": 3 } as React.CSSProperties} href={trackLink}>{t.track}</a>
      )}
    </Frame>
  );
}
