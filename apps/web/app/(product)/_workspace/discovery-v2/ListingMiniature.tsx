// The live miniature of the page a change lands on, as customers see it: the place's name, what the
// live read shows around it (when that read exists, workstream F), and the field being decided with
// its before struck through and its after behind the highlighter. Hours show the whole week from
// today, the changed day in focus; another field shows its one row.

import { T, wherePage, type D2Lang } from "./copy";
import type { AskView } from "./adapter";
import { spanText } from "./logic";
import type { DayKey } from "../discoveryApi";
import { Ic } from "./icons";
import { Hl, Ltr, dayTime } from "./parts";

export type HoursDraft = { open: string; close: string };

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
  /** Change it: the draft of the one day's hours, with its setter. Absent when not editing. */
  draft?: HoursDraft | null;
  onDraft?: (draft: HoursDraft) => void;
}) {
  const t = T[lang];
  const { p, listing } = ask;
  const start = ORDER.indexOf(today);
  const week = [...ORDER.slice(start), ...ORDER.slice(0, start)];
  const lineOf = (day: DayKey) => p.before.lines.find((l) => l.day === day)?.text ?? "";
  const shownAfter = draft ? `${draft.open}–${draft.close}` : ask.after;

  const diff = (before: string) => (
    <span className="d2-diff">
      {draft && onDraft ? (
        <span className="d2-edit" dir="ltr">
          <select className="d2-select" aria-label={t.opens(LONG[lang][ask.day ?? "fri"])} value={draft.open} onChange={(e) => onDraft({ ...draft, open: e.target.value })}>
            {HALF_HOURS.map((h) => <option key={h}>{h}</option>)}
          </select>
          {" – "}
          <select className="d2-select" aria-label={t.closes(LONG[lang][ask.day ?? "fri"])} value={draft.close} onChange={(e) => onDraft({ ...draft, close: e.target.value })}>
            {HALF_HOURS.map((h) => <option key={h}>{h}</option>)}
          </select>
        </span>
      ) : (
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
        {p.field === "hours" && p.before.lines.length ? (
          <div className="d2-g-hours" role="table" aria-label={t.listingHours}>
            {week.map((day) => {
              const focus = ask.days.includes(day);
              const cls = focus ? "d2-g-focus" : day === today ? "d2-g-today" : undefined;
              return (
                <div key={day} role="row" className={cls}>
                  <span role="cell">{LONG[lang][day]}</span>
                  {focus && ask.day === day ? <span role="cell">{diff(spanText(lineOf(day), lang))}</span> : <span role="cell" className="d2-tnum"><Ltr>{spanText(focus && settled ? (p.after.lines.find((l) => l.day === day)?.text ?? "") : lineOf(day), lang)}</Ltr></span>}
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
