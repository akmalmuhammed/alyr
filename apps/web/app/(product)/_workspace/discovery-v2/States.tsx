// The states This week draws before it has a view: loading (a still skeleton of the brief and the
// ticket, no shimmer loop) and a load that failed (what happened, that nothing changed, try again).

import type { ReactNode } from "react";
import { T, type D2Lang } from "./copy";
import "./tokens.css";
import "./discovery-v2.css";

const Root = ({ lang, children }: { lang: D2Lang; children: ReactNode }) => (
  <div className="d2" data-lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}><div className="d2-col">{children}</div></div>
);

export function LoadingState({ lang }: { lang: D2Lang }) {
  return (
    <Root lang={lang}>
      <div className="d2-brief" role="status" aria-label={T[lang].loading}>
        <span className="d2-skel d2-skel-title" />
        <span className="d2-skel d2-skel-line" />
        <span className="d2-skel d2-skel-ticket" />
      </div>
    </Root>
  );
}

export function ErrorState({ lang, message, onRetry }: { lang: D2Lang; message: string; onRetry: () => void }) {
  const t = T[lang];
  return (
    <Root lang={lang}>
      <section className="d2-brief" role="alert">
        <h1 className="d2-display">{t.errorTitle}</h1>
        <p className="d2-sub">{message || t.errorBody}</p>
        <div className="d2-t-actions d2-t-actions-main"><button className="d2-btn d2-btn-line" type="button" onClick={onRetry}>{t.retry}</button></div>
      </section>
    </Root>
  );
}
