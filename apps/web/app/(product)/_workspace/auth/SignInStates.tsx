"use client";

import React from "react";
import { Banner, Button } from "../../../_ui";
import type { AuthCopyStrings } from "./copy";

export interface SignInStatesProps {
  t: AuthCopyStrings;
}

export function SignInStates({ t }: SignInStatesProps) {
  return (
    <div className="auth-states-stage">
      <div className="auth-states-grid">
        {/* State 1: Wrong code */}
        <div className="auth-state-col">
          <div className="auth-state-header">
            <span className="auth-state-kicker">{t.wrongCodeTitle}</span>
            <span className="auth-state-sub">{t.wrongCodeSub}</span>
          </div>

          <div className="auth-state-card">
            <h2 className="auth-state-title">{t.codeTitle}</h2>

            <div style={{ display: "flex", gap: "var(--space-xs)", justifyContent: "center" }}>
              {"730581".split("").map((digit, i) => (
                <div key={i} className="auth-code-box auth-code-box--small auth-code-box--error" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {digit}
                </div>
              ))}
            </div>

            <div className="auth-error-line">
              <span style={{ color: "var(--bad)", fontWeight: 700 }}>•</span>
              <span>{t.wrongCodeError}</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "var(--space-xs)" }}>
              <Button kind="dark" size="sm">
                {t.sendNewCodeBtn}
              </Button>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                {t.triesLeft(3)}
              </span>
            </div>
          </div>
        </div>

        {/* State 2: Too many codes */}
        <div className="auth-state-col">
          <div className="auth-state-header">
            <span className="auth-state-kicker">{t.tooManyCodesTitle}</span>
            <span className="auth-state-sub">{t.tooManyCodesSub}</span>
          </div>

          <div className="auth-state-card">
            <h2 className="auth-state-title">{t.signInTitle}</h2>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                height: "2.5rem",
                paddingInline: "var(--space-sm)",
                border: "var(--rule-hairline) solid var(--line-strong)",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--surface)",
                fontSize: "var(--text-sm)",
                color: "var(--text)"
              }}
            >
              hana@nuqta.qa
            </div>

            <div className="auth-error-line">
              <span style={{ color: "var(--bad)", fontWeight: 700 }}>•</span>
              <span>{t.tooManyCodesError}</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "var(--space-xs)" }}>
              <Button kind="line" size="sm" disabled>
                {t.sendCodeBtn}
              </Button>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                {t.retryAtTime("10:38")}
              </span>
            </div>

            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", lineHeight: 1.4 }}>
              {t.lastCodeStillWorks("09:48")}
            </span>
          </div>
        </div>

        {/* State 3: No connection */}
        <div className="auth-state-col">
          <div className="auth-state-header">
            <span className="auth-state-kicker">{t.noConnectionTitle}</span>
            <span className="auth-state-sub">{t.noConnectionSub}</span>
          </div>

          <div className="auth-state-card">
            <h2 className="auth-state-title">{t.codeTitle}</h2>

            <div style={{ display: "flex", gap: "var(--space-xs)", justifyContent: "center" }}>
              {"730518".split("").map((digit, i) => (
                <div key={i} className="auth-code-box auth-code-box--small" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {digit}
                </div>
              ))}
            </div>

            <div className="auth-error-line">
              <span style={{ color: "var(--bad)", fontWeight: 700 }}>•</span>
              <span>{t.noConnectionError}</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "var(--space-xs)" }}>
              <Button kind="dark" size="sm">
                {t.tryAgainBtn}
              </Button>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                {t.retryingInSeconds(8)}
              </span>
            </div>
          </div>
        </div>

        {/* State 4: Sign-in ended */}
        <div className="auth-state-col">
          <div className="auth-state-header">
            <span className="auth-state-kicker">{t.sessionEndedTitle}</span>
            <span className="auth-state-sub">{t.sessionEndedSub}</span>
          </div>

          <div className="auth-state-card">
            <h2 className="auth-state-title">{t.sessionEndedHeadline}</h2>

            <Banner tone="n">{t.sessionEndedBanner}</Banner>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                height: "2.5rem",
                paddingInline: "var(--space-sm)",
                border: "var(--rule-hairline) solid var(--line-strong)",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--surface)",
                fontSize: "var(--text-sm)",
                color: "var(--text)"
              }}
            >
              hana@nuqta.qa
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", marginTop: "var(--space-xs)" }}>
              <Button kind="volt" size="sm">
                {t.sendCodeBtn}
              </Button>
            </div>

            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", lineHeight: 1.4 }}>
              {t.returnToOrderNote}
            </span>
          </div>
        </div>
      </div>

      <div className="auth-states-note">
        <span>{t.statesFooterNote}</span>
      </div>
    </div>
  );
}
