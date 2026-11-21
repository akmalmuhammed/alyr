import type { AuthCopyStrings } from "./copy";

export interface AuthFootProps {
  t: AuthCopyStrings;
}

/** The 52 px foot of the sign-in screens: where ALYR is, the two documents, the address of the app. */
export function AuthFoot({ t }: AuthFootProps) {
  return (
    <footer className="auth-foot">
      <span className="auth-foot-location">{t.locationQatar}</span>
      <div className="auth-foot-links">
        <a href="https://alyr.qa/terms" className="auth-foot-link">
          {t.customerAgreement}
        </a>
        <a href="https://alyr.qa/privacy" className="auth-foot-link">
          {t.privacyNotice}
        </a>
        <span className="auth-foot-domain">{t.appDomain}</span>
      </div>
    </footer>
  );
}
