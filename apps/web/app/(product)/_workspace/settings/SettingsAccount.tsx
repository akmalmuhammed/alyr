"use client";

import {
  Avatar, Button, Field, Icon, Input, Panel, PanelBody, PanelFooter, PanelHeader, Radio, Tag, Thumb,
} from "@/app/_ui";
import type { SettingsCopy } from "./copy";
import type { AccountData, Lang, ThemeChoice } from "./logic";

const THEMES: readonly ThemeChoice[] = ["light", "dark", "auto"];

/** A small drawing of the workspace in one theme (or half and half for "as the device"). */
function ThemePicture({ choice }: { choice: ThemeChoice }) {
  const pane = (tone: "light" | "dark") => (
    <span className={`set-theme-pane set-theme-pane--${tone}`}>
      <span className="set-theme-bar set-theme-bar--head" />
      <span className="set-theme-bar" />
      <span className="set-theme-bar set-theme-bar--volt" />
    </span>
  );
  return (
    <span className="set-theme-pic" aria-hidden="true">
      {choice === "auto" ? <>{pane("light")}{pane("dark")}</> : pane(choice)}
    </span>
  );
}

export function SettingsAccount({
  t, lang, account, theme, online, teamHref, openingId, onTheme, onLanguage, onChangeEmail, onSwitch, onSignOut,
}: {
  t: SettingsCopy;
  lang: Lang;
  account: AccountData;
  theme: ThemeChoice;
  /** False draws every change that needs the server as a line button that cannot be pressed. */
  online: boolean;
  /** The Team screen, where a person's name and role are set. Left out, the link is not drawn. */
  teamHref?: string;
  openingId: string | null;
  onTheme: (choice: ThemeChoice) => void;
  onLanguage: (lang: Lang) => void;
  onChangeEmail: () => void;
  onSwitch: (businessId: string) => void;
  onSignOut: () => void;
}) {
  const { me } = account;
  const themeLabels: Record<ThemeChoice, string> = { light: t.themeLight, dark: t.themeDark, auto: t.themeAuto };
  const roleWord = t.roles[me.role];

  return (
    <div className="set-cols">
      <div className="set-col">
        <Panel>
          <PanelHeader
            title={t.youTitle}
            sub={roleWord}
            right={teamHref ? <a className="set-link" href={teamHref}>{t.teamRoles}</a> : undefined}
          />
          <PanelBody>
            <div className="set-you">
              <Avatar initials={me.name.slice(0, 1)} size={56} tone="ink" />
              <div className="set-you-fields">
                <Field label={t.nameLabel} hint={t.nameHint}>
                  <Input readOnly value={me.name} />
                </Field>
                <Field label={t.roleLabel} hint={t.roleHint}>
                  <Input readOnly value={roleWord} />
                </Field>
              </div>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title={t.emailTitle}
            right={
              account.canChangeEmail ? (
                <Button kind="line" size="sm" onClick={onChangeEmail} disabled={!online}>{t.emailChange}</Button>
              ) : undefined
            }
          />
          <PanelBody>
            <div className="set-email">
              <span className="set-icon-tile" aria-hidden="true"><Icon name="lock" /></span>
              <div className="set-email-text">
                <bdi className="set-email-address u-mono" dir="ltr">{me.email}</bdi>
                <p className="set-help">{t.emailHelp}</p>
              </div>
            </div>
          </PanelBody>
          <PanelFooter>{t.sessionNote}</PanelFooter>
        </Panel>

        <Panel clip>
          <PanelHeader title={t.businessesTitle} sub={t.businessesSub} />
          <ul className="set-rows" aria-label={t.businessesTitle}>
            {account.businesses.map((b, index) => {
              const name = lang === "ar" && b.nameAr ? b.nameAr : b.name;
              const other = lang === "ar" ? b.name : b.nameAr;
              return (
                <li key={b.id} className={`set-row set-row--stack${b.current ? " set-row--on" : ""}`}>
                  <Thumb size={36} seed={index} initials={name.slice(0, 1)} />
                  <div className="set-row-text">
                    <span className="set-row-title">
                      <bdi>{name}</bdi>
                      {other ? <span className="set-row-name-ar"><bdi>{other}</bdi></span> : null}
                    </span>
                    <span className="set-row-sub">{t.youAreRole[b.role]}</span>
                  </div>
                  {b.current ? (
                    <Tag tone="ink">{t.openNow}</Tag>
                  ) : (
                    <Button
                      kind="line"
                      size="sm"
                      loading={openingId === b.id}
                      loadingLabel={t.opening}
                      disabled={!online}
                      onClick={() => onSwitch(b.id)}
                    >
                      {t.open}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          <PanelFooter>{t.businessesNote}</PanelFooter>
        </Panel>
      </div>

      <div className="set-col">
        <Panel clip>
          <PanelHeader title={t.languageTitle} sub={t.languageSub} />
          <fieldset className="set-rows">
            <legend className="u-sr">{t.languageTitle}</legend>
            {(["en", "ar"] as const).map((value) => (
              <div key={value} className={`set-row${lang === value ? " set-row--on" : ""}`}>
                <Radio name="set-lang" checked={lang === value} onChange={() => onLanguage(value)}>
                  <span className={lang === value ? "set-row-title" : undefined} lang={value}>{t.languageName[value]}</span>
                </Radio>
                <span className="set-row-end">{t.languageDirection[value]}</span>
              </div>
            ))}
          </fieldset>
        </Panel>

        <Panel>
          <PanelHeader title={t.appearanceTitle} sub={t.appearanceSub} />
          <fieldset className="set-themes">
            <legend className="u-sr">{t.appearanceTitle}</legend>
            {THEMES.map((choice) => (
              <div key={choice} className={`set-theme${theme === choice ? " set-theme--on" : ""}`}>
                <ThemePicture choice={choice} />
                <Radio name="set-theme" checked={theme === choice} onChange={() => onTheme(choice)}>
                  {themeLabels[choice]}
                </Radio>
              </div>
            ))}
          </fieldset>
        </Panel>

        <Panel>
          <div className="set-row">
            <div className="set-row-text">
              <span className="set-row-title">{t.signOutTitle}</span>
              <span className="set-row-sub">{t.signOutHelp}</span>
            </div>
            <Button kind="line" size="sm" onClick={onSignOut}>{t.signOutAction}</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
