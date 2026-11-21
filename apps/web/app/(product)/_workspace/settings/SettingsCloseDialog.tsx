"use client";

import { useState } from "react";
import { Banner, Button, Check, Modal, Thumb } from "@/app/_ui";
import { formatDate } from "@/app/_ui/format";
import type { SettingsCopy } from "./copy";
import { closeSchedule } from "./logic";
import type { Lang } from "./logic";

export interface CloseImpact {
  bookingsAfter: number;
  customersOwing: number;
  /** Dirhams owed in all. */
  owed: number;
}

/** A calendar day (an ISO date) as the shop prints it: «Thu 19 Nov», «الخميس 19 نوفمبر». */
function day(iso: string, lang: Lang, todayIso: string): string {
  return formatDate(`${iso}T12:00:00+03:00`, lang, { now: `${todayIso}T12:00:00+03:00` });
}

/**
 * The check before asking ALYR to end the plan. What it says is what the product does: seven
 * days' notice (core/subscription.py), an email to every owner, ALYR's sending ends that day, and
 * the data is erased 60 days later (core/erase.py, spec 042). It claims nothing else.
 */
export function SettingsCloseDialog({
  t, lang, businessName, businessNameAr, todayIso, impact, initialAcknowledged = false, requestClose, onClose, onDone,
}: {
  t: SettingsCopy;
  lang: Lang;
  businessName: string;
  businessNameAr: string;
  /** The shop's today, an ISO date: the notice and the erasure count from it. */
  todayIso: string;
  /** What closing interrupts, when the host can say; nothing is drawn without it. */
  impact?: CloseImpact;
  initialAcknowledged?: boolean;
  requestClose: () => Promise<void>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(initialAcknowledged);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const { noticeEnds, eraseOn } = closeSchedule(todayIso);
  const ends = day(noticeEnds, lang, todayIso);
  const erases = day(eraseOn, lang, todayIso);
  const name = lang === "ar" && businessNameAr ? businessNameAr : businessName;
  const other = lang === "ar" ? businessName : businessNameAr;
  const mono = lang === "en" ? "u-mono" : undefined;
  const hasImpact = impact && (impact.bookingsAfter > 0 || impact.customersOwing > 0);

  async function confirm() {
    setBusy(true);
    setFailed(false);
    try {
      await requestClose();
      onDone();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  const steps: Array<{ when: string; text: string; last?: boolean }> = [
    { when: t.closeToday, text: t.closeTodayText },
    { when: t.closeUntil(ends), text: t.closeUntilText },
    { when: t.closeFrom(ends), text: t.closeFromText },
    { when: t.closeFrom(erases), text: t.closeEraseText, last: true },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title={t.closeDialogTitle(name)}
      closeLabel={t.dismiss}
      footerNote={t.closeNote}
      footer={
        <>
          <Button kind="line" data-autofocus="" onClick={onClose}>{t.closeKeep}</Button>
          <Button kind="bad" loading={busy} disabled={!acknowledged} onClick={confirm}>{t.closeConfirm(ends)}</Button>
        </>
      }
    >
      <div className="set-business">
        <Thumb size={36} seed={0} initials={name.slice(0, 1)} />
        <div className="set-business-text">
          <span className="set-business-name"><bdi>{name}</bdi></span>
          {other ? <span className="set-help"><bdi>{other}</bdi></span> : null}
        </div>
      </div>

      <div className="set-says">
        <p className="set-label">{t.closeWhatHappens}</p>
        <ol className="set-timeline">
          {steps.map((step) => (
            <li key={step.when} className={`set-step${step.last ? " set-step--last" : ""}`}>
              <span className={`set-step-when ${mono ?? ""}`}>{step.when}</span>
              <p className="set-step-text">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>

      {hasImpact ? (
        <Banner tone="warn">{t.closeImpact(impact.bookingsAfter, ends, impact.customersOwing, impact.owed)}</Banner>
      ) : null}

      <Check checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)}>
        <span className="set-check-text">
          <span className="set-row-title">{t.closeHaveCopy}</span>
          <span className="set-check-hint">{t.closeHaveCopyHint(erases)}</span>
        </span>
      </Check>

      {failed ? <p className="set-error" role="alert">{t.closeFailed}</p> : null}
    </Modal>
  );
}
