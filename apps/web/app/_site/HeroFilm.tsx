import type { CSSProperties } from "react";
import { copy, type Locale } from "./copy";
import type { FilmWords } from "./FilmCanvas";
import { FilmCaption } from "./FilmCaption";
import { FilmDash } from "./FilmDash";
import { FilmScenes } from "./FilmScenes";
import { SampleMark } from "./Frames";
import { CARDS, MINUTES, hhmm, still } from "./filmScript";
import { LoopToggle } from "./LoopToggle";
import { SAMPLES } from "./samples";

// The homepage hero's film (D-062, the founder's choice of 28 Oct 2026, from prototype 05D):
// one afternoon at the fictional Qirfa Bakery, Thursday 15:58 to 16:20, in the product's own
// screens, on a Carbon plate cut by the fold beside the headline. Orders, bookings and credit
// accounts move at once in three lanes; the team confirms the orders and moves them on, ALYR
// sends the messages; it ends on the ALYR Agent home at the dashboard sample's moment.
//
// The HTML is the still: the plate, the bar with its one "Sample" mark, and the last shot, the
// real ALYR Agent home at 16:20 (FilmDash) under its caption. That is the first paint, and all
// there is without scripts or with reduced motion. After load film.ts asks for the rest of the
// canvas (FilmScenes, FilmCanvas), writes the film's tracks (filmScript.ts) and plays it from
// that same frame; it stops off screen, in a hidden tab and with Pause. The drawing is a
// picture: `inert`, out of the reading order, with one line first for screen readers.

const px = (n: number) => `${n}px`;

export function HeroFilm({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const f = t.home.hero.film;
  const sample = t.agent.samples.bakery;
  const frame = t.home.suite.frame;
  const shelf = t.pages.shelf.moment;
  const view = SAMPLES[locale].bakery;

  const s = still();
  const stage = {
    "--hf-cam-w": s.wide.cam, "--hf-cam-p": s.phone.cam,
    "--wx-w": px(s.wide.cap.x), "--wy-w": px(s.wide.cap.y), "--ww-w": px(s.wide.cap.w), "--ws-w": s.wide.cap.cs,
    "--wx-p": px(s.phone.cap.x), "--wy-p": px(s.phone.cap.y), "--ww-p": px(s.phone.cap.w), "--ws-p": s.phone.cap.cs,
  } as CSSProperties;
  const dash = CARDS.dash;

  const owed = view.owed!;
  const overdue = view.suggestions.find((x) => x.key === "overdue");
  const b = frame.bookings;
  const words: FilmWords = {
    ar: locale === "ar",
    chat: { action: frame.chat.action, event: frame.chat.event },
    book: { title: b.title, day: b.day, times: b.times, time: b.time, service: b.service, who: b.who, booked: b.booked, reminder: b.reminder, before: b.before, sentAt: b.sentAt },
    accounts: frame.accounts.title,
    shelf: {
      path: shelf.stock.path, leftToday: shelf.stock.leftToday, of: shelf.stock.of, soldOut: shelf.stock.soldOut, log: shelf.stock.log,
      limit: shelf.stock.rule, code: shelf.item.code, name: shelf.item.name, price: shelf.item.price, left: shelf.item.left,
    },
    owed: { title: owed.title, total: owed.total_text, customers: owed.customers, segments: owed.segments.map((x) => ({ key: x.key, label: x.label, amount: x.amount_text, share: x.share })) },
    flag: overdue ? { label: t.agent.flagged, title: overdue.title, line: overdue.line } : null,
  };

  return (
    <figure className="hf" aria-label={f.label} data-film>
      <figcaption className="sr-only">{f.about}</figcaption>
      <div className="hf-stage" aria-hidden="true" inert data-nosnippet style={stage}>
        <svg className="hf-plate" viewBox="0 0 1000 724" preserveAspectRatio="none" aria-hidden="true">
          <polygon points="724,0 1000,0 1000,724 0,724" />
        </svg>
        <div className="hf-clip">
          <div className="hf-world">
            <div className="hf-card hf-c-dash sf-win hf-dash" style={{ "--x": px(dash.x), "--y": px(dash.y), "--w": px(dash.w), "--h": px(dash.h) } as CSSProperties}>
              <div className="sf-win-head hf-dash-head">
                <span className="aw-mono">{sample.monogram}</span>
                <b>{sample.shop}</b>
                <span className="aw-path">{t.agent.path}</span>
              </div>
              <div className="hf-dash-body">
                <FilmDash view={view} suggestions={t.agent.suggestions} />
              </div>
            </div>
            <FilmCaption k="week" words={f.cap.week} ar={locale === "ar"} />
            <FilmScenes words={words} />
          </div>
          <div className="hf-cover" />
        </div>
        <div className="hf-bar">
          <span className="sf-mono">{sample.monogram}</span>
          <b>{sample.shop}</b>
          <SampleMark label={t.fig.sample} />
          <span className="hf-when">
            <span className="hf-day-name">{f.day}<span aria-hidden="true"> · </span></span>
            <bdi className="hf-sw hf-clock">
              <span className={`hf-clk-${MINUTES.length - 1} is-now`}>{hhmm(MINUTES[MINUTES.length - 1].m)}</span>
            </bdi>
          </span>
        </div>
      </div>
      <LoopToggle words={t.loop} name={t.loop.names.film} className="hf-toggle" />
    </figure>
  );
}
