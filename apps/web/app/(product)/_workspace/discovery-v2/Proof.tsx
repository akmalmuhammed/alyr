"use client";

// Proof, Discovery v2 (workstream U2): every receipt ALYR keeps, newest first. A compact Carbon
// strip "Receipts · kept by ALYR", light filters with counts, and each receipt as a white card: the
// before and after, the trail of what happened (asked, who decided and how, sent by ALYR, what the
// next check saw), and its status at the end. Undo only where ALYR applied the change and the API
// still allows it, saying what it puts back. A change the owner made outside ALYR has no Undo.
// Under the receipts: the 30-day note for Google's text and "A count of checks is not a count of
// customers".

import { useState, type ReactNode } from "react";
import { personFor, type Person } from "./adapter";
import { T, type D2Lang } from "./copy";
import { T2 } from "./copy2";
import { Filters, ScreenFrame, StatePill, Val, type PillTone } from "./frame";
import { Ic } from "./icons";
import { joinNames, stageOf as stage, whereOf } from "./logic";
import { Av, day, dayTime } from "./parts";
import { Mark } from "../shellParts";
import { beforeAfter } from "./logic";
import { filterReceipts, type ProofView, type ChangeReceipt, type Receipt, type ReceiptFilter, type ReceiptStatus } from "./screens";

export function Proof({ lang, view, tabs, foot, people, sourceKind, onUndo, busyId, initialFilter = "all" }: {
  lang: D2Lang;
  view: ProofView;
  tabs: ReactNode;
  foot?: ReactNode;
  people: Person[];
  sourceKind: string;
  onUndo: (r: ChangeReceipt) => void;
  busyId: string | null;
  initialFilter?: ReceiptFilter;
}) {
  const t = T2[lang];
  const [filter, setFilter] = useState<ReceiptFilter>(initialFilter);
  const shown = filterReceipts(view.receipts, filter);
  const google = view.receipts.some((r) => r.kind !== "you" && whereOf(r.p.target, sourceKind) === "google");
  const personOf = (name: string): Person => personFor(name, people);
  const deciders = view.deciders.map(personOf);
  // "Done by you" is always offered: a website change is the owner's to make (DECISIONS #8).
  const filters = (["all", "approved", "you", "fixed", "changed", "undone", "expired", "declined"] as const)
    .filter((k) => k === "all" || k === "approved" || k === "you" || view.counts[k] > 0)
    .map((key) => ({ key, label: t.proofFilters[key], count: view.counts[key] }));

  return (
    <ScreenFrame lang={lang} foot={foot}>
      {tabs}
      <section className="d2-brief">
        {view.receipts.length && view.since ? (
          <>
            <h1 className="d2-display">{t.proofTitle(view.receipts.length, day(view.since, lang))}</h1>
            <p className="d2-sub">{t.proofSub}</p>
            <p className="d2-figline">
              {view.matches ? <StatePill tone="ok">{t.sumMatch(view.matches)}</StatePill> : null}
              {view.counts.undone ? <StatePill tone="plain">{t.sumUndone(view.counts.undone)}</StatePill> : null}
              {view.counts.expired ? <StatePill tone="plain">{t.sumExpired(view.counts.expired)}</StatePill> : null}
              {deciders.length || view.byYou ? (
                <span className="d2-meta d2s-who">
                  <span className="d2-avs">{deciders.map((p) => <Av key={p.name} person={p} tip={p.name} />)}{view.byYou ? <Av tone="you" /> : null}</span>
                  {t.decidedBy(joinNames([...deciders.map((p) => p.name), ...(view.byYou ? [t.you] : [])], lang, "and"))}
                </span>
              ) : null}
            </p>
          </>
        ) : (
          <>
            <h1 className="d2-display">{t.proofNone}</h1>
            <p className="d2-sub">{t.proofNoneBody}</p>
          </>
        )}
      </section>

      {view.receipts.length ? (
        <section className="d2s-receipts" aria-labelledby="d2s-ledger-title">
          <div className="d2s-rstrip d2-on-carbon d2-cut">
            <span className="d2s-ch-mk" aria-hidden="true"><Mark /></span>
            <h2 id="d2s-ledger-title">{t.ledger}</h2><span className="d2s-rstrip-sub">{t.ledgerSub}</span>
            <span className="d2s-rstrip-end">{t.ledgerEnd}</span>
          </div>
          <div className="d2s-rtools"><Filters label={t.filtersLabel} items={filters} value={filter} onChange={setFilter} /></div>
          {shown.map((r) => <ReceiptCard key={r.id} r={r} lang={lang} sourceKind={sourceKind} personOf={personOf} onUndo={onUndo} busy={busyId !== null} />)}
          {google ? <p className="d2s-foot-note">{t.googleNote}</p> : null}
        </section>
      ) : null}

      <div className="d2s-caution">
        <span className="d2s-caution-ic"><Ic name="why" size="sm" /></span>
        <div><b>{t.cautionTitle}</b><p>{t.cautionBody}</p></div>
      </div>
    </ScreenFrame>
  );
}

