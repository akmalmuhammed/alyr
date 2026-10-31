"use client";

// Setting up bookings, for an owner or admin (ALY-27, D-084, spec 033; ALY-259, D-140, spec 043):
// the services (`BookingsServices.tsx`), the people and chairs and their own working hours, the
// shop's deposit rule (with the sentence the customer will read) and the review request. One
// part at a time, so a phone is not a page of forms. Agents never see this panel, and the API
// refuses them anyway. Words in `bookingsCopy.ts`.

import { useCallback, useEffect, useState } from "react";
import { termsSentence, type DepositTerms } from "../_customer/deposit";
import { BookingsServices } from "./BookingsServices";
import { BOOKINGS, type BookingsCopy, type Lang } from "./bookingsCopy";
import type { ServiceRow } from "./bookingsServiceForm";

type Period = { weekday: number; opens: string; closes: string };
type Resource = { id: string; name: string; name_ar: string; kind: "person" | "place"; active: boolean; hours: Period[] };
export type Part = "services" | "people" | "rules";
const PARTS: Part[] = ["services", "people", "rules"];
type Settings = DepositTerms & { review: { on: boolean; link: string } };

async function send(url: string, method: string, body: unknown): Promise<string> {
  try {
    const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (response.ok) return "";
    const data = await response.json().catch(() => ({}));
    const detail = data?.detail;
    return (typeof detail === "object" && detail?.code) || "generic";
  } catch {
    return "generic";
  }
}

