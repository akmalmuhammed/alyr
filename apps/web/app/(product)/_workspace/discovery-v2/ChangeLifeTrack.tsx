// The life of one approved change: Approved → Sent → Pending review → Live and checked, from the
// loop's `life` and `life_history` (agent D) when the API sends them, else from the proposal's
// status and verification. Google's own review, a refusal and a change made back are marked in
// the API's plain words; the check about 20 hours after sending says when it looks, then what it saw.

import type { ReactNode } from "react";
import { T, type D2Lang, type WhereKey } from "./copy";
import type { Proposal } from "../discoveryApi";
import { railOf, stageOf } from "./logic";
import { Ltr, dayTime, time } from "./parts";

export function ChangeLifeTrack({ p, where, lang, nextCheckAt = null }: { p: Proposal; where: WhereKey; lang: D2Lang; nextCheckAt?: string | null }) {
  const t = T[lang];
  const steps = railOf(p);
  const stage = stageOf(p);
  const life = p.life?.state ?? null;
  const by = p.decided?.by ?? "";
  const label = {
    approved: t.railApproved,
    sent: stage === "failed" ? t.railFailed : t.railSent(where),
    pending: life === "rejected" ? t.railRejected(where) : t.railPending(where),
    live: life === "changed_back" ? t.railChangedBack : stage === "notLive" ? t.railNotLive : t.railLive,
  };
  // The check about 20 hours after sending (the loop), else the weekly check-up.
  const next = p.next_check_at ?? p.receipt?.next_check_at ?? nextCheckAt;
  const verified = p.receipt?.verified ?? null;
  const sub = (key: (typeof steps)[number]["key"], at: string | null): ReactNode => {
    if (key === "approved") return at ? <><Ltr>{time(at, lang)}</Ltr>{by ? ` · ${by}` : ""}</> : by;
    if (key === "sent") return at ? <Ltr>{time(at, lang)}</Ltr> : stage === "failed" ? "" : t.railWaiting;
    if (key === "pending") return life === "rejected" ? (p.life?.text ?? "") : at ? <Ltr>{dayTime(at, lang)}</Ltr> : "";
    if (life === "changed_back") return p.life?.text ?? t.notMatching;
    if (stage === "live") return verified?.at ? t.checkedResult(dayTime(verified.at, lang)) : at ? t.checkedResult(dayTime(at, lang)) : t.matchesNow;
    if (stage === "notLive") return verified?.text || t.notMatching;
    return next ? (p.next_check_at || p.receipt?.next_check_at ? t.checkAround(dayTime(next, lang)) : <Ltr>{dayTime(next, lang)}</Ltr>) : t.railNext;
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
