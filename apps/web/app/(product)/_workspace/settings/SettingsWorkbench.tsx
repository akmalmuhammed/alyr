"use client";

import { useState, useSyncExternalStore } from "react";
import { Banner, Button, ConfirmDialog, PageTitle, useToast } from "@/app/_ui";
import { formatTime } from "@/app/_ui/format";
import { SETTINGS_COPY } from "./copy";
import type { SettingsActions } from "./settingsApi";
import { SettingsAccount } from "./SettingsAccount";
import { SettingsPrivacy } from "./SettingsPrivacy";
import { SettingsEmailDialog } from "./SettingsEmailDialog";
import { SettingsCloseDialog } from "./SettingsCloseDialog";
import type { CloseImpact } from "./SettingsCloseDialog";
import { SettingsLoading } from "./SettingsStates";
import { THEME_KEY, mayClose, mayDownload, themeAttribute, themeFromStored } from "./logic";
import type { AccountData, Lang, ThemeChoice } from "./logic";
import "./settings.css";

export type SettingsView = "account" | "privacy";
export type SettingsState = "loading" | "offline" | "error";
type Dialog = "email" | "close" | "download";

export interface SettingsWorkbenchProps {
  lang: Lang;
  view: SettingsView;
  /** Null while it loads or when it could not be loaded. */
  account: AccountData | null;
  /** loading, offline (what is on screen was loaded earlier) or error (it could not be loaded). */
  state?: SettingsState | null;
  actions: SettingsActions;
  /** The shop's today (an ISO date) and the moment the screen was loaded, in Doha time. */
  todayIso: string;
  loadedAt: string;
  /** What closing interrupts, when the host knows. */
  impact?: CloseImpact;
  /** The Team screen, where a name and a role are set. */
  teamHref?: string;
  /** The language radio: the host keeps the choice and reloads the screen in it. */
  onLanguage: (lang: Lang) => void;
  onRetry?: () => void;
  /** A dialog to open on arrival (a link, or the preview). */
  initialDialog?: Dialog | null;
  initialEmail?: { step: 0 | 1; address: string; code: string };
  initialAcknowledged?: boolean;
}

