"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Done, Empty, Frame, Glyph, Who, type Lang } from "../../_customer/Frame";

type Service = { id: string; name: string; name_ar: string; duration_minutes: number; price_text: string };
type BookingPage = {
  shop: { name: string; name_ar: string; timezone: string };
  services: Service[];
  customer: { name: string } | null;
};
type Booked = { number: number; when_text: string; service: string };

const DAYS_AHEAD = 14;

const T = {
  en: {
    context: "Booking", eyebrow: "Book from your chat", title: "Book a visit",
    hello: (n: string) => <>Booking as <b>{n}</b></>,
    noCustomer: "Open this page from the link in your chat so we know who is booking.",
    service: "Choose a service", day: "Choose a day", time: "Choose a time", minutes: (n: number) => `${n} min`,
    noTimes: "No free times on this day. Try another day.",
    note: "Anything we should know? (optional)", confirm: "Confirm booking",
    booked: (n: number) => `Booking ${n} confirmed`,
    backToChat: "You can go back to WhatsApp. We sent the details there and will remind you before the visit.",
    notFound: "This booking page was not found.", noServices: "This shop is not taking bookings yet.",
    failed: "The booking could not be made. Please try again.", today: "Today",
  },
  ar: {
    context: "حجز", eyebrow: "حجز من المحادثة", title: "احجز موعداً",
    hello: (n: string) => <>الحجز باسم <b>{n}</b></>,
    noCustomer: "افتح هذه الصفحة من الرابط في المحادثة لنعرف صاحب الحجز.",
    service: "اختر الخدمة", day: "اختر اليوم", time: "اختر الوقت", minutes: (n: number) => `${n} دقيقة`,
    noTimes: "لا توجد أوقات متاحة في هذا اليوم. جرّب يوماً آخر.",
    note: "هل من ملاحظة؟ (اختياري)", confirm: "تأكيد الحجز",
    booked: (n: number) => `تم تأكيد الحجز رقم ${n}`,
    backToChat: "يمكنك العودة إلى واتساب. أرسلنا التفاصيل هناك وسنذكّرك قبل الموعد.",
    notFound: "لم يتم العثور على صفحة الحجز.", noServices: "هذا المحل لا يستقبل الحجوزات بعد.",
    failed: "تعذّر إتمام الحجز. حاول مرة أخرى.", today: "اليوم",
  },
};

/** The next days as the shop's own calendar sees them, as YYYY-MM-DD. */
function upcomingDays(timezone: string): string[] {
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  return Array.from({ length: DAYS_AHEAD }, (_, index) => format.format(new Date(Date.now() + index * 86_400_000)));
}

