"use client";

import React, { useState } from "react";
import { Button, Check, Tag } from "../../../_ui";
import type { AuthCopyStrings } from "./copy";
import { FIXTURE_BUSINESSES, type BusinessChoice } from "./fixtures";

export interface SignInChooseBusinessProps {
  t: AuthCopyStrings;
  email: string;
  onSelectBusiness: (business: BusinessChoice) => void;
  onSignOut: () => void;
}

export function SignInChooseBusiness({
  t,
  email,
  onSelectBusiness,
  onSignOut
}: SignInChooseBusinessProps) {
  const [selectedId, setSelectedId] = useState<string>("nuqta");
  const [autoOpen, setAutoOpen] = useState(true);

  const selectedBusiness = FIXTURE_BUSINESSES.find((b) => b.id === selectedId) || FIXTURE_BUSINESSES[0];

  const handleOpen = () => {
    onSelectBusiness(selectedBusiness);
  };

  return (
    <div className="auth-stage">
      <div className="auth-card auth-card--wide">
        <div className="auth-card-body">
          <div className="auth-card-header">
            <span className="auth-card-kicker">{t.chooseKicker(email || "hana@nuqta.qa")}</span>
            <h1 className="auth-card-title">{t.chooseTitle}</h1>
            <p className="auth-card-subtitle">{t.chooseSubtitle}</p>
          </div>

          <div className="auth-business-list" role="radiogroup" aria-label={t.chooseTitle}>
            {FIXTURE_BUSINESSES.map((b) => {
              const isSelected = b.id === selectedId;
              const subText = b.role === "owner" ? t.ownerSub(b.places) : t.adminSub(b.places);
              return (
                <div
                  key={b.id}
                  className={`auth-business-row ${isSelected ? "auth-business-row--selected" : ""}`}
                  onClick={() => setSelectedId(b.id)}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(b.id);
                    }
                  }}
                >
                  <input
                    type="radio"
                    name="business-choice"
                    checked={isSelected}
                    onChange={() => setSelectedId(b.id)}
                    style={{ accentColor: "var(--text)", cursor: "pointer" }}
                    aria-label={b.name}
                  />

                  <div className={`auth-business-avatar ${b.id !== "nuqta" ? "auth-business-avatar--alt" : ""}`}>
                    {b.initial}
                  </div>

                  <div className="auth-business-info">
                    <div className="auth-business-names">
                      <span className="auth-business-title">{b.name}</span>
                      <span className="auth-business-ar">{b.name_ar}</span>
                    </div>
                    <span className="auth-business-desc">{subText}</span>
                  </div>

                  {b.usedLast && <Tag tone="n">{t.usedLast}</Tag>}
                </div>
              );
            })}
          </div>

          <div>
            <Check checked={autoOpen} onChange={(e) => setAutoOpen(e.target.checked)}>
              {t.rememberChoice}
            </Check>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-md)" }}>
            <Button kind="volt" size="md" onClick={handleOpen}>
              {t.openBusinessBtn(selectedBusiness.name)}
            </Button>
            <Button kind="quiet" size="md" onClick={onSignOut}>
              {t.signOutBtn}
            </Button>
          </div>
        </div>

        <div className="auth-card-note">
          <span>{t.switchAnytimeNote}</span>
        </div>
      </div>
    </div>
  );
}
