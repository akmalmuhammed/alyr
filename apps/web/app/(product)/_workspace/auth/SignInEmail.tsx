"use client";

import React, { useState } from "react";
import { Button, Check, Icon, Kbd } from "../../../_ui";
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

          <div className="auth-field-group">
            <label htmlFor="auth-email-input" className="auth-field-label">
              {t.workEmailLabel}
            </label>
            <div className="auth-input-box auth-input-box--active">
              <Icon name="send" size="sm" className="auth-input-icon" />
              <input
                id="auth-email-input"
                type="email"
                value={email}
                placeholder={t.workEmailPlaceholder}
                onChange={(e) => onChangeEmail(e.target.value)}
                className="auth-input-element"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="auth-checkbox-row">
            <Check checked={remember} onChange={(e) => setRemember(e.target.checked)}>
              <span className="auth-check-label">{t.keepMeSignedIn}</span>
            </Check>
          </div>

          <div className="auth-action-row">
            <Button kind="volt" size="md" type="submit">
              {t.sendCodeBtn}
            </Button>
            <div className="auth-spacer" />
            <Kbd>{t.enterKey}</Kbd>
          </div>
        </form>

        <div className="auth-card-note">
          <Icon name="info" size="sm" className="auth-note-icon" />
          <span className="auth-note-text">{t.noCodeHelp}</span>
        </div>
      </div>

      <div className="auth-below-card">
        <span className="auth-below-text">{t.newToAlyr}</span>
        <span>&nbsp;</span>
        <button type="button" className="auth-below-link" onClick={onGoToSignUp}>
          {t.setUpBusiness}
        </button>
      </div>
    </div>
  );
}
