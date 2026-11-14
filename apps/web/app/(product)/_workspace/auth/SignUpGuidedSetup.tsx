"use client";

import React, { useState } from "react";
import { Button, Icon, type IconName, Kbd, Tag } from "../../../_ui";
import type { AuthCopyStrings } from "./copy";
import { FIXTURE_SERVICES, type ServiceItem } from "./fixtures";
import { PhonePreview } from "./PhonePreview";
import type { LanguageChoice } from "./logic";

export interface SignUpGuidedSetupProps {
  t: AuthCopyStrings;
  lang: LanguageChoice;
  onBack: () => void;
  onContinue: (services: ServiceItem[]) => void;
}

const WHERE_USED_ICONS: readonly IconName[] = ["wa", "cal", "card", "bell"];

export function SignUpGuidedSetup({
  t,
  lang,
  onBack,
  onContinue
}: SignUpGuidedSetupProps) {
  const [services, setServices] = useState<ServiceItem[]>(FIXTURE_SERVICES);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceLength, setNewServiceLength] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("");
  const [newServiceDeposit, setNewServiceDeposit] = useState("");

  const handleUpdate = (id: string, field: keyof ServiceItem, val: string) => {
    setServices((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: val } : s))
    );
  };

  const handleRemove = (id: string) => {
    if (services.length <= 1) return;
    setServices((prev) => prev.filter((s) => s.id !== id));
  };

  const handleAdd = () => {
    if (!newServiceName.trim()) return;
    const newItem: ServiceItem = {
      id: `s_${Date.now()}`,
      name: newServiceName.trim(),
      length: newServiceLength.trim() || "30 min",
      price: newServicePrice.trim() || "50",
      deposit: newServiceDeposit.trim()
    };
    setServices((prev) => [...prev, newItem]);
    setNewServiceName("");
    setNewServiceLength("");
    setNewServicePrice("");
    setNewServiceDeposit("");
  };

  return (
    <div className="auth-wizard">
      <div className="auth-wizard-content">
        {/* Left Step Form */}
        <div className="auth-wizard-step">
          <div className="auth-step-body">
            <div className="auth-card-header">
              <span className="auth-card-kicker">{t.signupOfferKicker}</span>
              <h1 className="auth-card-title auth-card-title--lg">{t.signupOfferTitle}</h1>
              <p className="auth-card-subtitle">{t.signupOfferSubtitle}</p>
            </div>

            {/* Price List Table Panel */}
            <div className="auth-price-panel">
              <div className="auth-price-header">
                <span className="auth-price-cell-service">{t.colService}</span>
                <span className="auth-price-cell-fixed">{t.colLength}</span>
                <span className="auth-price-cell-fixed">{t.colPrice}</span>
                <span className="auth-price-cell-fixed">{t.colDeposit}</span>
                <span className="auth-price-cell-action" />
              </div>

              {services.map((s, idx) => {
                const isFullWashFocus = idx === 1;

                return (
                  <div
                    key={s.id}
                    className={`auth-price-row ${isFullWashFocus ? "auth-price-row--focus" : ""}`}
                  >
                    <div className="auth-price-cell-service">
                      <input
                        type="text"
                        value={s.name}
                        onChange={(e) => handleUpdate(s.id, "name", e.target.value)}
                        className="auth-cell-input"
                      />
                    </div>

                    <div className="auth-price-cell-fixed">
                      <div className="auth-cell-box auth-cell-box--select">
                        <input
                          type="text"
                          value={s.length}
                          onChange={(e) => handleUpdate(s.id, "length", e.target.value)}
                          className="auth-cell-input"
                        />
                        <Icon name="down" size="sm" className="auth-cell-chevron" />
                      </div>
                    </div>

                    <div className="auth-price-cell-fixed">
                      <div className={`auth-cell-box ${isFullWashFocus ? "auth-cell-box--active" : ""}`}>
                        <input
                          type="text"
                          value={s.price}
                          onChange={(e) => handleUpdate(s.id, "price", e.target.value)}
                          className="auth-cell-input auth-cell-input--mono"
                        />
                        <span className="auth-cell-suffix">{lang === "ar" ? "ر.ق" : "QAR"}</span>
                      </div>
                    </div>

                    <div className="auth-price-cell-fixed">
                      <div className="auth-cell-box">
                        <input
                          type="text"
                          value={s.deposit}
                          placeholder={lang === "ar" ? "بدون" : "None"}
                          onChange={(e) => handleUpdate(s.id, "deposit", e.target.value)}
                          className="auth-cell-input auth-cell-input--mono"
                        />
                        {s.deposit ? (
                          <span className="auth-cell-suffix">{lang === "ar" ? "ر.ق" : "QAR"}</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="auth-price-cell-action">
                      <button
                        type="button"
                        onClick={() => handleRemove(s.id)}
                        className="auth-remove-row-btn"
                        aria-label="Remove service"
                      >
                        <Icon name="x" size="sm" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Add New Service Row */}
              <div className="auth-price-row auth-price-row--add">
                <div className="auth-price-cell-service">
                  <input
                    type="text"
                    placeholder={t.newServicePlaceholder}
                    value={newServiceName}
                    onChange={(e) => setNewServiceName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAdd();
                    }}
                    className="auth-cell-input"
                  />
                </div>

                <div className="auth-price-cell-fixed">
                  <div className="auth-cell-box auth-cell-box--select">
                    <input
                      type="text"
                      placeholder={t.colLength}
                      value={newServiceLength}
                      onChange={(e) => setNewServiceLength(e.target.value)}
                      className="auth-cell-input"
                    />
                    <Icon name="down" size="sm" className="auth-cell-chevron" />
                  </div>
                </div>

                <div className="auth-price-cell-fixed">
                  <div className="auth-cell-box">
                    <input
                      type="text"
                      placeholder={lang === "ar" ? "غير معروض" : "Not shown"}
                      value={newServicePrice}
                      onChange={(e) => setNewServicePrice(e.target.value)}
                      className="auth-cell-input auth-cell-input--mono"
                    />
                    <span className="auth-cell-suffix">{lang === "ar" ? "ر.ق" : "QAR"}</span>
                  </div>
                </div>

                <div className="auth-price-cell-fixed">
                  <div className="auth-cell-box">
                    <input
                      type="text"
                      placeholder={lang === "ar" ? "بدون" : "None"}
                      value={newServiceDeposit}
                      onChange={(e) => setNewServiceDeposit(e.target.value)}
                      className="auth-cell-input auth-cell-input--mono"
                    />
                    <span className="auth-cell-suffix">{lang === "ar" ? "ر.ق" : "QAR"}</span>
                  </div>
                </div>

                <div className="auth-price-cell-action" />
              </div>
            </div>

            {/* Auto-save status line */}
            <div className="auth-save-status-line">
              <span className="auth-status-dot-ok" />
              <span className="auth-save-text">{t.savedAsYouType}</span>
              <span className="auth-last-saved">{t.lastSavedMeta}</span>
              <div className="auth-spacer" />
              <span className="auth-services-note">{t.photosArabicLaterNote}</span>
            </div>

            {/* "Where the list is used" Panel */}
            <div className="auth-starts-panel">
              <div className="auth-starts-cols">
                {t.whereUsedItems.map((col, idx) => (
                  <div
                    key={idx}
                    className={`auth-starts-col ${idx > 0 ? "auth-starts-col--bordered" : ""}`}
                  >
                    <div className="auth-starts-title-line">
                      <Icon name={WHERE_USED_ICONS[idx % WHERE_USED_ICONS.length]} size="sm" />
                      <span className="auth-starts-title">{col.title}</span>
                    </div>
                    <span className="auth-starts-desc">{col.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Actions Bar */}
          <div className="auth-wizard-actions">
            <Button kind="line" size="md" onClick={onBack}>
              {t.back}
            </Button>
            <span className="auth-actions-note">
              {t.signupOfferActionsNote(services.length)}
            </span>
            <div className="auth-spacer" />
            <Kbd>{t.enterKey}</Kbd>
            <Button kind="volt" size="md" onClick={() => onContinue(services)}>
              {t.continueBtn}
            </Button>
          </div>
        </div>

        {/* Right Preview Pane */}
        <div className="auth-wizard-preview">
          <div className="auth-preview-header-line">
            <span className="auth-card-kicker">{t.customerSeeHeader}</span>
            <Tag tone="volt">{t.liveBadge}</Tag>
          </div>
          <PhonePreview
            businessName="Nuqta Car Care"
            variant="offer"
            services={services}
            lang={lang}
            caption={t.phonePreviewCaptionOffer}
          />
        </div>
      </div>
    </div>
  );
}
