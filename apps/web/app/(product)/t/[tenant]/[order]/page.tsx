"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Empty, Frame, Glyph, initials } from "../../../_customer/Frame";
import { dayShort, goodsBeforeDiscount, zoneName, type Fulfilment } from "../../../_customer/fulfil";
import { formatPrice, type Lang } from "../../../_customer/price";
import { fmtQtyUnit, lineUnit } from "../../../_customer/qty";
import "../../../_customer/fulfil.css";

type Step = { key: "placed" | "confirmed" | "ready" | "done"; at: string | null };
type Order = {
  number: number; status: "new" | "confirmed" | "ready" | "done" | "cancelled";
  payment: "unpaid" | "paid" | "on_account"; total: number; lang: string; handler: string | null; table: string;
  items: {
    name: string; name_ar: string; quantity: number; unit?: string; unit_shown?: boolean; line_total: number;
    variant: string; variant_ar: string; options: string[]; options_ar: string[];
    /** What came off this line (ALY-150); absent when nothing did. */
    discount?: number;
  }[];
  // Only on an order that was given a discount (ALY-150): the goods, and each discount as it was
  // then. An order without one has none of these and reads exactly as before.
  subtotal?: number; discount_total?: number;
  discounts?: { kind: "coupon" | "auto"; code: string; name: string; name_ar: string; text: string; text_ar: string; amount: number; returned: boolean }[];
  // Only on an order made while the shop's Delivery and pickup was on (ALY-150): how it reaches the
  // customer and what that cost. An order without it reads exactly as before.
  fulfilment?: Fulfilment;
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
    items: "What you ordered", total: "Total", table: (label: string) => `Table ${label}`,
    subtotal: "Items", discount: "Discount", lineOff: (amount: string) => `Discount ${amount}`,
    how: "How you get it", pickup: "Pickup", delivery: "Delivery",
    pickupText: "Collect it from the shop. No fee.", deliverOn: "Delivery day", area: "Area", address: "Address", note: "Your note",
    deliveryTo: (zone: string) => (zone ? `Delivery to ${zone}` : "Delivery"), free: "Free",
    readyDelivery: "Ready for delivery",
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
    items: "ما طلبته", total: "الإجمالي", table: (label: string) => `طاولة ${label}`,
    subtotal: "الأصناف", discount: "الخصم", lineOff: (amount: string) => `خصم ${amount}`,
    how: "كيف يصلك طلبك", pickup: "الاستلام من المتجر", delivery: "التوصيل",
    pickupText: "تستلم طلبك من المتجر. دون رسوم.", deliverOn: "يوم التوصيل", area: "المنطقة", address: "العنوان", note: "ملاحظتك",
    deliveryTo: (zone: string) => (zone ? `التوصيل إلى ${zone}` : "التوصيل"), free: "مجاناً",
    readyDelivery: "جاهز للتوصيل",
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
    new Intl.DateTimeFormat(lang === "ar" ? "ar-QA-u-nu-latn" : "en-GB", {
      weekday: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Qatar",
    }).format(new Date(iso));
  const cancelled = o.status === "cancelled";
  const f = o.fulfilment;
  const delivering = f?.mode === "delivery";
  // "Ready for collection" is for pickup; a delivery is ready for delivery.
  const statusWord = (key: Order["status"]) => (delivering && key === "ready" ? t.readyDelivery : t.status[key]);
  const stepWord = (key: Step["key"]) => (delivering && key === "ready" ? t.readyDelivery : t.steps[key]);

  return (
    <Frame lang={lang} onLang={toggle} shop={shop} context={t.context} short>
      <section className="cx-hero" style={{ "--i": 0 } as React.CSSProperties}>
        <span className="cx-eyebrow">{t.eyebrow}</span>
        <h1 className="num">{t.title(o.number)}</h1>
        <span className={`cx-status ${cancelled ? "off" : o.status === "done" ? "done" : ""}`}>{statusWord(o.status)}</span>
        {o.table && <span className="cx-pill">{t.table(o.table)}</span>}
      </section>

      {cancelled ? <p className="cx-warn">{t.cancelled}</p> : (
        <section className="cx-card" style={{ "--i": 1 } as React.CSSProperties}>
          <ol className="cx-track">
            {o.steps.map((s, i) => (
              <li key={s.key} className={`${s.at ? "reached" : ""} ${i === reachedIndex && o.status !== "done" ? "now" : ""}`}>
                <span className="cx-node">{s.at && <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>
                <span className="cx-track-text">
                  <b>{stepWord(s.key)}</b>
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

      {f && (
        <section className="cx-section" style={{ "--i": 2 } as React.CSSProperties}>
          <h2>{t.how}</h2>
          <div className="cx-card">
            <div className="cx-row how">
              <div className="cx-row-text">
                <b>{delivering ? t.delivery : t.pickup}</b>
                {!delivering && <span>{t.pickupText}</span>}
              </div>
            </div>
            {delivering && (
              <dl className="cx-facts">
                {zoneName(f, lang) && <div><dt>{t.area}</dt><dd><bdi dir="auto">{zoneName(f, lang)}</bdi></dd></div>}
                {f.address && <div><dt>{t.address}</dt><dd><bdi dir="auto">{f.address}</bdi></dd></div>}
                {f.deliver_on && <div><dt>{t.deliverOn}</dt><dd><bdi>{dayShort(f.deliver_on, lang)}</bdi></dd></div>}
                {f.note && <div><dt>{t.note}</dt><dd><bdi dir="auto">{f.note}</bdi></dd></div>}
              </dl>
            )}
          </div>
        </section>
      )}

      <section className="cx-section" style={{ "--i": 3 } as React.CSSProperties}>
        <h2>{t.items}</h2>
        <div className="cx-card">
          {o.items.map((item, i) => {
            const ar = lang === "ar";
            const parts = [ar ? item.variant_ar || item.variant : item.variant, ...(ar ? item.options_ar : item.options)].filter(Boolean);
            return (
              <div key={i} className="cx-row">
                <div className="cx-row-text">
                  <b dir="auto">{ar && item.name_ar ? item.name_ar : item.name}</b>
                  {parts.length > 0 && <span dir="auto">{parts.join(ar ? "، " : ", ")}</span>}
                  <span className="num">× <bdi>{fmtQtyUnit(item.quantity, lineUnit(item.quantity, item.unit ?? "piece", Boolean(item.unit_shown)), lang)}</bdi></span>
                  {item.discount ? <span className="num"><bdi>{t.lineOff(`−${formatPrice(item.discount, lang)}`)}</bdi></span> : null}
                </div>
                <bdi className="num">{formatPrice(item.line_total, lang)}</bdi>
              </div>
            );
          })}
          {o.discount_total ? (
            <>
              <div className="cx-row">
                <div className="cx-row-text"><b>{t.subtotal}</b></div>
                <bdi className="num">{formatPrice(goodsBeforeDiscount(o), lang)}</bdi>
              </div>
              {(o.discounts ?? []).map((d, i) => (
                <div key={i} className="cx-row">
                  <div className="cx-row-text">
                    <b dir="auto">{d.kind === "coupon" ? d.code : (lang === "ar" && d.name_ar ? d.name_ar : d.name) || t.discount}</b>
                    <span dir="auto">{lang === "ar" && d.text_ar ? d.text_ar : d.text}</span>
                  </div>
                  <bdi className="num">{`−${formatPrice(d.amount, lang)}`}</bdi>
                </div>
              ))}
            </>
          ) : null}
          {delivering && f && (
            <div className="cx-row">
              <div className="cx-row-text">
                <b dir="auto">{t.deliveryTo(zoneName(f, lang))}</b>
              </div>
              <bdi className="num">{f.fee === 0 ? t.free : formatPrice(f.fee, lang)}</bdi>
            </div>
          )}
          <div className="cx-row">
            <div className="cx-row-text"><b>{t.total}</b></div>
            <b className="num"><bdi>{formatPrice(o.total, lang)}</bdi></b>
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
