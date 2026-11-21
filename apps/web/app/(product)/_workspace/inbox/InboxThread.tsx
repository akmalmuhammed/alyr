"use client";

import type { ReactNode } from "react";
import { Avatar, Banner, Button, Composer, Icon, IconButton, Menu, Select, Tabs } from "../../../_ui";
import { formatDate, formatTime } from "../../../_ui/format";
import { copy, type Lang } from "./copy";
import { InboxMessages } from "./InboxMessages";
import { InboxWindowClosed } from "./InboxWindowClosed";
import { pickText, waitingMinutes, windowHoursLeft, windowMinutesLeft, windowOpen, WAITING_MINUTES, type ConversationItem } from "./logic";
import type { SavedReply, Template, ThreadItem } from "./types";

export type ThreadProps = {
  customer: ConversationItem;
  items: readonly ThreadItem[];
  lang: Lang;
  now: number;
  members: readonly { id: string; name: string }[];
  templates: readonly Template[];
  savedReplies: readonly SavedReply[];
  draft: string;
  onDraft: (text: string) => void;
  mode: "reply" | "note";
  onMode: (mode: "reply" | "note") => void;
  onSend: () => void;
  sending: boolean;
  /** A reply that did not go: its reason, in words. The text stays in the box. */
  sendError: string | null;
  onAssign: (userId: string | null) => void;
  onClose: () => void;
  onTurnBackOn: () => void;
  onSendTemplate: (templateId: string) => void;
  /** Another layer (the close dialog) holds the screen's one Volt button. */
  yieldVolt: boolean;
  phone: boolean;
  onBack: () => void;
  /** Phone: the customer's details are another screen; this is the strip that opens it. */
  strip: ReactNode;
  /** Loaded from the API and nothing there yet. */
  loading: boolean;
  /** The connection is gone: nothing can be sent until it is back. */
  offline: boolean;
  /** The languages the customer writes in, from their details. */
  writesIn?: readonly ("ar" | "en")[];
};

const SAVED_SHOWN = 3;

/** The time the person who has the conversation took it, from what the team did (the latest "took"). */
function tookAt(items: readonly ThreadItem[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind === "activity" && item.action === "took") return item.at;
  }
  return null;
}

export function InboxThread(props: ThreadProps) {
  const { customer, items, lang, now, members, templates, savedReplies, draft, onDraft, mode, onMode, onSend, sending, sendError, onAssign, phone, loading } = props;
  const t = copy(lang);
  const open = windowOpen(customer.window_closes_at, now);
  const first = customer.name.split(" ")[0];
  const took = tookAt(items);
  const waiting = waitingMinutes(customer, now);
  const writesIn = props.writesIn?.length ? t.writesIn(props.writesIn.includes("ar"), props.writesIn.includes("en")) : null;

  const closes = customer.window_closes_at;
  const hours = windowHoursLeft(closes, now);

  const modes = [{ id: "reply", label: t.tabReply }, { id: "note", label: t.tabNote }] as const;
  const showClosedPane = !open && mode === "reply";

  const tools = (
    <>
      {savedReplies.slice(0, SAVED_SHOWN).map((r) => (
        <Button key={r.id} kind="line" size="xs" onClick={() => onDraft(`${draft}${draft && !draft.endsWith(" ") ? " " : ""}${pickText(r.body, lang)}`)}>
          {pickText(r.title, lang)}
        </Button>
      ))}
      {savedReplies.length > SAVED_SHOWN ? (
        <Menu
          label={t.savedMenu}
          align="start"
          items={savedReplies.map((r) => ({ id: r.id, label: pickText(r.title, lang), onSelect: () => onDraft(`${draft}${draft && !draft.endsWith(" ") ? " " : ""}${pickText(r.body, lang)}`) }))}
          trigger={(p) => <Button {...p} kind="line" size="xs">{t.allSaved(savedReplies.length)}</Button>}
        />
      ) : null}
    </>
  );

  return (
    <div className="ibx-thread">
      <header className="ibx-thread-head">
        {phone ? <IconButton bare icon={<Icon name="left" />} label={t.backToInbox} onClick={props.onBack} /> : <Avatar name={customer.name} size={36} />}
        <div className="ibx-thread-who">
          <h2 className="ibx-thread-name"><bdi>{customer.name}</bdi></h2>
          <p className="ibx-thread-sub u-mono">
            <bdi>{customer.phone}</bdi>{writesIn && !phone ? <> · {writesIn}</> : null}
          </p>
          {phone && waiting !== null && waiting >= WAITING_MINUTES ? <p className="ibx-thread-wait">{t.waitingNow(waiting)}</p> : null}
        </div>
        <div className="ibx-thread-actions">
          <Select
            aria-label={t.handledBy}
            value={customer.assigned?.id ?? ""}
            onChange={(e) => onAssign(e.target.value || null)}
          >
            <option value="">{t.nobodyOption}</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
          <Button kind="line" size="sm" onClick={props.onClose}>{t.closeBtn}</Button>
        </div>
      </header>

      {customer.assistant_paused ? (
        <div className="ibx-who">
          <Icon name="pause" />
          <span>{t.answersSince(customer.assigned?.name ?? t.somePerson, took ? formatTime(took, lang) : null, first)}</span>
          <button type="button" className="u-link ibx-who-link" onClick={props.onTurnBackOn}>{t.turnBackOn}</button>
        </div>
      ) : null}

      {phone ? props.strip : null}

      {loading ? null : <InboxMessages items={items} lang={lang} now={now} label={t.threadLabel} customer={customer.name} />}

      {open ? (
        <div className="ibx-window">
          <Icon name="clock" />
          <span>{t.windowOpen(hours, windowMinutesLeft(closes, now))}</span>
          <span className="u-label ibx-window-closes">{t.windowCloses(`${formatDate(closes as string, lang)} ${formatTime(closes as string, lang)}`)}</span>
        </div>
      ) : null}

      {showClosedPane ? (
        <div className="ibx-closedwrap">
          <Tabs className="ibx-modes" label={t.modeLabel} items={modes} value={mode} onChange={(id) => onMode(id as "reply" | "note")} />
          <InboxWindowClosed
            lang={lang}
            templates={templates}
            first={first}
            sending={sending}
            yield={props.yieldVolt}
            onSend={props.onSendTemplate}
          />
        </div>
      ) : (
        <div className="ibx-compose">
          {sendError ? <Banner tone="bad">{sendError}</Banner> : null}
          <Composer
            value={draft}
            onChange={onDraft}
            onSend={onSend}
            modes={modes}
            mode={mode}
            onModeChange={(id) => onMode(id as "reply" | "note")}
            modeLabel={t.modeLabel}
            fieldLabel={mode === "reply" ? t.replyField(customer.name) : t.noteField}
            placeholder={mode === "reply" ? t.replyPlaceholder : t.notePlaceholder}
            sendLabels={{ reply: sendError ? t.sendAgain : t.sendReply, note: t.sendNote }}
            sending={sending}
            limit={4000}
            counter={t.counter}
            hint={t.ctrlEnterSends}
            tools={mode === "reply" ? tools : undefined}
            closed={props.offline && mode === "reply" ? t.composerOffline : undefined}
          />
        </div>
      )}
    </div>
  );
}
