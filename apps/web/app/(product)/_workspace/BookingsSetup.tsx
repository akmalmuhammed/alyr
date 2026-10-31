"use client";

// Setting up bookings, for an owner or admin (ALY-27, D-084, spec 033; ALY-259, D-140, spec 043):
// the services (`BookingsServices.tsx`), the opening hours and days off (`BookingsHours.tsx`),
// the people and chairs (what each does, what is booked ahead, retiring, their own hours, their
// order), the shop's deposit rule (with the sentence the customer will read) and the review
// request. One part at a time, so a phone is not a page of forms. Agents never see this panel,
// and the API refuses them anyway. Words in `bookingsCopy.ts`.

import { useCallback, useEffect, useState } from "react";
import { termsSentence, type DepositTerms } from "../_customer/deposit";
import { send } from "./bookingsApi";
import { BookingsHours } from "./BookingsHours";
import { OrderButtons } from "./BookingsOrder";
import { BookingsServices } from "./BookingsServices";
import { BOOKINGS, type BookingsCopy, type Lang } from "./bookingsCopy";
import { reorder } from "./bookingsReorder";
import type { ServiceRow } from "./bookingsServiceForm";
import { WeekEditor } from "./BookingsWeek";

import type { Period } from "./bookingsWeekLogic";
type Resource = {
  id: string; name: string; name_ar: string; kind: "person" | "place"; active: boolean; hours: Period[];
  does: string[]; does_all: boolean; upcoming: number;
};
export type Part = "services" | "hours" | "people" | "rules";
const PARTS: Part[] = ["services", "hours", "people", "rules"];
type Settings = DepositTerms & { review: { on: boolean; link: string } };

