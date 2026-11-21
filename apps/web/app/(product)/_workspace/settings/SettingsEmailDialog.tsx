"use client";

import { useState } from "react";
import { Button, Field, Icon, Input, Modal, Steps } from "@/app/_ui";
import type { SettingsCopy } from "./copy";
import type { SettingsActions } from "./settingsApi";
import { formatCodeDigits, isValidEmail, normalizeCode, refusalKey, sameEmail } from "./logic";

/** The six boxes of a code, over one real input: typing, pasting and the keyboard stay the browser's. */
function CodeBoxes({ value, onChange, label, bad }: { value: string; onChange: (code: string) => void; label: string; bad: boolean }) {
  const cells = formatCodeDigits(value);
  return (
    <div className={`set-code${bad ? " set-code--bad" : ""}`}>
      {cells.map((digit, index) => (
        <span key={index} className={`set-code-cell${index === value.length && value.length < 6 ? " set-code-cell--now" : ""}`} aria-hidden="true">
          {digit.trim()}
        </span>
      ))}
      <input
        className="set-code-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label={label}
        aria-invalid={bad || undefined}
        maxLength={12}
        value={value}
        data-autofocus=""
        autoFocus
        onChange={(event) => onChange(normalizeCode(event.target.value))}
      />
    </div>
  );
}

export function SettingsEmailDialog({
  t, currentEmail, actions, initialStep = 0, initialAddress = "", initialCode = "", onClose, onDone,
}: {
  t: SettingsCopy;
  currentEmail: string;
  actions: Pick<SettingsActions, "requestEmailCode" | "confirmEmailChange">;
  initialStep?: 0 | 1;
  initialAddress?: string;
  initialCode?: string;
  onClose: () => void;
  onDone: (email: string) => void;
}) {
  const [step, setStep] = useState<0 | 1>(initialStep);
  const [address, setAddress] = useState(initialAddress);
  const [code, setCode] = useState(initialCode);
  const [problem, setProblem] = useState<keyof SettingsCopy["mailRefusals"] | null>(null);
  const [busy, setBusy] = useState<"send" | "again" | "confirm" | null>(null);

  const addressOk = isValidEmail(address) && !sameEmail(address, currentEmail);
  const codeOk = code.length === 6;

  async function send(again: boolean) {
    setBusy(again ? "again" : "send");
    setProblem(null);
    try {
      await actions.requestEmailCode(address.trim());
      setStep(1);
    } catch (error) {
      setProblem(refusalKey(error));
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    setBusy("confirm");
    setProblem(null);
    try {
      const email = await actions.confirmEmailChange(address.trim(), code);
      onDone(email);
    } catch (error) {
      setProblem(refusalKey(error));
      setBusy(null);
    }
  }

  const problemText = problem ? t.mailRefusals[problem] : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={t.mailTitle}
      closeLabel={t.dismiss}
      footer={
        step === 0 ? (
          <>
            <Button kind="quiet" onClick={onClose}>{t.mailCancel}</Button>
            {addressOk ? (
              <Button kind="volt" loading={busy === "send"} onClick={() => send(false)}>{t.mailSend}</Button>
            ) : (
              <Button kind="line" disabled>{t.mailSend}</Button>
            )}
          </>
        ) : (
          <>
            <Button kind="quiet" onClick={() => { setStep(0); setCode(""); setProblem(null); }}>{t.mailAnother}</Button>
            {codeOk ? (
              <Button kind="volt" loading={busy === "confirm"} onClick={confirm}>{t.mailConfirm}</Button>
            ) : (
              <Button kind="line" disabled>{t.mailConfirm}</Button>
            )}
          </>
        )
      }
    >
      <Steps
        steps={t.mailSteps}
        current={step}
        stateLabels={{ done: t.mailStepDone, current: t.mailStepCurrent }}
        label={t.mailTitle}
      />

      {step === 0 ? (
        <Field label={t.mailAddressLabel} hint={t.mailAddressHint} error={problemText ?? undefined}>
          <Input
            type="email"
            autoComplete="email"
            dir="ltr"
            value={address}
            data-autofocus=""
            autoFocus
            onChange={(event) => { setAddress(event.target.value); setProblem(null); }}
          />
        </Field>
      ) : (
        <>
          <div className="set-compare">
            <div className="set-compare-side">
              <span className="set-compare-tag u-mono">{t.mailNow}</span>
              <bdi className="set-compare-address u-mono" dir="ltr">{currentEmail}</bdi>
            </div>
            <Icon name="arrow" />
            <div className="set-compare-side set-compare-side--new">
              <span className="set-compare-tag u-mono">{t.mailNew}</span>
              <bdi className="set-compare-address u-mono" dir="ltr">{address}</bdi>
            </div>
          </div>

          <div className="set-says">
            <p className="set-say">{t.mailSent}</p>
            <CodeBoxes value={code} onChange={(next) => { setCode(next); setProblem(null); }} label={t.mailCodeLabel} bad={problem === "code"} />
            {problemText ? <p className="set-error" role="alert">{problemText}</p> : null}
            <div className="set-code-row">
              <span className="set-note">{t.mailCodeNote}</span>
              <Button kind="quiet" size="xs" loading={busy === "again"} onClick={() => send(true)}>{t.mailResend}</Button>
            </div>
          </div>

          <div className="set-says">
            <p className="set-say"><Icon name="send" /><span>{t.mailTellsOld}</span></p>
            <p className="set-say"><Icon name="lock" /><span>{t.mailSignsOut}</span></p>
          </div>
        </>
      )}
    </Modal>
  );
}
