"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { STAND_IN, termsSentence, type DepositTerms } from "../../_customer/deposit";
import { Done, Empty, Frame, Glyph, Who, type Lang } from "../../_customer/Frame";
import { formatPrice } from "../../_customer/price";
import { customerName } from "../../_customer/testName";

// The booking page (`/b/<shop>`). A customer's own link carries a signed token made for
// booking (`?t=`, ALY-133); the page sends it to the API in the header `X-Order-Link`, never
// in the address of a request, and the API says who it is. A public link (no token) shows the
// services and the free times and cannot book. The old `?c=<contact id>` identifies nobody:
// it is treated as a link that is not valid.
//
// D-084: the customer chooses "Anyone" or one of the people or chairs that do the service, and
// a service may ask a deposit. The deposit and the shop's rule for it are shown before the
// customer confirms; the deposit is paid by link, which opens a test page until the shop's
// payment provider is connected (the page says so).

type Service = {
  id: string; name: string; name_ar: string; duration_minutes: number; price: number;
  deposit: number; doers: string[];
};
type Person = { id: string; name: string; name_ar: string; kind: "person" | "place"; services: string[] };
type LinkState = { state: "none" | "ok" | "invalid" | "expired"; message: string; message_ar: string };
type BookingPage = {
  shop: { name: string; name_ar: string; timezone: string; whatsapp: string };
  services: Service[];
  resources: Person[];
  deposit_terms: DepositTerms;
  customer: { name: string; lang: Lang } | null;
  link: LinkState;
};
type Booked = {
  number: number; when_text: string; service: string; resource: string | null; resource_ar: string | null;
  deposit: { amount: number; pay_path: string; hold_until: string; terms: DepositTerms } | null;
};

const DAYS_AHEAD = 14;

