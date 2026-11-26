// The Ask Ticket: the one physical object on This week. One exact change, the sentence with the
// part to decide behind the Volt highlighter, the evidence that is real (what the owner confirmed,
// first-party bars when they exist), the live miniature of the page it lands on, and four actions:
// Approve (the one Volt button), Change it (only where the API can take a changed value), Not now
// and Why?. After Approve the same ticket shows the stamp and the life of the change, with Undo
// while the API allows it.

import type { AskView, Person } from "./adapter";
import type { Proposal, DayKey } from "../discoveryApi";
import { T, type D2Lang } from "./copy";
import { Ic } from "./icons";
import { Avs, Hl, Kbd, day, time } from "./parts";
import { DayBars } from "./DayBars";
import { ListingMiniature } from "./ListingMiniature";
import { ChangeLifeTrack } from "./ChangeLifeTrack";
import { afterFromDraft, draftText, stageOf, type Draft } from "./logic";

export type Busy = "approve" | "decline" | "undo" | null;

export type AskTicketProps = {
  ask: AskView;
  /** The proposal as it is now (after an Approve in this visit it is the API's answer). */
  p: Proposal;
  lang: D2Lang;
  approvers: Person[];
  today: DayKey;
  checkedAt: string | null;
  busy: Busy;
  /** Not now was pressed: the date ALYR may ask again. */
  snoozedUntil: number | null;
  /** Change it, where the API lets this proposal be changed (`edit`); otherwise undefined and the button is not drawn. */
  draft: Draft | null;
  onEdit?: (on: boolean) => void;
  onDraft?: (draft: Draft) => void;
  onApprove: () => void;
  onDecline: () => void;
  onUndo: () => void;
  onWhy: () => void;
  error: string;
  peeks: number;
  /** When the next check runs, if the API says (workstream D). */
  nextCheckAt: string | null;
};

