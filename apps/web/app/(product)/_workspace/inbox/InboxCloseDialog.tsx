"use client";

import { useState } from "react";
import { Banner, Button, Chip, Field, FormSection, Icon, Modal, Radio, Textarea } from "../../../_ui";
import { copy, type Lang } from "./copy";
import { LOST_REASONS, OUTCOMES, type LostReason, type Outcome } from "./logic";

export type CloseDraft = { outcome: Outcome | null; reason: LostReason | null; note: string };

export type CloseDialogProps = {
  open: boolean;
  customerName: string;
  lang: Lang;
  onClose: () => void;
  /** Saves how it ended. A refusal throws; the dialog stays open and says nothing changed. */
  onConfirm: (outcome: Outcome, reason: LostReason | null, note: string) => Promise<void>;
  /** The dialog opens with this chosen (the sample's drawing); a person opens it with nothing chosen. */
  initial?: Partial<CloseDraft>;
};

/**
 * "How did it end?" The outcome is what the Closed screen counts, so it is asked for; the reason is asked only
 * for a lost customer and is optional. The words in the sentence are the ids the API takes (`sold`, `no_reply`),
 * never the labels on screen. The Volt button is the one main action while the dialog is up.
 */
export function InboxCloseDialog({ open, customerName, lang, onClose, onConfirm, initial }: CloseDialogProps) {
  const t = copy(lang);
  const [draft, setDraft] = useState<CloseDraft>({ outcome: initial?.outcome ?? null, reason: initial?.reason ?? null, note: initial?.note ?? "" });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const first = customerName.split(" ")[0];

  async function submit() {
    if (!draft.outcome || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await onConfirm(draft.outcome, draft.outcome === "lost" ? draft.reason : null, draft.note.trim());
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.closeTitle(customerName)}
      closeLabel={t.dialogClose}
      footer={
        <>
          <Button kind="quiet" onClick={onClose} disabled={busy}>{t.keepOpen}</Button>
          <Button kind="volt" disabled={!draft.outcome} loading={busy} loadingLabel={t.closing} onClick={submit}>{t.closeConversation}</Button>
        </>
      }
    >
      <div className="ibx-close">
        {failed ? <Banner tone="bad">{t.closeFailed}</Banner> : null}

        <FormSection label={t.howDidItEnd}>
          <div className="ibx-outcomes">
            {OUTCOMES.map((id) => (
              <Radio
                key={id}
                name="ibx-outcome"
                className="ibx-outcome"
                checked={draft.outcome === id}
                onChange={() => setDraft((d) => ({ ...d, outcome: id, reason: id === "lost" ? d.reason : null }))}
              >
                <span className="ibx-opt ibx-opt--row">
                  <span className="ibx-opt-name">{t.outcomes[id].label}</span>
                  <span className="ibx-opt-sub">{t.outcomes[id].sub}</span>
                </span>
              </Radio>
            ))}
          </div>
        </FormSection>

        {draft.outcome === "lost" ? (
          <FormSection label={t.whyLost}>
            <div className="ibx-reasons">
              {LOST_REASONS.map((id) => (
                <Chip key={id} on={draft.reason === id} onClick={() => setDraft((d) => ({ ...d, reason: d.reason === id ? null : id }))}>
                  {t.reasons[id]}
                </Chip>
              ))}
            </div>
          </FormSection>
        ) : null}

        <Field label={t.noteForTeam}>
          <Textarea rows={2} value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} />
        </Field>

        <p className="ibx-close-info"><Icon name="info" />{t.closeInfo(first)}</p>
      </div>
    </Modal>
  );
}
