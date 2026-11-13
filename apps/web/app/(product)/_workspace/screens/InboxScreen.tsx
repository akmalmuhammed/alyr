"use client";

// The Inbox: every customer conversation, answered by automatic replies or by you. Moved out of
// Screens.tsx unchanged when that file was split into one file per screen.

import { useCallback, useEffect, useRef, useState } from "react";
import { ForgetCustomer } from "../Forget";
import { usePolling } from "../poll";
import { shopNameShown } from "../shopLedger";
import { BLOCK_REASON, T, type Activity } from "../screensCopy";
import {
  ScreenFrame, ShowFilter, activeFilter, getJson, maybe, useShopFacts,
  type ScreenProps,
} from "./shared";

type Choice = { id: string; title: string };
type Message = {
  direction: "in" | "out";
  kind: string;
  body: string;
  payload: { choices?: Choice[]; template?: string; category?: string };
  status?: string;
  error?: string | null;
  created_at: string;
};
type PriceGroupOption = { id: string; name: string; name_ar: string; is_default: boolean };
type InboxRow = {
  id: string; name: string; phone: string | null; username: string | null;
  status: "open" | "closed"; assistant_paused: boolean; opted_out: boolean;
  window_open: boolean; window_closes_at: string | null; unread: number;
  assigned: { id: string; name: string } | null;
  last: { body: string; direction: "in" | "out"; kind: string; status: string; created_at: string };
};
type InboxMessage = Message & { id: string; sent_by: string };
type StaffNote = { id: string; body: string; author_name: string; created_at: string };
type Thread = {
  customer: Omit<InboxRow, "unread" | "last"> & { price_group_id?: string | null };
  messages: InboxMessage[]; notes: StaffNote[];
  activity: Activity[];
};
type SavedReply = { id: string; title: string; body: string };

