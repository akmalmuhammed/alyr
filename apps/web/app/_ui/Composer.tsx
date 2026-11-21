"use client";

import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Button } from "./Button";
import { Tabs } from "./Tabs";
import { cx } from "./variants";

export type ComposerMode = { id: string; label: string };

/**
 * The box a person types a reply in: a multi-line field that grows with what is typed, a switch
 * between replying to the customer and writing a note for the team (a note is a dashed amber box, so
 * nobody sends one by mistake), a counter, the hint for the send key, a slot for tools (attach, saved
 * replies, opening hours, a pay link: the screen's chips and icon buttons), and the send button.
 *
 * Enter makes a new line. Ctrl or Cmd with Enter sends. The send button is Volt for a reply (the
 * screen's main action) and dark for a note (it goes to no customer). While the window to the customer
 * is closed, pass `closed`: the field and the send button switch off and the `closed` note says why and
 * what can still be done (the tools slot stays, so an approved template can still be chosen).
 *
 * The component keeps no text of its own; every word is a prop, in both languages.
 */
export function Composer({
  value, onChange, onSend, modes, mode, onModeChange, modeLabel, fieldLabel, placeholder, sendLabels, sending = false,
  limit, counter, hint, tools, closed, rows = 3, className,
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  modes: readonly ComposerMode[];
  mode: string;
  onModeChange: (id: string) => void;
  /** The switch's name for screen readers ("What you are writing"). */
  modeLabel: string;
  /** The field's name for screen readers ("Reply to Rashid Al-Marri"). */
  fieldLabel: string;
  placeholder?: string;
  /** The send button's words for each mode: { reply: "Reply", note: "Add note" }. */
  sendLabels: Record<string, string>;
  sending?: boolean;
  /** The most characters; over it the counter turns red and sending switches off. */
  limit?: number;
  /** "141 of 4,000": the caller formats it (digits, separators, language). */
  counter?: (length: number, limit: number) => string;
  /** "Ctrl Enter sends". */
  hint?: ReactNode;
  tools?: ReactNode;
  /** The customer cannot be written to now: say why, in a sentence. */
  closed?: ReactNode;
  /** How many lines tall the field starts. */
  rows?: number;
  className?: string;
}) {
  const id = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const over = limit !== undefined && value.length > limit;
  const empty = value.trim().length === 0;
  const off = Boolean(closed);
  const canSend = !off && !empty && !over && !sending;

  // Grow with the text; the CSS caps the height and scrolls past it.
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.blockSize = "auto";
    el.style.blockSize = `${el.scrollHeight}px`;
  }, [value, mode]);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && canSend) {
      event.preventDefault();
      onSend();
    }
  }

  const sendWords = sendLabels[mode] ?? "";

  return (
    <div className={cx("u-comp", `u-comp--${mode === "note" ? "note" : "reply"}`, off && "u-comp--closed", className)}>
      <div className="u-comp-top">
        <Tabs items={modes} value={mode} label={modeLabel} onChange={onModeChange} />
        <span className="u-comp-spacer" />
        {hint ? <span className="u-comp-hint">{hint}</span> : null}
        {limit !== undefined && counter ? <span className={cx("u-comp-count", over && "u-comp-count--over")}>{counter(value.length, limit)}</span> : null}
      </div>
      {off ? <p className="u-comp-closed" id={`${id}-closed`}>{closed}</p> : null}
      <textarea
        ref={field}
        id={id}
        className="u-comp-field"
        value={value}
        rows={rows}
        placeholder={placeholder}
        aria-label={fieldLabel}
        aria-describedby={off ? `${id}-closed` : undefined}
        aria-invalid={over || undefined}
        disabled={off}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="u-comp-bottom">
        <div className="u-comp-tools">{tools}</div>
        <Button kind={mode === "note" ? "dark" : "volt"} disabled={!canSend && !sending} loading={sending} onClick={() => { if (canSend) onSend(); }}>
          {sendWords}
        </Button>
      </div>
    </div>
  );
}
