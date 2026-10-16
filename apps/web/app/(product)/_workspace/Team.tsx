"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

// The team report (D-028): who is handling what, how fast customers get an answer, how
// conversations end, and the sales each person looks after. Owners and admins see
// everyone; an agent sees their own numbers.

type Closed = Partial<Record<"sold" | "booked" | "answered" | "lost" | "unsaid", number>>;
type Person = {
  id: string; name: string; role: string; open: number; waiting: number;
  oldest_wait_minutes: number | null; replies: number; median_reply_seconds: number | null;
  closed: Closed; closed_total: number; orders: number; sales: number; sales_text: string;
  bookings_completed: number; no_shows: number;
};
type Report = {
  days: number; waiting_minutes: number; can_see_everyone: boolean;
  unassigned: { open: number; waiting: number; oldest_wait_minutes: number | null };
  totals: { waiting: number; open: number; closed: number; sold: number; sales_text: string; median_reply_seconds: number | null };
  people: Person[];
};
type Lang = "en" | "ar";

const OUTCOMES = ["sold", "booked", "answered", "lost"] as const;

const T = {
  en: {
    title: "How the team is doing", mine: "Your numbers",
    periods: { 1: "Today", 7: "7 days", 30: "30 days" } as Record<number, string>,
    waitingNow: "Waiting for an answer", firstReply: "Typical first reply", closed: "Conversations closed",
    sales: "Sales looked after", sold: (n: number) => `${n} sold`,
    oldest: (m: number) => `longest ${duration(m * 60, "en")}`, nobodyWaiting: "Nobody is waiting",
    noReplies: "No replies yet",
    unassigned: (n: number, m: number | null, limit: number) =>
      `${n} ${n === 1 ? "customer has" : "customers have"} waited over ${limit} minutes with nobody on ${n === 1 ? "it" : "them"}${m ? `, the longest ${duration(m * 60, "en")}` : ""}.`,
    openInbox: "Open the inbox",
    open: "open", waiting: "waiting", replies: (n: number) => `${n} ${n === 1 ? "reply" : "replies"}`,
    reply: "first reply", orders: (n: number) => `${n} ${n === 1 ? "order" : "orders"}`,
    visits: (c: number, n: number) => `${c} came${n ? `, ${n} no-show` : ""}`,
    outcomes: { sold: "Sold", booked: "Booked", answered: "Answered", lost: "Lost" } as Record<string, string>,
    nothingClosed: "Nothing closed yet",
    roles: { owner: "Owner", admin: "Admin", agent: "Agent" } as Record<string, string>,
    sign: "Sign replies with the sender's first name",
    signHint: "Customers see who is looking after them.",
    example: "Your order is ready for collection.",
    unknown: "Cannot load the team's numbers right now.",
  },
  ar: {
    title: "أداء الفريق", mine: "أرقامك",
    periods: { 1: "اليوم", 7: "٧ أيام", 30: "٣٠ يوماً" } as Record<number, string>,
    waitingNow: "بانتظار الرد", firstReply: "زمن أول رد المعتاد", closed: "محادثات مغلقة",
    sales: "مبيعات يتابعها الفريق", sold: (n: number) => `${n} تم البيع`,
    oldest: (m: number) => `أطولها ${duration(m * 60, "ar")}`, nobodyWaiting: "لا أحد ينتظر",
    noReplies: "لا ردود بعد",
    unassigned: (n: number, m: number | null, limit: number) =>
      `${n} عميل ينتظرون أكثر من ${limit} دقائق دون مسؤول${m ? `، أطولهم ${duration(m * 60, "ar")}` : ""}.`,
    openInbox: "افتح المحادثات",
    open: "مفتوحة", waiting: "تنتظر", replies: (n: number) => `${n} رد`,
    reply: "أول رد", orders: (n: number) => `${n} طلب`,
    visits: (c: number, n: number) => `${c} حضروا${n ? `، ${n} لم يحضر` : ""}`,
    outcomes: { sold: "تم البيع", booked: "تم الحجز", answered: "تمت الإجابة", lost: "خسرناه" } as Record<string, string>,
    nothingClosed: "لم تُغلق محادثات بعد",
    roles: { owner: "مالك", admin: "مدير", agent: "موظف" } as Record<string, string>,
    sign: "وقّع الردود باسم المرسل الأول",
    signHint: "يعرف العميل من يتابع طلبه.",
    example: "طلبك جاهز للاستلام.",
    unknown: "تعذّر تحميل أرقام الفريق الآن.",
  },
};

