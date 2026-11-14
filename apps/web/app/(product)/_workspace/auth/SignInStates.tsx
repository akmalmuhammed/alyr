"use client";

import React from "react";
import { Banner, Button } from "../../../_ui";
import type { AuthCopyStrings } from "./copy";

export interface SignInStatesProps {
  t: AuthCopyStrings;
}

export function SignInStates({ t }: SignInStatesProps) {
  return (
    <div className="auth-stage auth-stage--states">
      <div className="auth-states-grid">
        {/* State 1: Wrong code */}
        <div className="auth-state-col">
          <div className="auth-state-meta-row">
            <span className="auth-card-kicker">{t.wrongCodeTitle}</span>
            <span className="auth-state-sub">{t.wrongCodeSub}</span>
          </div>
          <div className="auth-state-card">
            <h2 className="auth-state-title">{t.codeTitle}</h2>
            <div className="auth-code-row auth-code-row--error">
              {["7", "3", "0", "5", "8", "1"].map((d, i) => (
                <div key={i} className="auth-code-box auth-code-box--small auth-code-box--bad">
                  {d}
                </div>
              ))}
            </div>
            <div className="auth-error-line">
              <span className="auth-error-dot" />
              <span className="auth-error-text">{t.wrongCodeError}</span>
            </div>
            <div className="auth-action-row">
              <Button kind="dark" size="sm">
                {t.sendNewCodeBtn}
              </Button>
              <div className="auth-spacer" />
              <span className="auth-state-tries-left">{t.triesLeft(3)}</span>
            </div>
          </div>
        </div>

        {/* State 2: Too many codes */}
        <div className="auth-state-col">
          <div className="auth-state-meta-row">
            <span className="auth-card-kicker">{t.tooManyCodesTitle}</span>
            <span className="auth-state-sub">{t.tooManyCodesSub}</span>
          </div>
          <div className="auth-state-card">
            <h2 className="auth-state-title">{t.signInTitle}</h2>
            <div className="auth-field-group">
              <label className="auth-field-label">{t.workEmailLabel}</label>
              <div className="auth-input-box auth-input-box--sm">
                <input
                  type="email"
                  defaultValue="hana@nuqta.qa"
                  readOnly
                  className="auth-input-element"
                />
              </div>
            </div>
            <div className="auth-error-line">
              <span className="auth-error-dot" />
              <span className="auth-error-text">{t.tooManyCodesError}</span>
            </div>
            <div className="auth-action-row">
              <Button kind="line" size="sm">
                {t.sendCodeBtn}
              </Button>
              <div className="auth-spacer" />
              <span className="auth-state-time-hint">{t.retryAtTime("10:38")}</span>
            </div>
            <p className="auth-state-footnote">{t.lastCodeStillWorks("09:48")}</p>
          </div>
        </div>

        {/* State 3: No connection */}
        <div className="auth-state-col">
          <div className="auth-state-meta-row">
            <span className="auth-card-kicker">{t.noConnectionTitle}</span>
            <span className="auth-state-sub">{t.noConnectionSub}</span>
          </div>
          <div className="auth-state-card">
            <h2 className="auth-state-title">{t.codeTitle}</h2>
            <div className="auth-code-row">
              {["7", "3", "0", "5", "1", "8"].map((d, i) => (
                <div key={i} className="auth-code-box auth-code-box--small">
                  {d}
                </div>
              ))}
            </div>
            <div className="auth-error-line">
              <span className="auth-error-dot" />
              <span className="auth-error-text">{t.noConnectionError}</span>
            </div>
            <div className="auth-action-row">
              <Button kind="dark" size="sm">
                {t.tryAgainBtn}
              </Button>
              <div className="auth-spacer" />
              <span className="auth-state-retry-time">{t.retryingInSeconds(8)}</span>
            </div>
          </div>
        </div>

        {/* State 4: Sign-in ended */}
        <div className="auth-state-col">
          <div className="auth-state-meta-row">
            <span className="auth-card-kicker">{t.sessionEndedTitle}</span>
            <span className="auth-state-sub">{t.sessionEndedSub}</span>
          </div>
          <div className="auth-state-card">
            <h2 className="auth-state-title">{t.sessionEndedHeadline}</h2>
            <Banner tone="n">
              {t.sessionEndedBanner}
            </Banner>
            <div className="auth-field-group">
              <label className="auth-field-label">{t.workEmailLabel}</label>
              <div className="auth-input-box auth-input-box--sm">
                <input
                  type="email"
                  defaultValue="hana@nuqta.qa"
                  readOnly
                  className="auth-input-element"
                />
              </div>
            </div>
            <div className="auth-action-row">
              <Button kind="volt" size="sm">
                {t.sendCodeBtn}
              </Button>
            </div>
            <p className="auth-state-footnote">{t.returnToOrderNote}</p>
          </div>
        </div>
      </div>

      <div className="auth-states-footer">
        {t.statesFooterNote}
      </div>
    </div>
  );
}
