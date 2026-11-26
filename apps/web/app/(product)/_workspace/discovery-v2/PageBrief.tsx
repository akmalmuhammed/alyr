// The brief at the top of This week: one display sentence (how many things need the owner), the
// sub-line (when ALYR last checked, and where from), and the figure line "N of M checks match".
// After an Approve in this visit the sentence says what is left and names it.

import { useEffect, useState } from "react";
import { T, type D2Lang } from "./copy";
import type { PreviousTally, ViewState } from "./adapter";
import type { Tally } from "./logic";
import { Ic } from "./icons";
import { day, time } from "./parts";

export type PageBriefProps = {
  lang: D2Lang;
  state: ViewState;
  /** Things that need the owner this week, before any decision in this visit. */
  count: number;
  /** Decided in this visit (Approve or Not now): the sentence then says what is left. */
  decided: number;
  /** Names of what is still waiting, already joined («phone number and WhatsApp link»). */
  remaining: string;
  /** What is on its way after an Approve in this visit. */
  onItsWay: string;
  checkedAt: string | null;
  recordedOn: string | null;
  sample: boolean;
  tally: Tally | null;
  previous: PreviousTally | null;
};

export function PageBrief(props: PageBriefProps) {
  const t = T[props.lang];
  const { lang, tally, previous } = props;
  const left = Math.max(0, props.count - props.decided);
  const title = props.decided > 0 ? t.left(left) : t.needs(props.count);
  let sub = "";
  if (props.decided > 0) sub = [left > 0 && props.remaining ? t.remaining(props.remaining) : "", props.onItsWay].filter(Boolean).join(" ");
  else if (props.state === "noRun" || props.state === "noConnection" || !props.checkedAt) sub = t.notChecked;
  else sub = [t.checked(day(props.checkedAt, lang), time(props.checkedAt, lang)), props.recordedOn ? t.recorded(day(props.recordedOn, lang)) : "", props.sample ? t.sampleSource : ""].filter(Boolean).join(" ");
  const match = tally ? t.matchOf(tally.measured) : null;
  const delta = tally && previous && previous.matched !== tally.matched ? (previous.matched < tally.matched ? t.upFrom(previous.matched, day(previous.at, lang)) : t.downFrom(previous.matched, day(previous.at, lang))) : null;
  return (
    <section className="d2-brief">
      <h1 className="d2-display">{title}</h1>
      <p className="d2-sub">{sub}</p>
      {match && tally ? (
        <p className="d2-figline">
          <span>{match.pre}<span className="d2-big"><CountUp from={previous?.matched ?? tally.matched} to={tally.matched} />{match.of}</span>{match.post}</span>
          {delta ? <span className={`d2-delta${previous && previous.matched > tally.matched ? " d2-delta-down" : ""}`}><Ic name="up" size="xs" className={previous && previous.matched > tally.matched ? "d2-down" : undefined} />{delta}</span> : null}
          {tally.notMeasured > 0 ? <span className="d2-meta">{t.notMeasured(tally.notMeasured)}</span> : null}
        </p>
      ) : null}
    </section>
  );
}

/** A figure that changed since the last check counts up once; with reduced motion it just shows. */
function CountUp({ from, to }: { from: number; to: number }) {
  const [shown, setShown] = useState(to);
  useEffect(() => {
    if (from === to || typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const start = performance.now() + 350;
    const step = (now: number) => {
      const p = Math.max(0, Math.min(1, (now - start) / 700));
      setShown(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [from, to]);
  return <span className="d2-count-up">{shown.toLocaleString("en")}</span>;
}
