// The life of one approved change: Approved → Sent → Pending review → Live and checked, from the
// proposal's status and verification as the API sends them. A step that failed is marked, in words.

import type { ReactNode } from "react";
import { T, type D2Lang, type WhereKey } from "./copy";
import type { Proposal } from "../discoveryApi";
import { railOf, stageOf } from "./logic";
import { Ltr, dayTime, time } from "./parts";

export function ChangeLifeTrack({ p, where, lang, nextCheckAt = null }: { p: Proposal; where: WhereKey; lang: D2Lang; nextCheckAt?: string | null }) {
  const t = T[lang];
  const steps = railOf(p);
  const stage = stageOf(p);
  const by = p.decided?.by ?? "";
  const label = { approved: t.railApproved, sent: stage === "failed" ? t.railFailed : t.railSent(where), pending: t.railPending(where), live: stage === "notLive" ? t.railNotLive : t.railLive };
  const sub = (key: (typeof steps)[number]["key"], at: string | null): ReactNode => {
    if (key === "approved") return at ? <><Ltr>{time(at, lang)}</Ltr>{by ? ` · ${by}` : ""}</> : by;
    if (key === "sent") return at ? <Ltr>{time(at, lang)}</Ltr> : stage === "failed" ? "" : t.railWaiting;
    if (key === "pending") return "";
    if (stage === "live") return t.matchesNow;
    if (stage === "notLive") return t.notMatching;
    return nextCheckAt ? <Ltr>{dayTime(nextCheckAt, lang)}</Ltr> : t.railNext;
  };
  return (
    <ol className="d2-rail" aria-label={t.rail}>
      {steps.map((s) => (
        <li key={s.key} className={`d2-rail-${s.state}`} aria-current={s.state === "now" ? "step" : undefined}>
          <b>{label[s.key]}</b>
          <span>{sub(s.key, s.at)}</span>
        </li>
      ))}
    </ol>
  );
}