function BookingForm() {
  const { slug } = useParams<{ slug: string }>();
  const contact = useSearchParams().get("c");
  const [page, setPage] = useState<BookingPage | null>(null);
  const [missing, setMissing] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [serviceId, setServiceId] = useState("");
  const [day, setDay] = useState("");
  const [times, setTimes] = useState<string[] | null>(null);
  const [start, setStart] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [booked, setBooked] = useState<Booked | null>(null);
  const t = T[lang];
  const locale = lang === "ar" ? "ar-QA" : "en-GB";

  useEffect(() => {
    fetch(`/api/book/${slug}${contact ? `?c=${contact}` : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: BookingPage) => {
        setPage(data);
        setDay(upcomingDays(data.shop.timezone)[0]);
        if (data.services.length === 1) setServiceId(data.services[0].id);
      })
      .catch(() => setMissing(true));
  }, [slug, contact]);

  useEffect(() => {
    if (!serviceId || !day) return;
    let current = true;
    fetch(`/api/book/${slug}/times?service_id=${serviceId}&day=${day}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { times: string[] }) => { if (current) setTimes(data.times); })
      .catch(() => { if (current) setTimes([]); });
    return () => { current = false; };
  }, [slug, serviceId, day]);

  const days = useMemo(() => (page ? upcomingDays(page.shop.timezone) : []), [page]);
  const zone = page?.shop.timezone ?? "Asia/Qatar";
  const part = (value: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
  // Shops in Qatar quote times on the 12-hour clock.
  const timeLabel = (value: string) =>
    new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", hour12: true, timeZone: zone }).format(new Date(value));

  function pick(setter: (value: string) => void, value: string) {
    setter(value);
    setTimes(null);
    setStart("");
    setError("");
  }

  async function confirm() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/book/${slug}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact_id: contact, service_id: serviceId, starts_at: start, note }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data?.detail?.message ?? t.failed);
      // Someone else may have just taken the time: show what is still free.
      if (response.status === 409) pick(setDay, day);
      return;
    }
    setBooked(data);
  }

  if (missing) return <Empty text={t.notFound} />;
  if (!page) return null;
  const shop = lang === "ar" && page.shop.name_ar ? page.shop.name_ar : page.shop.name;
  const toggle = () => setLang(lang === "en" ? "ar" : "en");
  const chosen = page.services.find((s) => s.id === serviceId);

  if (booked) {
    return (
      <Frame lang={lang} onLang={toggle} shop={shop} context={t.context} short>
        <Done title={t.booked(booked.number)}>
          <p><b>{booked.service}</b> · <span className="num" dir="ltr">{booked.when_text}</span></p>
          <p>{t.backToChat}</p>
        </Done>
      </Frame>
    );
  }

  return (
    <Frame lang={lang} onLang={toggle} shop={shop} context={t.context}>
      <section className="cx-hero" style={{ "--i": 0 } as React.CSSProperties}>
        <span className="cx-eyebrow">{t.eyebrow}</span>
        <h1>{t.title}</h1>
        {page.customer ? <Who label={t.hello(page.customer.name)} /> : <p className="cx-warn">{t.noCustomer}</p>}
      </section>

      {page.services.length === 0 && <p className="cx-warn">{t.noServices}</p>}

      {page.services.length > 0 && (
        <section className="cx-section" style={{ "--i": 1 } as React.CSSProperties}>
          <h2><span className={`cx-step ${serviceId ? "done" : ""}`}>1</span>{t.service}</h2>
          <div className="cx-card" role="radiogroup" aria-label={t.service}>
            {page.services.map((s) => (
              <button key={s.id} role="radio" aria-checked={serviceId === s.id} className="cx-choice"
                onClick={() => pick(setServiceId, s.id)}>
                <span className="cx-row-text">
                  <b>{lang === "ar" && s.name_ar ? s.name_ar : s.name}</b>
                  <span className="num">{t.minutes(s.duration_minutes)}{s.price_text ? ` · ${s.price_text}` : ""}</span>
                </span>
                <span className="cx-radio"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
              </button>
            ))}
          </div>
        </section>
      )}

      {serviceId && (
        <section className="cx-section">
          <h2><span className={`cx-step ${day ? "done" : ""}`}>2</span>{t.day}</h2>
          <div className="cx-days" role="radiogroup" aria-label={t.day}>
            {days.map((value, index) => (
              <button key={value} role="radio" aria-checked={day === value} className="cx-day" onClick={() => pick(setDay, value)}>
                <small>{index === 0 ? t.today : part(value, { weekday: "short" })}</small>
                <b className="num">{part(value, { day: "numeric" })}</b>
                <span>{part(value, { month: "short" })}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {serviceId && (
        <section className="cx-section">
          <h2><span className={`cx-step ${start ? "done" : ""}`}>3</span>{t.time}</h2>
          {times === null && <div className="cx-times" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className="cx-skel" />)}</div>}
          {times?.length === 0 && <p className="cx-note">{t.noTimes}</p>}
          {times && times.length > 0 && (
            <div className="cx-times" role="radiogroup" aria-label={t.time}>
              {times.map((value) => (
                <button key={value} role="radio" aria-checked={start === value} className="cx-time num"
                  onClick={() => { setStart(value); setError(""); }} dir="ltr">
                  {timeLabel(value)}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {!start && error && <div className="cx-error" role="alert">{error}</div>}

      {start && chosen && (
        <div className="cx-bar">
          <div className="cx-bar-in">
            {error && <div className="cx-error" role="alert">{error}</div>}
            <div className="cx-sum">
              <span>{lang === "ar" && chosen.name_ar ? chosen.name_ar : chosen.name}</span>
              <b className="num" dir="ltr">{part(day, { weekday: "short", day: "numeric", month: "short" })} · {timeLabel(start)}</b>
            </div>
            <input className="cx-input" value={note} maxLength={500} placeholder={t.note} aria-label={t.note}
              onChange={(e) => setNote(e.target.value)} dir="auto" />
            <button className="cx-btn" disabled={busy || !page.customer} onClick={confirm}>
              <Glyph name="check" />{t.confirm}
            </button>
          </div>
        </div>
      )}
    </Frame>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BookingForm />
    </Suspense>
  );
}
