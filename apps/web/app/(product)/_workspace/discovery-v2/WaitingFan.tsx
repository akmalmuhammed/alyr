// The asks waiting behind the first one: a floating pill that names them, and on a press the
// tickets fan out from under the stack. A task only the owner can do ("You do this one") sits
// among them with its own receipt line.

import type { AskView } from "./adapter";
import type { Finding } from "../discoveryApi";
import { T, type D2Lang } from "./copy";
import { Ic } from "./icons";
import { Hl, Ltr, Say } from "./parts";

export function WaitingFan({ lang, asks, owner, startIndex, of, open, onToggle, onApprove, onDecline, onWhy, onSkip, busyId }: {
  lang: D2Lang;
  asks: AskView[];
  owner: Finding[];
  startIndex: number;
  of: number;
  open: boolean;
  onToggle: () => void;
  onApprove: (ask: AskView) => void;
  onDecline: (ask: AskView) => void;
  onWhy: (ask: AskView) => void;
  onSkip: (f: Finding) => void;
  busyId: string | null;
}) {
  const t = T[lang];
  const count = asks.length + owner.length;
  if (!count) return null;
  const lower = (s: string) => (lang === "en" && /^[A-Z][a-z]*(\s|$)/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
  const all = [...new Set([...asks.map((a) => lower(a.p.field_label)), ...owner.map((f) => t.ownerName[f.rule_id]?.replace(/^the /, "") ?? lower(f.title.replace(/[.。]$/, "")))])];
  const names = all.length > 3 ? t.andMore(all.slice(0, 3).join(t.listSep), all.length - 3) : all.join(t.listSep);
  return (
    <>
      <button className="d2-waiting" type="button" aria-expanded={open} aria-controls="d2-fan" onClick={onToggle}>
        <b><Say lang={lang}>{t.moreWaiting(count)}</Say></b> <span className="d2-waiting-names"><Say lang={lang}>{names}</Say></span>
        <span className="d2-chev" aria-hidden="true"><Ic name="down" size="sm" /></span>
      </button>
      <div className="d2-fan" id="d2-fan" hidden={!open}>
        {asks.map((a, i) => (
          <article className="d2-ticket d2-mini d2-cut" key={a.p.id} aria-labelledby={`d2-mini-${a.p.id}`}>
            <header className="d2-t-meta"><span className="d2-kind"><span className="d2-sq" aria-hidden="true" />{t.needsYou}</span><span className="d2-dot" aria-hidden="true">·</span><span><Say lang={lang}>{t.askOf(startIndex + i, of)}</Say></span></header>
            <div className="d2-t-inner">
              <h3 className="d2-t-lead" id={`d2-mini-${a.p.id}`}>{a.lead.pre}{a.lead.hl ? <Hl draw={false}>{a.lead.hl}</Hl> : null}{a.lead.post}</h3>
              <p className="d2-t-support"><Say lang={lang}>{a.p.why}</Say></p>
              <div className="d2-value-diff">
                <span className="d2-strike"><Ltr>{a.before}</Ltr></span>
                <Ic name="arrow" size="sm" flip className="d2-to" />
                <span className="d2-new"><Hl draw={false}><Ltr>{a.after}</Ltr></Hl></span>
              </div>
              <div className="d2-t-actions">
                <button className="d2-btn d2-btn-approve d2-btn-sm d2-cut-control" type="button" disabled={!a.p.can.approve || busyId !== null} onClick={() => onApprove(a)}>{busyId === a.p.id ? t.sending : t.approve}</button>
                <button className="d2-btn d2-btn-quiet" type="button" disabled={!a.p.can.decline || busyId !== null} onClick={() => onDecline(a)}>{t.notNow}</button>
                <button className="d2-why d2-why-sm" type="button" aria-haspopup="dialog" onClick={() => onWhy(a)}>{t.why}</button>
              </div>
            </div>
            <footer className="d2-t-receipt"><Ic name="lock" size="sm" /><Say lang={lang}>{t.lockLine(a.where)}</Say></footer>
          </article>
        ))}
        {owner.map((f, i) => (
          <article className="d2-ticket d2-mini d2-cut" key={f.id} aria-labelledby={`d2-mini-${f.id}`}>
            <header className="d2-t-meta"><span className="d2-kind"><Ic name="pen" size="sm" />{t.youDo}</span><span className="d2-dot" aria-hidden="true">·</span><span><Say lang={lang}>{t.askOf(startIndex + asks.length + i, of)}</Say></span></header>
            <div className="d2-t-inner">
              <h3 className="d2-t-lead" id={`d2-mini-${f.id}`}><Say lang={lang}>{f.title}</Say></h3>
              <p className="d2-t-support"><Say lang={lang}>{f.what_is_needed || f.why}</Say></p>
              <div className="d2-t-actions">
                <span className="d2-small d2-muted d2-grow">{f.what_happens}</span>
                <button className="d2-btn d2-btn-quiet" type="button" disabled={busyId !== null} onClick={() => onSkip(f)}>{t.notNow}</button>
              </div>
            </div>
            <footer className="d2-t-receipt"><Ic name="person" size="sm" />{t.youDoReceipt}</footer>
          </article>
        ))}
      </div>
    </>
  );
}