function duration(seconds: number, lang: Lang) {
  const minutes = Math.round(seconds / 60);
  if (lang === "ar") {
    if (seconds < 60) return "أقل من دقيقة";
    if (minutes < 60) return `${minutes} د`;
    return `${Math.floor(minutes / 60)} س ${minutes % 60} د`;
  }
  if (seconds < 60) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export function TeamReport({ lang, canManage, signer }: { lang: Lang; canManage: boolean; signer: string }) {
  const [days, setDays] = useState(1);
  const [report, setReport] = useState<Report | null>(null);
  const [failed, setFailed] = useState(false);
  const [sign, setSign] = useState<boolean | null>(null);
  const t = T[lang];

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([
        fetch(`/api/team/performance?days=${days}`, { cache: "no-store" }).then((x) => (x.ok ? x.json() : Promise.reject())),
        fetch("/api/team/settings", { cache: "no-store" }).then((x) => (x.ok ? x.json() : Promise.reject())),
      ]);
      setReport(r);
      setSign(s.sign_replies);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [days]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 30_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [load]);

  async function toggleSign() {
    const next = !sign;
    setSign(next);
    const response = await fetch("/api/team/settings", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ sign_replies: next }),
    });
    if (!response.ok) setSign(!next);
  }

  if (failed && !report) return <p className="sh-note">{t.unknown}</p>;
  if (!report) return null;

  const { totals, unassigned } = report;
  const maxSales = Math.max(1, ...report.people.map((p) => p.sales));
  const me = report.people[0];

  return (
    <section className="tm" aria-label={report.can_see_everyone ? t.title : t.mine}>
      <div className="tm-head">
        <h2>{report.can_see_everyone ? t.title : t.mine}</h2>
        <div className="tm-seg" role="radiogroup" aria-label={t.title}>
          {[1, 7, 30].map((d) => (
            <button key={d} role="radio" aria-checked={days === d} onClick={() => setDays(d)}>{t.periods[d]}</button>
          ))}
        </div>
      </div>

      {report.can_see_everyone && unassigned.waiting > 0 && (
        <div className="tm-alert" role="status">
          <span className="sh-dot" />
          <p>{t.unassigned(unassigned.waiting, unassigned.oldest_wait_minutes, report.waiting_minutes)}</p>
          <Link className="btn small" href="/app/inbox">{t.openInbox}</Link>
        </div>
      )}

      <div className="tm-strip">
        <div className={`tm-stat ${(report.can_see_everyone ? totals.waiting : me?.waiting) ? "warn" : ""}`}>
          <span>{t.waitingNow}</span>
          <b className="num">{report.can_see_everyone ? totals.waiting : me?.waiting ?? 0}</b>
          <small>{(report.can_see_everyone ? totals.waiting : me?.waiting)
            ? t.oldest((report.can_see_everyone
                ? Math.max(unassigned.oldest_wait_minutes ?? 0, ...report.people.map((p) => p.oldest_wait_minutes ?? 0))
                : me?.oldest_wait_minutes) ?? 0)
            : t.nobodyWaiting}</small>
        </div>
        <div className="tm-stat">
          <span>{t.firstReply}</span>
          {(() => {
            const seconds = report.can_see_everyone ? totals.median_reply_seconds : me?.median_reply_seconds;
            return <b className="num">{seconds == null ? "–" : duration(seconds, lang)}</b>;
          })()}
          <small>{t.replies(report.people.reduce((n, p) => n + p.replies, 0))}</small>
        </div>
        <div className="tm-stat">
          <span>{t.closed}</span>
          <b className="num">{report.can_see_everyone ? totals.closed : me?.closed_total ?? 0}</b>
          <small>{t.sold(report.can_see_everyone ? totals.sold : me?.closed.sold ?? 0)}</small>
        </div>
        <div className="tm-stat">
          <span>{t.sales}</span>
          <b className="num" dir="ltr">{report.can_see_everyone ? totals.sales_text : me?.sales_text}</b>
          <small>{t.orders(report.people.reduce((n, p) => n + p.orders, 0))}</small>
        </div>
      </div>

      <ul className="tm-people">
        {report.people.map((p) => {
          const closedKnown = OUTCOMES.reduce((n, o) => n + (p.closed[o] ?? 0), 0);
          return (
            <li key={p.id}>
              <div className="tm-who">
                <span className="sh-avatar">{initials(p.name)}</span>
                <span><b>{p.name}</b><small>{t.roles[p.role] ?? p.role}</small></span>
              </div>
              <div className="tm-load">
                <span className="num">{p.open} {t.open}</span>
                {p.waiting > 0 && (
                  <span className="sh-pill wait">{p.waiting} {t.waiting}{p.oldest_wait_minutes ? ` · ${duration(p.oldest_wait_minutes * 60, lang)}` : ""}</span>
                )}
              </div>
              <div className="tm-reply">
                <b className="num">{p.median_reply_seconds == null ? "–" : duration(p.median_reply_seconds, lang)}</b>
                <small>{p.replies ? `${t.reply} · ${t.replies(p.replies)}` : t.noReplies}</small>
              </div>
              <div className="tm-outcomes">
                {closedKnown > 0 ? (
                  <>
                    <div className="tm-bar" aria-hidden="true">
                      {OUTCOMES.map((o) => (p.closed[o] ? <span key={o} className={`o-${o}`} style={{ flexGrow: p.closed[o] }} /> : null))}
                    </div>
                    <small>
                      {OUTCOMES.filter((o) => p.closed[o]).map((o) => `${t.outcomes[o]} ${p.closed[o]}`).join(" · ")}
                    </small>
                  </>
                ) : <small>{t.nothingClosed}</small>}
              </div>
              <div className="tm-sales">
                <b className="num" dir="ltr">{p.sales_text}</b>
                <div className="tm-meter" aria-hidden="true"><span style={{ width: `${(p.sales / maxSales) * 100}%` }} /></div>
                <small>
                  {t.orders(p.orders)}
                  {(p.bookings_completed || p.no_shows) ? ` · ${t.visits(p.bookings_completed, p.no_shows)}` : ""}
                </small>
              </div>
            </li>
          );
        })}
      </ul>

      {canManage && sign !== null && (
        <div className="tm-setting">
          <button type="button" role="switch" className="sh-switch" aria-checked={sign} aria-label={t.sign} onClick={toggleSign} />
          <div>
            <b>{t.sign}</b>
            <small>{t.signHint}</small>
          </div>
          <p className="tm-sample" dir="auto">{t.example}<br />— {signer.split(" ")[0]}</p>
        </div>
      )}
    </section>
  );
}