export function BookingsSetup({ lang, start = "services", onChanged, onClose }: {
  lang: Lang; start?: Part; onChanged: () => void; onClose: (day?: string) => void;
}) {
  const t = BOOKINGS[lang];
  const [resources, setResources] = useState<Resource[] | null>(null);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [shopHours, setShopHours] = useState<Period[]>([]);
  const [part, setPart] = useState<Part>(start);
  const [said, setSaid] = useState("");

  const load = useCallback(async () => {
    const [r, s, g, h] = await Promise.all([
      fetch("/api/resources", { cache: "no-store" }).then((x) => x.json()),
      fetch("/api/services", { cache: "no-store" }).then((x) => x.json()),
      fetch("/api/bookings/settings", { cache: "no-store" }).then((x) => x.json()),
      fetch("/api/hours", { cache: "no-store" }).then((x) => x.json()),
    ]).catch(() => [null, null, null, null]);
    if (r) setResources(r.resources);
    if (s) setServices(s.services);
    if (g) setSettings(g);
    if (h) setShopHours(h.periods);
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  async function save(url: string, method: string, body: unknown, done?: string | ((data: Record<string, unknown>) => string)): Promise<string> {
    const { code, data } = await send(url, method, body);
    const stranded = ((data.detail as { services?: string[] } | undefined)?.services ?? []).join(", ");
    setSaid(code
      ? (code === "last_resource" ? t.lastOne : code === "service_needs_someone" ? t.needsSomeone(stranded) : t.errors[code] ?? t.errors.generic)
      : typeof done === "function" ? done(data) : done ?? t.saved);
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
        <button type="button" className="btn" onClick={() => onClose()}>{t.setupBack}</button>
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

      {part === "hours" && (
        <BookingsHours t={t} lang={lang} people={resources} say={setSaid} changed={onChanged} openDay={onClose} />
      )}

      {part === "people" && (
        <section className="bk-part" aria-labelledby="bk-people">
          <h3 id="bk-people">{t.people}</h3>
          <p className="bk-quiet">{t.peopleHint}</p>
          {resources.length > 1 && <p className="bk-quiet">{t.orderHint}</p>}
          <ul className="bk-people">
            {resources.map((r, i) => (
              <PersonRow key={r.id} r={r} t={t} lang={lang} save={save} shopHours={shopHours} services={services}
                first={i === 0} last={i === resources.length - 1}
                move={(direction) => void save("/api/resources/order", "PUT", { ids: reorder(resources.map((x) => x.id), r.id, direction) })} />
            ))}
          </ul>
          <AddPerson t={t} save={save} first={resources.length === 0} />
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

type Save = (url: string, method: string, body: unknown, done?: string | ((data: Record<string, unknown>) => string)) => Promise<string>;

function PersonRow({ r, t, lang, save, shopHours, services, first, last, move }: {
  r: Resource; t: BookingsCopy; lang: Lang; save: Save; shopHours: Period[]; services: ServiceRow[];
  first: boolean; last: boolean; move: (direction: "up" | "down") => void;
}) {
  const [name, setName] = useState(r.name);
  const [nameAr, setNameAr] = useState(r.name_ar);
  const [kind, setKind] = useState(r.kind);
  const [own, setOwn] = useState(r.hours.length > 0);
  const [retiring, setRetiring] = useState(false);
  const id = `bk-r-${r.id}`;
  const shown = lang === "ar" && r.name_ar ? r.name_ar : r.name;
  // What they do, in the services' own names: all of them, or the ones chosen for them.
  const does = r.does_all ? t.doesAll
    : r.does.length === 0 ? t.doesNone
      : t.doesThese(r.does.map((sid) => services.find((x) => x.id === sid)).filter((x): x is ServiceRow => Boolean(x)).map((x) => (lang === "ar" && x.name_ar ? x.name_ar : x.name)).join(lang === "ar" ? "، " : ", "));
  return (
    <li className={`bk-person${r.active ? "" : " is-hidden"}`}>
      <div className="bk-personhead">
        <div className="bk-service-head">
          <p className="bk-service-name"><b><bdi>{shown}</bdi></b>{!r.active && <span className="bk-tag">{t.retired}</span>}</p>
          {r.active && (
            <p className="bk-facts">
              <span><bdi>{does}</bdi></span>
              {r.upcoming > 0 && <span>{t.bookedAhead(r.upcoming)}</span>}
            </p>
          )}
        </div>
        <OrderButtons up={t.moveUp(shown)} down={t.moveDown(shown)} first={first} last={last}
          onUp={() => move("up")} onDown={() => move("down")} />
      </div>
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
        <input type="checkbox" checked={r.active} onChange={(e) => {
          // Someone with bookings still to come is asked first: the bookings stay with them.
          if (!e.target.checked && r.upcoming > 0) { setRetiring(true); return; }
          void save(`/api/resources/${r.id}/active`, "POST", { active: e.target.checked });
        }} />
        <span>{t.on}</span>
      </label>
      {retiring && (
        <div className="bk-form inline" role="group" aria-label={t.retired}>
          <p>{t.retireAsk(r.upcoming)}</p>
          <div className="bk-acts">
            <button type="button" className="btn primary" onClick={async () => {
              await save(`/api/resources/${r.id}/active`, "POST", { active: false });
              setRetiring(false);
            }}>{t.retireYes}</button>
            <button type="button" className="btn ghost" onClick={() => setRetiring(false)}>{t.retireNo}</button>
          </div>
        </div>
      )}
      <label className="bk-check">
        <input type="checkbox" checked={own} onChange={(e) => {
          setOwn(e.target.checked);
          if (!e.target.checked) void save(`/api/resources/${r.id}/hours`, "PUT", { periods: [] });
        }} />
        <span>{own ? t.ownHours : t.shopHours}</span>
      </label>
      {own && (
        <WeekEditor t={t} idp={`${id}-w`} periods={r.hours.length ? r.hours : shopHours} saveLabel={t.saveHours}
          onSave={(periods) => save(`/api/resources/${r.id}/hours`, "PUT", { periods }, t.saved)} />
      )}
    </li>
  );
}

function AddPerson({ t, save, first }: { t: BookingsCopy; save: Save; first: boolean }) {
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [kind, setKind] = useState<"person" | "place">("person");
  return (
    <form className="bk-form" onSubmit={async (e) => {
      e.preventDefault();
      const failed = await save(
        "/api/resources", "POST", { name, name_ar: nameAr, kind },
        (data) => (Number(data.adopted) > 0 ? t.personAddedAdopted(Number(data.adopted)) : t.personAdded),
      );
      if (!failed) { setName(""); setNameAr(""); }
    }}>
      <h4>{t.addPersonTitle}</h4>
      {first && <p className="bk-quiet">{t.firstPersonHint}</p>}
      <div className="bk-grid start">
      <label className="bk-field" htmlFor="bk-new-n"><span>{t.nameEn}</span>
        <input id="bk-new-n" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} required dir="auto" /></label>
      <label className="bk-field" htmlFor="bk-new-a"><span>{t.nameAr}</span>
        <input id="bk-new-a" value={nameAr} maxLength={120} onChange={(e) => setNameAr(e.target.value)} dir="rtl" lang="ar" /></label>
      <label className="bk-field" htmlFor="bk-new-k"><span>{t.kindLabel}</span>
        <select id="bk-new-k" value={kind} onChange={(e) => setKind(e.target.value as "person" | "place")}>
          <option value="person">{t.kind.person}</option>
          <option value="place">{t.kind.place}</option>
        </select></label>
      <div className="bk-acts"><button type="submit" className="btn primary">{t.addPerson}</button></div>
      </div>
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