export function AskTicket(props: AskTicketProps) {
  const { ask, p, lang, approvers } = props;
  const t = T[lang];
  const stage = stageOf(p);
  const undone = stage === "undone";
  const after = !undone && stage !== "waiting" && stage !== "declined" && stage !== "expired";
  const editing = !!props.draft;
  const exact = props.draft ? draftText(p, props.draft, lang) : ask.exact;
  const draftOk = !props.draft || afterFromDraft(p, props.draft) !== null;
  const names = approvers.map((a) => a.name);
  const nameList = names.length > 1 ? `${names.slice(0, -1).join(t.listSep)}${t.or}${names[names.length - 1]}` : names[0] ?? "";
  const asked = ask.p.proposed_at ? (ask.p.expires_at ? t.asked(day(ask.p.proposed_at, lang), day(ask.p.expires_at, lang)) : t.askedOnly(day(ask.p.proposed_at, lang))) : "";
  const kind = stage === "failed" || stage === "notLive"
    ? <span className="d2-kind d2-kind-attn"><Ic name="alert" size="sm" />{t.attention}</span>
    : after ? <span className="d2-kind"><Ic name="clock" size="sm" />{t.inProgress}</span>
    : <span className="d2-kind"><span className="d2-sq" aria-hidden="true" />{t.needsYou}</span>;

  return (
    <div className="d2-stack" data-peeks={props.peeks}>
      <article className={`d2-ticket d2-cut${after ? " d2-approved" : ""}${editing ? " d2-editing" : ""}`} id="d2-ask" aria-labelledby="d2-ask-title" tabIndex={-1}>
        {props.snoozedUntil ? (
          <div className="d2-snoozed" role="status">
            <p><b>{t.notNowTitle}</b> <span className="d2-muted">{t.notNowBody(day(new Date(props.snoozedUntil).toISOString(), lang))}</span></p>
          </div>
        ) : undone ? (
          <div className="d2-snoozed" role="status">
            <p><b>{t.toastUndone}.</b> <span className="d2-muted">{t.toastUndoneBody(ask.before, ask.where)}</span></p>
          </div>
        ) : (
          <>
            <header className="d2-t-meta">
              {kind}
              <span className="d2-dot" aria-hidden="true">·</span><span>{t.askOf(ask.index, ask.of)}</span>
              {asked ? <><span className="d2-dot" aria-hidden="true">·</span><span>{asked}</span></> : null}
            </header>
            <div className="d2-t-body">
              <div className="d2-t-text">
                {after ? (
                  <div className="d2-after">
                    <div className="d2-stamp d2-cut-stamp"><Ic name="check" size="sm" />{t.approved}{p.decided ? <small>{t.stampBy(p.decided.by, time(p.decided.at, lang))}</small> : null}</div>
                    <h2 className="d2-t-lead" id="d2-ask-title">{ask.day ? t.afterLeadDay(ask.day, ask.after, ask.where) : t.afterLead(p.field_label, ask.where)}</h2>
                    <p className="d2-t-support">{stage === "failed" ? t.failed(p.failure?.message ?? "") : p.life && (p.life.state === "rejected" || p.life.state === "changed_back") && p.life.text ? p.life.text : t.afterSupport(ask.where)}</p>
                    {p.approved_as === "edited" ? <p className="d2-small d2-muted">{t.editedNote}</p> : null}
                    <ChangeLifeTrack p={p} where={ask.where} lang={lang} nextCheckAt={props.nextCheckAt} />
                    <div className="d2-t-actions d2-undo-row">
                      {p.can.undo && p.undo_until ? (
                        <>
                          <button className="d2-btn d2-btn-line d2-btn-sm" type="button" onClick={props.onUndo} disabled={props.busy === "undo"} data-tip={t.undoTip(ask.before, ask.where)}>
                            <Ic name="undo" size="sm" flip />{t.undo}
                          </button>
                          <span className="d2-small d2-muted">{t.undoUntil(day(p.undo_until, lang), ask.before, ask.where)}</span>
                        </>
                      ) : stage === "approved" ? <span className="d2-small d2-muted">{t.undoWhenSent}</span> : null}
                    </div>
                  </div>
                ) : (
                  <div className="d2-before">
                    <h2 className="d2-t-lead" id="d2-ask-title">{ask.lead.pre}{ask.lead.hl ? <Hl>{ask.lead.hl}</Hl> : null}{ask.lead.post}</h2>
                    <p className="d2-t-support">
                      {ask.firstParty ? (() => {
                        const fp = ask.firstParty;
                        const o = fp.weeks.reduce((a, w) => a + w.orders, 0);
                        const b = fp.weeks.reduce((a, w) => a + w.bookings, 0);
                        const s = t.firstParty(o, b, fp.weeks.length, fp.day);
                        return <>{s.pre}<b>{s.strong}</b>{s.post} </>;
                      })() : null}
                      {ask.confirmed && ask.confirmed.at ? (ask.day ? t.confirmedDay(ask.day, ask.confirmed.text, day(ask.confirmed.at, lang)) : t.confirmedValue(ask.confirmed.text, day(ask.confirmed.at, lang))) : !ask.firstParty ? p.why : null}
                    </p>
                    {ask.firstParty ? <DayBars fp={ask.firstParty} where={ask.where} lang={lang} /> : null}
                    <div className="d2-t-scope">
                      <span className="d2-chip"><Ic name="calendar" size="sm" />{ask.day ? t.onlyDay(ask.day) : ask.days.length > 1 ? t.daysChange(ask.days.length) : t.onlyField(p.field_label)}</span>
                      <span className="d2-chip"><Ic name="globe" size="sm" />{t.whereChip(ask.where)}</span>
                    </div>
                    {editing && (p.field === "hours" || p.field === "phone") ? <p className="d2-small d2-muted">{t.editFactNote(p.field_label)}</p> : null}
                    {editing && !draftOk ? <p className="d2-error" role="alert">{t.editInvalid}</p> : null}
                    {props.error ? <p className="d2-error" role="alert">{props.error}</p> : null}
                    <div className="d2-t-actions d2-t-actions-main">
                      <button className="d2-btn d2-btn-approve d2-cut-control" type="button" onClick={props.onApprove} disabled={!p.can.approve || props.busy !== null || !draftOk} aria-keyshortcuts="a">
                        <span>{props.busy === "approve" ? t.sending : editing ? t.approveExact(exact) : t.approve}</span><Kbd>{t.keyA}</Kbd>
                      </button>
                      {props.onEdit ? (
                        <button className="d2-btn d2-btn-line" type="button" onClick={() => props.onEdit?.(!editing)} data-tip={t.tipChange} aria-keyshortcuts="c" aria-pressed={editing}>{editing ? t.cancel : t.changeIt}</button>
                      ) : null}
                      <button className="d2-btn d2-btn-text" type="button" onClick={props.onDecline} disabled={!p.can.decline || props.busy !== null} data-tip={t.tipNotNow} aria-keyshortcuts="n">{t.notNow}</button>
                      {editing ? null : (
                        <button className="d2-why" type="button" onClick={props.onWhy} data-tip={t.tipWhy} aria-keyshortcuts="Shift+?" aria-haspopup="dialog"><Ic name="why" size="sm" />{t.why}</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <ListingMiniature ask={ask} lang={lang} today={props.today} settled={after} readAt={props.checkedAt} draft={props.draft} onDraft={props.onDraft} />
            </div>
            <footer className="d2-t-receipt">
              <Ic name="lock" size="sm" />
              {after ? (
                <span>{p.decided ? t.approvedIn(p.decided.by) : null}<span className="d2-sep"> · </span>{t.noCustomers}</span>
              ) : (
                <span>
                  {t.nothingUntil(ask.where)}
                  {p.undo_window_days ? <><span className="d2-sep"> · </span>{t.undoFor(p.undo_window_days)}</> : null}
                  {names.length ? <><span className="d2-sep"> · </span><Avs people={approvers} tips={(a) => t.personTip(a.name, t.roles[a.role] ?? "")} /> {t.canApprove(nameList)}</> : null}
                </span>
              )}
            </footer>
          </>
        )}
      </article>
      {props.peeks > 0 ? <div className="d2-peek d2-peek-1 d2-cut" aria-hidden="true" /> : null}
      {props.peeks > 1 ? <div className="d2-peek d2-peek-2 d2-cut" aria-hidden="true" /> : null}
    </div>
  );
}
