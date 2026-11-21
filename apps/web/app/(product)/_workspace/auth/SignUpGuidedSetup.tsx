"use client";

import { useState } from "react";
import { Button, Icon, IconButton, Input, Kbd, Panel, Select, SectionLabel, Status } from "../../../_ui";
import { formatTime } from "../../../_ui/format";
import type { AuthCopyStrings } from "./copy";
import { FIXTURE_LAST_SAVED, FIXTURE_SERVICES, LENGTH_CHOICES, type ServiceItem } from "./fixtures";
import { PhonePreview } from "./PhonePreview";
import { canRemoveService, durationLabel, normalizeDigits, type LanguageChoice } from "./logic";

export interface SignUpGuidedSetupProps {
  t: AuthCopyStrings;
  lang: LanguageChoice;
  businessName: string;
  initialServices?: readonly ServiceItem[];
  onBack: () => void;
  onContinue: (services: ServiceItem[]) => void;
}

const WHERE_ICONS = ["inbox", "cal", "card", "bell"] as const;
const DEFAULT_MINUTES = 30;
/** The moment of an edit, read when the event happens (never while rendering). */
const stamp = () => Date.now();
const EMPTY_DRAFT = { name: "", minutes: "", price: "", deposit: "" };

export function SignUpGuidedSetup({ t, lang, businessName, initialServices = FIXTURE_SERVICES, onBack, onContinue }: SignUpGuidedSetupProps) {
  const [services, setServices] = useState<ServiceItem[]>(() => [...initialServices]);
  const [focusId, setFocusId] = useState<string | undefined>(initialServices[1]?.id);
  const [savedAt, setSavedAt] = useState<string | number>(FIXTURE_LAST_SAVED);
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const edit = (id: string, patch: Partial<ServiceItem>) => {
    setServices((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setFocusId(id);
    setSavedAt(stamp());
  };
  const remove = (id: string) => {
    if (!canRemoveService(services.length)) return;
    setServices((list) => list.filter((s) => s.id !== id));
    setSavedAt(stamp());
  };
  const add = () => {
    const name = draft.name.trim();
    if (!name) return;
    const id = `s_${stamp()}`;
    setServices((list) => [...list, { id, name, minutes: Number(draft.minutes) || DEFAULT_MINUTES, price: draft.price, deposit: draft.deposit }]);
    setFocusId(id);
    setSavedAt(stamp());
    setDraft(EMPTY_DRAFT);
  };
  const addOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  const lengthOptions = (current?: number) => {
    const set = new Set<number>(LENGTH_CHOICES);
    if (current) set.add(current);
    return [...set]
      .sort((a, b) => a - b)
      .map((m) => (
        <option key={m} value={m}>
          {durationLabel(m, lang)}
        </option>
      ));
  };

  return (
    <div className="auth-wizard">
      <div className="auth-wizard-main">
        <div className="auth-wizard-step">
          <div className="auth-step-body">
            <div className="auth-card-header">
              <SectionLabel>{t.signupOfferKicker}</SectionLabel>
              <h1 className="auth-step-title">{t.signupOfferTitle}</h1>
              <p className="auth-card-subtitle">{t.signupOfferSubtitle}</p>
            </div>

            <Panel className="auth-price-panel" clip>
              <table className="auth-price-table" aria-label={t.priceListLabel}>
                <thead>
                  <tr>
                    <th scope="col">{t.colService}</th>
                    <th scope="col">{t.colLength}</th>
                    <th scope="col">{t.colPrice}</th>
                    <th scope="col">{t.colDeposit}</th>
                    <th scope="col"><span className="u-sr">{t.colActions}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s, index) => (
                    <tr key={s.id} className={s.id === focusId ? "auth-price-row auth-price-row--focus" : "auth-price-row"}>
                      <td data-label={t.colService}>
                        <Input
                          value={s.name}
                          aria-label={t.nameOfService(index + 1)}
                          onChange={(e) => edit(s.id, { name: e.target.value })}
                          onFocus={() => setFocusId(s.id)}
                        />
                      </td>
                      <td data-label={t.colLength}>
                        <Select aria-label={t.lengthOf(s.name)} value={s.minutes} onChange={(e) => edit(s.id, { minutes: Number(e.target.value) })}>
                          {lengthOptions(s.minutes)}
                        </Select>
                      </td>
                      <td data-label={t.colPrice}>
                        <Input
                          inputMode="decimal"
                          dir="ltr"
                          value={s.price}
                          suffix={t.currencyShort}
                          aria-label={t.priceOf(s.name)}
                          onChange={(e) => edit(s.id, { price: normalizeDigits(e.target.value) })}
                          onFocus={() => setFocusId(s.id)}
                        />
                      </td>
                      <td data-label={t.colDeposit}>
                        <Input
                          inputMode="decimal"
                          dir="ltr"
                          value={s.deposit}
                          placeholder={t.none}
                          suffix={t.currencyShort}
                          aria-label={t.depositOf(s.name)}
                          onChange={(e) => edit(s.id, { deposit: normalizeDigits(e.target.value) })}
                          onFocus={() => setFocusId(s.id)}
                        />
                      </td>
                      <td className="auth-price-action">
                        <IconButton
                          icon={<Icon name="x" size="md" />}
                          label={t.removeService(s.name)}
                          size="xs"
                          bare
                          disabled={!canRemoveService(services.length)}
                          onClick={() => remove(s.id)}
                        />
                      </td>
                    </tr>
                  ))}
                  <tr className="auth-price-row auth-price-row--add">
                    <td data-label={t.colService}>
                      <Input
                        value={draft.name}
                        placeholder={t.newServicePlaceholder}
                        aria-label={t.newServicePlaceholder}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        onKeyDown={addOnEnter}
                      />
                    </td>
                    <td data-label={t.colLength}>
                      <Select aria-label={t.newLengthLabel} value={draft.minutes} onChange={(e) => setDraft({ ...draft, minutes: e.target.value })}>
                        <option value="">{t.colLength}</option>
                        {lengthOptions()}
                      </Select>
                    </td>
                    <td data-label={t.colPrice}>
                      <Input
                        inputMode="decimal"
                        dir="ltr"
                        value={draft.price}
                        placeholder={t.notShown}
                        suffix={t.currencyShort}
                        aria-label={t.newPriceLabel}
                        onChange={(e) => setDraft({ ...draft, price: normalizeDigits(e.target.value) })}
                        onKeyDown={addOnEnter}
                      />
                    </td>
                    <td data-label={t.colDeposit}>
                      <Input
                        inputMode="decimal"
                        dir="ltr"
                        value={draft.deposit}
                        placeholder={t.none}
                        suffix={t.currencyShort}
                        aria-label={t.newDepositLabel}
                        onChange={(e) => setDraft({ ...draft, deposit: normalizeDigits(e.target.value) })}
                        onKeyDown={addOnEnter}
                      />
                    </td>
                    <td className="auth-price-action">
                      <IconButton icon={<Icon name="plus" size="md" />} label={t.addService} size="xs" bare disabled={!draft.name.trim()} onClick={add} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </Panel>

            <div className="auth-save-line">
              <Status tone="ok">{t.savedAsYouType}</Status>
              <span className="auth-last-saved">{t.lastSaved(formatTime(savedAt, lang))}</span>
              <span className="auth-save-note">{t.photosArabicLaterNote}</span>
            </div>

            <Panel className="auth-starts-panel" clip>
              <div className="auth-starts-cols">
                {t.whereUsedItems.map((col, index) => (
                  <div key={col.title} className="auth-starts-col">
                    <div className="auth-starts-title-line">
                      <Icon name={WHERE_ICONS[index]} size="md" />
                      <span className="auth-starts-title">{col.title}</span>
                    </div>
                    <span className="auth-starts-desc">{col.desc}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="auth-wizard-actions">
            <Button kind="line" size="md" icon={<Icon name="left" size="md" />} onClick={onBack}>
              {t.back}
            </Button>
            <span className="auth-actions-note">{t.signupOfferActionsNote(services.length)}</span>
            <Kbd>{t.enterKey}</Kbd>
            <Button kind="volt" size="md" onClick={() => onContinue(services)}>
              {t.continueBtn}
            </Button>
          </div>
        </div>

        <aside className="auth-wizard-preview">
          <div className="auth-preview-head">
            <SectionLabel>{t.customerSeeHeader}</SectionLabel>
            <Status tone="volt">{t.previewLive}</Status>
          </div>
          <PhonePreview t={t} lang={lang} variant="offer" businessName={businessName} services={services} focusId={focusId} caption={t.phonePreviewCaptionOffer} />
        </aside>
      </div>
    </div>
  );
}
