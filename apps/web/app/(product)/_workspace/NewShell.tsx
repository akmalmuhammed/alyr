"use client";

// The redesigned workspace shell: the sidebar, the top bar with its breadcrumbs, language and
// theme, the phone's bar and tab bar, and the search over the screens, drawn from the same
// `useWorkspace()` data as `LegacyShell`. It draws a section only when that section has a
// redesigned screen and the visitor opted in (`?ui=2`, uiChoice.ts); the page decides that, so
// every visitor who never chose sees the classic shell.
//
// Everything in it is kit and tokens (`_ui`, `newShell.css`): one Volt button per view (the
// shell has none), light and dark, English and Arabic, and a phone layout under 48 rem.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar, Icon, IconButton, Kbd, Modal, Search, Status, Tag, ToastProvider, UiIcon, UiRoot, type IconName } from "../../_ui";
import { BillingBanner } from "./BillingBanner";
import { TermsBanner } from "./TermsBanner";
import { NS } from "./newShellCopy";
import { findSection, sectionOpens } from "./sectionRegistry";
import { THEME_KEY, themeAttribute, themeFromStored } from "./settings/logic";
import type { ThemeChoice } from "./settings/logic";
import { Mark } from "./shellParts";
import type { NavItem, ReadyWorkspace } from "./useWorkspace";
import "../../_ui/ui.css";
import "./newShell.css";

// The API names its icons for the classic shell's drawings; the kit draws its own set.
const ICON: Record<string, IconName> = {
  home: "home", inbox: "inbox", calendar: "cal", receipt: "orders", book: "wallet", apps: "prod", catalog: "box",
  doc: "doc", plug: "plug", users: "team", user: "acct", search: "disc", chat: "chat", card: "card", chart: "chart",
  wallet: "wallet", plus: "plus",
};
const icon = (name: string): IconName => ICON[name] ?? "prod";
const hrefOf = (key: string) => (key === "home" ? "/app" : `/app/${key}`);
const NEXT_THEME: Record<ThemeChoice, ThemeChoice> = { auto: "light", light: "dark", dark: "auto" };

function readTheme(): ThemeChoice {
  try { return themeFromStored(localStorage.getItem(THEME_KEY)); } catch { return "auto"; }
}

