"use client";

// ALYR Agent, the dashboard (ALY-99, docs/agent-dashboard/03-build-brief.md).
//
// Presentational only: it draws an AgentView and fetches nothing, so the workspace home
// and the public site's sample figure show the same screen. Colours and type come from
// CSS custom properties with ALYR defaults (agent.css); it follows the host's theme.
// Calm by rule: no tiles, no glow, no count-ups, nothing moves after the first load except
// a suggestion closing when its rule stops being true.

import { Fragment, useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { AGENT_LABELS, type AgentLabels } from "./labels";
import type { AgentView, Rich as RichParts } from "./types";
import "./agent.css";

export type AgentLink = ComponentType<{ href: string; className?: string; children: ReactNode; title?: string }>;

const PlainLink: AgentLink = ({ href, className, children, title }) => (
  <a href={href} className={className} title={title}>{children}</a>
);

export type AgentDashboardProps = {
  view: AgentView;
  labels?: Partial<AgentLabels>;
  /** The host's link component (next/link in the workspace); a plain <a> by default. */
  link?: AgentLink;
  /** The first load of a session: the numbers rise once along the 45° diagonal. */
  animate?: boolean;
  /** Shown above the numbers when the host could not refresh them. */
  stale?: string | null;
  /** "Not now" on a knowledge card; without it the button is not drawn. */
  onNotNow?: (key: string, fingerprint: string) => void;
  className?: string;
};

type Card = AgentView["suggestions"][number] & { closing?: boolean };

/** Text whose figures stay whole: amounts and counts go in a <bdi>. */
export function Rich({ parts }: { parts: RichParts | null | undefined }) {
  if (!parts) return null;
  return (
    <>
      {parts.map((part, i) =>
        typeof part === "string" ? <Fragment key={i}>{part}</Fragment> : <bdi key={i} className="ag-fig">{part.b}</bdi>,
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

function Tick() {
  return (
    <svg className="ag-tick-mark" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

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

export function AgentDashboard({ view, labels, link: L = PlainLink, animate = false, stale, onNotNow, className = "" }: AgentDashboardProps) {
  const t: AgentLabels = { ...AGENT_LABELS[view.lang], ...labels };
  const [rising] = useState(animate);
  const [listOpen, setListOpen] = useState<string | null>(null);
  const [cardOpen, setCardOpen] = useState<string | null>(null);
  const [hoursOpen, setHoursOpen] = useState(false);
  const cards = useClosingCards(view.suggestions);
  const ticked = useTicked(view.done.rows, view.lang);
  const style = (i: number) => ({ "--i": i }) as CSSProperties;

  return (
    <div className={`ag ${rising ? "is-rising" : ""} ${className}`} dir={view.dir} lang={view.lang} data-state={view.state}>
      {stale && <p className="ag-stale" role="status">{stale}</p>}

      <header className="ag-head">
        <p className="ag-eyebrow">{view.header.eyebrow}</p>
        <h1 className="ag-greeting">{view.header.greeting}</h1>
        <p className="ag-summary">
          {view.header.summary.map((s, i) => (
            <Fragment key={i}>{i > 0 && " "}<span className={s.muted ? "is-muted" : undefined}><Rich parts={s.text} /></span></Fragment>
          ))}
        </p>
        <p className="ag-updated">{view.header.updated}</p>
      </header>

      <section className="ag-needs" aria-labelledby="ag-needs-title">
        <h2 className="ag-label" id="ag-needs-title">{t.needs}</h2>
        {view.needs.items.length === 0 ? (
          <p className="ag-nothing"><span className="ag-done-tick"><Tick /></span>{view.needs.empty}</p>
        ) : (
          <ul className="ag-needs-list">
            {view.needs.items.map((item) => {
              const inner = (
                <>
                  <span className="ag-need-count"><bdi>{item.count}</bdi></span>
                  <span className="ag-need-words">
                    <span><Rich parts={item.words} /></span>
                    {item.detail && <small><Rich parts={item.detail} /></small>}
                  </span>
                  <Arrow />
                </>
              );
              return (
                <li key={item.key}>
                  {item.href ? <L href={item.href} className="ag-need" title={item.rule}>{inner}</L> : <span className="ag-need" title={item.rule}>{inner}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {view.state === "empty" ? (
        <ul className="ag-slots">
          {view.placeholders.map((text, i) => <li key={i} className="ag-slot-box">{text}</li>)}
        </ul>
      ) : (
        <ul className="ag-kpis">
          {view.kpis.map((kpi, i) => (
            <li key={kpi.key} className="ag-kpi" style={style(i)}>
              <L href={kpi.href} className="ag-kpi-link">
                <span className="ag-label">{kpi.label}</span>
                <span className="ag-kpi-value"><bdi>{kpi.value}</bdi></span>
                {kpi.change && (
                  <span className={`ag-kpi-change ${kpi.change.dir ?? "plain"}`}><Rich parts={kpi.change.text} /></span>
                )}
              </L>
            </li>
          ))}
        </ul>
      )}

      <div className="ag-grid">
        {cards.length > 0 && (
          <section className="ag-span-8 ag-cards" aria-labelledby="ag-cards-title">
            <h2 className="ag-label" id="ag-cards-title">{t.suggestions}</h2>
            {cards.map((card, i) => {
              const first = i === 0 && !card.closing;
              const open = first || cardOpen === card.key;
              return (
                <article key={card.key} className={`ag-card ${open ? "is-open" : ""} ${card.closing ? "is-closing" : ""}`} aria-hidden={card.closing || undefined}>
                  <h3 className="ag-card-title">
                    <button type="button" className="ag-card-toggle" aria-expanded={open}
                      onClick={() => setCardOpen(cardOpen === card.key ? null : card.key)} disabled={first}>
                      <Rich parts={card.title} />
                    </button>
                  </h3>
                  <div className="ag-card-body">
                    <p className="ag-card-line"><Rich parts={card.line} /></p>
                    <p className="ag-rule">{card.rule}</p>
                    {listOpen === card.key && card.rows.length > 0 && (
                      <ul className="ag-rows">
                        {card.rows.map((row) => <li key={row.id}>{row.label}</li>)}
                        {card.more > 0 && <li className="ag-rows-more">{t.more(card.more)}</li>}
                      </ul>
                    )}
                    <div className="ag-card-foot">
                      {card.action ? (
                        <L href={card.action.href} className={`ag-btn ${first ? "is-volt" : ""}`}>{card.action.label}<Arrow /></L>
                      ) : (
                        <p className="ag-status">{card.status}</p>
                      )}
                      {card.rows.length > 0 && (
                        <button type="button" className="ag-link-btn" aria-expanded={listOpen === card.key}
                          onClick={() => setListOpen(listOpen === card.key ? null : card.key)}>
                          {listOpen === card.key ? t.hide : t.showMe}
                        </button>
                      )}
                      {card.snooze && onNotNow && (
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

        <section className={`${cards.length ? "ag-span-4" : "ag-span-12"} ag-done`} aria-labelledby="ag-done-title">
          <h2 className="ag-label" id="ag-done-title">{t.done}</h2>
          {view.done.rows.length === 0 ? (
            <p className="ag-quiet-line">{view.done.empty}</p>
          ) : (
            <ul className="ag-ledger">
              {view.done.rows.map((row) => (
                <li key={row.key} className={ticked.has(row.key) ? "is-ticked" : undefined}>
                  <L href={row.href} className="ag-ledger-row">
                    <span className="ag-ledger-value"><bdi>{row.value}</bdi></span>
                    <span className="ag-ledger-label">{row.label}</span>
                    {ticked.has(row.key) && <span className="ag-done-tick" aria-label={t.doneTick}><Tick /></span>}
                  </L>
                </li>
              ))}
            </ul>
          )}
        </section>

        {view.week && (
          <section className={`${view.hours ? "ag-span-8" : "ag-span-12"} ag-week`} aria-labelledby="ag-week-title">
            <div className="ag-section-head">
              <h2 className="ag-label" id="ag-week-title">{view.week.title}</h2>
              <span className="ag-section-total"><bdi>{view.week.total_text}</bdi></span>
            </div>
            <ol className="ag-bars">
              {view.week.days.map((day, i) => {
                const height = (v: number | null) => `${Math.max(0, Math.min(100, ((v ?? 0) / view.week!.max) * 100))}%`;
                const said = day.state === "coming"
                  ? `${day.label}: ${t.coming}`
                  : `${day.label}: ${day.value_text}. ${t.lastWeek} ${day.last_text}`;
                return (
                  <li key={day.date} className={`ag-day is-${day.state}`} aria-label={said}>
                    <span className="ag-col" aria-hidden="true">
                      {day.state === "coming" ? (
                        <span className="ag-slot" style={style(i)}>
                          {day.booked != null && day.booked > 0 && <span className="ag-booked" style={{ height: `${day.booked * 100}%` }} />}
                        </span>
                      ) : (
                        <span className="ag-bar" style={{ ...style(i), height: height(day.value) }} />
                      )}
                      {day.state !== "coming" && day.last > 0 && <span className="ag-last" style={{ bottom: height(day.last) }} />}
                    </span>
                    <span className="ag-day-label" aria-hidden="true">{day.state === "today" ? t.today : day.label}</span>
                    <span className="ag-day-value" aria-hidden="true">{day.value_text ? <bdi>{day.value_text}</bdi> : " "}</span>
                  </li>
                );
              })}
            </ol>
            <p className="ag-legend"><span className="ag-legend-tick" aria-hidden="true" />{t.lastWeek}</p>
          </section>
        )}

        {view.hours && (
          <section className="ag-span-4 ag-hours" aria-labelledby="ag-hours-title">
            <h2 className="ag-label" id="ag-hours-title">{view.hours.title}</h2>
            <p className="ag-hours-top">{view.hours.top}</p>
            <ol className="ag-hours-words">
              {view.hours.top3.map((words) => <li key={words}>{words}</li>)}
            </ol>
            <button type="button" className="ag-link-btn ag-hours-toggle" aria-expanded={hoursOpen} onClick={() => setHoursOpen(!hoursOpen)}>
              {t.allHours}
            </button>
            <div className={`ag-hours-grid ${hoursOpen ? "is-open" : ""}`} style={{ "--cols": view.hours.hours.length } as CSSProperties} aria-hidden="true">
              <span />
              {view.hours.hours.map((h, i) => <span key={h} className="ag-hour-label">{i % 3 === 0 ? h : ""}</span>)}
              {view.hours.rows.map((row) => (
                <Fragment key={row.label}>
                  <span className="ag-hour-day">{row.label}</span>
                  {row.cells.map((level, i) => <span key={i} className={`ag-cell l${level}`} />)}
                </Fragment>
              ))}
            </div>
          </section>
        )}

        {view.top && (
          <section className={`${view.owed ? "ag-span-6" : "ag-span-12"} ag-top`} aria-labelledby="ag-top-title">
            <h2 className="ag-label" id="ag-top-title">{view.top.title}</h2>
            <ol className="ag-top-list">
              {view.top.rows.map((row) => (
                <li key={row.name}>
                  <span className="ag-top-name">{row.name}</span>
                  <span className="ag-top-bar" aria-hidden="true"><span style={{ width: `${row.share * 100}%` }} /></span>
                  <span className="ag-top-value"><bdi>{row.value_text}</bdi></span>
                  <span className={`ag-top-change ${row.change.dir ?? "new"}`}><bdi>{row.change.text}</bdi></span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {view.owed && (
          <section className={`${view.top ? "ag-span-6" : "ag-span-12"} ag-owed`} aria-labelledby="ag-owed-title">
            <h2 className="ag-label" id="ag-owed-title">{view.owed.title}</h2>
            <p className="ag-owed-total"><bdi>{view.owed.total_text}</bdi><small>{t.owedOf} {view.owed.customers}</small></p>
            {view.owed.segments.some((s) => s.share > 0) ? (
              <>
                <span className="ag-age-bar" aria-hidden="true">
                  {view.owed.segments.map((s, i) => s.share > 0 && <span key={s.key} className={`seg s${i}`} style={{ flexGrow: s.share }} />)}
                </span>
                <ul className="ag-age-legend">
                  {view.owed.segments.map((s, i) => (
                    <li key={s.key}><span className={`swatch s${i}`} aria-hidden="true" />{s.label}<bdi>{s.amount_text}</bdi></li>
                  ))}
                </ul>
                {view.owed.oldest && <p className="ag-owed-oldest"><Rich parts={view.owed.oldest} /></p>}
              </>
            ) : (
              <p className="ag-quiet-line">{view.owed.empty}</p>
            )}
          </section>
        )}

        {view.team && view.team.rows.length > 0 && (
          <section className="ag-span-12 ag-team" aria-labelledby="ag-team-title">
            <h2 className="ag-label" id="ag-team-title">{t.team}</h2>
            <table className="ag-team-table">
              <thead>
                <tr>
                  <th scope="col"><span className="ag-sr">{t.team}</span></th>
                  <th scope="col">{t.replies}</th>
                  <th scope="col">{t.firstAnswer}</th>
                  <th scope="col">{t.open}</th>
                  <th scope="col">{t.waiting}</th>
                </tr>
              </thead>
              <tbody>
                {view.team.rows.map((row) => (
                  <tr key={row.name}>
                    <th scope="row">{row.name}</th>
                    <td data-label={t.replies}><bdi>{row.replies}</bdi></td>
                    <td data-label={t.firstAnswer}><bdi>{row.first_answer}</bdi></td>
                    <td data-label={t.open}><bdi>{row.open}</bdi></td>
                    <td data-label={t.waiting}><bdi>{row.waiting}</bdi></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {view.team.unassigned && <p className="ag-team-nobody"><Rich parts={view.team.unassigned} /></p>}
          </section>
        )}

        {view.report && (
          <p className="ag-span-12 ag-report"><span className="ag-label">{t.report}</span><span><Rich parts={view.report} /></span></p>
        )}
      </div>
    </div>
  );
}
