"use client";

import React, { useState } from "react";
import { Button, Kbd, Status } from "../../../_ui";
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

export function SignUpGuidedSetup({
  t,
  lang,
  onBack,
  onContinue
}: SignUpGuidedSetupProps) {
  const [services, setServices] = useState<ServiceItem[]>(FIXTURE_SERVICES);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceLength, setNewServiceLength] = useState("30 min");
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
      length: newServiceLength,
      price: newServicePrice.trim() || "50",
      deposit: newServiceDeposit.trim()
    };
    setServices((prev) => [...prev, newItem]);
    setNewServiceName("");
    setNewServicePrice("");
    setNewServiceDeposit("");
  };

  return (
    <div className="auth-wizard">
      <div className="auth-wizard-content">
        {/* Left Form */}
        <div className="auth-wizard-step">
          <div className="auth-card-header">
            <span className="auth-card-kicker">{t.signupOfferKicker}</span>
            <h1 className="auth-card-title">{t.signupOfferTitle}</h1>
            <p className="auth-card-subtitle">{t.signupOfferSubtitle}</p>
          </div>

          {/* Price list panel */}
          <div className="auth-price-panel">
            <div className="auth-price-header">
              <span className="auth-price-cell-service">{t.colService}</span>
              <span className="auth-price-cell-fixed">{t.colLength}</span>
              <span className="auth-price-cell-fixed">{t.colPrice}</span>
              <span className="auth-price-cell-fixed">{t.colDeposit}</span>
              <span className="auth-price-cell-action" />
            </div>

            {services.map((s, idx) => (
              <div
                key={s.id}
                className={`auth-price-row ${idx === 1 ? "auth-price-row--focus" : ""}`}
              >
                <div className="auth-price-cell-service">
                  <input
                    type="text"
                    value={s.name}
                    onChange={(e) => handleUpdate(s.id, "name", e.target.value)}
                    style={{
                      width: "100%",
                      height: "2.125rem",
                      paddingInline: "var(--space-sm)",
                      border: "var(--rule-hairline) solid var(--line)",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "var(--surface)",
                      fontSize: "var(--text-sm)",
                      color: "var(--text)",
                      outline: "none"
                    }}
                  />
                </div>

                <div className="auth-price-cell-fixed">
                  <select
                    value={s.length}
                    onChange={(e) => handleUpdate(s.id, "length", e.target.value)}
                    style={{
                      width: "100%",
                      height: "2.125rem",
                      paddingInline: "var(--space-xs)",
                      border: "var(--rule-hairline) solid var(--line)",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "var(--surface)",
                      fontSize: "var(--text-xs)",
                      color: "var(--text)",
                      outline: "none"
                    }}
                  >
                    <option value="20 min">20 min</option>
                    <option value="30 min">30 min</option>
                    <option value="40 min">40 min</option>
                    <option value="60 min">60 min</option>
                    <option value="90 min">90 min</option>
                    <option value="4 h">4 h</option>
                  </select>
                </div>

                <div className="auth-price-cell-fixed" style={{ position: "relative" }}>
                  <input
                    type="text"
                    value={s.price}
                    onChange={(e) => handleUpdate(s.id, "price", e.target.value)}
                    style={{
                      width: "100%",
                      height: "2.125rem",
                      paddingInlineStart: "var(--space-sm)",
                      paddingInlineEnd: "2.25rem",
                      border: "var(--rule-hairline) solid var(--line)",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "var(--surface)",
                      fontSize: "var(--text-sm)",
                      fontFamily: "var(--font-mono)",
                      color: "var(--text)",
                      outline: "none"
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      insetInlineEnd: "var(--space-xs)",
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: "0.625rem",
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-faint)"
                    }}
                  >
                    {lang === "ar" ? "ر.ق" : "QAR"}
                  </span>
                </div>

                <div className="auth-price-cell-fixed" style={{ position: "relative" }}>
                  <input
                    type="text"
                    value={s.deposit}
                    placeholder="None"
                    onChange={(e) => handleUpdate(s.id, "deposit", e.target.value)}
                    style={{
                      width: "100%",
                      height: "2.125rem",
                      paddingInlineStart: "var(--space-sm)",
                      paddingInlineEnd: "2.25rem",
                      border: "var(--rule-hairline) solid var(--line)",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: "var(--surface)",
                      fontSize: "var(--text-sm)",
                      fontFamily: "var(--font-mono)",
                      color: "var(--text)",
                      outline: "none"
                    }}
                  />
                  {s.deposit && (
                    <span
                      style={{
                        position: "absolute",
                        insetInlineEnd: "var(--space-xs)",
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: "0.625rem",
                        fontFamily: "var(--font-mono)",
                        color: "var(--text-faint)"
                      }}
                    >
                      {lang === "ar" ? "ر.ق" : "QAR"}
                    </span>
                  )}
                </div>

                <div className="auth-price-cell-action">
                  <button
                    type="button"
                    onClick={() => handleRemove(s.id)}
                    aria-label={`Remove ${s.name}`}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-faint)",
                      cursor: "pointer",
                      fontSize: "var(--text-xs)"
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}

            {/* Add row */}
            <div className="auth-price-row" style={{ backgroundColor: "var(--subtle)" }}>
              <div className="auth-price-cell-service">
                <input
                  type="text"
                  value={newServiceName}
                  placeholder={t.newServicePlaceholder}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAdd();
                    }
                  }}
                  style={{
                    width: "100%",
                    height: "2.125rem",
                    paddingInline: "var(--space-sm)",
                    border: "var(--rule-hairline) solid var(--line)",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "var(--surface)",
                    fontSize: "var(--text-sm)",
                    color: "var(--text)",
                    outline: "none"
                  }}
                />
              </div>

              <div className="auth-price-cell-fixed">
                <select
                  value={newServiceLength}
                  onChange={(e) => setNewServiceLength(e.target.value)}
                  style={{
                    width: "100%",
                    height: "2.125rem",
                    paddingInline: "var(--space-xs)",
                    border: "var(--rule-hairline) solid var(--line)",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "var(--surface)",
                    fontSize: "var(--text-xs)",
                    color: "var(--text)",
                    outline: "none"
                  }}
                >
                  <option value="20 min">20 min</option>
                  <option value="30 min">30 min</option>
                  <option value="40 min">40 min</option>
                  <option value="60 min">60 min</option>
                  <option value="90 min">90 min</option>
                  <option value="4 h">4 h</option>
                </select>
              </div>

              <div className="auth-price-cell-fixed">
                <input
                  type="text"
                  value={newServicePrice}
                  placeholder="Price"
                  onChange={(e) => setNewServicePrice(e.target.value)}
                  style={{
                    width: "100%",
                    height: "2.125rem",
                    paddingInline: "var(--space-sm)",
                    border: "var(--rule-hairline) solid var(--line)",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "var(--surface)",
                    fontSize: "var(--text-sm)",
                    fontFamily: "var(--font-mono)",
                    color: "var(--text)",
                    outline: "none"
                  }}
                />
              </div>

              <div className="auth-price-cell-fixed">
                <input
                  type="text"
                  value={newServiceDeposit}
                  placeholder="Deposit"
                  onChange={(e) => setNewServiceDeposit(e.target.value)}
                  style={{
                    width: "100%",
                    height: "2.125rem",
                    paddingInline: "var(--space-sm)",
                    border: "var(--rule-hairline) solid var(--line)",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "var(--surface)",
                    fontSize: "var(--text-sm)",
                    fontFamily: "var(--font-mono)",
                    color: "var(--text)",
                    outline: "none"
                  }}
                />
              </div>

              <div className="auth-price-cell-action">
                <button
                  type="button"
                  onClick={handleAdd}
                  aria-label="Add service"
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text)",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: "var(--text-sm)"
                  }}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Meta status info */}
          <div className="auth-meta-row">
            <Status tone="ok">{t.savedAsYouType}</Status>
            <span className="auth-meta-time">{t.lastSavedMeta}</span>
            <div className="auth-spacer" />
            <span>{t.photosArabicLaterNote}</span>
          </div>

          {/* Where the list is used */}
          <div className="auth-start-panel">
            <div className="auth-start-header">
              <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>{t.whereUsedTitle}</span>
            </div>

            <div className="auth-start-items">
              {t.whereUsedItems.map((item, i) => (
                <div key={i} className="auth-start-item">
                  <span className="auth-start-item-title">{item.title}</span>
                  <span className="auth-start-item-desc">{item.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Phone Preview */}
        <div className="auth-wizard-preview">
          <PhonePreview
            businessName={lang === "ar" ? "نقطة للعناية بالسيارات" : "Nuqta Car Care"}
            variant="offer"
            services={services}
            lang={lang}
            liveBadgeText={t.liveBadge}
            caption={t.phonePreviewCaptionOffer}
          />
        </div>
      </div>

      {/* Action Bar */}
      <div className="auth-wizard-actions">
        <Button kind="line" size="md" onClick={onBack}>
          {t.back}
        </Button>
        <span className="auth-wizard-note">{t.signupOfferActionsNote(services.length)}</span>
        <div className="auth-spacer" />
        <Kbd>{t.enterKey}</Kbd>
        <Button kind="volt" size="md" onClick={() => onContinue(services)}>
          {t.continueBtn}
        </Button>
      </div>
    </div>
  );
}