// The theme choice lives in localStorage (the site's switch writes the same key), so it is read as an
// external store: the server draws "as the device", the browser then draws what was kept.
const themeListeners = new Set<() => void>();
let themeInMemory: ThemeChoice | null = null;
function subscribeTheme(listener: () => void) {
  themeListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    themeListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
function readTheme(): ThemeChoice {
  try { return themeFromStored(localStorage.getItem(THEME_KEY)); } catch { return themeInMemory ?? "auto"; }
}

export function SettingsWorkbench({
  lang, view, account: initialAccount, state = null, actions, todayIso, loadedAt, impact, teamHref, onLanguage,
  onRetry, initialDialog = null, initialEmail, initialAcknowledged,
}: SettingsWorkbenchProps) {
  const t = SETTINGS_COPY[lang];
  const toast = useToast();
  const [account, setAccount] = useState(initialAccount);
  const [dialog, setDialog] = useState<Dialog | null>(initialDialog);
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "auto" as ThemeChoice);
  const [openingId, setOpeningId] = useState<string | null>(null);

  function chooseTheme(choice: ThemeChoice) {
    themeInMemory = choice;
    const attribute = themeAttribute(choice);
    try {
      if (attribute) localStorage.setItem(THEME_KEY, attribute);
      else localStorage.removeItem(THEME_KEY);
    } catch { /* not remembered; this tab still changes */ }
    if (attribute) document.documentElement.setAttribute("data-theme", attribute);
    else document.documentElement.removeAttribute("data-theme");
    themeListeners.forEach((listener) => listener());
  }

  const online = state !== "offline";
  const role = account?.me.role ?? "owner";
  const canDownload = account ? mayDownload(role, account.canExport) : false;
  const canClose = account ? mayClose(role) && !!actions.requestClose : false;
  const current = account?.businesses.find((b) => b.current) ?? account?.businesses[0];
  const dialogOpen = dialog !== null;

  const title = view === "account" ? t.accountTitle : t.privacyTitle;
  const sub = view === "account" ? t.accountSub : t.privacySub;
  const loaded = formatTime(loadedAt, lang);

  async function switchTo(businessId: string) {
    setOpeningId(businessId);
    try {
      await actions.switchBusiness(businessId);
    } catch {
      toast.push({ text: t.mailRefusals.failed, tone: "bad" });
    } finally {
      setOpeningId(null);
    }
  }

  async function signOut() {
    try {
      await actions.signOut();
    } catch {
      toast.push({ text: t.mailRefusals.failed, tone: "bad" });
    }
  }

  // The title row's one action. Behind a dialog the page is inert and the dialog owns the Volt.
  let right = null;
  if (view === "privacy" && state !== "loading" && state !== "error" && canDownload) {
    right = (
      <>
        <span className="set-note">{t.titleAction}</span>
        {!online ? (
          <Button kind="line" disabled>{t.downloadAll}</Button>
        ) : dialogOpen ? (
          <Button kind="dark" onClick={() => setDialog("download")}>{t.downloadAll}</Button>
        ) : (
          <Button kind="volt" onClick={() => setDialog("download")}>{t.downloadAll}</Button>
        )}
      </>
    );
  }

  let banner = null;
  if (state === "offline") {
    banner = <Banner tone="warn">{t.offlineBanner(loaded)}</Banner>;
  } else if (state === "error") {
    banner = (
      <Banner tone="bad" action={onRetry ? <Button kind="quiet" size="sm" onClick={onRetry}>{t.retry}</Button> : undefined}>
        {t.errorBanner}
      </Banner>
    );
  } else if (account && view === "privacy" && !canDownload) {
    banner = <Banner tone="n">{t.noAccessBody}</Banner>;
  }

  return (
    <div className="set-page">
      <PageTitle title={title} sub={sub} right={right} />
      {banner}

      {state === "loading" || !account ? (
        state === "error" ? null : <SettingsLoading t={t} />
      ) : view === "account" ? (
        <SettingsAccount
          t={t}
          lang={lang}
          account={account}
          theme={theme}
          online={online}
          teamHref={teamHref}
          openingId={openingId}
          onTheme={chooseTheme}
          onLanguage={onLanguage}
          onChangeEmail={() => setDialog("email")}
          onSwitch={switchTo}
          onSignOut={signOut}
        />
      ) : (
        <SettingsPrivacy
          t={t}
          mayClose={canClose}
          closeDisabled={!online}
          onClose={() => setDialog("close")}
        />
      )}

      {dialog === "email" && account ? (
        <SettingsEmailDialog
          t={t}
          currentEmail={account.me.email}
          actions={actions}
          initialStep={initialEmail?.step}
          initialAddress={initialEmail?.address}
          initialCode={initialEmail?.code}
          onClose={() => setDialog(null)}
          onDone={(email) => {
            setAccount({ ...account, me: { ...account.me, email } });
            setDialog(null);
            toast.push({ text: t.mailDone(email), tone: "ok" });
          }}
        />
      ) : null}

      {dialog === "close" && account && current && actions.requestClose ? (
        <SettingsCloseDialog
          t={t}
          lang={lang}
          businessName={current.name}
          businessNameAr={current.nameAr}
          todayIso={todayIso}
          impact={impact}
          initialAcknowledged={initialAcknowledged}
          requestClose={actions.requestClose}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            toast.push({ text: t.closeAsked, tone: "ok" });
          }}
        />
      ) : null}

      <ConfirmDialog
        open={dialog === "download"}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          actions.download();
        }}
        title={t.downloadTitle}
        closeLabel={t.dismiss}
        confirmLabel={t.downloadConfirm}
        cancelLabel={t.downloadKeep}
      >
        {t.downloadBody}
      </ConfirmDialog>
    </div>
  );
}
