"use client";

import React from "react";
import { getCreditCopy, CreditLang } from "./copy";

interface CreditStatesProps {
  state: "loading" | "empty" | "filtered" | "offline";
  lang?: CreditLang;
  onReset?: () => void;
  onAction?: () => void;
}

export function CreditStates({
  state,
  lang = "en",
  onReset,
  onAction,
}: CreditStatesProps) {
  const t = getCreditCopy(lang);

  if (state === "loading") {
    return (
      <div className="crd-root" aria-busy="true" aria-label={t.loadingAccounts}>
        {/* Header with Title and Subtitle */}
        <header className="crd-header">
          <div className="crd-title-group">
            <h1 className="crd-title">{t.creditTitle}</h1>
            <p className="crd-subtitle">{t.loadingAccounts}</p>
          </div>
          <button type="button" className="u-btn u-btn--line" disabled>
            {t.btnSendReminders}
          </button>
        </header>

        {/* Owed Band Skeleton */}
        <div className="crd-band" style={{ minBlockSize: "9rem", opacity: 0.7 }}>
          <div className="crd-band-main" style={{ gap: "1rem" }}>
            <div style={{ inlineSize: "6rem", blockSize: "0.875rem", background: "var(--band-line)", borderRadius: "var(--radius-xs)" }} />
            <div style={{ inlineSize: "14rem", blockSize: "2.5rem", background: "var(--band-line)", borderRadius: "var(--radius-sm)" }} />
            <div style={{ inlineSize: "100%", maxInlineSize: "28rem", blockSize: "0.5rem", background: "var(--band-line)", borderRadius: "var(--radius-xs)" }} />
          </div>
        </div>

        {/* Table Skeleton */}
        <div className="crd-panel" style={{ minBlockSize: "20rem", padding: "1.5rem", gap: "1rem" }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1.5rem",
                padding: "0.75rem 0",
                borderBlockEnd: "var(--rule-hairline) solid var(--line)",
              }}
            >
              <div style={{ inlineSize: "12rem", blockSize: "1.25rem", background: "var(--subtle)", borderRadius: "var(--radius-xs)" }} />
              <div style={{ inlineSize: "6rem", blockSize: "1.25rem", background: "var(--subtle)", borderRadius: "var(--radius-xs)" }} />
              <div style={{ inlineSize: "10rem", blockSize: "0.5rem", background: "var(--subtle)", borderRadius: "var(--radius-xs)" }} />
              <div style={{ inlineSize: "5rem", blockSize: "1.25rem", background: "var(--subtle)", borderRadius: "var(--radius-xs)" }} />
              <div style={{ marginInlineStart: "auto", inlineSize: "7rem", blockSize: "1.25rem", background: "var(--subtle)", borderRadius: "var(--radius-xs)" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="crd-root">
        <header className="crd-header">
          <div className="crd-title-group">
            <h1 className="crd-title">{t.creditTitle}</h1>
            <p className="crd-subtitle">{t.creditSubtitle}</p>
          </div>
          <button
            type="button"
            className="u-btn u-btn--line"
            onClick={onAction}
          >
            {t.btnGiveCredit}
          </button>
        </header>

        <section
          className="crd-panel"
          style={{
            minBlockSize: "24rem",
            alignItems: "center",
            justifyContent: "center",
            padding: "3rem 1.5rem",
            textAlign: "center",
            gap: "1rem",
          }}
          aria-label={t.emptyTitle}
        >
          <div
            style={{
              inlineSize: "3.5rem",
              blockSize: "3.5rem",
              borderRadius: "var(--radius-full)",
              background: "var(--subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.5rem",
            }}
          >
            📋
          </div>
          <h2 style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, margin: 0 }}>
            {t.emptyTitle}
          </h2>
          <p
            style={{
              fontSize: "var(--font-size-sm)",
              color: "var(--text-muted)",
              maxInlineSize: "28rem",
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {t.emptySubtitle}
          </p>
          <button
            type="button"
            className="u-btn u-btn--volt"
            style={{ marginBlockStart: "0.5rem" }}
            onClick={onAction}
          >
            {t.btnGiveCredit}
          </button>
        </section>
      </div>
    );
  }

  if (state === "filtered") {
    return (
      <div className="crd-root">
        <header className="crd-header">
          <div className="crd-title-group">
            <h1 className="crd-title">{t.creditTitle}</h1>
            <p className="crd-subtitle">{t.creditSubtitle}</p>
          </div>
        </header>

        <section
          className="crd-panel"
          style={{
            minBlockSize: "18rem",
            alignItems: "center",
            justifyContent: "center",
            padding: "3rem 1.5rem",
            textAlign: "center",
            gap: "0.75rem",
          }}
        >
          <span style={{ fontSize: "var(--font-size-base)", fontWeight: 500 }}>
            {lang === "ar" ? "لا توجد حسابات مطابقة للبحث" : "No accounts match this filter"}
          </span>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
            {lang === "ar" ? "جرّب مسح البحث أو تغيير معايير التصفية" : "Try clearing the search or choosing another filter chip."}
          </span>
          <button
            type="button"
            className="u-btn u-btn--line"
            style={{ marginBlockStart: "0.5rem" }}
            onClick={onReset}
          >
            {lang === "ar" ? "إعادة تعيين الفلاتر" : "Reset filters"}
          </button>
        </section>
      </div>
    );
  }

  if (state === "offline") {
    return (
      <div className="crd-root">
        {/* Offline Warning Banner */}
        <div
          style={{
            background: "var(--warn-soft)",
            border: "var(--rule-hairline) solid var(--warn)",
            borderRadius: "var(--radius-md)",
            padding: "0.75rem 1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            color: "var(--text)",
            fontSize: "var(--font-size-sm)",
          }}
          role="alert"
        >
          <span style={{ color: "var(--warn-text)", fontWeight: 600 }}>⚠</span>
          <span>{t.offlineNotice}</span>
        </div>

        {/* Normal header below offline banner */}
        <header className="crd-header">
          <div className="crd-title-group">
            <h1 className="crd-title">{t.creditTitle}</h1>
            <p className="crd-subtitle">{t.creditSubtitle}</p>
          </div>
        </header>
      </div>
    );
  }

  return null;
}
