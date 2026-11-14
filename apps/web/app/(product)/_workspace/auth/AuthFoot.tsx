"use client";

import React from "react";
import type { AuthCopyStrings } from "./copy";

export interface AuthFootProps {
  t: AuthCopyStrings;
}

export function AuthFoot({ t }: AuthFootProps) {
  return (
    <footer className="auth-foot" role="contentinfo">
      <span className="auth-foot-location">{t.locationQatar}</span>

      <div className="auth-spacer" />

      <div className="auth-foot-links">
        <a href="#agreement" className="auth-foot-link">
          {t.customerAgreement}
        </a>
        <a href="#privacy" className="auth-foot-link">
          {t.privacyNotice}
        </a>
        <span className="auth-foot-domain">{t.appDomain}</span>
      </div>
    </footer>
  );
}
