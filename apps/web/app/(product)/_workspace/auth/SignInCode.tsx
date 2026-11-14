"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "../../../_ui";
import type { AuthCopyStrings } from "./copy";
import { sanitizeCode, formatCountdown } from "./logic";

export interface SignInCodeProps {
  t: AuthCopyStrings;
  email: string;
  initialCode?: string;
  onSubmit: (code: string) => void;
  onChangeEmail: () => void;
}

export function SignInCode({
  t,
  email,
  initialCode = "730518",
  onSubmit,
  onChangeEmail
}: SignInCodeProps) {
  const [digits, setDigits] = useState<string[]>(() => {
    const clean = sanitizeCode(initialCode);
    const arr = clean.split("").slice(0, 6);
    while (arr.length < 6) arr.push("");
    return arr;
  });
  const [countdown] = useState(42);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Focus first input box on mount
    inputsRef.current[0]?.focus();
  }, []);

  const handleChange = (index: number, val: string) => {
    const clean = sanitizeCode(val);
    if (!clean) {
      const copy = [...digits];
      copy[index] = "";
      setDigits(copy);
      return;
    }

    if (clean.length > 1) {
      // Pasted multiple characters
      const copy = [...digits];
      for (let i = 0; i < clean.length && index + i < 6; i++) {
        copy[index + i] = clean[i];
      }
      setDigits(copy);
      const nextIndex = Math.min(5, index + clean.length);
      inputsRef.current[nextIndex]?.focus();
      return;
    }

    const copy = [...digits];
    copy[index] = clean;
    setDigits(copy);

    if (index < 5 && clean) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    const clean = sanitizeCode(pasted);
    if (!clean) return;

    const copy = clean.split("").slice(0, 6);
    while (copy.length < 6) copy.push("");
    setDigits(copy);

    const nextIndex = Math.min(5, clean.length);
    inputsRef.current[nextIndex]?.focus();
  };

  const codeString = digits.join("");
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(codeString);
  };

  return (
    <div className="auth-stage">
      <div className="auth-card">
        <form onSubmit={handleSubmit} className="auth-card-body">
          <div className="auth-card-header">
            <span className="auth-card-kicker">{t.codeKicker}</span>
            <h1 className="auth-card-title">{t.codeTitle}</h1>
            <p className="auth-card-subtitle">{t.codeSubtitle(email || "hana@nuqta.qa")}</p>
          </div>

          <div className="auth-code-row" onPaste={handlePaste}>
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputsRef.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className="auth-code-box"
                aria-label={`Digit ${i + 1}`}
              />
            ))}
          </div>

          <div className="auth-code-meta">
            <Button kind="volt" size="md" type="submit" disabled={codeString.length < 6}>
              {t.signInBtn}
            </Button>
            <span className="auth-code-resend">{t.resendCountdown(formatCountdown(countdown))}</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: "var(--space-md)",
              borderTop: "var(--rule-hairline) solid var(--line)",
              fontSize: "var(--text-xs)"
            }}
          >
            <button type="button" className="auth-link" onClick={onChangeEmail}>
              {t.useDifferentEmail}
            </button>
            <span style={{ color: "var(--text-faint)" }}>{t.maxTriesNotice}</span>
          </div>
        </form>

        <div className="auth-card-note">
          <span>{t.codeHint}</span>
        </div>
      </div>

      <div className="auth-session-info">
        <span>{t.sessionInfo}</span>
      </div>
    </div>
  );
}
