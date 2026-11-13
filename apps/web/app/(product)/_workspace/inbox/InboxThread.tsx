"use client";

import React, { useState } from "react";
import { Avatar, Button, Chip, Select, Tabs, UiIcon } from "../../../_ui";
import { copy, type Lang } from "./copy";
import type { MessageItem } from "./fixtures";
import type { ConversationItem } from "./logic";

export interface InboxThreadProps {
  customer: ConversationItem;
  messages: MessageItem[];
  onReply: (text: string) => Promise<void>;
  onSaveNote: (text: string) => Promise<void>;
  onCloseClick: () => void;
  onToggleAssistant: (paused: boolean) => Promise<void>;
  lang: Lang;
}

export function InboxThread({
  customer,
  messages,
  onReply,
  onSaveNote,
  onCloseClick,
  onToggleAssistant,
  lang,
}: InboxThreadProps) {
  const t = copy(lang);
  const [composerTab, setComposerTab] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSend = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      if (composerTab === "reply") {
        await onReply(text.trim());
      } else {
        await onSaveNote(text.trim());
      }
      setText("");
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const composerTabs = [
    { id: "reply", label: t.tabReply },
    { id: "note", label: t.tabNote },
  ];

  return (
    <main className="ibx-pane-thread" aria-label={customer.name}>
      {/* Header */}
      <div className="ibx-thread-header">
        <Avatar name={customer.name} size={36} />
        <div className="ibx-thread-header-info">
          <div className="ibx-thread-name">{customer.name}</div>
          <div className="ibx-thread-sub">
            {customer.phone} · {lang === "ar" ? "العربية، الإنجليزية" : "Arabic, English"}
          </div>
        </div>

        <div style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <Select
            label={t.handledBy}
            value={customer.assigned?.id || "none"}
            onChange={() => {}}
          >
            <option value="none">{t.nobodyYet}</option>
            <option value="u-hana">Hana</option>
            <option value="u-salma">Salma</option>
            <option value="u-yusuf">Yusuf</option>
            <option value="u-bilal">Bilal</option>
          </Select>
          <Button kind="line" size="sm" onClick={onCloseClick}>
            {t.closeBtn}
          </Button>
        </div>
      </div>

      {/* Who Answers Pause Strip */}
      {customer.assistant_paused && (
        <div className="ibx-who-strip">
          <UiIcon name="info" className="u-ico" />
          <span>
            {t.answersSince(customer.assigned?.name || "Staff", "09:39", customer.name.split(" ")[0])}
          </span>
          <button
            type="button"
            style={{
              marginInlineStart: "auto",
              background: "none",
              border: "none",
              textDecoration: "underline",
              cursor: "pointer",
              color: "inherit",
              fontSize: "inherit",
              fontWeight: 500,
            }}
            onClick={() => onToggleAssistant(false)}
          >
            {t.turnBackOn}
          </button>
        </div>
      )}

      {/* Messages Stream */}
      <div className="ibx-messages-area">
        {messages.map((m) => {
          if (m.type === "separator") {
            return (
              <div key={m.id} className="ibx-separator">
                <div className="ibx-separator-line" />
                <span className="ibx-separator-text">{m.text}</span>
                <div className="ibx-separator-line" />
              </div>
            );
          }

          if (m.type === "activity") {
            return (
              <div key={m.id} className="ibx-activity-pill">
                <UiIcon name="check" className="u-ico" />
                <span>{m.text}</span>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-xs)", opacity: 0.7 }}>
                  {m.time}
                </span>
              </div>
            );
          }

          if (m.type === "note") {
            return (
              <div key={m.id} className="ibx-staff-note">
                <div className="ibx-staff-note-hdr">
                  <UiIcon name="info" className="u-ico" />
                  <span>{t.staffNoteLabel(m.sender || "Staff")}</span>
                </div>
                <div className="ibx-staff-note-text">{m.text}</div>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                  {m.time}
                </span>
              </div>
            );
          }

          const isOut = m.direction === "out";

          return (
            <div
              key={m.id}
              className={`ibx-bubble-wrap ${
                isOut ? "ibx-bubble-wrap--out" : "ibx-bubble-wrap--in"
              }`}
            >
              <div
                className={`ibx-bubble ${
                  isOut ? (m.failed ? "ibx-bubble--fail" : "ibx-bubble--out") : "ibx-bubble--in"
                }`}
              >
                {isOut && m.sender && (
                  <span className="ibx-bubble-sender">{m.sender}</span>
                )}
                <div className="ibx-bubble-text" style={{ direction: m.arabic ? "rtl" : undefined, textAlign: m.arabic ? "start" : undefined }}>
                  {m.text}
                </div>
                <div className="ibx-bubble-meta">
                  <span>{m.time}</span>
                  {m.status && <span>· {m.status}</span>}
                </div>
                {m.buttons && (
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginTop: "var(--space-1)" }}>
                    {t.buttonsCues(m.buttons)}
                  </div>
                )}
                {m.failed && (
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--bad)", fontWeight: 500 }}>
                    {m.failed}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 24-hour Window Countdown Bar */}
      <div className="ibx-window-bar">
        <UiIcon name="info" className="u-ico" />
        <span>{t.windowOpenTitle(23)}</span>
        <span
          style={{
            marginInlineStart: "auto",
            fontFamily: "var(--font-ui-mono)",
            fontSize: "var(--font-size-xs)",
            color: "var(--text-muted)",
            letterSpacing: "0.05em",
          }}
        >
          {t.windowClosesAt("FRI 13 NOV 09:27")}
        </span>
      </div>

      {/* Composer */}
      <div className="ibx-composer">
        <div className="ibx-composer-top">
          <Tabs
            label={t.tabReply}
            items={composerTabs}
            value={composerTab}
            onChange={(val) => setComposerTab(val as "reply" | "note")}
          />
          <div className="ibx-composer-hints">
            <span>{t.ctrlEnterSends}</span>
            <span>{t.charCount(text.length, 4000)}</span>
          </div>
        </div>

        <textarea
          className="ibx-composer-box"
          placeholder={composerTab === "reply" ? t.replyPlaceholder : t.notePlaceholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          aria-label={composerTab === "reply" ? t.tabReply : t.tabNote}
        />

        <div className="ibx-composer-actions">
          {composerTab === "reply" && (
            <>
              <Chip onClick={() => setText((p) => p + " Our opening hours are 07:00–22:00 every day.")}>
                {t.chipOpeningHours}
              </Chip>
              <Chip onClick={() => setText((p) => p + " Here is your payment link: https://pay.alyr.app/order")}>
                {t.chipPayLink}
              </Chip>
              <Chip onClick={() => setText((p) => p + " We are located behind the petrol station on C Ring Road.")}>
                {t.chipDirections}
              </Chip>
            </>
          )}

          <div style={{ marginInlineStart: "auto" }}>
            <Button
              kind="volt"
              size="sm"
              disabled={!text.trim()}
              loading={busy}
              onClick={handleSend}
            >
              {composerTab === "reply" ? t.btnReply : t.btnSaveNote}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