export default function NewShell({ ws, children, fill = false }: { ws: ReadyWorkspace; children: ReactNode; fill?: boolean }) {
  const {
    section, state, cards, offline, lang, t, pick, chooseLang, signOut, clock, palette, shopName, current,
  } = ws;
  const c = NS[lang];
  const query = useSearchParams();
  const whatsapp = state.connections.find((x) => x.key === "whatsapp");
  const signedIn = state.me.signed_in;
  const person = signedIn ? state.me.name : shopName;
  const roleLabel = signedIn ? t.roles[state.me.role] ?? state.me.role : c.demo;
  const manager = signedIn && (state.me.role === "owner" || state.me.role === "admin");

  // The theme choice is the one Settings and the public site write; read after mount so the server and the browser draw the same.
  const [theme, setTheme] = useState<ThemeChoice>("auto");
  useEffect(() => {
    const read = setTimeout(() => setTheme(readTheme()), 0);
    return () => clearTimeout(read);
  }, []);
  const changeTheme = useCallback(() => {
    const next = NEXT_THEME[readTheme()];
    const attribute = themeAttribute(next);
    try {
      if (attribute) localStorage.setItem(THEME_KEY, attribute);
      else localStorage.removeItem(THEME_KEY);
    } catch { /* this tab still changes */ }
    if (attribute) document.documentElement.setAttribute("data-theme", attribute);
    else document.documentElement.removeAttribute("data-theme");
    setTheme(next);
  }, []);

  const view = query.get("view");
  const accountView = section === "account" ? (view === "privacy" ? "privacy" : "account") : null;

  const link = (item: NavItem) => {
    const count = item.key === "inbox" ? cards.find((x) => x.key === "unanswered")?.value ?? 0 : 0;
    const on = section === item.key;
    // The account's two screens sit under its name while it is open (the screens draw no tabs of their own).
    if (item.key === "account" && on) {
      return (
        <div key={item.key} className="ns-open">
          <span className="ns-link ns-link--head"><Icon name={icon(item.icon)} /><span className="ns-link-text">{pick(item.label)}</span></span>
          <div className="ns-sub">
            <Link href="/app/account" className="ns-sublink" aria-current={accountView === "account" ? "page" : undefined}>{c.accountViews.account}</Link>
            <Link href="/app/account?view=privacy" className="ns-sublink" aria-current={accountView === "privacy" ? "page" : undefined}>{c.accountViews.privacy}</Link>
          </div>
        </div>
      );
    }
    return (
      <Link key={item.key} href={hrefOf(item.key)} className="ns-link" aria-current={on ? "page" : undefined}>
        <Icon name={icon(item.icon)} />
        <span className="ns-link-text">{pick(item.label)}</span>
        {count > 0 && <span className="ns-count u-mono">{count}</span>}
      </Link>
    );
  };

  const def = findSection(section);
  const opens = def ? sectionOpens(def, ws) : false;
  const tabs = [...state.nav.core, ...state.nav.products].slice(0, 4);
  const sectionName = current ? pick(current.label) : t.productsTitle;
  const crumbTail = accountView ? c.accountViews[accountView] : null;

  // The search: the same commands as the classic shell, in a kit dialog.
  const { query: q, setQuery, cursor, setCursor, matches } = palette;
  const group = (i: number) => (i === 0 || matches[i].group !== matches[i - 1].group ? matches[i].group : "");
  const onSearchKey = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setCursor((n) => Math.min(n + 1, matches.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setCursor((n) => Math.max(n - 1, 0)); }
    else if (event.key === "Enter") { event.preventDefault(); palette.run(matches[cursor]); }
  };
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>("[aria-selected='true']")?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  // What the shell says above every screen: the connection, the terms to accept, the plan's state.
  const notes = (
    <>
      {offline && <div className="ns-offline" role="status">{t.offline}</div>}
      <TermsBanner lang={lang} canAccept={manager} />
      <BillingBanner lang={lang} canSee={manager} />
    </>
  );
  const empty = (
    <div className="ns-empty">
      <p>{t.notOn}</p>
      {state.can_manage && <Link className="ns-textbtn" href="/app/products">{t.seeProducts}</Link>}
    </div>
  );
  const liveTag = <Status tone={whatsapp?.connected ? "ok" : "n"}>{whatsapp?.connected ? t.live : t.sim}</Status>;
  const langButton = (
    <IconButton icon={<span className="ns-langmark">{t.lang}</span>} label={t.langName}
      onClick={() => chooseLang(lang === "en" ? "ar" : "en")} lang={lang === "en" ? "ar" : "en"} />
  );
  const [day, time] = clock ? clock.text.split(" · ") : ["", ""];

  return (
    <UiRoot lang={lang} className="ns">
      <ToastProvider labels={{ dismiss: lang === "ar" ? "إغلاق" : "Dismiss", undo: lang === "ar" ? "تراجع" : "Undo" }}>
        <nav aria-label={c.skip}><a className="ns-skip" href="#ns-main">{c.skip}</a></nav>
        <div className="ns-frame">
          <aside className="ns-side">
            <div className="ns-brand">
              <Mark />
              <span className="ns-brand-text"><b>{shopName}</b><small>ALYR</small></span>
              {!signedIn && <Tag tone="n" dot={false}>{c.demo}</Tag>}
            </div>
            <button type="button" className="ns-search" onClick={() => palette.open()}>
              <UiIcon name="search" /><span>{t.search}</span><Kbd>Ctrl K</Kbd>
            </button>
            <nav aria-label={c.mainNav} className="ns-nav">
              {state.nav.core.map(link)}
              {state.nav.products.length > 0 && <span className="ns-group">{t.yourProducts}</span>}
              {state.nav.products.map(link)}
              {state.can_manage && (
                <Link href="/app/products" className="ns-link"><Icon name="plus" /><span className="ns-link-text">{t.add}</span></Link>
              )}
              <span className="ns-group">{t.account}</span>
              {state.nav.account.map(link)}
            </nav>
            <div className="ns-foot">
              <Avatar name={person} size={32} tone="ink" />
              <span className="ns-me"><b>{person}</b><small>{roleLabel}</small></span>
              {langButton}
              {signedIn
                ? <IconButton icon={<Icon name="right" />} label={t.signOut} onClick={signOut} />
                : <IconButton icon={<Icon name="right" />} label={t.signIn} onClick={() => ws.router.push("/login")} />}
            </div>
          </aside>

          <div className="ns-body">
            <header className="ns-top" aria-label={c.topBar}>
              <nav className="ns-crumbs" aria-label={sectionName}>
                <span>{shopName}</span><i aria-hidden="true">/</i>
                {crumbTail
                  ? <><span>{sectionName}</span><i aria-hidden="true">/</i><b aria-current="page">{crumbTail}</b></>
                  : <b aria-current="page">{sectionName}</b>}
              </nav>
              <span className="ns-spacer" />
              {clock && <span className="ns-clock u-mono" dir="ltr">{day} · {t.doha} {time}</span>}
              {liveTag}
              <button type="button" className="ns-textbtn" onClick={changeTheme} aria-label={c.theme(c.themes[theme])}>{c.themes[theme]}</button>
              <Link className="ns-textbtn" href={`${hrefOf(section)}?ui=1`} title={c.classicHint}>{c.classic}</Link>
            </header>
            <header className="ns-mtop">
              <Mark />
              <span className="ns-brand-text"><b>{shopName}</b><small>{sectionName}</small></span>
              {liveTag}
              {langButton}
              <IconButton icon={<UiIcon name="search" />} label={t.search} onClick={() => palette.open()} />
            </header>
            <main id="ns-main" className="ns-main" data-fill={fill ? "" : undefined} tabIndex={-1}>
              {fill ? <div className="ns-notes">{notes}</div> : null}
              <div className={fill ? "ns-fill" : "ns-page"}>
                {fill ? null : notes}
                {opens ? children : empty}
              </div>
            </main>
          </div>

          <nav className="ns-tabbar" aria-label={c.mainNav}>
            {tabs.map((item) => (
              <Link key={item.key} href={hrefOf(item.key)} aria-current={section === item.key ? "page" : undefined}>
                <Icon name={icon(item.icon)} /><span>{pick(item.label)}</span>
              </Link>
            ))}
            <button type="button" onClick={() => palette.open()}><Icon name="dots" /><span>{t.more}</span></button>
          </nav>
        </div>

        <Modal open={palette.isOpen} onClose={palette.close} title={c.searchTitle} closeLabel={c.closeSearch} className="ns-palette">
          <Search value={q} onChange={(v) => { setQuery(v); setCursor(0); }} label={t.searchFull} placeholder={t.searchFull} onKeyDown={onSearchKey} autoFocus />
          <ul role="listbox" aria-label={t.searchFull} className="ns-results" ref={list}>
            {matches.length === 0 && <li className="ns-none">{t.noMatch}</li>}
            {matches.map((command, i) => (
              <li key={command.id} role="presentation">
                {group(i) && <div className="ns-grp">{group(i)}</div>}
                <button type="button" role="option" aria-selected={i === cursor} className="ns-result" onMouseEnter={() => setCursor(i)} onClick={() => palette.run(command)}>
                  <Icon name={icon(command.icon)} />{command.label}
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      </ToastProvider>
    </UiRoot>
  );
}
