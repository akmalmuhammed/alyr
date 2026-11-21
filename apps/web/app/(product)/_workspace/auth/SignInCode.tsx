"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Icon, Panel, SectionLabel } from "../../../_ui";
import { formatDate, formatTime } from "../../../_ui/format";
import type { AuthCopyStrings } from "./copy";
import type { FIXTURE_SESSION } from "./fixtures";
import { applyCodeInput, CODE_LENGTH, formatCountdown, isValidCode, type LanguageChoice } from "./logic";

export interface SignInCodeProps {
  t: AuthCopyStrings;
  lang: LanguageChoice;
  email: string;
  /** Digits already in the boxes (the preview shows a typed code); a real screen starts empty. */
  initialCode?: string;
  /** What the browser reported and when, for the line under the card. */
  session: typeof FIXTURE_SESSION;
  /** Checks the code. The preview passes a function that only moves on: nothing is verified. */
  onSubmit: (code: string) => void;
  onChangeEmail: () => void;
}

const RESEND_SECONDS = 42;

export function SignInCode({ t, lang, email, initialCode = "", session, onSubmit, onChangeEmail }: SignInCodeProps) {
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length: CODE_LENGTH }, (_, i) => initialCode[i] ?? ""));
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [incomplete, setIncomplete] = useState(false);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    boxes.current[Math.max(0, digits.indexOf(""))]?.focus();
    // Only on arrival: later focus moves come from typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const apply = (index: number, typed: string) => {
    const edit = applyCodeInput(digits, index, typed);
    setDigits(edit.digits);
    setIncomplete(false);
    if (typed) boxes.current[edit.focus]?.focus();
  };

  const onKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      e.preventDefault();
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
      boxes.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      boxes.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      boxes.current[index + 1]?.focus();
    }
  };

  const when = `${formatDate(session.at, lang, { now: session.at })} ${formatTime(session.at, lang)}`;
  const place = lang === "ar" ? "الدوحة" : session.place;

  return (
    <div className="auth-stage">
      <Panel className="auth-card" aria-labelledby="auth-code-title">
        <form
          className="auth-card-body"
          onSubmit={(e) => {
            e.preventDefault();
            const code = digits.join("");
            if (isValidCode(code)) onSubmit(code);
            else setIncomplete(true);
          }}
        >
          <div className="auth-card-header">
            <SectionLabel>{t.codeKicker}</SectionLabel>
            <h1 className="auth-card-title" id="auth-code-title">{t.codeTitle}</h1>
            <p className="auth-card-subtitle">
              {t.codeSubtitle.before}
              <bdi dir="ltr">{email}</bdi>
              {t.codeSubtitle.after}
            </p>
          </div>

          <div role="group" aria-label={t.codeGroupLabel} className="auth-code-row">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => {
                  boxes.current[index] = el;
                }}
                className="auth-code-box"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                dir="ltr"
                value={digit}
                aria-label={t.digitLabel(index + 1)}
                aria-invalid={incomplete && !digit ? true : undefined}
                onFocus={(e) => e.target.select()}
                onChange={(e) => apply(index, e.target.value)}
                onPaste={(e) => {
                  e.preventDefault();
                  apply(index, e.clipboardData.getData("text"));
                }}
                onKeyDown={(e) => onKeyDown(index, e)}
              />
            ))}
          </div>
          {incomplete ? (
            <p className="auth-error-line" role="alert">
              <span className="auth-error-dot" aria-hidden="true" />
              <span className="auth-error-text">{t.codeIncomplete}</span>
            </p>
          ) : null}

          <div className="auth-action-row">
            <Button kind="volt" size="md" type="submit">
              {t.signInBtn}
            </Button>
            {countdown > 0 ? (
              <span className="auth-countdown-text">{t.resendCountdown(formatCountdown(countdown))}</span>
            ) : (
              <Button kind="quiet" size="sm" onClick={() => setCountdown(RESEND_SECONDS)}>
                {t.sendNewCodeBtn}
              </Button>
            )}
          </div>

          <div className="auth-subbar-row">
            <button type="button" className="auth-subbar-link" onClick={onChangeEmail}>
              <Icon name="left" size="sm" />
              <span>{t.useDifferentEmail}</span>
            </button>
            <span className="auth-subbar-note">{t.maxTriesNotice}</span>
          </div>
        </form>

        <div className="auth-card-note">
          <Icon name="info" size="md" className="auth-note-icon" />
          <p className="auth-note-text">{t.codeHint}</p>
        </div>
      </Panel>

      <p className="auth-session-info">{t.sessionInfo(session.browser, session.os, place, when)}</p>
    </div>
  );
}