const T = {
  en: {
    context: "Booking", eyebrow: "Book from your chat", title: "Book a visit",
    hello: (n: string) => <>Booking as <b>{n}</b></>,
    noCustomer: "Open this page from the link in your chat so we know who is booking.",
    startOnWhatsApp: (shop: string) => `To book, start on WhatsApp with ${shop}. They will send you your own booking link.`,
    askShop: "Message the shop on WhatsApp", prefill: "Book",
    service: "Choose a service", day: "Choose a day", time: "Choose a time", minutes: (n: number) => `${n} min`,
    who: "Choose who", anyone: "Anyone", anyoneHint: "The first one free",
    depositTag: (a: string) => `Deposit ${a}`,
    depositAsk: (a: string, m: number) => `A deposit of ${a} holds this time for ${m} minutes while you pay it by link.`,
    confirmPay: "Book and pay the deposit",
    held: (n: number) => `Booking ${n} is held for you`,
    heldText: (a: string, m: number) => `Pay the deposit of ${a} within ${m} minutes to confirm it. The link is in your chat too.`,
    payDeposit: "Pay the deposit",
    withWhom: (name: string, place: boolean) => (place ? `, ${name}` : ` with ${name}`),
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
    startOnWhatsApp: (shop: string) => `للحجز، ابدأ من واتساب مع ${shop} وسيرسلون لك رابط الحجز الخاص بك.`,
    askShop: "راسل المتجر على واتساب", prefill: "حجز",
    service: "اختر الخدمة", day: "اختر اليوم", time: "اختر الوقت", minutes: (n: number) => `${n} دقيقة`,
    who: "اختر من يخدمك", anyone: "أي أحد", anyoneHint: "أول من يكون متاحاً",
    depositTag: (a: string) => `العربون ${a}`,
    depositAsk: (a: string, m: number) => `عربون ${a} يحجز لك هذا الموعد لمدة ${m} دقيقة حتى تدفعه عبر الرابط.`,
    confirmPay: "احجز وادفع العربون",
    held: (n: number) => `الحجز رقم ${n} محجوز لك`,
    heldText: (a: string, m: number) => `ادفع العربون ${a} خلال ${m} دقيقة لتأكيده. الرابط في محادثتك أيضاً.`,
    payDeposit: "ادفع العربون",
    withWhom: (name: string, place: boolean) => (place ? `، ${name}` : ` مع ${name}`),
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

/** The language a visitor with no link of their own reads: the one asked for in the address,
 *  else the phone's. */
function preferred(asked: string | null): Lang {
  if (asked === "ar" || asked === "en") return asked;
  return typeof navigator !== "undefined" && /^ar/i.test(navigator.language) ? "ar" : "en";
}

function BookingForm() {
  const { slug } = useParams<{ slug: string }>();
  const query = useSearchParams();
  const asked = query.get("t");
  // The customer's link goes in a header, not in the address, so no request log of ours holds
  // it. A token is plain ASCII; anything else cannot be a header (fetch would throw) and
  // cannot be ours, so it is sent as one the API will call invalid. The old `?c=` link (a
  // bare contact ID) gets the same answer: it identifies nobody.
  const token = asked ? (/^[\w.-]{1,200}$/.test(asked) ? asked : "invalid") : query.get("c") ? "invalid" : null;
  const askedLang = query.get("lang");
  const [page, setPage] = useState<BookingPage | null>(null);
  const [missing, setMissing] = useState(false);
  const [chosen, setChosen] = useState<Lang | null>(null);
  const [serviceId, setServiceId] = useState("");
  // "" is anyone; otherwise one person or chair the customer chose.
  const [resourceId, setResourceId] = useState("");
  const [day, setDay] = useState("");
  const [times, setTimes] = useState<string[] | null>(null);
  const [start, setStart] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The link stopped working while the page was open (it expired, say): the page says so.
  const [stopped, setStopped] = useState<LinkState | null>(null);
  const [booked, setBooked] = useState<Booked | null>(null);
  const lang: Lang = chosen ?? "en";
  const t = T[lang];
  const locale = lang === "ar" ? "ar-QA-u-nu-latn" : "en-GB";

  useEffect(() => {
    fetch(`/api/book/${slug}`, { cache: "no-store", headers: token ? { "x-order-link": token } : undefined })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: BookingPage) => {
        setPage(data);
        // The page speaks the customer's own language when their link says who they are.
        setChosen((current) => current ?? data.customer?.lang ?? preferred(askedLang));
        setDay(upcomingDays(data.shop.timezone)[0]);
        if (data.services.length === 1) setServiceId(data.services[0].id);
      })
      .catch(() => { setChosen((current) => current ?? preferred(askedLang)); setMissing(true); });
  }, [slug, token, askedLang]);

  useEffect(() => {
    if (!serviceId || !day) return;
    let current = true;
    fetch(`/api/book/${slug}/times?service_id=${serviceId}&day=${day}${resourceId ? `&resource_id=${resourceId}` : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { times: string[] }) => { if (current) setTimes(data.times); })
      .catch(() => { if (current) setTimes([]); });
    return () => { current = false; };
  }, [slug, serviceId, day, resourceId]);

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
      body: JSON.stringify({ token, service_id: serviceId, starts_at: start, note, resource_id: resourceId || null }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      const refusal = data?.detail;
      // The link ran out, or was never good: say so, with the API's own words.
      if (response.status === 403 && (refusal?.code === "expired_link" || refusal?.code === "bad_link")) {
        setStopped({ state: refusal.code === "expired_link" ? "expired" : "invalid", message: refusal.message, message_ar: refusal.message_ar });
        return;
      }
      setError(refusal?.message ?? t.failed);
      // Someone else may have just taken the time: show what is still free.
      if (response.status === 409) pick(setDay, day);
      return;
    }
    setBooked(data);
  }

  if (missing) return <Empty text={t.notFound} />;
  if (!page || !chosen) return null;
  const shop = lang === "ar" && page.shop.name_ar ? page.shop.name_ar : page.shop.name;
  const toggle = () => setChosen(lang === "en" ? "ar" : "en");
  const chosenService = page.services.find((s) => s.id === serviceId);
  // The people or chairs that do the chosen service: a choice only when there is more than one.
  const doers = page.resources.filter((r) => chosenService?.doers.includes(r.id));
  const choosing = Boolean(serviceId) && doers.length > 1;
  const step = (n: number) => (choosing ? n + 1 : n);
  const nameOf = (r: { name: string; name_ar: string }) => (lang === "ar" && r.name_ar ? r.name_ar : r.name);
  const holdMinutes = page.deposit_terms.hold_minutes ?? 30;
  const whatsapp = page.shop.whatsapp ? `https://wa.me/${page.shop.whatsapp}?text=${encodeURIComponent(t.prefill)}` : "";

  // A link that has expired or is not valid (an edited one, one from another shop, an order
  // link, or the old bare contact ID): the customer is told, kindly, to ask the shop for a new
  // one. Nothing here can book.
  const problem = stopped ?? (page.link.state === "invalid" || page.link.state === "expired" ? page.link : null);
  if (problem) {
    return (
      <Frame lang={lang} onLang={toggle} shop={shop} context={t.context} short>
        <section className="cx-hero" style={{ "--i": 0 } as React.CSSProperties}>
          <span className="cx-eyebrow">{t.eyebrow}</span>
          <h1>{t.title}</h1>
        </section>
        <p className="cx-warn" role="alert" style={{ "--i": 1 } as React.CSSProperties}>
          {lang === "ar" && problem.message_ar ? problem.message_ar : problem.message}
        </p>
        {whatsapp && (
          <a className="cx-btn" style={{ "--i": 2 } as React.CSSProperties} href={whatsapp}>
            <Glyph name="wa" />{t.askShop}
          </a>
        )}
      </Frame>
    );
  }

  if (booked) {
    const person = lang === "ar" ? booked.resource_ar ?? booked.resource : booked.resource;
    const place = page.resources.find((r) => r.name === booked.resource)?.kind === "place";
    const what = (
      <p><b><bdi>{booked.service}{person ? t.withWhom(person, place) : ""}</bdi></b> · <span className="num" dir="ltr">{booked.when_text}</span></p>
    );
    if (booked.deposit) {
      const money = formatPrice(booked.deposit.amount, lang);
      return (
        <Frame lang={lang} onLang={toggle} shop={shop} context={t.context} short>
          <section className="cx-done" role="status">
            <h1>{t.held(booked.number)}</h1>
            {what}
            <p>{t.heldText(money, holdMinutes)}</p>
            <p className="cx-note">{termsSentence(booked.deposit.terms, lang)}</p>
          </section>
          <a className="cx-btn" href={booked.deposit.pay_path}><Glyph name="card" />{t.payDeposit} · <bdi>{money}</bdi></a>
          <p className="cx-note">{STAND_IN[lang]}</p>
        </Frame>
      );
    }
    return (
      <Frame lang={lang} onLang={toggle} shop={shop} context={t.context} short>
        <Done title={t.booked(booked.number)}>
          {what}
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
        {page.customer ? <Who label={t.hello(customerName(page.customer.name, lang))} /> : (
          <p className="cx-warn">{whatsapp ? t.startOnWhatsApp(shop) : t.noCustomer}</p>
        )}
        {!page.customer && whatsapp && (
          <a className="cx-btn ghost" href={whatsapp}><Glyph name="wa" />{t.askShop}</a>
        )}
      </section>

      {page.services.length === 0 && <p className="cx-warn">{t.noServices}</p>}

      {page.services.length > 0 && (
        <section className="cx-section" style={{ "--i": 1 } as React.CSSProperties}>
          <h2><span className={`cx-step ${serviceId ? "done" : ""}`}>1</span>{t.service}</h2>
          <div className="cx-card" role="radiogroup" aria-label={t.service}>
            {page.services.map((s) => (
              <button key={s.id} role="radio" aria-checked={serviceId === s.id} className="cx-choice"
                onClick={() => { setResourceId(""); pick(setServiceId, s.id); }}>
                <span className="cx-row-text">
                  <b>{lang === "ar" && s.name_ar ? s.name_ar : s.name}</b>
                  <span className="num">{t.minutes(s.duration_minutes)}{s.price ? <> · <bdi>{formatPrice(s.price, lang)}</bdi></> : null}{s.deposit ? <> · <bdi>{t.depositTag(formatPrice(s.deposit, lang))}</bdi></> : null}</span>
                </span>
                <span className="cx-radio"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
              </button>
            ))}
          </div>
        </section>
      )}

      {choosing && (
        <section className="cx-section">
          <h2><span className="cx-step done">2</span>{t.who}</h2>
          <div className="cx-card" role="radiogroup" aria-label={t.who}>
            {[{ id: "", label: t.anyone, sub: t.anyoneHint }, ...doers.map((r) => ({ id: r.id, label: nameOf(r), sub: "" }))].map((o) => (
              <button key={o.id || "anyone"} role="radio" aria-checked={resourceId === o.id} className="cx-choice"
                onClick={() => pick(setResourceId, o.id)}>
                <span className="cx-row-text">
                  <b><bdi>{o.label}</bdi></b>
                  {o.sub && <span>{o.sub}</span>}
                </span>
                <span className="cx-radio"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
              </button>
            ))}
          </div>
        </section>
      )}

      {serviceId && (
        <section className="cx-section">
          <h2><span className={`cx-step ${day ? "done" : ""}`}>{step(2)}</span>{t.day}</h2>
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
          <h2><span className={`cx-step ${start ? "done" : ""}`}>{step(3)}</span>{t.time}</h2>
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

      {start && chosenService && chosenService.deposit > 0 && (
        <section className="cx-section cx-deposit" aria-labelledby="cx-deposit-h">
          <h2 id="cx-deposit-h"><span className="cx-step done">{step(4)}</span>{t.depositTag(formatPrice(chosenService.deposit, lang))}</h2>
          <div className="cx-card cx-terms">
            <p>{t.depositAsk(formatPrice(chosenService.deposit, lang), holdMinutes)}</p>
            <p>{termsSentence(page.deposit_terms, lang)}</p>
            <p className="cx-note">{STAND_IN[lang]}</p>
          </div>
        </section>
      )}

      {!start && error && <div className="cx-error" role="alert">{error}</div>}

      {start && chosenService && (
        <div className="cx-bar">
          <div className="cx-bar-in">
            {error && <div className="cx-error" role="alert">{error}</div>}
            <div className="cx-sum">
              <span>{lang === "ar" && chosenService.name_ar ? chosenService.name_ar : chosenService.name}</span>
              <b className="num" dir="ltr">{part(day, { weekday: "short", day: "numeric", month: "short" })} · {timeLabel(start)}</b>
            </div>
            <input className="cx-input" value={note} maxLength={500} placeholder={t.note} aria-label={t.note}
              onChange={(e) => setNote(e.target.value)} dir="auto" />
            <button className="cx-btn" disabled={busy || !page.customer} onClick={confirm}>
              <Glyph name="check" />{chosenService.deposit > 0 ? t.confirmPay : t.confirm}
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
