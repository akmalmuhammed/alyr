"use client";

import React from "react";
import type { SettingsCopy } from "./copy";
import type { AccountProfile } from "./fixtures";
import type { UserDevice, BusinessItem, ThemeChoice, NoticeChannel, LanguageChoice, DownloadRecord, CustomerDataRequest, TermsItem } from "./logic";
import { SettingsAccount } from "./SettingsAccount";
import { SettingsPrivacy } from "./SettingsPrivacy";

interface SettingsPhoneProps {
  t: SettingsCopy;
  tab: "account" | "privacy";
  profile: AccountProfile;
  devices: UserDevice[];
  businesses: BusinessItem[];
  downloads: DownloadRecord[];
  requests: CustomerDataRequest[];
  terms: TermsItem[];
  theme: ThemeChoice;
  language: LanguageChoice;
  noticesChannel: NoticeChannel;
  onThemeChange: (theme: ThemeChoice) => void;
  onLanguageChange: (lang: LanguageChoice) => void;
  onNoticesChange: (ch: NoticeChannel) => void;
  onChangeEmailClick: () => void;
  onSwitchBusiness: (id: string) => void;
  onCloseAccountClick: () => void;
}

export function SettingsPhone({
  t,
  tab,
  profile,
  devices,
  businesses,
  downloads,
  requests,
  terms,
  theme,
  language,
  noticesChannel,
  onThemeChange,
  onLanguageChange,
  onNoticesChange,
  onChangeEmailClick,
  onSwitchBusiness,
  onCloseAccountClick,
}: SettingsPhoneProps) {
  return (
    <div className="set-phone-shell" style={{ inlineSize: "100%", maxInlineSize: "100%", overflowX: "hidden" }}>
      {tab === "account" ? (
        <SettingsAccount
          t={t}
          profile={profile}
          devices={devices}
          businesses={businesses}
          theme={theme}
          language={language}
          noticesChannel={noticesChannel}
          onThemeChange={onThemeChange}
          onLanguageChange={onLanguageChange}
          onNoticesChange={onNoticesChange}
          onChangeEmailClick={onChangeEmailClick}
          onSwitchBusiness={onSwitchBusiness}
        />
      ) : (
        <SettingsPrivacy
          t={t}
          downloads={downloads}
          requests={requests}
          terms={terms}
          onCloseAccountClick={onCloseAccountClick}
        />
      )}
    </div>
  );
}
