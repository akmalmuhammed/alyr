"use client";

import { useState } from "react";
import { Button, Check, Icon, Panel, Radio, SectionLabel, Tag, Thumb } from "../../../_ui";
import type { AuthCopyStrings } from "./copy";
import type { BusinessChoice } from "./fixtures";
import type { LanguageChoice } from "./logic";

export interface SignInChooseBusinessProps {
  t: AuthCopyStrings;
  lang: LanguageChoice;
  email: string;
  businesses: readonly BusinessChoice[];
  /** Opens the chosen business. The preview passes a function that only moves on. */
  onOpen: (id: string, remember: boolean) => void;
  onSignOut: () => void;
}

export function SignInChooseBusiness({ t, lang, email, businesses, onOpen, onSignOut }: SignInChooseBusinessProps) {
  const last = businesses.find((b) => b.usedLast) ?? businesses[0];
  const [selectedId, setSelectedId] = useState(last.id);
  const [remember, setRemember] = useState(true);
  const selected = businesses.find((b) => b.id === selectedId) ?? last;
  const nameOf = (b: BusinessChoice) => (lang === "ar" ? b.name_ar : b.name);
  const otherNameOf = (b: BusinessChoice) => (lang === "ar" ? b.name : b.name_ar);

  return (
    <div className="auth-stage">
      <Panel className="auth-card auth-card--wide">
        <form
          className="auth-card-body"
          onSubmit={(e) => {
            e.preventDefault();
            onOpen(selected.id, remember);
          }}
        >
          <div className="auth-card-header">
            <SectionLabel>
              {t.chooseKicker.before}
              <bdi dir="ltr">{email}</bdi>
              {t.chooseKicker.after}
            </SectionLabel>
            <h1 className="auth-card-title">{t.chooseTitle}</h1>
            <p className="auth-card-subtitle">{t.chooseSubtitle}</p>
          </div>

          <fieldset className="auth-biz-list">
            <legend className="u-sr">{t.chooseLegend}</legend>
            {businesses.map((b) => (
              <Radio
                key={b.id}
                name="business"
                value={b.id}
                checked={b.id === selectedId}
                onChange={() => setSelectedId(b.id)}
                className="auth-biz-row"
              >
                <span className={b.id === "nuqta" ? "auth-biz-mark auth-biz-mark--ink" : "auth-biz-mark"} aria-hidden="true">
                  {b.id === "nuqta" ? b.initial : <Thumb size={36} seed={b.id} initials={b.initial} />}
                </span>
                <span className="auth-biz-info">
                  <span className="auth-biz-title-line">
                    <span className="auth-biz-name" lang={lang}>
                      {nameOf(b)}
                    </span>
                    <span className="auth-biz-other" lang={lang === "ar" ? "en" : "ar"}>
                      {otherNameOf(b)}
                    </span>
                  </span>
                  <span className="auth-biz-meta">{b.role === "owner" ? t.ownerSub : t.adminSub}</span>
                </span>
                {b.usedLast ? (
                  <Tag tone="n" dot={false}>
                    {t.usedLast}
                  </Tag>
                ) : null}
              </Radio>
            ))}
          </fieldset>

          <Check checked={remember} onChange={(e) => setRemember(e.target.checked)}>
            {t.rememberChoice}
          </Check>

          <div className="auth-action-row">
            <Button kind="volt" size="md" type="submit">
              {t.openBusinessBtn(nameOf(selected))}
            </Button>
            <Button kind="quiet" size="md" onClick={onSignOut}>
              {t.signOutBtn}
            </Button>
          </div>
        </form>

        <div className="auth-card-note">
          <Icon name="info" size="md" className="auth-note-icon" />
          <p className="auth-note-text">{t.switchAnytimeNote}</p>
        </div>
      </Panel>
    </div>
  );
}