export function BookingsSetup({ lang, start = "services", onChanged, onClose }: {
  lang: Lang; start?: Part; onChanged: () => void; onClose: () => void;
}) {
  const t = BOOKINGS[lang];
  const [resources, setResources] = useState<Resource[] | null>(null);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [part, setPart] = useState<Part>(start);
  const [said, setSaid] = useState("");

  const load = useCallback(async () => {
    const [r, s, g] = await Promise.all([
      fetch("/api/resources", { cache: "no-store" }).then((x) => x.json()),
      fetch("/api/services", { cache: "no-store" }).then((x) => x.json()),
      fetch("/api/bookings/settings", { cache: "no-store" }).then((x) => x.json()),
    ]).catch(() => [null, null, null]);
    if (r) setResources(r.resources);
    if (s) setServices(s.services);
    if (g) setSettings(g);
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  async function save(url: string, method: string, body: unknown, done?: string): Promise<string> {
    const code = await send(url, method, body);
    setSaid(code ? (code === "last_resource" ? t.lastOne : t.errors[code] ?? t.errors.generic) : done ?? t.saved);
    if (!code) {
      await load();
      onChanged();
    }
    return code;
  }

  if (!resources || !settings) return <p className="bk-quiet" role="status">{t.loading}</p>;
  return (
    <div className="bk-setup-body">
      <div className="bk-setup-top">
        <h2>{t.setup}</h2>
        <button type="button" className="btn" onClick={onClose}>{t.setupBack}</button>
      </div>
      <div className="bk-parts" role="group" aria-label={t.partsLabel}>
        {PARTS.map((p) => (
          <button key={p} type="button" className="bk-partbtn" aria-pressed={part === p}
            onClick={() => { setPart(p); setSaid(""); }}>{t.parts[p]}</button>
        ))}
      </div>
      <p className="bk-said" role="status" aria-live="polite">{said}</p>

      {part === "services" && (
        <BookingsServices t={t} lang={lang} services={services} people={resources} save={save} />
      )}

      {part === "people" && (
        <section className="bk-part" aria-labelledby="bk-people">
          <h3 id="bk-people">{t.people}</h3>
          <p className="bk-quiet">{t.peopleHint}</p>
          <ul className="bk-people">
            {resources.map((r) => <PersonRow key={r.id} r={r} t={t} save={save} />)}
          </ul>
          <AddPerson t={t} save={save} />
        </section>
      )}

      {part === "rules" && (
        <>
          <p className="bk-quiet">{t.depositsMoved}</p>
          <RuleForm t={t} lang={lang} settings={settings} save={save} />
          <ReviewForm t={t} settings={settings} save={save} />
        </>
      )}
    </div>
  );
}

type Save = (url: string, method: string, body: unknown, done?: string) => Promise<string>;

function PersonRow({ r, t, save }: { r: Resource; t: BookingsCopy; save: Save }) {
  const [name, setName] = useState(r.name);
  const [nameAr, setNameAr] = useState(r.name_ar);
  const [kind, setKind] = useState(r.kind);
  const [own, setOwn] = useState(r.hours.length > 0);
  const [week, setWeek] = useState(() => Array.from({ length: 7 }, (_, d) => {
    const p = r.hours.find((h) => h.weekday === d);
    return { on: Boolean(p), opens: p?.opens ?? "10:00", closes: p?.closes ?? "20:00" };
  }));
  const id = `bk-r-${r.id}`;
  return (
    <li className="bk-person">
      <form className="bk-grid" onSubmit={(e) => { e.preventDefault(); void save(`/api/resources/${r.id}`, "PATCH", { name, name_ar: nameAr, kind }); }}>
        <label className="bk-field" htmlFor={`${id}-n`}><span>{t.nameEn}</span>
          <input id={`${id}-n`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} required dir="auto" /></label>
        <label className="bk-field" htmlFor={`${id}-a`}><span>{t.nameAr}</span>
          <input id={`${id}-a`} value={nameAr} maxLength={120} onChange={(e) => setNameAr(e.target.value)} dir="rtl" lang="ar" /></label>
        <label className="bk-field" htmlFor={`${id}-k`}><span>{t.kindLabel}</span>
          <select id={`${id}-k`} value={kind} onChange={(e) => setKind(e.target.value as Resource["kind"])}>
            <option value="person">{t.kind.person}</option>
            <option value="place">{t.kind.place}</option>
          </select></label>
        <div className="bk-acts"><button type="submit" className="btn small">{t.save}</button></div>
      </form>
      <label className="bk-check">
        <input type="checkbox" checked={r.active} onChange={(e) => void save(`/api/resources/${r.id}/active`, "POST", { active: e.target.checked })} />
        <span>{t.on}</span>
      </label>
      <label className="bk-check">
        <input type="checkbox" checked={own} onChange={(e) => {
          setOwn(e.target.checked);
          if (!e.target.checked) void save(`/api/resources/${r.id}/hours`, "PUT", { periods: [] });
        }} />
        <span>{own ? t.ownHours : t.shopHours}</span>
      </label>
      {own && (
        <form className="bk-week" onSubmit={(e) => {
          e.preventDefault();
          void save(`/api/resources/${r.id}/hours`, "PUT", {
            periods: week.flatMap((d, weekday) => (d.on ? [{ weekday, opens: d.opens, closes: d.closes }] : [])),
          });
        }}>
          {week.map((d, weekday) => (
            <div key={weekday} className="bk-wday">
              <label className="bk-check">
                <input type="checkbox" checked={d.on} onChange={(e) => setWeek(week.map((x, i) => (i === weekday ? { ...x, on: e.target.checked } : x)))} />
                <span>{t.weekdays[weekday]}</span>
              </label>
              {d.on && (
                <span className="bk-span" dir="ltr">
                  <label className="bk-visually" htmlFor={`${id}-o${weekday}`}>{t.from} {t.weekdays[weekday]}</label>
                  <input id={`${id}-o${weekday}`} type="time" value={d.opens} onChange={(e) => setWeek(week.map((x, i) => (i === weekday ? { ...x, opens: e.target.value } : x)))} />
                  <span aria-hidden="true">–</span>
                  <label className="bk-visually" htmlFor={`${id}-c${weekday}`}>{t.to} {t.weekdays[weekday]}</label>
                  <input id={`${id}-c${weekday}`} type="time" value={d.closes} onChange={(e) => setWeek(week.map((x, i) => (i === weekday ? { ...x, closes: e.target.value } : x)))} />
                </span>
              )}
            </div>
          ))}
          <div className="bk-acts"><button type="submit" className="btn small">{t.saveHours}</button></div>
        </form>
      )}
    </li>
  );
}

function AddPerson({ t, save }: { t: BookingsCopy; save: Save }) {
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [kind, setKind] = useState<"person" | "place">("person");
  return (
    <form className="bk-grid bk-addperson" onSubmit={async (e) => {
      e.preventDefault();
      if (!(await save("/api/resources", "POST", { name, name_ar: nameAr, kind }))) { setName(""); setNameAr(""); }
    }}>
      <label className="bk-field" htmlFor="bk-new-n"><span>{t.nameEn}</span>
        <input id="bk-new-n" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} required dir="auto" /></label>
      <label className="bk-field" htmlFor="bk-new-a"><span>{t.nameAr}</span>
        <input id="bk-new-a" value={nameAr} maxLength={120} onChange={(e) => setNameAr(e.target.value)} dir="rtl" lang="ar" /></label>
      <label className="bk-field" htmlFor="bk-new-k"><span>{t.kindLabel}</span>
        <select id="bk-new-k" value={kind} onChange={(e) => setKind(e.target.value as "person" | "place")}>
          <option value="person">{t.kind.person}</option>
          <option value="place">{t.kind.place}</option>
        </select></label>
      <div className="bk-acts"><button type="submit" className="btn small">{t.addPerson}</button></div>
    </form>
  );
}

function RuleForm({ t, lang, settings, save }: { t: BookingsCopy; lang: Lang; settings: Settings; save: Save }) {
  const [noShow, setNoShow] = useState(settings.no_show);
  const [late, setLate] = useState(settings.late_cancel);
  const [hours, setHours] = useState(String(settings.cancel_hours));
  const preview = termsSentence({ no_show: noShow, late_cancel: late, cancel_hours: Number(hours) || 0 }, lang);
  return (
    <section className="bk-part" aria-labelledby="bk-rule">
      <h3 id="bk-rule">{t.rule}</h3>
      <p className="bk-quiet">{t.ruleHint}</p>
      <form className="bk-grid" onSubmit={(e) => {
        e.preventDefault();
        void save("/api/bookings/settings", "PUT", { deposit_no_show: noShow, deposit_late_cancel: late, deposit_cancel_hours: Number(hours) });
      }}>
        <label className="bk-field" htmlFor="bk-rule-ns"><span>{t.noShowRule}</span>
          <select id="bk-rule-ns" value={noShow} onChange={(e) => setNoShow(e.target.value as "keep" | "refund")}>
            <option value="keep">{t.keepIt}</option><option value="refund">{t.refundIt}</option>
          </select></label>
        <label className="bk-field" htmlFor="bk-rule-late"><span>{t.lateRule}</span>
          <select id="bk-rule-late" value={late} onChange={(e) => setLate(e.target.value as "keep" | "refund")}>
            <option value="keep">{t.keepIt}</option><option value="refund">{t.refundIt}</option>
          </select></label>
        <label className="bk-field" htmlFor="bk-rule-h"><span>{t.lateHours}</span>
          <input id="bk-rule-h" type="number" inputMode="numeric" min={0} max={168} value={hours} onChange={(e) => setHours(e.target.value)} required dir="ltr" /></label>
        <div className="bk-acts"><button type="submit" className="btn small">{t.saveSettings}</button></div>
      </form>
      <p className="bk-preview"><span>{t.customerSees}</span> {preview}</p>
    </section>
  );
}

function ReviewForm({ t, settings, save }: { t: BookingsCopy; settings: Settings; save: Save }) {
  const [on, setOn] = useState(settings.review.on);
  const [link, setLink] = useState(settings.review.link);
  return (
    <section className="bk-part" aria-labelledby="bk-review">
      <h3 id="bk-review">{t.review}</h3>
      <p className="bk-quiet">{t.reviewHint}</p>
      <form className="bk-grid" onSubmit={(e) => { e.preventDefault(); void save("/api/bookings/settings", "PUT", { review_requests: on, review_link: link }); }}>
        <label className="bk-check"><input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /><span>{t.reviewOn}</span></label>
        <label className="bk-field wide" htmlFor="bk-review-link"><span>{t.reviewLink}</span>
          <input id="bk-review-link" type="url" inputMode="url" value={link} maxLength={500} placeholder="https://" onChange={(e) => setLink(e.target.value)} dir="ltr" /></label>
        <div className="bk-acts"><button type="submit" className="btn small">{t.saveSettings}</button></div>
      </form>
    </section>
  );
}
