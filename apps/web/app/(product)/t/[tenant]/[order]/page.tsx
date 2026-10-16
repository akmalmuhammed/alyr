"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Empty, Frame, Glyph, initials, type Lang } from "../../../_customer/Frame";

type Step = { key: "placed" | "confirmed" | "ready" | "done"; at: string | null };
type Order = {
  number: number; status: "new" | "confirmed" | "ready" | "done" | "cancelled";
  payment: "unpaid" | "paid" | "on_account"; total_text: string; lang: string; handler: string | null;
  items: { name: string; name_ar: string; quantity: number; line_text: string }[];
  steps: Step[]; cancelled_at: string | null; paid_at: string | null; payment_id: string | null;
};
type Tracking = { shop: { name: string; name_ar: string }; order: Order };

const T = {
  en: {
    context: "Order tracking", eyebrow: "Your order", title: (n: number) => `Order #${n}`,
    status: { new: "Received", confirmed: "Confirmed", ready: "Ready for collection", done: "Complete", cancelled: "Cancelled" },
    steps: { placed: "Order received", confirmed: "Confirmed by the shop", ready: "Ready for collection", done: "Complete" },
    waiting: "Waiting", handler: (name: string, shop: string) => <><b>{name}</b> at {shop} is looking after your order.</>,
    noHandler: (shop: string) => <>The team at <b>{shop}</b> will pick up your order shortly.</>,
    items: "What you ordered", total: "Total",
    payment: { unpaid: "Not paid yet", paid: "Paid", on_account: "On your account" },
    pay: "Pay now", updates: "This page updates by itself. We also message you on WhatsApp at every step.",
    cancelled: "This order was cancelled. Message the shop on WhatsApp if that is unexpected.",
    notFound: "We could not find this order. Open the link from your chat again.",
  },
  ar: {
    context: "تتبّع الطلب", eyebrow: "طلبك", title: (n: number) => `الطلب رقم ${n}`,
    status: { new: "تم الاستلام", confirmed: "مؤكد", ready: "جاهز للاستلام", done: "مكتمل", cancelled: "ملغي" },
    steps: { placed: "تم استلام الطلب", confirmed: "أكّده المتجر", ready: "جاهز للاستلام", done: "مكتمل" },
    waiting: "قيد الانتظار", handler: (name: string, shop: string) => <><b>{name}</b> من {shop} يتابع طلبك.</>,
    noHandler: (shop: string) => <>سيتولى فريق <b>{shop}</b> طلبك قريباً.</>,
    items: "ما طلبته", total: "الإجمالي",
    payment: { unpaid: "لم يُدفع بعد", paid: "مدفوع", on_account: "على حسابك" },
    pay: "ادفع الآن", updates: "تتحدّث هذه الصفحة تلقائياً، ونراسلك على واتساب عند كل خطوة.",
    cancelled: "تم إلغاء هذا الطلب. راسل المتجر على واتساب إن لم يكن ذلك متوقعاً.",
    notFound: "لم نعثر على هذا الطلب. افتح الرابط من المحادثة مرة أخرى.",
  },
};

export default function TrackPage() {
  const { tenant, order } = useParams<{ tenant: string; order: string }>();
  const [data, setData] = useState<Tracking | null>(null);
  const [missing, setMissing] = useState(false);
  const [lang, setLang] = useState<Lang | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/track/${tenant}/${order}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const next: Tracking = await response.json();
      setData(next);
      // The page opens in the language the customer chats in.
      setLang((current) => current ?? (next.order.lang === "ar" ? "ar" : "en"));
    } catch {
      setMissing(true);
    }
  }, [tenant, order]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 20_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [load]);

  const t = T[lang ?? "en"];
  if (missing && !data) return <Empty text={t.notFound} />;
  if (!data || !lang) return null;
  const o = data.order;
  const shop = lang === "ar" && data.shop.name_ar ? data.shop.name_ar : data.shop.name;
  const toggle = () => setLang(lang === "en" ? "ar" : "en");
  const reachedIndex = o.steps.reduce((last, s, i) => (s.at ? i : last), 0);
  const time = (iso: string) =>
    new Intl.DateTimeFormat(lang === "ar" ? "ar-QA" : "en-GB", {
      weekday: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Qatar",
    }).format(new Date(iso));
  const cancelled = o.status === "cancelled";

  return (
    <Frame lang={lang} onLang={toggle} shop={shop} context={t.context} short>
      <section className="cx-hero" style={{ "--i": 0 } as React.CSSProperties}>
        <span className="cx-eyebrow">{t.eyebrow}</span>
        <h1 className="num">{t.title(o.number)}</h1>
        <span className={`cx-status ${cancelled ? "off" : o.status === "done" ? "done" : ""}`}>{t.status[o.status]}</span>
      </section>

      {cancelled ? <p className="cx-warn">{t.cancelled}</p> : (
        <section className="cx-card" style={{ "--i": 1 } as React.CSSProperties}>
          <ol className="cx-track">
            {o.steps.map((s, i) => (
              <li key={s.key} className={`${s.at ? "reached" : ""} ${i === reachedIndex && o.status !== "done" ? "now" : ""}`}>
                <span className="cx-node">{s.at && <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>
                <span className="cx-track-text">
                  <b>{t.steps[s.key]}</b>
                  <span className="num" dir={lang === "ar" ? "rtl" : "ltr"}>{s.at ? time(s.at) : t.waiting}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="cx-card cx-person" style={{ "--i": 2 } as React.CSSProperties}>
        <span className="cx-avatar" aria-hidden="true">{o.handler ? initials(o.handler) : initials(shop)}</span>
        <p>{o.handler ? t.handler(o.handler, shop) : t.noHandler(shop)}</p>
      </section>

      <section className="cx-section" style={{ "--i": 3 } as React.CSSProperties}>
        <h2>{t.items}</h2>
        <div className="cx-card">
          {o.items.map((item, i) => (
            <div key={i} className="cx-row">
              <div className="cx-row-text">
                <b>{lang === "ar" && item.name_ar ? item.name_ar : item.name}</b>
                <span className="num">× {item.quantity}</span>
              </div>
              <span className="num" dir="ltr">{item.line_text}</span>
            </div>
          ))}
          <div className="cx-row">
            <div className="cx-row-text"><b>{t.total}</b></div>
            <b className="num" dir="ltr">{o.total_text}</b>
          </div>
          <div className="cx-row">
            <div className="cx-row-text">
              <span className={`cx-pill ${o.payment === "unpaid" ? "due" : "good"}`} style={{ justifySelf: "start" }}>{t.payment[o.payment]}</span>
            </div>
            {o.payment_id && !cancelled && (
              <a className="cx-btn" style={{ width: "auto", height: 40, padding: "0 16px", fontSize: 14 }} href={`/pay/${tenant}/${o.payment_id}`}>
                <Glyph name="card" />{t.pay}
              </a>
            )}
          </div>
        </div>
      </section>

      <p className="cx-note" style={{ "--i": 4, textAlign: "center" } as React.CSSProperties}>{t.updates}</p>
    </Frame>
  );
}
