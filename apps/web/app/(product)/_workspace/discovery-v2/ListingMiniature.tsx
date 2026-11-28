// The live miniature of the page a change lands on, as customers see it NOW: the place's name, what
// the live read shows around it (when that read exists, workstream F), and the field being decided
// as it is today ("No hours" when there are none). What Approve would put there is apart, under
// "After you approve", and only there behind the Volt highlighter (the lead's review of #372).

import { T, wherePage, type D2Lang } from "./copy";
import type { AskView } from "./adapter";
import { choiceLabels, emptyBefore, noneOf, spanText, type Draft } from "./logic";
import { T3 } from "./copy3";
import { Val } from "./frame";
import type { DayKey } from "../discoveryApi";
import { Ic } from "./icons";
import { Hl, Ltr, dayTime } from "./parts";

/** Change it's draft (logic.ts `Draft`): one day's hours, a phone number or a confirmed value. */
export type { Draft } from "./logic";

const ORDER: DayKey[] = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"];
const SHORT: Record<D2Lang, Record<DayKey, string>> = {
  en: { sat: "Sat", sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri" },
  ar: { sat: "السبت", sun: "الأحد", mon: "الاثنين", tue: "الثلاثاء", wed: "الأربعاء", thu: "الخميس", fri: "الجمعة" },
};
const LONG: Record<D2Lang, Record<DayKey, string>> = {
  en: { sat: "Saturday", sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday" },
  ar: { sat: "السبت", sun: "الأحد", mon: "الاثنين", tue: "الثلاثاء", wed: "الأربعاء", thu: "الخميس", fri: "الجمعة" },
};

/** Half-hour steps for the Change it selects. */
export const HALF_HOURS: string[] = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

export function ListingMiniature({ ask, lang, today, settled, readAt, draft, onDraft }: {
  ask: AskView;
  lang: D2Lang;
  /** Today's weekday in Doha: the week starts there, as the listing shows it. */
  today: DayKey;
  /** After Approve: only the new value shows. */
  settled: boolean;
  readAt: string | null;
  /** Change it: the draft (hours of the one day, a phone number or a confirmed value), with its setter. Absent when not editing. */
  draft?: Draft | null;
  onDraft?: (draft: Draft) => void;
}) {
  const t = T[lang];
  const t3 = T3[lang];
  const { p, listing } = ask;
  const start = ORDER.indexOf(today);
  const week = [...ORDER.slice(start), ...ORDER.slice(0, start)];
  const lineOf = (day: DayKey) => p.before.lines.find((l) => l.day === day)?.text ?? "";
  const afterOf = (day: DayKey) => p.after.lines.find((l) => l.day === day)?.text ?? "";
  const hoursShown = p.field === "hours" && (p.before.lines.length > 0 || p.after.lines.length > 0);
  const week7 = draft?.kind === "week" && onDraft ? draft : null;

  /** Change it for a whole week: each day's opening and closing, or Closed. */
  const dayEditor = (day: DayKey) => {
    if (!week7 || !onDraft) return null;
    const v = week7.days[day];
    const set = (next: { open: string; close: string } | null) => onDraft({ kind: "week", days: { ...week7.days, [day]: next } });
    return (
      <span className="d2-edit" dir="ltr">
        <select className="d2-select" aria-label={t.opens(LONG[lang][day])} value={v ? v.open : ""}
          onChange={(e) => set(e.target.value ? { open: e.target.value, close: v?.close ?? "22:00" } : null)}>
          <option value="">{t.closedOption}</option>
          {HALF_HOURS.map((h) => <option key={h}>{h}</option>)}
        </select>
        {v ? (
          <>
            {" – "}
            <select className="d2-select" aria-label={t.closes(LONG[lang][day])} value={v.close} onChange={(e) => set({ open: v.open, close: e.target.value })}>
              {HALF_HOURS.map((h) => <option key={h}>{h}</option>)}
            </select>
          </>
        ) : null}
      </span>
    );
  };
  const shownAfter = ask.after;
  // Nothing is there today: no hours on any day, or an empty field.
  const nowEmpty = p.field === "hours" ? p.before.lines.length === 0 && !settled : emptyBefore(p);
  const afterRtl = /[؀-ۿ]/.test(shownAfter);
  // The hours Approve would put there, days with the same hours run together («Sat–Thu 07:00–22:00»).
  const afterRuns: { label: string; text: string; from: DayKey; to: DayKey }[] = [];
  for (const day of ORDER.filter((d) => ask.days.includes(d))) {
    const text = spanText(afterOf(day), lang);
    const last = afterRuns[afterRuns.length - 1];
    const prev = ORDER[ORDER.indexOf(day) - 1];
    if (last && last.text === text && prev && ask.days.includes(prev) && last.to === prev) { last.to = day; last.label = `${SHORT[lang][last.from]}–${SHORT[lang][day]}`; }
    else afterRuns.push({ label: SHORT[lang][day], text, from: day, to: day });
  }
  const choices = choiceLabels(p);

  const editor = (d: Draft, set: (draft: Draft) => void) => {
    if (d.kind === "week") return null;
    if (d.kind === "hours") {
      return (
        <span className="d2-edit" dir="ltr">
          <select className="d2-select" aria-label={t.opens(LONG[lang][d.day])} value={d.open} onChange={(e) => set({ ...d, open: e.target.value })}>
            {HALF_HOURS.map((h) => <option key={h}>{h}</option>)}
          </select>
          {" – "}
          <select className="d2-select" aria-label={t.closes(LONG[lang][d.day])} value={d.close} onChange={(e) => set({ ...d, close: e.target.value })}>
            {HALF_HOURS.map((h) => <option key={h}>{h}</option>)}
          </select>
        </span>
      );
    }
    if (d.kind === "phone") {
      return (
        <span className="d2-edit" dir="ltr">
          <input className="d2-select d2-input" type="tel" inputMode="tel" autoComplete="off" aria-label={t.editPhoneLabel} value={d.phone} onChange={(e) => set({ ...d, phone: e.target.value })} />
        </span>
      );
    }
    return (
      <span className="d2-edit">
        <select className="d2-select" aria-label={t.editChoiceLabel} value={String(d.index)} onChange={(e) => set({ ...d, index: Number(e.target.value) })}>
          {choices.map((c, i) => <option key={`${c}-${i}`} value={String(i)}>{c}</option>)}
        </select>
      </span>
    );
  };

  return (
    <figure className="d2-object">
      <figcaption className="d2-object-label"><Ic name="eye" size="xs" />{wherePage(ask.where, lang)}</figcaption>
      <div className="d2-listing" role="group" aria-label={t.listingMini}>
        {/* A name ask: the name customers see now is the listing's name. */}
        <p className="d2-listing-name">{p.field === "name" ? (settled ? shownAfter : ask.before || ask.place) : ask.place}</p>
        {listing && listing.rating !== null ? (
          <div className="d2-g-rate">
            <span className="d2-g-v">{listing.rating.toFixed(1)}</span>
            <span className="d2-g-stars" aria-hidden="true">★★★★★</span>
            {listing.reviews !== null ? <Ltr>({listing.reviews.toLocaleString("en")})</Ltr> : null}
          </div>
        ) : null}
        {listing?.category ? <div className="d2-g-cat">{listing.category}</div> : null}
        {listing?.openLine ? <div className="d2-g-open"><b>{t.openNow}</b> · {listing.openLine}</div> : null}
        {/* The listing as customers see it now: the value being decided is shown as it is today
            (or "No hours" when there is none). What Approve would put there is apart, below. */}
        {hoursShown && !nowEmpty ? (
          <div className="d2-g-hours" role="table" aria-label={t.listingHours}>
            {week.map((day) => {
              const changes = ask.days.includes(day);
              const text = settled ? afterOf(day) : lineOf(day);
              return (
                <div key={day} role="row" className={changes && !settled ? "d2-g-focus" : day === today ? "d2-g-today" : undefined}>
                  <span role="cell">{LONG[lang][day]}</span>
                  <span role="cell" className="d2-tnum">{text ? <Ltr>{spanText(text, lang)}</Ltr> : <span className="d2-g-none">{T[lang].closedOption}</span>}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="d2-g-hours d2-g-field" role="table" aria-label={p.field_label}>
            <div role="row" className={settled ? undefined : "d2-g-focus"}>
              <span role="cell">{p.field_label}</span>
              <span role="cell">{settled ? <Val text={shownAfter} /> : nowEmpty ? <span className="d2-g-none">{noneOf(p.field, lang)}</span> : <Val text={ask.before} />}</span>
            </div>
          </div>
        )}        {readAt ? (
          <div className="d2-g-foot"><span>{t.readLive(dayTime(readAt, lang))}</span>{ask.where === "google" ? <span>{t.notStored}</span> : null}</div>
        ) : null}
      </div>
      {settled ? null : (
        <div className="d2-object-after" aria-label={t3.afterApprove}>
          <span className="d2-object-after-k"><Ic name="arrow" size="xs" flip />{t3.afterApprove}</span>
          {draft && onDraft && draft.kind !== "week" ? <div className="d2-object-after-v">{editor(draft, onDraft)}</div>
            : week7 ? (
              <div className="d2-g-hours d2-g-week-edit" role="table" aria-label={t.listingHours}>
                {ORDER.map((day) => <div key={day} role="row"><span role="cell">{LONG[lang][day]}</span><span role="cell">{dayEditor(day)}</span></div>)}
              </div>
            ) : hoursShown && !ask.day ? (
              <ul className="d2-object-after-runs">
                {afterRuns.map((r) => <li key={r.label}><span>{r.label}</span><Hl><Ltr>{r.text}</Ltr></Hl></li>)}
              </ul>
            ) : (
              <div className="d2-object-after-v" dir={afterRtl ? "rtl" : undefined}>{hoursShown && ask.day ? <span className="d2-object-after-day">{LONG[lang][ask.day]}</span> : null}<Hl><Val text={shownAfter} /></Hl></div>
            )}
        </div>
      )}    </figure>
  );
}
