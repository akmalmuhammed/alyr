"use client";

import { useState } from "react";
import { Button, Icon, type IconName, Kbd, Panel, SectionLabel } from "../../../_ui";
import type { AuthCopyStrings } from "./copy";
import { FIXTURE_TYPES, TYPES_WITH_START_LIST, type BusinessTypeItem } from "./fixtures";
import { PhonePreview } from "./PhonePreview";
import type { LanguageChoice } from "./logic";

export interface SignUpBusinessTypeProps {
  t: AuthCopyStrings;
  lang: LanguageChoice;
  initialId?: string;
  onBack: () => void;
  onContinue: (chosen: BusinessTypeItem) => void;
}

const START_ICONS: readonly IconName[] = ["cal", "tag", "box", "inbox"];

export function SignUpBusinessType({ t, lang, initialId = "carcare", onBack, onContinue }: SignUpBusinessTypeProps) {
  const [selectedId, setSelectedId] = useState(initialId);
  const selected = FIXTURE_TYPES.find((item) => item.id === selectedId) ?? FIXTURE_TYPES[0];
  const chosenTitle = t.types[selected.id].title;

  return (
    <div className="auth-wizard">
      <div className="auth-wizard-main">
        <form
          className="auth-wizard-step"
          onSubmit={(e) => {
            e.preventDefault();
            onContinue(selected);
          }}
        >
          <div className="auth-step-body">
            <div className="auth-card-header">
              <SectionLabel>{t.signupTypeKicker}</SectionLabel>
              <h1 className="auth-step-title">{t.signupTypeTitle}</h1>
              <p className="auth-card-subtitle">{t.signupTypeSubtitle}</p>
            </div>

            <fieldset className="auth-type-grid">
              <legend className="u-sr">{t.typesLegend}</legend>
              {FIXTURE_TYPES.map((item) => {
                const on = item.id === selectedId;
                return (
                  <label key={item.id} className={on ? "auth-type-tile auth-type-tile--on" : "auth-type-tile"}>
                    <input
                      type="radio"
                      name="trade"
                      value={item.id}
                      className="u-sr"
                      checked={on}
                      onChange={() => setSelectedId(item.id)}
                    />
                    <span className="auth-type-tile-top">
                      <Icon name={item.icon} size="md" className="auth-type-icon" />
                      {on ? (
                        <span className="auth-tick" aria-hidden="true">
                          <Icon name="check" size="sm" />
                        </span>
                      ) : item.withAlyr ? (
                        <span className="auth-with-alyr">{t.withAlyrBadge}</span>
                      ) : null}
                    </span>
                    <span className="auth-type-title">{t.types[item.id].title}</span>
                    <span className="auth-type-subtitle">{t.types[item.id].desc}</span>
                  </label>
                );
              })}
            </fieldset>

            {TYPES_WITH_START_LIST.includes(selected.id) ? (
              <Panel className="auth-starts-panel" clip>
                <div className="auth-starts-header">
                  <SectionLabel>{t.startWithTitle}</SectionLabel>
                  <span className="auth-starts-note">{t.startWithSub}</span>
                </div>
                <div className="auth-starts-cols">
                  {t.startItems.map((col, index) => (
                    <div key={col.title} className="auth-starts-col">
                      <div className="auth-starts-title-line">
                        <Icon name={START_ICONS[index]} size="md" />
                        <span className="auth-starts-title">{col.title}</span>
                      </div>
                      <span className="auth-starts-desc">{col.desc}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            ) : null}
          </div>

          <div className="auth-wizard-actions">
            <Button kind="line" size="md" icon={<Icon name="left" size="md" />} onClick={onBack}>
              {t.back}
            </Button>
            <span className="auth-actions-note">{t.signupTypeChosenNote(chosenTitle)}</span>
            <Kbd>{t.enterKey}</Kbd>
            <Button kind="volt" size="md" type="submit">
              {t.continueBtn}
            </Button>
          </div>
        </form>

        <aside className="auth-wizard-preview">
          <SectionLabel>{t.customerSeeHeader}</SectionLabel>
          <PhonePreview t={t} lang={lang} variant="type" businessName={t.phone.yourBusiness} caption={t.phonePreviewCaptionType} />
        </aside>
      </div>
    </div>
  );
}
