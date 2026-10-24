"use client";

// ALYR Agent, the dashboard (ALY-99, docs/agent-dashboard/03-build-brief.md, 05-critique.md).
//
// Presentational only: it draws an AgentView and fetches nothing, so the workspace home and
// the public site show the same screen. `mode="showcase"` is the homepage figure: no links
// into the workspace, no "Not now", no team or report, a moment instead of a date. Colours
// and type come from CSS custom properties with ALYR defaults (agent.css) and follow the
// host's theme. The summary is the headline; Needs and Done sit under it, then the numbers,
// the suggestions and the charts. Nothing moves after the first view except a suggestion
// closing when its rule stops being true.

import {
  Fragment,
  createElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { AGENT_LABELS, type AgentLabels } from "./labels";
import type { AgentView, Change, Day, Kpi, Rich as RichParts } from "./types";
import "./agent.css";

export type AgentLink = ComponentType<{ href: string; className?: string; children: ReactNode; title?: string }>;

const PlainLink: AgentLink = ({ href, className, children, title }) => (
  <a href={href} className={className} title={title}>{children}</a>
);

/** In showcase mode a destination is not a link: the reader is not signed in. */
const NoLink: AgentLink = ({ className, children, title }) => (
  <span className={className} title={title}>{children}</span>
);

export type AgentDashboardProps = {
  view: AgentView;
  labels?: Partial<AgentLabels>;
  /** "workspace" (default) or "showcase", the homepage figure. */
  mode?: "workspace" | "showcase";
  /** The summary's heading level (default 1 in the workspace, 2 in showcase); section
   * titles sit one below it and suggestion titles two below. */
  headingLevel?: 1 | 2 | 3 | 4;
  /** False draws the titles as plain text, not headings: the public site's drawings of a
   * fictional business, so a sample's numbers never read as the page's own outline to a
   * screen reader or a crawler (site audit 03, A1). The workspace keeps its headings. */
  headings?: boolean;
  /** False hides the "RULE · …" lines (under each suggestion, and as a need's tooltip):
   * the public site's showcase only, where the founder took the word "rule" off the site
   * (25 Oct 2026). The workspace and `/agent-sample` keep them (default true). */
  ruleLines?: boolean;
  /** The host's link component. In showcase mode links are plain text unless one is given. */
  link?: AgentLink;
  /** The first load of a session: the numbers rise once along the 45° diagonal. In showcase
   * mode the figure rises once, when it first comes into view, and this is ignored. */
  animate?: boolean;
  /** Shown above the numbers when the host could not refresh them (workspace only). */
  stale?: string | null;
  /** "Not now" on a knowledge card (workspace only); without it the button is not drawn. */
  onNotNow?: (key: string, fingerprint: string) => void;
  /** Drawn under the header: the workspace's setup checklist while nothing has happened yet. */
  setup?: ReactNode;
  className?: string;
};

type Card = AgentView["suggestions"][number] & { closing?: boolean };

const MARKS = /([▲▼]|\d+–\d+)/;

/** A string with its ▲ and ▼ drawn small (P1-4), and number ranges kept left to right, so
 * "0–30" does not read "30–0" in Arabic (P2-4). */
function Text({ text }: { text: string }) {
  if (!MARKS.test(text)) return <>{text}</>;
  return (
    <>
      {text.split(MARKS).map((piece, i) =>
        piece === "▲" || piece === "▼" ? <span key={i} className="ag-tri">{piece}</span>
          : i % 2 === 1 ? <bdi key={i} dir="ltr">{piece}</bdi>
          : <Fragment key={i}>{piece}</Fragment>,
      )}
    </>
  );
}

/** Text whose figures and names stay whole: each `{ b }` goes in a <bdi>. */
export function Rich({ parts }: { parts: RichParts | null | undefined }) {
  if (!parts) return null;
  return (
    <>
      {parts.map((part, i) =>
        typeof part === "string" ? <Text key={i} text={part} /> : <bdi key={i}>{part.b}</bdi>,
      )}
    </>
  );
}

function Arrow() {
  return (
    <svg className="ag-arrow" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg className="ag-chevron" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Tick() {
  return (
    <svg className="ag-tick-mark" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** ▲ 5% for the eye, "up 5%" for a screen reader (P1-11). */
function ChangeLine({ change, className }: { change: Change; className: string }) {
  if (!change) return null;
  if (!change.said) return <span className={className}><Rich parts={change.text} /></span>;
  return (
    <span className={`${className} ${change.dir ?? ""}`}>
      <span aria-hidden="true"><Rich parts={change.text} /></span>
      <span className="ag-sr">{change.said}</span>
    </span>
  );
}

/** A figure with its unit drawn small: "QAR 3,120", "3,120 ر.ق", "13%" (P1-5). */
function Figure({ value, unit, unitFirst }: { value: string; unit: string | null; unitFirst: boolean }) {
  return (
    <bdi className="ag-figure">
      {unit && unitFirst && <span className="ag-unit">{unit}{"\u00a0"}</span>}
      {value}
      {unit === "%" ? "%" : unit && !unitFirst && <span className="ag-unit">{`\u00a0${unit}`}</span>}
    </bdi>
  );
}

function Heading({ level, className, id, children }: { level: number; className?: string; id?: string; children: ReactNode }) {
  // level 0: a title that is not a heading (`headings={false}`)
  return createElement(level <= 0 ? "p" : `h${Math.min(level, 6)}`, { className, id }, children);
}

function reducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Suggestions in their order; a card whose rule stopped being true stays for the 240 ms
 * of its closing fold ("the fold closes it"), then leaves. */
function useClosingCards(cards: AgentView["suggestions"]): Card[] {
  const previous = useRef<AgentView["suggestions"]>(cards);
  const [closing, setClosing] = useState<Card[]>([]);
  useEffect(() => {
    const now = new Set(cards.map((c) => c.key));
    const gone = previous.current.filter((c) => !now.has(c.key));
    previous.current = cards;
    if (!gone.length || reducedMotion()) return;
    const show = setTimeout(() => setClosing(gone.map((c) => ({ ...c, closing: true }))), 0);
    const hide = setTimeout(() => setClosing([]), 260);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [cards]);
  return [...cards, ...closing.filter((c) => !cards.some((x) => x.key === c.key))];
}

/** "Done for you" rows whose count went up since the last refresh get one Volt tick. A
 * switch of language is not a change. */
function useTicked(rows: AgentView["done"]["rows"], lang: string): Set<string> {
  const previous = useRef<{ lang: string; values: Map<string, string> } | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    const before = previous.current?.lang === lang ? previous.current.values : null;
    previous.current = { lang, values: new Map(rows.map((r) => [r.key, r.value])) };
    if (!before) return;
    const changed = new Set(rows.filter((r) => before.has(r.key) && before.get(r.key) !== r.value).map((r) => r.key));
    const set = setTimeout(() => setTicked(changed), 0);
    return () => clearTimeout(set);
  }, [rows, lang]);
  return ticked;
}

/** Showcase: the figure rises once when it first comes into view. It is drawn still on the
 * server and without JavaScript; below the fold it waits, hidden, for the reader to reach it. */
function useRiseInView(enabled: boolean, ref: RefObject<HTMLDivElement | null>): "still" | "waiting" | "rising" {
  const [phase, setPhase] = useState<"still" | "waiting" | "rising">("still");
  useBrowserLayoutEffect(() => {
    const node = ref.current;
    if (!enabled || !node || reducedMotion() || typeof IntersectionObserver === "undefined") return;
    const box = node.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) {
      setPhase("rising");
      return;
    }
    setPhase("waiting");
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setPhase("rising");
        observer.disconnect();
      }
    }, { threshold: 0.15 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, ref]);
  return phase;
}

export function AgentDashboard({
  view, labels, mode = "workspace", headingLevel, headings = true, ruleLines = true, link, animate = false, stale, onNotNow, setup, className = "",
}: AgentDashboardProps) {
  const t: AgentLabels = { ...AGENT_LABELS[view.lang], ...labels };
  const showcase = mode === "showcase";
  const L: AgentLink = link ?? (showcase ? NoLink : PlainLink);
  // without headings every title is drawn at "level 0", which Heading renders as plain text
  const level = headings ? headingLevel ?? (showcase ? 2 : 1) : -9;
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const phase = useRiseInView(showcase, root);
  const rising = showcase ? phase === "rising" : animate;
  const [listOpen, setListOpen] = useState<string | null>(null);
  const [cardOpen, setCardOpen] = useState<string | null>(null);
  const [hoursOpen, setHoursOpen] = useState(false);
  const cards = useClosingCards(view.suggestions);
  const ticked = useTicked(view.done.rows, view.lang);
  const style = (i: number) => ({ "--i": i }) as CSSProperties;
  const empty = view.state === "empty";
  const needs = showcase ? view.needs.items.filter((item) => item.key !== "setup") : view.needs.items;
  const hasSetup = Array.isArray(setup) ? setup.length > 0 : !!setup;
  const states = [rising && "is-rising", phase === "waiting" && "is-waiting", showcase && "is-showcase", className];

  return (
    <div ref={root} className={["ag", ...states].filter(Boolean).join(" ")}
      dir={view.dir} lang={view.lang} data-state={view.state}>
      {!showcase && stale && <p className="ag-stale" role="status">{stale}</p>}

      <header className="ag-head">
        <p className="ag-eyebrow">{showcase ? view.header.when : view.header.eyebrow}</p>
        <Heading level={level} className="ag-summary">
          {view.header.summary.map((s, i) => (
            <Fragment key={i}>{i > 0 && " "}<span className={s.muted ? "is-muted" : undefined}><Rich parts={s.text} /></span></Fragment>
          ))}
        </Heading>
      </header>

      {!showcase && hasSetup && <div className="ag-slot">{setup}</div>}

      <div className="ag-grid">
        <section className="ag-span-8 ag-needs" aria-labelledby={`${id}-needs`}>
          <Heading level={level + 1} className="ag-label" id={`${id}-needs`}>{t.needs}</Heading>
          {needs.length === 0 ? (
            <p className="ag-nothing">{!empty && <span className="ag-done-tick"><Tick /></span>}{view.needs.empty}</p>
          ) : (
            <ul className="ag-needs-list">
              {needs.map((item) => {
                const Row = item.href ? L : NoLink;
                return (
                  <li key={item.key}>
                    <Row href={item.href ?? ""} className="ag-need" title={ruleLines ? item.rule : undefined}>
                      <span className="ag-need-count"><bdi>{item.count}</bdi></span>
                      <span className="ag-need-words">
                        <span><Rich parts={item.words} /></span>
                        {item.detail && <small><Rich parts={item.detail} /></small>}
                      </span>
                      {!showcase && item.href && <Arrow />}
                    </Row>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="ag-span-4 ag-done" aria-labelledby={`${id}-done`}>
          <Heading level={level + 1} className="ag-label" id={`${id}-done`}>{t.done}</Heading>
          {view.done.rows.length === 0 ? (
            <p className="ag-quiet-line">{view.done.empty}</p>
          ) : (
            <ul className="ag-ledger">
              {view.done.rows.map((row) => (
                <li key={row.key}>
                  <L href={row.href} className="ag-ledger-row">
                    <span className="ag-ledger-value"><bdi>{row.value}</bdi></span>
                    <span className="ag-ledger-label">
                      {row.label}
                      {ticked.has(row.key) && <span className="ag-done-tick small" role="img" aria-label={t.doneTick}><Tick /></span>}
                    </span>
                  </L>
                </li>
              ))}
            </ul>
          )}
        </section>

        {empty ? (
          <div className="ag-span-12 ag-skeleton">
            {view.placeholders.map((slot, i) => (
              <div key={i} className={`ag-skel is-${slot.kind}`}>
                <span className="ag-skel-shape" aria-hidden="true">
                  {slot.kind === "week" && [38, 54, 46, 70, 30, 62, 50].map((h, d) => <span key={d} style={{ height: `${h}%` }} />)}
                  {slot.kind === "hours" && Array.from({ length: 28 }, (_, d) => <span key={d} />)}
                  {slot.kind === "list" && <><span /><span /><span /></>}
                </span>
                <span className="ag-skel-caption">{slot.text}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="ag-span-12 ag-kpis-block">
            <ul className="ag-kpis">
              {view.kpis.map((kpi: Kpi, i) => (
                <li key={kpi.key} className={`ag-kpi ${i === 0 ? "is-hero" : ""}`} style={style(i)}>
                  <L href={kpi.href} className="ag-kpi-link">
                    <span className="ag-kpi-label">{kpi.label}</span>
                    <span className="ag-kpi-value"><Figure value={kpi.value} unit={kpi.unit} unitFirst={kpi.unit_first} /></span>
                    <ChangeLine change={kpi.change} className="ag-kpi-change" />
                  </L>
                </li>
              ))}
            </ul>
            {view.kpi_caption && <p className="ag-caption">{view.kpi_caption}</p>}
          </div>
        )}

        {/* The Catalog's two numbers and, for a shop with Documents, its two (ALY-109, ALY-146):
            each card is the size of the list its link opens. */}
        {!showcase && ([["stock", view.catalog], ["docs", view.documents]] as const).map(([part, block]) => block && (
          <section key={part} className="ag-span-12 ag-stock" aria-labelledby={`${id}-${part}`}>
            <Heading level={level + 1} className="ag-label" id={`${id}-${part}`}>{block.title}</Heading>
            <ul className="ag-stock-cards">
              {block.cards.map((c) => {
                const Cell = c.href ? L : NoLink;
                return (
                  <li key={c.key}>
                    <Cell href={c.href ?? ""} className={`ag-stock-card ${c.value ? "" : "is-none"}`}>
                      <span className="ag-kpi-label">{c.label}</span>
                      <span className="ag-stock-value">
                        <bdi>{c.text}</bdi>
                        {c.href && <Arrow />}
                      </span>
                    </Cell>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {cards.length > 0 && (
          <section className={`${view.week ? "ag-span-8" : "ag-span-12"} ag-cards`} aria-labelledby={`${id}-cards`}>
            <Heading level={level + 1} className="ag-label" id={`${id}-cards`}>{t.suggestions}</Heading>
            {cards.map((card, i) => {
              const folded = i > 0 && cardOpen !== card.key;
              const body = `${id}-card-${card.key}`;
              return (
                <article key={card.key} className={`ag-card ${folded ? "is-folded" : ""} ${card.closing ? "is-closing" : ""}`}
                  aria-hidden={card.closing || undefined}>
                  <div className="ag-card-head">
                    <Heading level={level + 2} className="ag-card-title"><Rich parts={card.title} /></Heading>
                    {i > 0 && (
                      <button type="button" className="ag-card-toggle" aria-expanded={!folded} aria-controls={body}
                        aria-label={folded ? t.open : t.closeCard}
                        onClick={() => setCardOpen(folded ? card.key : null)}>
                        <Chevron />
                      </button>
                    )}
                  </div>
                  <div className="ag-card-body" id={body}>
                    <p className="ag-card-line"><Rich parts={card.line} /></p>
                    {ruleLines && <p className="ag-rule">{card.rule}</p>}
                    {listOpen === card.key && card.rows.length > 0 && (
                      <ul className="ag-rows">
                        {card.rows.map((row) => <li key={row.id}><bdi>{row.label}</bdi></li>)}
                        {card.more > 0 && <li className="ag-rows-more">{t.more(card.more)}</li>}
                      </ul>
                    )}
                    <div className="ag-card-foot">
                      {card.action ? (
                        <L href={card.action.href} className={`ag-btn ${card.primary && !showcase ? "is-volt" : ""}`}>
                          {card.action.label}{!showcase && <Arrow />}
                        </L>
                      ) : (
                        <p className="ag-status">{card.status}</p>
                      )}
                      {card.rows.length > 0 && (
                        <button type="button" className="ag-link-btn" aria-expanded={listOpen === card.key}
                          onClick={() => setListOpen(listOpen === card.key ? null : card.key)}>
                          {listOpen === card.key ? t.hide : t.who(card.rows.length + card.more)}
                        </button>
                      )}
                      {!showcase && card.snooze && onNotNow && (
                        <button type="button" className="ag-link-btn" onClick={() => onNotNow(card.snooze!.key, card.snooze!.fingerprint)}>
                          {t.notNow}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {view.week && <Week week={view.week} wide={cards.length === 0} id={id} level={level + 1} t={t} />}

        {view.hours && (
          <section className="ag-span-4 ag-hours" aria-labelledby={`${id}-hours`}>
            <Heading level={level + 1} className="ag-label" id={`${id}-hours`}>{view.hours.title}</Heading>
            <p className="ag-hours-top">{view.hours.top.day} <bdi dir="ltr">{view.hours.top.range}</bdi></p>
            <ol className="ag-hours-words">
              {view.hours.top3.slice(1).map((w) => <li key={w.day + w.range}>{w.day} <bdi dir="ltr">{w.range}</bdi></li>)}
            </ol>
            <button type="button" className="ag-link-btn ag-hours-toggle" aria-expanded={hoursOpen} onClick={() => setHoursOpen(!hoursOpen)}>
              {hoursOpen ? t.hide : t.allHours}
            </button>
            <div className={`ag-hours-grid ${hoursOpen ? "is-open" : ""}`} style={{ "--cols": view.hours.hours.length } as CSSProperties} aria-hidden="true">
              <span />
              {view.hours.hours.map((h, i) => <span key={h} className="ag-hour-label">{i % 3 === 0 ? h : ""}</span>)}
              {view.hours.rows.map((row) => (
                <Fragment key={row.label}>
                  <span className="ag-hour-day">{row.label}</span>
                  {row.cells.map((cell, i) => <span key={i} className={`ag-cell ${cell < 0 ? "is-closed" : `l${cell}`}`} />)}
                </Fragment>
              ))}
            </div>
          </section>
        )}

        {view.top && (
          <section className="ag-span-4 ag-top" aria-labelledby={`${id}-top`}>
            <Heading level={level + 1} className="ag-label" id={`${id}-top`}>{view.top.title}</Heading>
            {view.top.change_label && <p className="ag-top-key" aria-hidden="true">{view.top.change_label}</p>}
            <ol className="ag-top-list">
              {view.top.rows.map((row) => (
                <li key={row.name}>
                  <span className="ag-top-name"><bdi>{row.name}</bdi></span>
                  <span className="ag-top-value"><bdi>{row.value_text}</bdi></span>
                  {view.top!.change_label && (
                    <span className={`ag-top-change ${row.change?.dir ?? "new"}`}>
                      {row.change?.said ? (
                        <>
                          <span aria-hidden="true"><Text text={row.change.text} /></span>
                          <span className="ag-sr">{view.top!.change_label}: {row.change.said}</span>
                        </>
                      ) : row.change?.text}
                    </span>
                  )}
                  <span className="ag-top-bar" aria-hidden="true"><span style={{ width: `${Math.max(row.share * 100, 2)}%` }} /></span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {view.owed && (
          <section className="ag-span-4 ag-owed" aria-labelledby={`${id}-owed`}>
            <Heading level={level + 1} className="ag-label" id={`${id}-owed`}>{view.owed.title}</Heading>
            <p className="ag-owed-total">
              <Figure value={view.owed.total.value} unit={view.owed.total.unit} unitFirst={view.owed.total.unit_first} />
            </p>
            <p className="ag-owed-who">{t.owedBy} {view.owed.customers} · <Rich parts={view.owed.change} /></p>
            {view.owed.segments.some((s) => s.share > 0) ? (
              <>
                <span className="ag-age-bar" aria-hidden="true">
                  {view.owed.segments.map((s, i) => s.share > 0 && <span key={s.key} className={`seg s${i}`} style={{ flexGrow: s.share }} />)}
                </span>
                <ul className="ag-age-legend">
                  {view.owed.segments.map((s, i) => (
                    <li key={s.key}><span className={`swatch s${i}`} aria-hidden="true" /><span><Text text={s.label} /></span><bdi>{s.amount_text}</bdi></li>
                  ))}
                </ul>
                {view.owed.oldest && <p className="ag-owed-oldest"><Rich parts={view.owed.oldest} /></p>}
              </>
            ) : (
              <p className="ag-quiet-line">{view.owed.empty}</p>
            )}
          </section>
        )}

        {!showcase && view.team && view.team.rows.length > 0 && (
          <section className="ag-span-12 ag-team" aria-labelledby={`${id}-team`}>
            <Heading level={level + 1} className="ag-label" id={`${id}-team`}>{t.team}</Heading>
            <ul className="ag-team-list">
              {view.team.rows.map((row) => (
                <li key={row.name}><span className="ag-team-name">{row.name}</span><span className="ag-team-line">{row.line}</span></li>
              ))}
            </ul>
            {view.team.unassigned && <p className="ag-team-nobody"><Rich parts={view.team.unassigned} /></p>}
          </section>
        )}

        {!showcase && view.report && (
          <p className="ag-span-12 ag-report"><span className="ag-label">{t.report}</span><span><Rich parts={view.report} /></span></p>
        )}
      </div>
    </div>
  );
}

/** Seven days from Sunday, each against the same day last week, in one unit (P0-2, P1-4).
 * Today is drawn so far, with last week up to the same time as a tick and its whole day as
 * a ghost; days to come show last week as a dashed outline and what is booked; a closed day
 * says so; a day before the business joined is left empty. */
function Week({ week, wide, id, level, t }: {
  week: NonNullable<AgentView["week"]>; wide: boolean; id: string; level: number; t: AgentLabels;
}) {
  const max = Math.max(week.max, ...week.days.map((d) => (d.value ?? 0) + (d.booked ?? 0)), 1);
  const pct = (v: number | null) => `${Math.max(0, Math.min(100, ((v ?? 0) / max) * 100))}%`;
  const said = (day: Day) => {
    const name = day.state === "today" ? `${t.today}, ${day.label}` : day.label;
    if (day.state === "closed") return `${name}: ${week.legend.closed}`;
    if (day.state === "before") return "";
    const parts = [day.value_text != null ? `${name}: ${day.value_text}` : `${name}:`];
    if (day.booked_text) parts.push(day.booked_text);
    if (day.state === "today" && day.last_by_now_text) parts.push(`${week.legend.by_now}: ${day.last_by_now_text}`);
    if (day.last_text) parts.push(`${week.legend.last}: ${day.last_text}`);
    return parts.join(". ");
  };
  const ghosts = week.days.some((d) => (d.last ?? 0) > 0 && d.state !== "closed" && d.state !== "before");
  const tick = week.days.some((d) => d.state === "today" && d.last_by_now != null);
  const booked = week.days.some((d) => (d.booked ?? 0) > 0);
  return (
    <section className={`${wide ? "ag-span-12 is-wide" : "ag-span-4"} ag-week`} aria-labelledby={`${id}-week`}>
      <Heading level={level} className="ag-label" id={`${id}-week`}>{week.title}</Heading>
      <ol className="ag-bars">
        {week.days.map((day, i) => (
          <li key={day.date} className={`ag-day is-${day.state}`}>
            {said(day) && <span className="ag-sr">{said(day)}</span>}
            <span className="ag-col" aria-hidden="true">
              {day.last != null && day.state !== "closed" && day.state !== "before" && (
                <span className={`ag-ghost ${day.state === "ahead" ? "is-dashed" : ""}`} style={{ height: pct(day.last) }} />
              )}
              {(day.state === "past" || day.state === "today") && (
                <span className="ag-bar" style={{ "--i": i, height: pct(day.value) } as CSSProperties} />
              )}
              {day.booked != null && day.booked > 0 && (
                <span className="ag-booked" style={{ bottom: day.state === "today" ? pct(day.value) : 0, height: pct(day.booked) }} />
              )}
              {day.state === "today" && day.last_by_now != null && (
                <span className="ag-by-now" style={{ bottom: pct(day.last_by_now) }} />
              )}
            </span>
            <span className="ag-day-label" aria-hidden="true">{day.label}</span>
            <span className="ag-day-value" aria-hidden="true">
              {day.state === "closed" ? week.legend.closed
                : day.state === "today" ? <bdi>{day.value_text}</bdi>
                : day.booked ? <bdi>{day.booked}</bdi>
                : "\u00a0"}
            </span>
          </li>
        ))}
      </ol>
      {(ghosts || tick || booked) && (
        <p className="ag-legend" aria-hidden="true">
          {ghosts && <span><span className="ag-legend-ghost" />{week.legend.last}</span>}
          {tick && <span><span className="ag-legend-tick" />{week.legend.by_now}</span>}
          {booked && <span><span className="ag-legend-booked" />{week.legend.booked}</span>}
        </p>
      )}
    </section>
  );
}
