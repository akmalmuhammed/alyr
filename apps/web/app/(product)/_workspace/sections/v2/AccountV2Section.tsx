"use client";

// The redesigned Your account and Data and privacy, on the signed-in person's real account. The
// two views are `/app/account` and `/app/account?view=privacy` (the sidebar lists both). The owner's
// "Close the account" is NOT wired: there is no owner route for it (cancelling is back office only,
// D-082), and without `requestClose` the screen draws no close panel and no button at all.

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SettingsWorkbench, type SettingsView } from "../../settings/SettingsWorkbench";
import { fetchAccount, settingsActions } from "../../settings/settingsApi";
import type { AccountData, Lang } from "../../settings/logic";
import type { SectionProps } from "../../sectionRegistry";

/** Doha's date and the moment the screen was loaded, as the screen formats them. */
function dohaNow(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return { todayIso: parts, loadedAt: now.toISOString() };
}

export default function AccountV2Section({ ws }: SectionProps) {
  const search = useSearchParams();
  const view: SettingsView = search.get("view") === "privacy" ? "privacy" : "account";
  const [account, setAccount] = useState<AccountData | null>(null);
  const [failed, setFailed] = useState(false);
  const [stamp, setStamp] = useState(() => dohaNow(new Date()));

  const load = useCallback(async () => {
    try {
      setAccount(await fetchAccount());
      setFailed(false);
      setStamp(dohaNow(new Date()));
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);

  // The workbench keeps the account it is first given, so it is drawn again (keyed) once the
  // account has come: first the loading frame, then the screen.
  const state = failed ? (account ? "offline" : "error") : account ? null : "loading";

  return (
    <SettingsWorkbench
      key={account ? "ready" : (state ?? "loading")}
      lang={ws.lang}
      view={view}
      account={account}
      state={state}
      actions={settingsActions}
      todayIso={stamp.todayIso}
      loadedAt={stamp.loadedAt}
      teamHref="/app/team"
      onLanguage={(next: Lang) => ws.chooseLang(next)}
      onRetry={() => void load()}
    />
  );
}
