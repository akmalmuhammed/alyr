// The live miniature of the page a change lands on, as customers see it: the place's name, what the
// live read shows around it (when that read exists, workstream F), and the field being decided with
// its before struck through and its after behind the highlighter. Hours show the whole week from
// today, the changed day in focus; another field shows its one row.

import { T, wherePage, type D2Lang } from "./copy";
import type { AskView } from "./adapter";
import { choiceLabels, spanText, type Draft } from "./logic";
import type { DayKey } from "../discoveryApi";
import { Ic } from "./icons";
import { Hl, Ltr, dayTime } from "./parts";

/** Change it's draft (logic.ts `Draft`): one day's hours, a phone number or a confirmed value. */
export type { Draft } from "./logic";

const ORDER: DayKey[] = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"];
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
  /** One day of a change on several days: the day's before struck (when there was one) and its after. */
  const dayDiff = (day: DayKey) => {
    const before = spanText(lineOf(day), lang), after = spanText(afterOf(day), lang);
    if (settled) return <span className="d2-new"><Ltr>{after}</Ltr></span>;
    return (
      <span className="d2-diff">
        {lineOf(day) ? <><span className="d2-strike"><Ltr>{before}</Ltr></span><Ic name="arrow" size="xs" flip className="d2-to" /></> : null}
        <span className="d2-new"><Hl><Ltr>{after}</Ltr></Hl></span>
      </span>
    );
  };
  const shownAfter = ask.after;
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

  const diff = (before: string) => (
    <span className="d2-diff">
      {draft && onDraft ? editor(draft, onDraft) : (
        <>
          {settled ? null : <><span className="d2-strike">{lang === "ar" ? <Ltr>{before}</Ltr> : before}</span><Ic name="arrow" size="xs" flip className="d2-to" /></>}
          <span className="d2-new">{settled ? <Ltr>{shownAfter}</Ltr> : <Hl><Ltr>{shownAfter}</Ltr></Hl>}</span>
        </>
      )}
    </span>
  );

  return (
    <figure className="d2-object">
      <figcaption className="d2-object-label"><Ic name="eye" size="xs" />{wherePage(ask.where, lang)}</figcaption>
      <div className="d2-listing" role="group" aria-label={t.listingMini}>
        <p className="d2-listing-name">{ask.place}</p>
        {listing && listing.rating !== null ? (
          <div className="d2-g-rate">
            <span className="d2-g-v">{listing.rating.toFixed(1)}</span>
            <span className="d2-g-stars" aria-hidden="true">★★★★★</span>
            {listing.reviews !== null ? <Ltr>({listing.reviews.toLocaleString("en")})</Ltr> : null}
          </div>
        ) : null}
        {listing?.category ? <div className="d2-g-cat">{listing.category}</div> : null}
        {listing?.openLine ? <div className="d2-g-open"><b>{t.openNow}</b> · {listing.openLine}</div> : null}
        {hoursShown ? (
          <div className={`d2-g-hours${week7 ? " d2-g-week-edit" : ""}`} role="table" aria-label={t.listingHours}>
            {week.map((day) => {
              const focus = ask.days.includes(day);
              const cls = focus || week7 ? "d2-g-focus" : day === today ? "d2-g-today" : undefined;
              return (
                <div key={day} role="row" className={cls}>
                  <span role="cell">{LONG[lang][day]}</span>
                  {week7 ? <span role="cell">{dayEditor(day)}</span>
                    : focus && ask.day === day ? <span role="cell">{diff(spanText(lineOf(day), lang))}</span>
                    : focus ? <span role="cell" className="d2-tnum">{dayDiff(day)}</span>
                    : <span role="cell" className="d2-tnum"><Ltr>{spanText(lineOf(day) || afterOf(day), lang)}</Ltr></span>}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="d2-g-hours d2-g-field" role="table" aria-label={p.field_label}>
            <div role="row" className="d2-g-focus">
              <span role="cell">{p.field_label}</span>
              <span role="cell">{diff(ask.before)}</span>
            </div>
          </div>
        )}
        {readAt ? (
          <div className="d2-g-foot"><span>{t.readLive(dayTime(readAt, lang))}</span>{ask.where === "google" ? <span>{t.notStored}</span> : null}</div>
        ) : null}
      </div>
    </figure>
  );
}
