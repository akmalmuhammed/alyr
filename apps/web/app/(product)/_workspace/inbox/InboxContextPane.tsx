"use client";

import React from "react";
import { Avatar, Button, KV, KVList, Status, Tag, UiIcon } from "../../../_ui";
import { copy, type Lang } from "./copy";
import type { CustomerContextData } from "./fixtures";

export interface InboxContextPaneProps {
  data: CustomerContextData;
  lang: Lang;
}

export function InboxContextPane({ data, lang }: { data: CustomerContextData; lang: Lang }) {
  const t = copy(lang);

  return (
    <aside className="ibx-pane-context" aria-label={t.profileLink}>
      {/* Section 1: Customer Identity & Stats */}
      <div className="ibx-ctx-sec">
        <div className="ibx-ctx-header">
          <Avatar name={data.name} size={44} />
          <div>
            <div className="ibx-ctx-name">{data.name}</div>
            <div className="ibx-ctx-phone">{data.phone}</div>
          </div>
          <button
            type="button"
            style={{
              marginInlineStart: "auto",
              background: "none",
              border: "none",
              textDecoration: "underline",
              fontSize: "var(--font-size-xs)",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {t.profileLink}
          </button>
        </div>

        {/* Tags */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", flexWrap: "wrap", marginBlock: "var(--space-1)" }}>
          {data.tags.map((tag) => (
            <Tag key={tag} tone="n">
              {lang === "ar"
                ? tag === "Regular"
                  ? "دائم"
                  : tag === "Ceramic"
                  ? "سيراميك"
                  : tag === "New this year"
                  ? "جديد هذا العام"
                  : tag
                : tag}
            </Tag>
          ))}
          <button
            type="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-1)",
              padding: "0 var(--space-2)",
              height: "1.375rem",
              borderRadius: "var(--radius-sm)",
              border: "var(--rule-hairline) dashed var(--line-strong)",
              background: "transparent",
              fontSize: "var(--font-size-xs)",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            <UiIcon name="plus" className="u-ico" style={{ width: 10, height: 10 }} />
            <span>{t.addLabel}</span>
          </button>
        </div>

        {/* 3 Stats */}
        <div className="ibx-ctx-stats">
          <div className="ibx-ctx-stat">
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{t.visitsStat}</span>
            <span className="ibx-ctx-stat-val">{data.visits}</span>
          </div>
          <div className="ibx-ctx-stat">
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{t.spentStat}</span>
            <span className="ibx-ctx-stat-val">
              {lang === "ar" ? data.spent.replace("QAR ", "").trim() + "\u00a0ر.ق" : data.spent}
            </span>
          </div>
          <div className="ibx-ctx-stat">
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{t.sinceStat}</span>
            <span className="ibx-ctx-stat-val">
              {lang === "ar" && data.since === "Mar 2025"
                ? "مارس 2025"
                : lang === "ar" && data.since === "Jun 2026"
                ? "يونيو 2026"
                : data.since}
            </span>
          </div>
        </div>
      </div>

      {/* Section 2: Owes */}
      <div className="ibx-ctx-sec">
        <div className="ibx-ctx-sec-title">
          <span>{t.owesTitle}</span>
          {data.credit && (
            <button
              type="button"
              style={{
                background: "none",
                border: "none",
                textDecoration: "underline",
                fontSize: "var(--font-size-xs)",
                fontWeight: 500,
                cursor: "pointer",
                color: "inherit",
              }}
            >
              {t.creditAccountLink}
            </button>
          )}
        </div>

        {data.owesAmount ? (
          <div>
            <div style={{ fontSize: "1.25rem", fontWeight: 600, color: "var(--text)" }}>
              {t.owesDays(
                lang === "ar"
                  ? data.owesAmount.replace("QAR ", "").trim() + "\u00a0ر.ق"
                  : data.owesAmount,
                data.owesDays || 0
              )}
            </div>
            <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--font-size-xs)", color: "var(--text-muted)", lineHeight: 1.4 }}>
              {data.owesNote
                ? lang === "ar"
                  ? data.owesNote
                      .replace("Ceramic top-up on account, 28 Oct. Limit QAR 500. No promise to pay yet.", "طلاء سيراميك إضافي على الحساب، 28 أكتوبر. الحد 500\u00a0ر.ق. لا يوجد وعد بالسداد بعد.")
                      .replace("QAR 500", "500\u00a0ر.ق")
                  : data.owesNote
                : t.limitAndPromise(lang === "ar" ? "500\u00a0ر.ق" : "QAR 500")}
            </p>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, color: "var(--text)" }}>
              {t.nothingOwed}
            </div>
            <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--font-size-xs)", color: "var(--text-muted)", lineHeight: 1.4 }}>
              {t.noCreditAccountSub}
            </p>
          </div>
        )}
      </div>

      {/* Section 3: Next Booking */}
      <div className="ibx-ctx-sec">
        <div className="ibx-ctx-sec-title">
          <span>{t.nextBookingTitle}</span>
          {data.booking && (
            <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
              {lang === "ar" ? `الحجز ${data.booking.number}` : `Booking ${data.booking.number}`}
            </span>
          )}
        </div>

        {data.booking ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <div
              style={{
                padding: "var(--space-3)",
                borderRadius: "var(--radius-sm)",
                border: "var(--rule-hairline) solid var(--line)",
                background: "var(--surface-subtle)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-1)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-sm)", fontWeight: 600 }}>
                  {lang === "ar" && data.booking.time === "Sat 14 Nov 08:00"
                    ? "السبت 14 نوفمبر 08:00"
                    : data.booking.time}
                </span>
                <Status tone="ok">
                  {lang === "ar" && data.booking.sub === "Booked" ? "مؤكد" : data.booking.sub}
                </Status>
              </div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                {lang === "ar" && data.booking.title === "Ceramic coating · 4 h · Ceramic · Bilal"
                  ? "طلاء سيراميك · 4 س · سيراميك · بلال"
                  : data.booking.title}
              </div>
              <div style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                {lang === "ar" && data.booking.deposit.includes("Deposit QAR 300 paid")
                  ? `عربون 300\u00a0ر.ق مدفوع · ${data.booking.deposit.split("· ")[1] || "R-2026-1893"}`
                  : data.booking.deposit}
              </div>
            </div>

            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <Button kind="line" size="xs">
                {t.btnMove}
              </Button>
              <Button kind="quiet" size="xs">
                {t.btnOpenBooking}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, color: "var(--text)" }}>
              {t.noBookingAhead}
            </div>
            <p style={{ margin: "var(--space-1) 0 var(--space-2)", fontSize: "var(--font-size-xs)", color: "var(--text-muted)", lineHeight: 1.4 }}>
              {t.lastVisitSub("Full wash, Mon 2 Nov")}
            </p>
            <Button kind="line" size="xs">
              {t.btnBookForHer}
            </Button>
          </div>
        )}
      </div>

      {/* Section 4: Last Orders */}
      <div className="ibx-ctx-sec">
        <div className="ibx-ctx-sec-title">
          <span>{t.lastOrdersTitle}</span>
          <button
            type="button"
            style={{
              background: "none",
              border: "none",
              textDecoration: "underline",
              fontSize: "var(--font-size-xs)",
              fontWeight: 500,
              cursor: "pointer",
              color: "inherit",
            }}
          >
            {t.allOrdersLink(7)}
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {data.orders.map((o) => (
            <div
              key={o.number}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "var(--font-size-xs)",
              }}
            >
              <div>
                <div style={{ color: "var(--text)", fontWeight: 500 }}>
                  {lang === "ar"
                    ? o.name
                        .replace("Tyre shine", "ملمع إطارات")
                        .replace("Air freshener", "معطر جو")
                        .replace("Carnauba wax 500 ml", "شمع كارنوبا 500 مل")
                        .replace("Microfibre cloth pack × 2", "عبوة مناشف مايكروفايبر × 2")
                    : o.name}
                </div>
                <div style={{ fontFamily: "var(--font-ui-mono)", color: "var(--text-muted)" }}>
                  {lang === "ar"
                    ? o.number
                        .replace("Order", "الطلب")
                        .replace("3 Nov", "3 نوفمبر")
                        .replace("21 Oct", "21 أكتوبر")
                        .replace("6 Oct", "6 أكتوبر")
                        .replace("paid", "مدفوع")
                    : o.number}
                </div>
              </div>
              <div style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 600, color: "var(--text)" }}>
                {lang === "ar" ? o.total.replace("QAR ", "").trim() + "\u00a0ر.ق" : o.total}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 5: Messages Allowed Compliance */}
      <div className="ibx-ctx-sec" style={{ borderBlockEnd: "none" }}>
        <div className="ibx-ctx-sec-title">
          <span>{t.messagesAllowedTitle}</span>
        </div>

        <KVList>
          {data.allow.map((a) => (
            <KV
              key={a.purpose}
              k={
                lang === "ar"
                  ? a.purpose === "Bookings and receipts"
                    ? "الحجوزات والإيصالات"
                    : a.purpose === "Offers"
                    ? "العروض"
                    : a.purpose === "Back in stock"
                    ? "توفر المنتجات"
                    : a.purpose === "Price group"
                    ? "فئة السعر"
                    : a.purpose === "Writes in"
                    ? "لغة المحادثة"
                    : a.purpose
                  : a.purpose
              }
              className={a.off ? "u-text-muted" : undefined}
            >
              {lang === "ar"
                ? a.status
                    .replace("Agreed · 14 Mar 2025", "موافق · 14 مارس 2025")
                    .replace("Agreed · 2 Jun 2025", "موافق · 2 يونيو 2025")
                    .replace("Agreed · 8 Jun 2026", "موافق · 8 يونيو 2026")
                    .replace("Not agreed", "غير موافق")
                    .replace("Not asked", "لم يُطلب")
                    .replace("Standard", "قياسي")
                    .replace("Arabic, English", "العربية، الإنجليزية")
                : a.status}
            </KV>
          ))}
        </KVList>
      </div>
    </aside>
  );
}
