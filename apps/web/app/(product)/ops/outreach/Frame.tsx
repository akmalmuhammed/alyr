"use client";

// The outreach area's frame (specs/065, ALY-311): the overview strip (the kill switch, what waits
// for the founder, today's sends against the caps, prospects by stage) and the area's own
// navigation, above whichever screen is open. A screen that changes something calls `refresh()`
// so the strip's counts follow at once; otherwise it reads the API again every minute, quietly.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../api";
import { STAGE, STAGE_ORDER, W } from "./copy";
import { stageTone } from "./outreachLogic";
import type { Overview } from "./types";
import "./outreach.css";

type Frame = { overview: Overview | null; refresh: () => void };
const FrameContext = createContext<Frame>({ overview: null, refresh: () => {} });
export const useOverview = () => useContext(FrameContext);

export function OutreachFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    const answer = await api<Overview>("/api/admin/outreach/overview");
    if (answer.ok) { setOverview(answer.data); setFailed(false); } else setFailed(true);
  }, []);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 60_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [refresh]);

  const o = overview;
  const stages = o ? STAGE_ORDER.filter((s) => (o.stages[s] ?? 0) > 0) : [];
  const section = W.sections.find((s) => (s.href === "/ops/outreach" ? path === s.href : path.startsWith(s.href)));

  return (
    <FrameContext.Provider value={{ overview, refresh }}>
      <div className="or">
        <section className="or-strip" aria-label={W.overview.label} aria-live="polite">
          {!o && !failed && <p className="sh-note">{W.loading}</p>}
          {!o && failed && <p className="sh-note">{W.loadError}</p>}
          {o && <>
            <div className="or-strip-top">
              <Link href="/ops/outreach/settings" className={`or-kill ${o.kill_switch.on || !o.enabled ? "stopped" : ""}`}>
                <span className={`sh-pill ${o.kill_switch.on ? "bad" : !o.enabled ? "idle" : "active"}`}>
                  {o.kill_switch.on ? W.overview.killOn : !o.enabled ? W.overview.off : W.overview.killOff}
                </span>
                {o.mailbox?.paused && <span className="sh-pill wait">{W.overview.mailboxPaused}</span>}
              </Link>
              <dl className="or-figures">
                <div>
                  <dt>{W.overview.review}</dt>
                  <dd><Link href="/ops/outreach" className="num">{o.review_waiting}</Link></dd>
                </div>
                <div>
                  <dt>{W.overview.replies}</dt>
                  <dd><Link href="/ops/outreach/replies" className="num">{o.replies_waiting}</Link></dd>
                </div>
                <div>
                  <dt>{W.overview.today}</dt>
                  <dd><Link href="/ops/outreach/activity" className="num">{o.today.sent}<small>&nbsp;{W.overview.of}&nbsp;{Math.min(o.today.global_cap, o.today.mailbox_cap)}</small></Link></dd>
                </div>
              </dl>
            </div>
            {!o.enabled && <p className="or-strip-note">{W.overview.offNote}</p>}
            {stages.length === 0
              ? <p className="or-strip-note">{W.overview.noProspects}</p>
              : (
                <ul className="or-stages" aria-label={W.overview.stages}>
                  {stages.map((s) => (
                    <li key={s}>
                      <Link href={`/ops/outreach/prospects?stage=${s}`} className={`or-stage ${stageTone(s)}`}>
                        {STAGE[s]} <b className="num">{o.stages[s]}</b>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
          </>}
        </section>
        <nav className="or-nav" aria-label={W.sectionsLabel}>
          {W.sections.map((s) => {
            const count = s.label === "Review" ? o?.review_waiting : s.label === "Replies" ? o?.replies_waiting : undefined;
            const on = section?.href === s.href;
            return (
              <Link key={s.href} href={s.href} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>
                {s.label}{count ? <span className="or-nav-count num">{count}</span> : null}
              </Link>
            );
          })}
        </nav>
        {children}
      </div>
    </FrameContext.Provider>
  );
}
