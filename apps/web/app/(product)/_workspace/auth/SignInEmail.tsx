"use client";

import React, { useState } from "react";
import { Button, Check, Kbd } from "../../../_ui";
import type { AuthCopyStrings } from "./copy";

export interface SignInEmailProps {
  t: AuthCopyStrings;
  email: string;
  onChangeEmail: (val: string) => void;
  onSubmit: () => void;
  onGoToSignUp: () => void;
}

export function SignInEmail({
  t,
  email,
  onChangeEmail,
  onSubmit,
  onGoToSignUp
}: SignInEmailProps) {
  const [remember, setRemember] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <div className="auth-stage">
      <div className="auth-card">
        <form onSubmit={handleSubmit} className="auth-card-body">
          <div className="auth-card-header">
            <span className="auth-card-kicker">{t.signInKicker}</span>
            <h1 className="auth-card-title">{t.signInTitle}</h1>
            <p className="auth-card-subtitle">{t.signInSubtitle}</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
            <label htmlFor="auth-email-input" style={{ fontSize: "var(--text-xs)", fontWeight: 500, color: "var(--text-muted)" }}>
              {t.workEmailLabel}
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                height: "2.75rem",
                paddingInline: "var(--space-md)",
                gap: "var(--space-sm)",
                border: "var(--rule-hairline) solid var(--line-strong)",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--surface)"
              }}
            >
              <input
                id="auth-email-input"
                type="email"
                value={email}
                placeholder={t.workEmailPlaceholder}
                onChange={(e) => onChangeEmail(e.target.value)}
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  outline: "none",
                  fontSize: "var(--text-sm)",
                  color: "var(--text)",
                  fontFamily: "inherit"
                }}
                required
              />
            </div>
          </div>

          <div>
            <Check checked={remember} onChange={(e) => setRemember(e.target.checked)}>
              {t.keepMeSignedIn}
            </Check>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-md)" }}>
            <Button kind="volt" size="md" type="submit">
              {t.sendCodeBtn}
            </Button>
            <Kbd>{t.enterKey}</Kbd>
          </div>
        </form>

        <div className="auth-card-note">
          <span>{t.noCodeHelp}</span>
        </div>
      </div>

      <div className="auth-below-card">
        <span>{t.newToAlyr}</span>
        <button type="button" className="auth-link" onClick={onGoToSignUp}>
          {t.setUpBusiness}
        </button>
      </div>
    </div>
  );
}
