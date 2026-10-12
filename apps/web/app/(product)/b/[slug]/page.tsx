"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

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
    book: "Book with", hello: (n: string) => `Booking as ${n}`,
    noCustomer: "Open this page from the link in your chat so we know who is booking.",
    service: "What do you need?", day: "Which day?", time: "What time?", minutes: (n: number) => `${n} min`,
    noTimes: "No free times on this day. Try another day.", loading: "Checking free times…",
    note: "Anything we should know? (optional)", confirm: "Confirm booking",
    booked: (n: number) => `Booking ${n} confirmed`, backToChat: "You can return to the chat. We sent the details there and will remind you before the visit.",
    notFound: "This booking page was not found.", noServices: "This shop is not taking bookings yet.",
    failed: "The booking could not be made. Please try again.", lang: "العربية", today: "Today",
  },
  ar: {
    book: "احجز لدى", hello: (n: string) => `الحجز باسم ${n}`,
    noCustomer: "افتح هذه الصفحة من الرابط في المحادثة لنعرف صاحب الحجز.",
    service: "ما الخدمة المطلوبة؟", day: "أي يوم؟", time: "أي وقت؟", minutes: (n: number) => `${n} دقيقة`,
    noTimes: "لا توجد أوقات متاحة في هذا اليوم. جرّب يوماً آخر.", loading: "جارٍ التحقق من الأوقات المتاحة…",
    note: "هل من ملاحظة؟ (اختياري)", confirm: "تأكيد الحجز",
    booked: (n: number) => `تم تأكيد الحجز رقم ${n}`, backToChat: "يمكنك العودة إلى المحادثة. أرسلنا التفاصيل هناك وسنذكّرك قبل الموعد.",
    notFound: "لم يتم العثور على صفحة الحجز.", noServices: "هذا المحل لا يستقبل الحجوزات بعد.",
    failed: "تعذّر إتمام الحجز. حاول مرة أخرى.", lang: "English", today: "اليوم",
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
  const [lang, setLang] = useState<"en" | "ar">("en");
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
  // Shops in Qatar quote times on the 12-hour clock.

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
  const dayLabel = (value: string, index: number) =>
    index === 0 ? t.today : new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
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

  if (missing) return <div className="pay"><div className="paycard"><p>{t.notFound}</p></div></div>;
  if (!page) return null;

  if (booked) {
    return (
      <div className="pay" dir={lang === "ar" ? "rtl" : "ltr"}>
        <div className="paycard">
          <p className="paid">{t.booked(booked.number)}</p>
          <div className="row"><span>{booked.service}</span><b dir="ltr">{booked.when_text}</b></div>
          <p style={{ color: "var(--muted)" }}>{t.backToChat}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="store booking" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <header className="store-head">
        <div>
          <span className="label">{t.book}</span>
          <h1>{lang === "ar" && page.shop.name_ar ? page.shop.name_ar : page.shop.name}</h1>
          <p>{page.customer ? t.hello(page.customer.name) : t.noCustomer}</p>
        </div>
        <button className="btn" onClick={() => setLang(lang === "en" ? "ar" : "en")}>{t.lang}</button>
      </header>

      {page.services.length === 0 && <p className="empty-note">{t.noServices}</p>}

      {page.services.length > 0 && (
        <section className="store-cat">
          <h2>{t.service}</h2>
          <ul role="radiogroup" aria-label={t.service}>
            {page.services.map((s) => (
              <li key={s.id}>
                <button
                  role="radio" aria-checked={serviceId === s.id} className="choice"
                  onClick={() => pick(setServiceId, s.id)}
                >
                  <span>
                    <b>{lang === "ar" && s.name_ar ? s.name_ar : s.name}</b>
                    <span className="num">{t.minutes(s.duration_minutes)}{s.price_text ? ` · ${s.price_text}` : ""}</span>
                  </span>
                  <span className="choice-mark" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {serviceId && (
        <section className="store-cat">
          <h2>{t.day}</h2>
          <div className="daystrip" role="radiogroup" aria-label={t.day}>
            {days.map((value, index) => (
              <button key={value} role="radio" aria-checked={day === value} onClick={() => pick(setDay, value)}>
                {dayLabel(value, index)}
              </button>
            ))}
          </div>
        </section>
      )}

      {serviceId && (
        <section className="store-cat">
          <h2>{t.time}</h2>
          {times === null && <p className="empty-note">{t.loading}</p>}
          {times?.length === 0 && <p className="empty-note">{t.noTimes}</p>}
          {times && times.length > 0 && (
            <div className="timegrid" role="radiogroup" aria-label={t.time}>
              {times.map((value) => (
                <button key={value} role="radio" aria-checked={start === value} onClick={() => { setStart(value); setError(""); }} dir="ltr">
                  {timeLabel(value)}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {start && (
        <footer className="cartbar">
          {error && <div className="error">{error}</div>}
          <input
            className="booking-note" value={note} maxLength={500} placeholder={t.note} aria-label={t.note}
            onChange={(e) => setNote(e.target.value)} dir="auto"
          />
          <div className="cart-actions">
            <button className="btn primary" disabled={busy || !page.customer} onClick={confirm}>
              {t.confirm} · <span dir="ltr">{timeLabel(start)}</span>
            </button>
          </div>
        </footer>
      )}
      {!start && error && <div className="error">{error}</div>}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BookingForm />
    </Suspense>
  );
}
