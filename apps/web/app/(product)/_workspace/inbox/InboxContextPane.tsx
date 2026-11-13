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
              {tag}
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
            <span className="ibx-ctx-stat-val">{data.spent}</span>
          </div>
          <div className="ibx-ctx-stat">
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{t.sinceStat}</span>
            <span className="ibx-ctx-stat-val">{data.since}</span>
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
              {t.owesDays(data.owesAmount, data.owesDays || 0)}
            </div>
            <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--font-size-xs)", color: "var(--text-muted)", lineHeight: 1.4 }}>
              {data.owesNote || t.limitAndPromise("QAR 500")}
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
              Booking {data.booking.number}
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
                  {data.booking.time}
                </span>
                <Status tone="ok">{data.booking.sub}</Status>
              </div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                {data.booking.title}
              </div>
              <div style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                {data.booking.deposit}
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
                <div style={{ color: "var(--text)", fontWeight: 500 }}>{o.name}</div>
                <div style={{ fontFamily: "var(--font-ui-mono)", color: "var(--text-muted)" }}>{o.number}</div>
              </div>
              <div style={{ fontFamily: "var(--font-ui-mono)", fontWeight: 600, color: "var(--text)" }}>
                {o.total}
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
              k={a.purpose}
              className={a.off ? "u-text-muted" : undefined}
            >
              {a.status}
            </KV>
          ))}
        </KVList>
      </div>
    </aside>
  );
}
