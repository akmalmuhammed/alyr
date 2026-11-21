"use client";

// Discovery in the workspace (ALY-322, spec 065 "Screens"; ALY-324, spec 066): the section at
// `/app/discovery` and its views, carried in the address like Documents does
// (`?view=home|todo|proposals|reviews|reports|settings`, Home by default; Settings is for the owner
// and an admin only). The menu lists the views beneath the section (`DiscoveryMenu.tsx`); on a
// phone, where the menu is the tab bar and its More sheet, the same views are a row at the top of
// the screen. This file is the frame: the heading, the view row, the note that says when the data
// is a sample business, and whichever view the address names. It reads the address with
// `useSearchParams`, so the shell draws it inside a `Suspense`.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { ToastLayer, useToasts } from "./CatalogUi";
import { useWaiting } from "./DiscoveryMenu";
import { DiscoveryHome } from "./DiscoveryHome";
import { DiscoveryProposals } from "./DiscoveryProposals";
import { DiscoveryReports } from "./DiscoveryReports";
import { DiscoveryReviews } from "./DiscoveryReviews";
import { DiscoverySettings } from "./DiscoverySettings";
import { DiscoveryTodo } from "./DiscoveryTodo";
import { discovery, type Connection } from "./discoveryApi";
import { T, type Lang } from "./discoveryCopy";
import { isSample, readView, viewHref, viewsFor } from "./discoveryLogic";
import { useLoad } from "./discoveryUi";
import "./discovery.css";

export function Discovery({ lang, canManage }: { lang: Lang; canManage: boolean }) {
  const t = T[lang];
  const params = useSearchParams();
  const view = readView(params.get("view"), canManage);
  const waiting = useWaiting(lang);
  const { toasts, push, dismiss, clear } = useToasts();
  // Whether what the screens show is the sample business. A shop that may not read the connection
  // sees no note; the answer never blocks the screen.
  const [connection, reloadConnection] = useLoad<Connection | null>(() => discovery.connection().catch(() => null), "connection");
  const sample = isSample(connection.data ?? null);

  // A new view takes the focus on its heading and starts at the top, so a keyboard or a screen
  // reader lands on what changed; the first view of a visit does neither.
  const heading = useRef<HTMLHeadingElement>(null);
  const before = useRef(view);
  useEffect(() => {
    if (before.current === view) return;
    before.current = view;
    clear();
    document.querySelector(".sh-scroll")?.scrollTo?.({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [view, clear]);

  const title = view === "home" ? t.title : t.views[view];

  return (
    <div className="ct dv" lang={lang}>
      <header className="sh-head dv-head">
        <span className="sh-eyebrow">{t.title}</span>
        <h1 ref={heading} tabIndex={-1}>{title}</h1>
        {view === "home" && <p>{t.sub}</p>}
      </header>

      <nav className="dv-views" aria-label={t.viewsLabel}>
        {viewsFor(canManage).map((v) => (
          <Link key={v} href={viewHref(v)} className={v === view ? "on" : ""} aria-current={v === view ? "page" : undefined}>
            {t.views[v]}
            {v === "proposals" && waiting !== null && waiting > 0 && <small className="dv-subn">{t.waitingN(waiting)}</small>}
          </Link>
        ))}
      </nav>

      {sample && (
        <p className="dv-sample">
          <span className="dv-sample-tag">{t.sample.tag}</span>
          <span>{t.sample.text}</span>
        </p>
      )}

      {view === "home" && <DiscoveryHome lang={lang} canManage={canManage} push={push} onConnection={() => void reloadConnection(true)} />}
      {view === "todo" && <DiscoveryTodo lang={lang} canManage={canManage} push={push} />}
      {view === "proposals" && <DiscoveryProposals lang={lang} canManage={canManage} />}
      {view === "reviews" && <DiscoveryReviews lang={lang} />}
      {view === "reports" && <DiscoveryReports lang={lang} />}
      {view === "settings" && <DiscoverySettings lang={lang} push={push} />}

      <ToastLayer toasts={toasts} dismiss={dismiss} lang={lang} undoWord={t.undo} dismissWord={t.dismiss} />
    </div>
  );
}
