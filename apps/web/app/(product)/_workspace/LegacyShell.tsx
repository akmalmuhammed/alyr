"use client";

// Today's workspace shell: the sidebar, the top bar, the phone tab bar, the search palette and
// the page the open section draws. It holds no data of its own: `useWorkspace()` loads it, and the
// section registry says which section draws the page. A second shell can render the same data.
// Moved out of the shell page unchanged.

import Link from "next/link";
import { Suspense } from "react";
import "./sectionStyles";
import { BillingBanner } from "./BillingBanner";
import { SubNav, ViewReporter } from "./DiscoveryMenu";
import { TermsBanner } from "./TermsBanner";
import { T as DISCOVERY } from "./discoveryCopy";
import { subItems } from "./discoveryLogic";
import { findSection, sectionOpens } from "./sectionRegistry";
import { Icon, Mark, initials } from "./shellParts";
import { isReady, useWorkspace, type NavItem } from "./useWorkspace";
import "./shell.css";

export default function LegacyShell() {
  const ws = useWorkspace();
  if (!isReady(ws)) {
    return <div className="sh-empty">{ws.offline ? ws.t.offline : ws.t.loading}</div>;
  }
  const {
    section, state, cards, offline, lang, t, pick, chooseLang, signOut, clock, palette,
    discoveryView, setDiscoveryView, shopName, current,
  } = ws;
  const { query, setQuery, cursor, setCursor, matches } = palette;
  const whatsapp = state.connections.find((c) => c.key === "whatsapp");
  const roleLabel = state.me.signed_in ? t.roles[state.me.role] ?? state.me.role.charAt(0).toUpperCase() + state.me.role.slice(1) : t.demo;

  const navLink = (item: NavItem) => {
    const count = item.key === "inbox" ? cards.find((c) => c.key === "unanswered")?.value ?? 0 : 0;
    // An item with views beneath it (Discovery) opens them while its section is open; the current
    // view carries the mark and the item itself only says it is open.
    const withViews = subItems(item.key, state.can_manage).length > 0 && section === item.key;
    const link = (
      <Link key={item.key} href={item.key === "home" ? "/app" : `/app/${item.key}`}
        className={`sh-link ${section === item.key && !withViews ? "on" : ""} ${withViews ? "open" : ""}`}
        aria-current={section === item.key ? (withViews ? "true" : "page") : undefined}>
        <Icon name={item.icon} />{pick(item.label)}
        {count > 0 && <span className="sh-count num">{count}</span>}
      </Link>
    );
    return withViews ? [link, <SubNav key={`${item.key}-views`} itemKey={item.key} lang={lang} view={discoveryView} canManage={state.can_manage} />] : link;
  };

  // The open section, found in the registry: a section that is not listed, or not switched on for
  // this shop, says so.
  const def = findSection(section);
  const Section = def && sectionOpens(def, ws) ? def.load : null;
  const body = Section ? <Section ws={ws} /> : (
    <div className="sh-empty-inline">
      <p>{t.notOn}</p>
      {state.can_manage && <Link className="btn primary" href="/app/products">{t.seeProducts}</Link>}
    </div>
  );

  const tabs = [...state.nav.core, ...state.nav.products].slice(0, 4);
  // A command's group is named above its first row only.
  const groupHeader = (i: number) => (i === 0 || matches[i].group !== matches[i - 1].group ? matches[i].group : "");

  return (
    <div className="sh" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <aside className="sh-side">
        <div className="sh-brand">
          <Mark />
          <span className="sh-brand-text"><b>{shopName}</b><small>ALYR</small></span>
        </div>
        <button className="sh-search" onClick={() => palette.open()}>
          <Icon name="search" /><span>{t.search}</span><kbd className="sh-kbd">Ctrl K</kbd>
        </button>
        <nav aria-label={shopName}>
          {state.nav.core.map(navLink)}
          {state.nav.products.length > 0 && <span className="sh-group">{t.yourProducts}</span>}
          {state.nav.products.map(navLink)}
          {state.can_manage && (
            <Link href="/app/products" className="sh-link sh-add"><Icon name="plus" />{t.add}</Link>
          )}
          <span className="sh-group">{t.account}</span>
          {state.nav.account.map(navLink)}
        </nav>
        <div className="sh-foot">
          <span className="sh-avatar">{initials(state.me.signed_in ? state.me.name : shopName)}</span>
          <span className="sh-me"><b>{state.me.signed_in ? state.me.name : shopName}</b><small>{roleLabel}</small></span>
          <button className="sh-lang" onClick={() => chooseLang(lang === "en" ? "ar" : "en")} aria-label={t.langName}>{t.lang}</button>
          {state.me.signed_in
            ? <button className="sh-iconbtn" onClick={signOut} aria-label={t.signOut} title={t.signOut}><Icon name="out" /></button>
            : <a className="sh-iconbtn" href="/login" aria-label={t.signIn} title={t.signIn}><Icon name="out" /></a>}
        </div>
      </aside>

      <div className="sh-sheet">
        <header className="sh-top">
          <div className="sh-crumbs">
            <span>{shopName}</span><i>/</i>
            {section === "discovery" && current
              ? <><span>{pick(current.label)}</span><i>/</i><b>{DISCOVERY[lang].views[discoveryView]}</b></>
              : <b>{current ? pick(current.label) : t.productsTitle}</b>}
          </div>
          <span className="spacer" />
          {clock && <span className="sh-clock" dir="ltr">{t.doha} {clock.text.split(" · ")[1]}</span>}
          <span className={`sh-live ${whatsapp?.connected ? "on" : ""}`}><span className="sh-dot" />{whatsapp?.connected ? t.live : t.sim}</span>
        </header>
        <header className="sh-mtop">
          <Mark />
          <span className="sh-brand-text"><b>{shopName}</b><small>{current ? pick(current.label) : "ALYR"}</small></span>
          <span className={`sh-live ${whatsapp?.connected ? "on" : ""}`}><span className="sh-dot" />{whatsapp?.connected ? t.live : t.sim}</span>
          <button className="sh-lang sh-mlang" onClick={() => chooseLang(lang === "en" ? "ar" : "en")} aria-label={t.langName}>{t.lang}</button>
          <button className="sh-iconbtn" onClick={() => palette.open()} aria-label={t.search}><Icon name="search" /></button>
        </header>
        <div className="sh-scroll">
          <main className="sh-main sh-enter" key={`${section}-${lang}`}>
            {offline && <div className="error" role="status">{t.offline}</div>}
            <TermsBanner lang={lang} canAccept={state.me.signed_in && (state.me.role === "owner" || state.me.role === "admin")} />
            <BillingBanner lang={lang} canSee={state.me.signed_in && (state.me.role === "owner" || state.me.role === "admin")} />
            {section === "discovery" && <Suspense fallback={null}><ViewReporter onView={setDiscoveryView} canManage={state.can_manage} /></Suspense>}
            {body}
          </main>
        </div>
      </div>

      <nav className="sh-tabbar" aria-label={shopName}>
        {tabs.map((item) => (
          <Link key={item.key} href={item.key === "home" ? "/app" : `/app/${item.key}`} className={section === item.key ? "on" : ""}>
            <Icon name={item.icon} /><span>{pick(item.label)}</span>
          </Link>
        ))}
        <button onClick={() => palette.open()}><Icon name="more" /><span>{t.more}</span></button>
      </nav>

      {palette.isOpen && (
        <div className="sh-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) palette.close(); }}>
          <div className="sh-palette" role="dialog" aria-modal="true" aria-label={t.searchFull}>
            <div className="sh-palette-in">
              <Icon name="search" />
              <input autoFocus value={query} placeholder={t.searchFull} aria-label={t.searchFull}
                onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") palette.close();
                  else if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, matches.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
                  else if (e.key === "Enter") { e.preventDefault(); palette.run(matches[cursor]); }
                }} />
              <kbd className="sh-kbd">Esc</kbd>
            </div>
            <ul role="listbox">
              {matches.length === 0 && <li className="none">{t.noMatch}</li>}
              {matches.map((command, i) => {
                const header = groupHeader(i);
                return (
                  <li key={command.id}>
                    {header && <div className="grp">{header}</div>}
                    <button role="option" aria-selected={i === cursor} aria-current={command.current ? "true" : undefined} className={command.current ? "cur" : undefined} onMouseEnter={() => setCursor(i)} onClick={() => palette.run(command)}>
                      <Icon name={command.icon} />{command.label}<Icon name="enter" className="sh-ico ret" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="sh-palette-foot">
              <span><kbd className="sh-kbd">↑↓</kbd>{t.navigate}</span>
              <span><kbd className="sh-kbd">Enter</kbd>{t.choose}</span>
              <span><kbd className="sh-kbd">Esc</kbd>{t.close}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
