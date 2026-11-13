"use client";

import React, { useState } from "react";
import { Button, Chip, Modal, Panel, Radio, UiIcon } from "../../../_ui";
import { copy, type Lang } from "./copy";

export interface InboxCloseDialogProps {
  open: boolean;
  customerName: string;
  onClose: () => void;
  onConfirm: (outcome: string, reason?: string, note?: string) => Promise<void>;
  lang: Lang;
}

export function InboxCloseDialog({
  open,
  customerName,
  onClose,
  onConfirm,
  lang,
}: InboxCloseDialogProps) {
  const t = copy(lang);
  const [outcome, setOutcome] = useState("lost");
  const [reason, setReason] = useState("Stopped replying");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const outcomes = [
    { id: "sold", label: t.outcomeSold, sub: t.outcomeSoldSub },
    { id: "booked", label: t.outcomeBooked, sub: t.outcomeBookedSub },
    { id: "answered", label: t.outcomeAnswered, sub: t.outcomeAnsweredSub },
    { id: "lost", label: t.outcomeLost, sub: t.outcomeLostSub },
  ];

  const reasons = [
    t.reasonPrice,
    t.reasonNotAvailable,
    t.reasonStoppedReplying,
    t.reasonWentElsewhere,
    t.reasonOther,
  ];

  const handleSubmit = async () => {
    setBusy(true);
    try {
      await onConfirm(outcome, outcome === "lost" ? reason : undefined, note);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t.closeDialogTitle(customerName)}
      open={open}
      onClose={onClose}
      closeLabel={lang === "ar" ? "إغلاق" : "Close"}
      footer={
        <>
          <Button kind="quiet" onClick={onClose} disabled={busy}>
            {t.btnKeepOpen}
          </Button>
          <Button kind="volt" onClick={handleSubmit} loading={busy}>
            {t.btnCloseConversation}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {/* How did it end? */}
        <div>
          <label style={{ display: "block", marginBottom: "var(--space-2)", fontSize: "var(--font-size-sm)", fontWeight: 600 }}>
            {t.howDidItEnd}
          </label>
          <Panel>
            {outcomes.map((o) => {
              const isSelected = outcome === o.id;
              return (
                <div
                  key={o.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-3)",
                    padding: "var(--space-3) var(--space-4)",
                    borderBottom: "var(--rule-hairline) solid var(--line)",
                    background: isSelected ? "var(--surface-subtle)" : "transparent",
                    cursor: "pointer",
                  }}
                  onClick={() => setOutcome(o.id)}
                >
                  <Radio checked={isSelected} onChange={() => setOutcome(o.id)} />
                  <span style={{ inlineSize: "5rem", fontSize: "var(--font-size-sm)", fontWeight: 600 }}>
                    {o.label}
                  </span>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                    {o.sub}
                  </span>
                </div>
              );
            })}
          </Panel>
        </div>

        {/* Why was it lost? (Conditional) */}
        {outcome === "lost" && (
          <div>
            <label style={{ display: "block", marginBottom: "var(--space-2)", fontSize: "var(--font-size-sm)", fontWeight: 600 }}>
              {t.whyWasItLost}
            </label>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              {reasons.map((r) => (
                <Chip
                  key={r}
                  on={reason === r}
                  onClick={() => setReason(r)}
                >
                  {r}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {/* Note for the team */}
        <div>
          <label style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--font-size-sm)", fontWeight: 600 }}>
            {t.noteForTeam}
          </label>
          <textarea
            className="ibx-composer-box"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ inlineSize: "100%" }}
          />
        </div>

        {/* Info Note */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", padding: "var(--space-2) var(--space-3)", background: "var(--surface-subtle)", borderRadius: "var(--radius-sm)" }}>
          <UiIcon name="info" className="u-ico" style={{ color: "var(--text-muted)", marginTop: "0.125rem" }} />
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", lineHeight: 1.4 }}>
            {t.closeDialogInfo}
          </span>
        </div>
      </div>
    </Modal>
  );
}
