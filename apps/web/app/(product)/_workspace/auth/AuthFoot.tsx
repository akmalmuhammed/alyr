"use client";

import React from "react";
import type { AuthCopyStrings } from "./copy";

export interface AuthFootProps {
  t: AuthCopyStrings;
}

export function AuthFoot({ t }: AuthFootProps) {
  return (
    <footer className="auth-foot" role="contentinfo">
      <span>{t.locationQatar}</span>
      <div className="auth-spacer" />
      <a href="#agreement" className="auth-foot-link" onClick={(e) => e.preventDefault()}>
        {t.customerAgreement}
      </a>
      <a href="#privacy" className="auth-foot-link" onClick={(e) => e.preventDefault()}>
        {t.privacyNotice}
      </a>
      <span className="auth-foot-domain">{t.appDomain}</span>
    </footer>
  );
}
