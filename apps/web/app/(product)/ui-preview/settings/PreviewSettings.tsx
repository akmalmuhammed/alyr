"use client";

// The preview route's host for Settings: sample data, and actions that touch no network. Nothing
// here downloads, sends a code, signs anyone out or closes anything; each action only says so in a
// toast. The real screen is given `settingsActions` (settingsApi.ts) by whoever wires the section.

import { useState } from "react";
import { useToast } from "@/app/_ui";
import { ApiError } from "@/app/_ui/api";
import { SettingsWorkbench } from "@/app/(product)/_workspace/settings/SettingsWorkbench";
import type { SettingsState, SettingsView } from "@/app/(product)/_workspace/settings/SettingsWorkbench";
import type { SettingsActions } from "@/app/(product)/_workspace/settings/settingsApi";
import {
  FIXTURE_ACCOUNT, FIXTURE_AGENT, FIXTURE_CODE, FIXTURE_IMPACT, FIXTURE_NEW_EMAIL, FIXTURE_NOW, FIXTURE_TODAY,
} from "@/app/(product)/_workspace/settings/fixtures";
import { THEME_KEY } from "@/app/(product)/_workspace/settings/logic";
import type { Lang } from "@/app/(product)/_workspace/settings/logic";
import { keepLang } from "@/app/(product)/_workspace/lang";

const PREVIEW_NOTE: Record<Lang, string> = {
  en: "Preview: nothing was sent, changed, downloaded or closed.",
  ar: "معاينة: لم يُرسل شيء ولم يتغير ولم يُنزَّل ولم يُغلق.",
};

export function PreviewSettings({
  lang, view, state, dialog, theme,
}: {
  lang: Lang;
  view: SettingsView;
  state: SettingsState | "agent" | null;
  dialog: "email" | "close" | null;
  theme?: "light" | "dark";
}) {
  const toast = useToast();

  // The preview's `?theme=` reaches <html> and the stored choice before the screen reads it.
  useState(() => {
    if (!theme) return null;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* not stored */ }
    if (typeof document !== "undefined") document.documentElement.setAttribute("data-theme", theme);
    return null;
  });

  const say = () => toast.push({ text: PREVIEW_NOTE[lang], tone: "warn", key: "preview" });
  const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 400));

  const actions: SettingsActions = {
    async requestEmailCode() {
      await pause();
      say();
    },
    async confirmEmailChange(email, code) {
      await pause();
      // The one refusal worth seeing: a code that is wrong.
      if (code === "000000") throw new ApiError(422, "code", "wrong");
      say();
      return email;
    },
    async switchBusiness() {
      await pause();
      say();
    },
    async signOut() {
      say();
    },
    download() {
      say();
    },
    async requestClose() {
      await pause();
      say();
    },
  };

  const agent = state === "agent";
  const screenState: SettingsState | null = state === "agent" ? null : state;

  function changeLanguage(next: Lang) {
    keepLang(next);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", next);
    window.location.assign(url.toString());
  }

  return (
    <main className="set-preview-wrap">
      <SettingsWorkbench
        lang={lang}
        view={view}
        account={screenState === "error" ? null : agent ? FIXTURE_AGENT : FIXTURE_ACCOUNT}
        state={screenState}
        actions={actions}
        todayIso={FIXTURE_TODAY}
        loadedAt={FIXTURE_NOW}
        impact={FIXTURE_IMPACT}
        teamHref="/app/team"
        onLanguage={changeLanguage}
        onRetry={() => window.location.reload()}
        initialDialog={dialog}
        initialEmail={dialog === "email" ? { step: 1, address: FIXTURE_NEW_EMAIL, code: FIXTURE_CODE } : undefined}
        initialAcknowledged={dialog === "close"}
      />
    </main>
  );
}
