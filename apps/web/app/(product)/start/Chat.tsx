"use client";

// A WhatsApp-style conversation, drawn from the customer's side: their own messages on
// the right, the business's answers on the left with its reply buttons under them.

import { useEffect, useRef } from "react";

export type Choice = { id: string; title: string };
export type ChatMessage = {
  direction: "in" | "out";
  body: string;
  payload?: { choices?: Choice[] };
  created_at?: string;
};

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

function time(iso?: string) {
  if (!iso) return "now";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function Chat({
  name, initials, messages, onChoice, footer, live,
}: {
  name: string;
  initials: string;
  messages: ChatMessage[];
  onChoice?: (choice: Choice) => void;
  footer?: React.ReactNode;
  live?: boolean;
}) {
  // Like WhatsApp, the newest message is always in view.
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.scrollTo({ top: body.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);
  return (
    <div className="ob-chat" dir="ltr">
      <div className="ob-chat-head">
        <span className="ob-avatar" aria-hidden>{initials}</span>
        <span className="ob-chat-name">
          <b>{name || "Your business"}</b>
          <small>Business account</small>
        </span>
        {live && <span className="ob-live" aria-hidden />}
      </div>
      <div className="ob-chat-body" ref={body} aria-live={live ? "polite" : undefined}>
        {messages.map((m, i) => (
          <div key={i} className={`ob-row ${m.direction === "in" ? "me" : ""}`}>
            <div className="ob-group">
              <div className="ob-bubble" dir="auto">
                <Linked text={m.body} />
                <time>{time(m.created_at)}</time>
              </div>
              {m.direction === "out" && m.payload?.choices?.map((c) => (
                <button
                  key={c.id} type="button" className="ob-reply" dir="auto"
                  disabled={!onChoice} onClick={() => onChoice?.(c)}
                >
                  {c.title}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {footer}
    </div>
  );
}

export function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "AL";
  return (words[0][0] + (words[1]?.[0] ?? "")).toUpperCase();
}
