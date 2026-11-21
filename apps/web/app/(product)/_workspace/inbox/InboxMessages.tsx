"use client";

import { useEffect, useRef } from "react";
import { Icon, type IconName } from "../../../_ui";
import { formatDate, formatTime, money } from "../../../_ui/format";
import { copy, type Lang } from "./copy";
import { dayKey, pickText } from "./logic";
import { buildTimeline, type TimelineRow } from "./thread";
import type { Delivery, ThreadActivity, ThreadItem, ThreadMessage, ThreadNote } from "./types";

const ICON: Record<ThreadActivity["action"], IconName> = {
  booked: "cal", paid_deposit: "card", asked_person: "flag", took: "people", closed: "check", reopened: "refresh",
};

/** What the team or the customer did, in a sentence in the person's language. */
export function activityText(a: ThreadActivity, lang: Lang): string {
  const t = copy(lang).activity;
  const name = a.actor === "auto" ? copy(lang).automaticReply : a.actor;
  switch (a.action) {
    case "booked": {
      const when = a.detail?.startsAt ? `${formatDate(a.detail.startsAt, lang)} ${formatTime(a.detail.startsAt, lang)}` : "";
      return t.booked(a.detail?.number ?? 0, a.detail?.service ? pickText(a.detail.service, lang) : "", when);
    }
    case "paid_deposit": return t.paidDeposit(money(a.detail?.amount ?? 0, lang));
    case "asked_person": return t.askedPerson;
    case "took": return t.took(name);
    case "closed": return t.closed(name);
    case "reopened": return t.reopened(name);
  }
}

function Separator({ row, lang, now }: { row: Extract<TimelineRow, { kind: "day" | "window" }>; lang: Lang; now: number }) {
  const t = copy(lang);
  const date = row.kind === "day" ? (dayKey(row.at) === dayKey(now) ? `${t.today} · ${formatDate(row.at, lang, { now })}` : formatDate(row.at, lang, { now })) : "";
  const closed = row.kind === "window" || row.closedAt ? t.windowClosedAt(formatTime(row.kind === "window" ? row.at : (row.closedAt as string), lang)) : "";
  return (
    <li className="ibx-sep">
      <span className="ibx-sep-line" aria-hidden="true" />
      <span className="u-label ibx-sep-text">{[date, closed].filter(Boolean).join(" · ")}</span>
      <span className="ibx-sep-line" aria-hidden="true" />
    </li>
  );
}

function Mark({ delivery, lang }: { delivery: Delivery; lang: Lang }) {
  const t = copy(lang).delivery;
  const word = t[delivery.status];
  const at = delivery.at && (delivery.status === "read" || delivery.status === "delivered") ? ` ${formatTime(delivery.at, lang)}` : "";
  const done = delivery.status === "delivered" || delivery.status === "read";
  return (
    <span className="ibx-mark">
      {done ? <Icon name="check" size="sm" /> : null}
      <span>{word}{at}</span>
    </span>
  );
}

function Message({ m, lang, customer }: { m: ThreadMessage; lang: Lang; customer: string }) {
  const t = copy(lang);
  const out = m.direction === "out";
  const failed = out && (m.delivery?.status === "failed" || m.delivery?.status === "blocked");
  const sender = out ? (m.by === "auto" ? t.automaticReply : m.by) : null;
  return (
    <li className={`ibx-msg ${out ? "ibx-msg--out" : "ibx-msg--in"}`}>
      <div className={`ibx-bubble ${out ? (failed ? "ibx-bubble--failed" : "ibx-bubble--out") : "ibx-bubble--in"}`}>
        {sender ? <span className="ibx-sender">{sender}</span> : <span className="u-sr">{customer}</span>}
        <p className="ibx-text" dir="auto">{pickText(m.text, lang)}</p>
        <span className="ibx-meta u-mono">
          <bdi>{formatTime(m.at, lang)}</bdi>
          {out && m.delivery && !failed ? <Mark delivery={m.delivery} lang={lang} /> : null}
        </span>
      </div>
      {m.buttons?.length ? (
        <p className="ibx-cue">{t.buttonsCue(m.buttons.map((b) => pickText(b, lang)).join(" · "))}</p>
      ) : null}
      {failed ? (
        <p className="ibx-failed"><span className="ibx-failed-dot" aria-hidden="true" />{t.blockedReason(m.delivery?.reason)}</p>
      ) : null}
    </li>
  );
}

function Note({ n, lang }: { n: ThreadNote; lang: Lang }) {
  return (
    <li className="ibx-note">
      <p className="ibx-note-head"><Icon name="lock" />{copy(lang).staffNote(n.author)}</p>
      <p className="ibx-note-text" dir="auto">{n.text}</p>
      <span className="ibx-meta u-mono"><bdi>{formatTime(n.at, lang)}</bdi></span>
    </li>
  );
}

function Activity({ a, lang }: { a: ThreadActivity; lang: Lang }) {
  return (
    <li className="ibx-activity">
      <Icon name={ICON[a.action]} />
      <span>{activityText(a, lang)}</span>
      <span className="ibx-meta u-mono"><bdi>{formatTime(a.at, lang)}</bdi></span>
    </li>
  );
}

/** The stream: day separators, messages, notes and what the team did, oldest first. */
export function InboxMessages({ items, lang, now, label, customer }: { items: readonly ThreadItem[]; lang: Lang; now: number; label: string; customer: string }) {
  const rows = buildTimeline(items);
  const scroller = useRef<HTMLDivElement>(null);
  // A conversation opens at its newest message, and a new one brings you to it. A poll that changes nothing does not move you.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, customer]);
  return (
    <div ref={scroller} className="ibx-messages" role="log" aria-label={label} tabIndex={0}>
      <ol className="ibx-stream">
        {rows.map((row) => {
          if (row.kind !== "item") return <Separator key={row.key} row={row} lang={lang} now={now} />;
          const item = row.item;
          return item.kind === "message" ? <Message key={row.key} m={item} lang={lang} customer={customer} /> : item.kind === "note" ? <Note key={row.key} n={item} lang={lang} /> : <Activity key={row.key} a={item} lang={lang} />;
        })}
      </ol>
    </div>
  );
}
