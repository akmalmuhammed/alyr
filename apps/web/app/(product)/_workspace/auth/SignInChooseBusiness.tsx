"use client";

import React, { useState } from "react";
import { Button, Check, Icon, Radio, Tag } from "../../../_ui";
import type { AuthCopyStrings } from "./copy";
import { FIXTURE_BUSINESSES } from "./fixtures";

export interface SignInChooseBusinessProps {
  t: AuthCopyStrings;
  email: string;
  onSelectBusiness: (id: string) => void;
  onSignOut: () => void;
}

export function SignInChooseBusiness({
  t,
  email,
  onSelectBusiness,
  onSignOut
}: SignInChooseBusinessProps) {
  const [selectedId, setSelectedId] = useState<string>("nuqta");
  const [rememberChoice, setRememberChoice] = useState(true);

  const selectedBiz =
    FIXTURE_BUSINESSES.find((b) => b.id === selectedId) || FIXTURE_BUSINESSES[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSelectBusiness(selectedId);
  };

  return (
    <div className="auth-stage">
      <div className="auth-card auth-card--wide">
        <form onSubmit={handleSubmit} className="auth-card-body">
          <div className="auth-card-header">
            <span className="auth-card-kicker">{t.chooseKicker(email)}</span>
            <h1 className="auth-card-title">{t.chooseTitle}</h1>
            <p className="auth-card-subtitle">{t.chooseSubtitle}</p>
          </div>

          <div className="auth-biz-list">
            {FIXTURE_BUSINESSES.map((biz, idx) => {
              const isSelected = biz.id === selectedId;
              const isNuqta = biz.id === "nuqta";

              return (
                <div
                  key={biz.id}
                  onClick={() => setSelectedId(biz.id)}
                  className={`auth-biz-row ${isSelected ? "auth-biz-row--selected" : ""} ${
                    idx < FIXTURE_BUSINESSES.length - 1 ? "auth-biz-row--bordered" : ""
                  }`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setSelectedId(biz.id);
                    }
                  }}
                >
                  <Radio checked={isSelected} readOnly />

                  <div className={`auth-biz-mark ${isNuqta ? "auth-biz-mark--nuqta" : "auth-biz-mark--qirfa"}`}>
                    <span className={`auth-biz-letter ${isNuqta ? "auth-biz-letter--nuqta" : ""}`}>
                      {biz.initial}
                    </span>
                  </div>

                  <div className="auth-biz-info">
                    <div className="auth-biz-title-line">
                      <span className="auth-biz-name">{biz.name}</span>
                      <span className="auth-biz-arabic">{biz.name_ar}</span>
                    </div>
                    <span className="auth-biz-meta">
                      {biz.role === "owner" ? t.ownerSub(biz.places) : t.adminSub(biz.places)}
                    </span>
                  </div>

                  {biz.usedLast ? (
                    <Tag tone="n">
                      {t.usedLast}
                    </Tag>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="auth-checkbox-row">
            <Check checked={rememberChoice} onChange={(e) => setRememberChoice(e.target.checked)}>
              <span className="auth-check-label">{t.rememberChoice}</span>
            </Check>
          </div>

          <div className="auth-action-row">
            <Button kind="volt" size="md" type="submit">
              {t.openBusinessBtn(selectedBiz.name)}
            </Button>
            <div className="auth-spacer" />
            <button type="button" className="auth-signout-action" onClick={onSignOut}>
              {t.signOutBtn}
            </button>
          </div>
        </form>

        <div className="auth-card-note">
          <Icon name="info" size="sm" className="auth-note-icon" />
          <span className="auth-note-text">{t.switchAnytimeNote}</span>
        </div>
      </div>
    </div>
  );
}
