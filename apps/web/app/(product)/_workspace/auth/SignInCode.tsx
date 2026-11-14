"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button, Icon } from "../../../_ui";
import type { AuthCopyStrings } from "./copy";
import { sanitizeCode, formatCountdown } from "./logic";

export interface SignInCodeProps {
  t: AuthCopyStrings;
  email: string;
  onSubmit: (code: string) => void;
  onChangeEmail: () => void;
}

export function SignInCode({
  t,
  email,
  onSubmit,
  onChangeEmail
}: SignInCodeProps) {
  const [digits, setDigits] = useState<string[]>(["7", "3", "0", "5", "1", "8"]);
  const [countdown, setCountdown] = useState(42);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleDigitChange = (index: number, val: string) => {
    const sanitized = sanitizeCode(val);
    if (!sanitized) {
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }

    if (sanitized.length > 1) {
      // Paste handling
      const next = [...digits];
      for (let i = 0; i < 6; i++) {
        if (i < sanitized.length) {
          next[i] = sanitized[i];
        }
      }
      setDigits(next);
      const targetIdx = Math.min(5, sanitized.length);
      inputRefs.current[targetIdx]?.focus();
      return;
    }

    const next = [...digits];
    next[index] = sanitized[0];
    setDigits(next);

    if (index < 5 && sanitized[0]) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(digits.join(""));
  };

  return (
    <div className="auth-stage">
      <div className="auth-card">
        <form onSubmit={handleSubmit} className="auth-card-body">
          <div className="auth-card-header">
            <span className="auth-card-kicker">{t.codeKicker}</span>
            <h1 className="auth-card-title">{t.codeTitle}</h1>
            <p className="auth-card-subtitle">{t.codeSubtitle(email)}</p>
          </div>

          <div className="auth-code-row">
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  inputRefs.current[idx] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                className={`auth-code-box ${idx === 0 ? "auth-code-box--active" : ""}`}
                aria-label={`Digit ${idx + 1}`}
              />
            ))}
          </div>

          <div className="auth-action-row">
            <Button kind="volt" size="md" type="submit">
              {t.signInBtn}
            </Button>
            <div className="auth-spacer" />
            <span className="auth-countdown-text">
              {t.resendCountdown(formatCountdown(countdown))}
            </span>
          </div>

          <div className="auth-subbar-row">
            <button
              type="button"
              className="auth-subbar-link"
              onClick={onChangeEmail}
            >
              <Icon name="left" size="sm" className="auth-subbar-icon" />
              <span>{t.useDifferentEmail}</span>
            </button>
            <div className="auth-spacer" />
            <span className="auth-subbar-note">{t.maxTriesNotice}</span>
          </div>
        </form>

        <div className="auth-card-note">
          <Icon name="info" size="sm" className="auth-note-icon" />
          <span className="auth-note-text">{t.codeHint}</span>
        </div>
      </div>

      <div className="auth-session-info">
        {t.sessionInfo}
      </div>
    </div>
  );
}
