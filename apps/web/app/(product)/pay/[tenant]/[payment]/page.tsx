"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { STAND_IN, termsSentence, type DepositTerms } from "../../../_customer/deposit";
import { Done, Empty, Frame, Glyph } from "../../../_customer/Frame";
import { amount as amountOf, currency, formatPrice, type Lang } from "../../../_customer/price";

// The payment page (ALY-73, ALY-112). A payment link is pending, paid, or expired: a pay-link
// order that was not paid inside its hold (or was cancelled) is released, its items go back
// on the shelf, and the link stops paying. Such a link says so and offers the way back to
// the shop; it never keeps a Pay button that does nothing.
//
// A booking's deposit (ALY-27, D-084): the page names the visit and shows the shop's rule for
// the deposit again before paying. A booking whose deposit was not paid in time is released,
// and its link says so.
// A shop that has connected its own payment account (ALY-17, specs/033) gets the provider's
// page: the Pay button goes there. While ALYR is still asking the provider for it, the page
// waits and looks again. The test provider's page (a developer machine) is this same page with
// `?sim=<ref>`.

type Payment = {
  shop: string; shop_ar: string | null; slug: string | null; customer: string; amount: number;
  status: "pending" | "paid" | "expired"; order_number: number | null; order_id: string | null; lang: Lang;
  booking: {
    number: number; service_name: string; service_name_ar: string | null; deposit_terms: DepositTerms;
    resource: string | null; resource_ar: string | null; resource_kind: "person" | "place" | null;
    when_text: string; when_text_ar: string;
  } | null;
  stand_in: boolean; preparing: boolean; unavailable: boolean; checkout_url: string | null;
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
    deposit: (n: number) => `Deposit for booking ${n}`,
    visit: "Visit",
    withWhom: (name: string, place: boolean) => (place ? `, ${name}` : ` with ${name}`),
    rule: "The shop's rule",
    depositPaid: "Your visit is confirmed. You can go back to WhatsApp; we sent the details there.",
    releasedTitle: "This booking was released",
    releasedText: "The deposit was not paid in time, so the time was given back. Nothing was charged.",
    bookAgain: "Book again",
    preparing: "Getting your payment ready…",
    unavailableTitle: "This payment link no longer works",
    unavailableText: "Nothing was charged. Please ask the shop for a new link in your chat.",
    simulated: "Test provider page. No money moves.",
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
    deposit: (n: number) => `عربون الحجز رقم ${n}`,
    visit: "الموعد",
    withWhom: (name: string, place: boolean) => (place ? `، ${name}` : ` مع ${name}`),
    rule: "سياسة المحل",
    depositPaid: "تم تأكيد موعدك. يمكنك العودة إلى واتساب، أرسلنا التفاصيل هناك.",
    releasedTitle: "أُلغي هذا الحجز",
    releasedText: "لم يُدفع العربون في الوقت المحدد، فأُعيد الموعد. لم يُخصم أي مبلغ.",
    bookAgain: "احجز مرة أخرى",
    preparing: "جارٍ تجهيز الدفع…",
    unavailableTitle: "رابط الدفع هذا لم يعد يعمل",
    unavailableText: "لم يُخصم أي مبلغ. اطلب من المتجر رابطاً جديداً في المحادثة.",
    simulated: "صفحة مزوّد تجريبية. لا تُنقل أي أموال.",
  },
};

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
  const { tenant, payment } = useParams<{ tenant: string; payment: string }>();
  const simRef = useSearchParams().get("sim");
  const [data, setData] = useState<Payment | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [lang, setLang] = useState<Lang | null>(null);

  const [look, setLook] = useState(0);

  useEffect(() => {
    fetch(`/api/pay/${tenant}/${payment}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((p: Payment) => { setData(p); setLang((current) => current ?? (p.lang === "ar" ? "ar" : "en")); })
      .catch(() => setMissing(true));
  }, [tenant, payment, look]);

  // The provider's page is being made: look again, for about half a minute.
  const preparing = data?.status === "pending" && data.preparing;
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
    const response = await fetch(`/api/pay/${tenant}/${payment}/complete`, { method: "POST" }).catch(() => null);
    if (response?.ok) setData((d) => (d ? { ...d, status: "paid" } : d));
    // The hold ran out while the page was open: the link is released, and it says so.
    else if (response?.status === 409) setData((d) => (d ? { ...d, status: "expired" } : d));
    else setError(true);
    setBusy(false);
  }

  const t = T[lang ?? "en"];
  if (missing) return <Empty text={t.invalid} />;
  if (!data || !lang) return null;
  const shop = lang === "ar" && data.shop_ar ? data.shop_ar : data.shop;
  const money = formatPrice(data.amount, lang);
  const toggle = () => setLang(lang === "en" ? "ar" : "en");
  // The tracking page opens only by its own signed link now (SEC-8, D-080), which this page will
  // be given with its own signed link (after the payment adapters, ALY-17). Until then it shows
  // no way there; the customer's chat holds the link.
  const trackLink = (data as { track_path?: string | null }).track_path ?? null;
  const booking = data.booking;
  const visit = booking
    ? `${lang === "ar" && booking.service_name_ar ? booking.service_name_ar : booking.service_name}${
      booking.resource ? t.withWhom(lang === "ar" && booking.resource_ar ? booking.resource_ar : booking.resource, booking.resource_kind === "place") : ""}`
    : "";
  const visitWhen = booking ? (lang === "ar" ? booking.when_text_ar : booking.when_text) : "";

  if (data.status === "paid") {
    return (
      <Frame lang={lang} onLang={toggle} shop={shop} context={t.context} short>
        <Done title={t.paid(money)}>
          {data.order_number && <p>{t.order(data.order_number)}</p>}
          {booking && <p><bdi>{visit}</bdi> · <span className="num" dir="ltr">{visitWhen}</span></p>}
          <p>{booking ? t.depositPaid : t.back}</p>
        </Done>
        {trackLink && <a className="cx-btn ink" href={trackLink}>{t.track}<Glyph name="arrow" className="flip" /></a>}
      </Frame>
    );
  }

  if (data.status === "expired" && booking) {
    return (
      <Frame lang={lang} onLang={toggle} shop={shop} context={t.context} short>
        <section className="cx-done" role="status">
          <h1>{t.releasedTitle}</h1>
          <p>{t.deposit(booking.number)}</p>
          <p>{t.releasedText}</p>
        </section>
        {data.slug && <a className="cx-btn" href={`/b/${data.slug}`}>{t.bookAgain}<Glyph name="arrow" className="flip" /></a>}
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
        <div className="cx-kv"><span>{t.for}</span><b>{booking ? t.deposit(booking.number) : data.order_number ? t.order(data.order_number) : t.account}</b></div>
        {booking && (
          <div className="cx-kv"><span>{t.visit}</span><b><bdi>{visit}</bdi> · <span className="num" dir="ltr">{visitWhen}</span></b></div>
        )}
        {data.stand_in && (
          <div className="cx-kv"><span>{t.method}</span><b className="cx-card-brand"><i aria-hidden="true" />{t.card}</b></div>
        )}
      </section>
      {booking && (
        <section className="cx-card cx-terms" style={{ "--i": 2 } as React.CSSProperties}>
          <h2>{t.rule}</h2>
          <p>{termsSentence(booking.deposit_terms, lang)}</p>
        </section>
      )}
      {booking && data.stand_in && <p className="cx-note">{STAND_IN[lang]}</p>}
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