function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer">{part}</a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function InboxScreen({ lang, intro, show = null, onClearShow, modules, business }: ScreenProps) {
  const { me, members, canManage, summary } = useShopFacts(modules);
  // The shop's customer price groups (wholesale); empty where the Catalog is not switched on.
  const [priceGroups, setPriceGroups] = useState<{ groups: PriceGroupOption[]; can_manage: boolean }>({ groups: [], can_manage: false });
  const [inboxRows, setInboxRows] = useState<InboxRow[]>([]);
  const [inboxFilter, setInboxFilter] = useState<"open" | "closed">("open");
  const [assignedFilter, setAssignedFilter] = useState<"any" | "me" | "none">("any");
  const [savedReplies, setSavedReplies] = useState<SavedReply[]>([]);
  const [composeMode, setComposeMode] = useState<"reply" | "note">("reply");
  const [closing, setClosing] = useState<"" | "outcome" | "reason">("");
  const [chatId, setChatId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [hoursLeft, setHoursLeft] = useState(0);
  // Refreshed with the data, so "has this visit started" never calls the clock while rendering.
  const [now, setNow] = useState(0);
  const threadEnd = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const t = T[lang];
  const filter = activeFilter(show, "inbox");
  const filterLine = <ShowFilter filter={filter} lang={lang} onClearShow={onClearShow} />;

  const refresh = useCallback(async () => {
    try {
      // The open conversation, after the list: reading it on screen is what marks it read.
      const rows = (
        await maybe<{ conversations: InboxRow[] }>(
          `/api/inbox/conversations?status=${inboxFilter}&assigned=${assignedFilter}`,
          { conversations: [] },
        )
      ).conversations;
      setInboxRows(rows);
      if (chatId) {
        const loaded = await getJson<Thread>(`/api/inbox/conversations/${chatId}`);
        setThread(loaded);
        const closes = loaded.customer.window_closes_at;
        setHoursLeft(closes ? Math.floor((new Date(closes).getTime() - Date.now()) / 3_600_000) : 0);
        if (rows.find((r) => r.id === chatId)?.unread) {
          await getJson(`/api/inbox/conversations/${chatId}/read`, { method: "POST" });
        }
      }
      setNow(Date.now());
      setError("");
    } catch {
      setError(t.unreachable);
    }
  }, [inboxFilter, assignedFilter, chatId, t]);

  // Every 10 s while the screen is on show, and at once when what is asked for changes or the
  // person comes back to the tab.
  usePolling(refresh, 10_000);

  // Saved replies, and the price groups the conversation's side panel offers, change rarely:
  // asked when the inbox or a conversation is opened.
  useEffect(() => {
    const ask = setTimeout(async () => {
      try {
        setSavedReplies((await getJson<{ replies: SavedReply[] }>("/api/inbox/saved-replies")).replies);
        if (chatId) setPriceGroups(await maybe("/api/price-groups", { groups: [], can_manage: false }));
      } catch {
        // The polling's own error line says the API cannot be reached.
      }
    }, 0);
    return () => clearTimeout(ask);
  }, [chatId]);

  const threadLength = thread?.messages.length ?? 0;
  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: "nearest" });
  }, [threadLength, chatId]);

  async function inboxPost(path: string, body?: object) {
    if (!chatId) return;
    await getJson(`/api/inbox/conversations/${chatId}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    refresh();
  }

  async function setCustomerGroup(groupId: string) {
    if (!chatId) return;
    await getJson(`/api/price-groups/customers/${chatId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ group_id: groupId }),
    });
    refresh();
  }

  async function sendReply() {
    const text = replyDraft.trim();
    if (!text) return;
    setReplyDraft("");
    await inboxPost(composeMode === "note" ? "notes" : "reply", { text });
  }

  async function saveQuickReply() {
    const body = replyDraft.trim();
    if (!body) return;
    await getJson("/api/inbox/saved-replies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: body.slice(0, 28), body }),
    });
    refresh();
  }

  async function deleteQuickReply(id: string) {
    await getJson(`/api/inbox/saved-replies/${id}`, { method: "DELETE" });
    refresh();
  }


  async function closeAs(outcome: string, reason?: string) {
    setClosing("");
    await inboxPost("status", { status: "closed", outcome, ...(reason ? { reason } : {}) });
  }

  const shownChats = filter === "waiting"
    ? inboxRows.filter((r) => r.status === "open" && r.last.direction === "in"
        && now - new Date(r.last.created_at).getTime() > 10 * 60_000)
    : inboxRows;
  const openThread = thread && thread.customer.id === chatId ? thread : null;
  // Customer messages, staff notes and what the team did, in one timeline, oldest first.
  const timeline = openThread
    ? [...openThread.messages, ...openThread.notes, ...(openThread.activity ?? [])]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
    : [];

  return (
    <ScreenFrame lang={lang} error={error} title={t.tabInbox} shop={shopNameShown(lang, summary?.shop, business)} sub={t.inboxSub} intro={intro}>
      <div className="inbox">
        <div className="inbox-list">
          <div className="seg">
            {(["open", "closed"] as const).map((f) => (
              <button key={f} aria-pressed={inboxFilter === f} onClick={() => setInboxFilter(f)}>{t[f]}</button>
            ))}
          </div>
          <div className="seg">
            {([["any", t.everyone], ["me", t.mine], ["none", t.unassigned]] as const).map(([f, label]) => (
              <button
                key={f} aria-pressed={assignedFilter === f} onClick={() => setAssignedFilter(f)}
                disabled={f === "me" && !me?.signed_in}
              >{label}</button>
            ))}
          </div>
          {filterLine}
          {shownChats.length === 0 && <p className="empty-note">{t.noChats}</p>}
          {shownChats.map((r) => (
            <button
              key={r.id}
              className={`conv ${r.id === chatId ? "sel" : ""}`}
              onClick={() => { setChatId(r.id); setReplyDraft(""); }}
            >
              <span className="conv-top">
                <b>{r.name}</b>
                {r.unread > 0 && <span className="pill p1 num">{r.unread}</span>}
              </span>
              <span className="conv-last" dir="auto">
                {r.last.direction === "out" ? "↩ " : ""}{r.last.body}
              </span>
              <span className="conv-flags">
                {r.assigned && <span className="pill p0">{r.assigned.name}</span>}
                {r.assistant_paused && !r.assigned && <span className="pill promise">{t.paused}</span>}
                {r.opted_out && <span className="pill none">{t.optedOut}</span>}
                {r.last.status === "blocked" && <span className="pill p3">{t.notSent}</span>}
              </span>
            </button>
          ))}
        </div>

        <div className="inbox-thread">
          {!openThread ? (
            <p className="empty-note">{t.pick}</p>
          ) : (
            <>
              <div className="thread-head">
                <div>
                  <b>{openThread.customer.name}</b>
                  <span className="mono" dir="ltr">
                    {openThread.customer.phone ? `+${openThread.customer.phone}` : `@${openThread.customer.username}`}
                  </span>
                </div>
                <span className="spacer" />
                <label className="assign">
                  {t.assignedTo}
                  <select
                    value={openThread.customer.assigned?.id ?? ""}
                    onChange={(e) => inboxPost("assign", { user_id: e.target.value || null })}
                  >
                    <option value="">{t.nobody}</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
                {priceGroups.groups.length > 1 && (
                  <label className="assign">
                    {t.priceGroup}
                    <select
                      value={openThread.customer.price_group_id ?? priceGroups.groups.find((g) => g.is_default)?.id ?? ""}
                      disabled={!priceGroups.can_manage}
                      onChange={(e) => setCustomerGroup(e.target.value)}
                    >
                      {priceGroups.groups.map((g) => (
                        <option key={g.id} value={g.id}>{lang === "ar" ? g.name_ar || g.name : g.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                {openThread.customer.assistant_paused && (
                  <button className="btn small" onClick={() => inboxPost("assistant", { paused: false })}>{t.handBack}</button>
                )}
                <button
                  className="btn small"
                  aria-expanded={openThread.customer.status === "open" ? closing !== "" : undefined}
                  onClick={() => openThread.customer.status === "open"
                    ? setClosing(closing ? "" : "outcome")
                    : inboxPost("status", { status: "open" })}
                >
                  {openThread.customer.status === "open" ? t.close : t.reopen}
                </button>
              </div>
              {closing && (
                <div className="closing" role="group" aria-label={closing === "outcome" ? t.howEnded : t.why}>
                  <span>{closing === "outcome" ? t.howEnded : t.why}</span>
                  {closing === "outcome"
                    ? (["sold", "booked", "answered", "lost"] as const).map((o) => (
                        <button key={o} className={`outcome o-${o}`}
                          onClick={() => (o === "lost" ? setClosing("reason") : closeAs(o))}>
                          {t.outcomes[o]}
                        </button>
                      ))
                    : Object.keys(t.reasons).map((r) => (
                        <button key={r} className="outcome o-lost" onClick={() => closeAs("lost", r)}>{t.reasons[r]}</button>
                      ))}
                  <button className="btn small" onClick={() => setClosing("")}>{t.cancelClose}</button>
                </div>
              )}
              {openThread.customer.assistant_paused && <p className="thread-note">{t.pausedHint}</p>}
              <div className="msgs thread-msgs">
                {timeline.map((m) => "action" in m ? (
                  <div key={m.id} className="sysline" dir={lang === "ar" ? "rtl" : "ltr"}>
                    <span>{t.did(m, t.outcomes, t.reasons)}</span>
                    <time className="mono" dir="ltr">
                      {new Date(m.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </time>
                  </div>
                ) : "author_name" in m ? (
                  <div key={m.id} className="bub staffnote" dir="auto">
                    <span className="who" dir={lang === "ar" ? "rtl" : "ltr"}>{m.author_name} · {t.noteLabel}</span>
                    {m.body}
                  </div>
                ) : (
                  <div key={m.id} className={`bub ${m.direction === "out" ? "me" : ""}`} dir="auto">
                    <span className="who" dir={lang === "ar" ? "rtl" : "ltr"}>
                      {m.direction === "in" ? t.customerSays : m.sent_by || t.assistant}
                    </span>
                    <Linked text={m.body} />
                    {m.payload.choices && (
                      <span className="tag" dir="ltr">Buttons: {m.payload.choices.map((c) => c.title).join(" · ")}</span>
                    )}
                    {m.status === "failed" && <span className="tag bad">{t.notDelivered}</span>}
                    {m.status === "blocked" && (
                      <span className="tag bad" dir="ltr">Not sent: {BLOCK_REASON[m.error ?? ""] ?? "blocked"}</span>
                    )}
                  </div>
                ))}
                <div ref={threadEnd} />
              </div>
              <p className={`thread-note ${openThread.customer.window_open ? "" : "warn"}`}>
                {openThread.customer.window_open ? t.windowOpen(hoursLeft) : t.windowClosed}
              </p>
              <div className="quick" aria-label={t.quick}>
                <div className="seg small">
                  <button aria-pressed={composeMode === "reply"} onClick={() => setComposeMode("reply")}>{t.reply}</button>
                  <button aria-pressed={composeMode === "note"} onClick={() => setComposeMode("note")}>{t.noteMode}</button>
                </div>
                {composeMode === "reply" && savedReplies.map((r) => (
                  <span key={r.id} className="quickchip">
                    <button dir="auto" title={r.body} onClick={() => setReplyDraft(r.body)}>{r.title}</button>
                    {canManage && <button aria-label={`${t.remove}: ${r.title}`} onClick={() => deleteQuickReply(r.id)}>×</button>}
                  </span>
                ))}
              </div>
              <form
                className={`composer ${composeMode === "note" ? "noting" : ""}`}
                onSubmit={(e) => { e.preventDefault(); sendReply(); }}
              >
                <input
                  id="reply"
                  aria-label={composeMode === "note" ? t.noteHere : t.replyHere}
                  value={replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                  placeholder={composeMode === "note" ? t.noteHere : t.replyHere}
                  disabled={composeMode === "reply" && !openThread.customer.window_open}
                  dir="auto"
                  autoComplete="off"
                />
                {composeMode === "reply" && replyDraft.trim() && (
                  <button className="btn small" type="button" onClick={saveQuickReply}>{t.saveReply}</button>
                )}
                <button
                  className="btn primary" type="submit"
                  disabled={composeMode === "reply" && !openThread.customer.window_open}
                >{composeMode === "note" ? t.addNote : t.reply}</button>
              </form>
              {canManage && (
                <ForgetCustomer
                  key={openThread.customer.id}
                  contactId={openThread.customer.id}
                  lang={lang}
                  onDone={() => { setChatId(null); refresh(); }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </ScreenFrame>
  );
}