const TONE: Record<ReceiptStatus, PillTone> = {
  matches: "ok", youMatches: "ok", fixed: "ok", sent: "nm", youPending: "nm", approved: "nm", notMatching: "warn", failed: "warn", undone: "plain", expired: "plain", declined: "plain", changed: "plain",
};

type Node = "ask" | "alyr" | "ok" | "no" | "eye" | "wait" | "you" | { person: Person };
type Step = { node: Node; open?: boolean; title: string; text: string };

function ReceiptCard({ r, lang, sourceKind, personOf, onUndo, busy }: {
  r: Receipt;
  lang: D2Lang;
  sourceKind: string;
  personOf: (name: string) => Person;
  onUndo: (r: ChangeReceipt) => void;
  busy: boolean;
}) {
  const t = T2[lang];
  const t1 = T[lang];
  if (r.kind === "you") {
    const steps: Step[] = [
      { node: "you", title: t.doneYou, text: t.doneYouStep },
      r.f.status === "verified" ? { node: "ok", title: t.nextSaw, text: day(r.when, lang) } : { node: "wait", open: true, title: t.nextWait, text: "" },
    ];
    return (
      <article className="d2s-rc" data-kind="you">
        <div className="d2s-rc-d"><b>{day(r.when, lang)}</b>{r.f.location?.name ?? ""}</div>
        <div className="d2s-rc-main"><h3>{r.f.title}</h3><Trail steps={steps} lang={lang} /></div>
        <div className="d2s-rc-st">
          <StatePill tone={TONE[r.status]}>{r.status === "youMatches" ? t.stMatches : t.stPending}</StatePill>
          <small>{t.noUndoOutside}</small>
        </div>
      </article>
    );
  }
  const p = r.p;
  const where = whereOf(p.target, sourceKind);
  const ba = beforeAfter(p, lang);
  const by = p.decided?.by ?? "";
  const steps: Step[] = [];
  // The loop opens an ask when it becomes one of the three; before that it was only noticed.
  const askedAt = p.opened_at ?? p.proposed_at;
  if (askedAt) steps.push({ node: "ask", title: t.asked, text: dayTime(askedAt, lang) });
  const closed = day(r.when, lang);
  if (r.kind === "expired") {
    steps.push({ node: "ask", open: true, title: t.closedNoDecision(closed), text: "" });
    steps.push({ node: "no", title: t.nothingApplied, text: t.nothingAppliedBody });
  } else if (r.kind === "fixed") {
    steps.push({ node: "ok", title: t.fixedStep(closed), text: "" });
    steps.push({ node: "no", title: t.nothingApplied, text: t.fixedBody });
  } else if (r.kind === "changed") {
    steps.push({ node: "you", title: t.changedStep(closed), text: t.changedBody });
  } else if (r.kind === "declined" && p.status === "expired") {
    steps.push({ node: "you", title: t.setAside(closed), text: "" });
    steps.push({ node: "no", title: t.nothingApplied, text: t.setAsideBody });
  } else if (r.kind === "declined") {
    steps.push({ node: by ? { person: personOf(by) } : "no", title: t.declinedBy(by), text: [dayTime(p.decided?.at, lang), t.channel[p.decided?.channel ?? ""]].filter(Boolean).join(", ") });
    steps.push({ node: "no", title: t.nothingApplied, text: p.decided?.reason === "declined" ? "" : t.notNowBody });
  } else {
    if (by) steps.push({ node: { person: personOf(by) }, title: p.approved_as === "edited" ? t.changedAndApproved(by) : t.approvedBy(by), text: [dayTime(p.decided?.at, lang), t.channel[p.decided?.channel ?? ""]].filter(Boolean).join(", ") });
    if (p.status === "failed") steps.push({ node: "no", title: t.notSent, text: p.failure?.message ?? "" });
    else if (p.applied_at) steps.push({ node: "alyr", title: t.sentBy, text: `${t.sentTo[where]} · ${dayTime(p.applied_at, lang)}` });
    else steps.push({ node: "alyr", open: true, title: t.sendingNow, text: "" });
    if (r.kind === "undone") {
      const who = p.undone?.by ?? "";
      steps.push({ node: who ? { person: personOf(who) } : "ask", title: t.undoneByAt(who), text: `${dayTime(p.undone?.at, lang)}. ${t.undoneBody(ba.before, t.where[where])}` });
    } else if (p.applied_at) {
      // The loop's life (Google's review, refused, changed back) in the API's words, then the check
      // about 20 hours after sending: when it looks, and what it saw.
      const life = p.life?.state;
      const verified = p.receipt?.verified ?? null;
      const seen = verified?.at ? dayTime(verified.at, lang) : "";
      if (life === "pending_review") steps.push({ node: "wait", open: true, title: p.life?.text || t.nextWait, text: dayTime(p.life?.at, lang) });
      if (life === "rejected" || life === "changed_back") steps.push({ node: "eye", title: p.life?.text || t.nextSawNot, text: dayTime(p.life?.at, lang) });
      else if (stage(p) === "live") steps.push({ node: "ok", title: t.nextSaw, text: seen || dayTime(p.verified_at, lang) });
      else if (p.verification === "not_confirmed") steps.push({ node: "eye", title: verified?.text || t.nextSawNot, text: seen });
      else if (life !== "pending_review") {
        const next = p.next_check_at ?? p.receipt?.next_check_at ?? null;
        steps.push({ node: "wait", open: true, title: t.nextWait, text: next ? t1.checkAround(dayTime(next, lang)) : "" });
      }
    }
  }
  const word = { matches: t.stMatches, sent: t.stSent, notMatching: t.stNotMatching, approved: t.stApproved, failed: t.stFailed, undone: t.stUndone, expired: t.stExpired, declined: t.stDeclined, fixed: t.stFixed, changed: t.stChanged, youMatches: t.stMatches, youPending: t.stPending }[r.status];
  const sub = r.status === "expired" || r.status === "declined" || r.status === "fixed" ? t.nothingChanged : r.status === "undone" ? t.sinceDay(day(p.undone?.at, lang)) : "";
  return (
    <article className="d2s-rc" data-kind={r.kind}>
      <div className="d2s-rc-d"><b>{day(r.when, lang)}</b>{t.where[where]}</div>
      <div className="d2s-rc-main">
        <h3>{t1.exactField(p.field_label, where)}</h3>
        <div className="d2-pair">
          {p.before.removed ? <span className="d2-chip d2-chip-from d2-chip-removed" data-tip={t1.removedTip}>{ba.before}</span> : <span className="d2-chip d2-chip-from"><Val text={ba.before} /></span>}
          <Ic name="arrow" size="xs" flip className="d2-to" />
          <span className="d2-chip d2-chip-to"><Val text={ba.after} /></span>
        </div>
        <Trail steps={steps} lang={lang} />
      </div>
      <div className="d2s-rc-st">
        <StatePill tone={TONE[r.status]}>{word}</StatePill>
        {sub ? <small>{sub}</small> : null}
        {r.kind === "approved" && p.can.undo && p.undo_until ? (
          <>
            <button className="d2-undo" type="button" onClick={() => onUndo(r)} disabled={busy} data-tip={t1.undoTip(ba.before, where)}><Ic name="undo" size="xs" flip />{t1.undo}</button>
            <small>{t1.untilDate(day(p.undo_until, lang))}</small>
          </>
        ) : null}
      </div>
    </article>
  );
}

