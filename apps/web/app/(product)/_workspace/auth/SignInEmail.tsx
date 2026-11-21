"use client";

import { useState } from "react";
import { Button, Check, Field, Icon, Input, Kbd, Panel, SectionLabel } from "../../../_ui";
import type { AuthCopyStrings } from "./copy";
import { isValidEmail } from "./logic";

export interface SignInEmailProps {
  t: AuthCopyStrings;
  email: string;
  onChangeEmail: (value: string) => void;
  /** Asks for a code. The preview passes a function that only moves to the next screen: no email is sent. */
  onSubmit: () => void;
  onGoToSignUp: () => void;
}

export function SignInEmail({ t, email, onChangeEmail, onSubmit, onGoToSignUp }: SignInEmailProps) {
  const [remember, setRemember] = useState(true);
  const [invalid, setInvalid] = useState(false);

  return (
    <div className="auth-stage">
      <Panel className="auth-card">
        <form
          className="auth-card-body"
          onSubmit={(e) => {
            e.preventDefault();
            if (isValidEmail(email)) onSubmit();
            else setInvalid(true);
          }}
        >
          <div className="auth-card-header">
            <SectionLabel>{t.signInKicker}</SectionLabel>
            <h1 className="auth-card-title">{t.signInTitle}</h1>
            <p className="auth-card-subtitle">{t.signInSubtitle}</p>
          </div>

          <Field label={t.workEmailLabel} error={invalid ? t.emailInvalid : undefined}>
            <Input
              type="email"
              name="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              required
              dir="ltr"
              value={email}
              placeholder={t.workEmailPlaceholder}
              onChange={(e) => {
                onChangeEmail(e.target.value);
                setInvalid(false);
              }}
              prefix={<Icon name="send" size="md" />}
            />
          </Field>

          <Check checked={remember} onChange={(e) => setRemember(e.target.checked)}>
            {t.keepMeSignedIn}
          </Check>

          <div className="auth-action-row">
            <Button kind="volt" size="md" type="submit">
              {t.sendCodeBtn}
            </Button>
            <Kbd>{t.enterKey}</Kbd>
          </div>
        </form>

        <div className="auth-card-note">
          <Icon name="info" size="md" className="auth-note-icon" />
          <p className="auth-note-text">{t.noCodeHelp}</p>
        </div>
      </Panel>

      <p className="auth-below-card">
        <span>{t.newToAlyr}</span>
        <button type="button" className="auth-below-link" onClick={onGoToSignUp}>
          {t.setUpBusiness}
        </button>
      </p>
    </div>
  );
}