function Trail({ steps, lang }: { steps: Step[]; lang: D2Lang }) {
  return (
    <ol className="d2s-trail" data-lang={lang}>
      {steps.map((s, i) => (
        <li key={i} className={s.open ? "d2s-open" : undefined}>
          <NodeMark node={s.node} />
          <span><b>{s.title}</b>{s.text ? <> · <span className="d2s-trail-t">{s.text}</span></> : null}</span>
        </li>
      ))}
    </ol>
  );
}

function NodeMark({ node }: { node: Node }) {
  if (typeof node === "object") return <span className="d2s-node d2s-node-av"><Av person={node.person} /></span>;
  if (node === "alyr") return <span className="d2s-node d2s-node-alyr" aria-hidden="true"><Mark /></span>;
  if (node === "you") return <span className="d2s-node" aria-hidden="true"><Ic name="person" size="xs" /></span>;
  if (node === "ok") return <span className="d2s-node d2s-node-ok" aria-hidden="true"><Ic name="check" size="xs" /></span>;
  if (node === "no") return <span className="d2s-node d2s-node-n" aria-hidden="true"><Ic name="x" size="xs" /></span>;
  if (node === "eye") return <span className="d2s-node d2s-node-n" aria-hidden="true"><Ic name="eye" size="xs" /></span>;
  if (node === "wait") return <span className="d2s-node d2s-node-n" aria-hidden="true"><Ic name="clock" size="xs" /></span>;
  return <span className="d2s-node" aria-hidden="true"><Ic name="send" size="xs" flip /></span>;
}
