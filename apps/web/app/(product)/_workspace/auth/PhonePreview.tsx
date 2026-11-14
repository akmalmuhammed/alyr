"use client";

import React from "react";
import type { ServiceItem } from "./fixtures";
import type { LanguageChoice } from "./logic";

export interface PhonePreviewProps {
  businessName: string;
  variant?: "type" | "offer" | "plan";
  services?: ServiceItem[];
  lang?: LanguageChoice;
  caption?: string;
  liveBadgeText?: string;
}

export function PhonePreview({
  businessName,
  variant = "type",
  services = [],
  lang = "en",
  caption,
  liveBadgeText = "Live"
}: PhonePreviewProps) {
  const isAr = lang === "ar";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-md)" }}>
      {variant === "offer" && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
          <span style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
            {isAr ? "ما يراه عملاؤك" : "What your customers see"}
          </span>
          <span
            style={{
              padding: "0.125rem 0.375rem",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--volt)",
              color: "var(--text-inv)",
              fontSize: "0.625rem",
              fontWeight: 700,
              textTransform: "uppercase"
            }}
          >
            {liveBadgeText}
          </span>
        </div>
      )}

      <div className="auth-phone-frame">
        {/* Phone Status bar */}
        <div className="auth-phone-bar">
          <span>09:40</span>
          <span>5G</span>
        </div>

        {/* WhatsApp Header */}
        <div className="auth-phone-header">
          <div className="auth-phone-avatar">{businessName[0] || "N"}</div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text)" }}>{businessName}</span>
            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
              {isAr ? "حساب تجاري" : "Business account"}
            </span>
          </div>
        </div>

        {/* Chat conversation */}
        <div className="auth-phone-chat">
          {variant === "type" && (
            <>
              <div className="auth-phone-bubble auth-phone-bubble--in">
                <span>{isAr ? "مرحباً، كم سعر الغسيل الكامل؟" : "Hi, how much is a full wash?"}</span>
                <span className="auth-phone-bubble-meta">09:38</span>
              </div>

              <div className="auth-phone-bubble auth-phone-bubble--out">
                <span>
                  {isAr
                    ? "أهلاً بك، هذا حساب نشاطك التجاري على واتساب. الغسيل الكامل بـ 60 ر.ق ويستغرق 40 دقيقة. هل تود الحجز؟"
                    : "Hello, this is your business on WhatsApp. A full wash is QAR 60 and takes 40 minutes. Would you like to book?"}
                </span>
                <span className="auth-phone-bubble-meta">09:38 · {isAr ? "رد تلقائي" : "automatic reply"}</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
                <div className="auth-phone-action">{isAr ? "احجز زيارة" : "Book a visit"}</div>
                <div style={{ display: "flex", gap: "var(--space-xs)" }}>
                  <div className="auth-phone-action" style={{ flex: 1 }}>
                    {isAr ? "قائمة الأسعار" : "Price list"}
                  </div>
                  <div className="auth-phone-action" style={{ flex: 1 }}>
                    {isAr ? "موظف" : "A person"}
                  </div>
                </div>
              </div>
            </>
          )}

          {variant === "offer" && (
            <>
              <div className="auth-phone-bubble auth-phone-bubble--in">
                <span>{isAr ? "ما هي أسعاركم؟" : "What are your prices?"}</span>
                <span className="auth-phone-bubble-meta">09:40</span>
              </div>

              <div className="auth-phone-bubble auth-phone-bubble--out">
                <span style={{ fontWeight: 500, marginBottom: "var(--space-xs)" }}>
                  {isAr ? `إليك قائمة أسعارنا في ${businessName}:` : `Here is our price list at ${businessName}:`}
                </span>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginBlock: "var(--space-xs)" }}>
                  {services.map((s, idx) => (
                    <div
                      key={s.id || idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingBlock: "0.125rem",
                        borderBottom: "var(--rule-hairline) solid var(--line)",
                        fontSize: "var(--text-xs)"
                      }}
                    >
                      <span style={{ fontWeight: idx === 1 ? 600 : 400 }}>{s.name}</span>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontSize: "0.625rem" }}>
                        {s.length}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                        {isAr ? `${s.price}\u00a0ر.ق` : `QAR ${s.price}`}
                      </span>
                    </div>
                  ))}
                </div>

                <span style={{ fontSize: "0.6875rem", color: "var(--text)", marginTop: "var(--space-xs)" }}>
                  {isAr
                    ? "تتطلب طبقة النانو سيراميك عربوناً قدره 300 ر.ق لحجز الموعد."
                    : "Ceramic coating needs a QAR 300 deposit to hold the slot."}
                </span>

                <span className="auth-phone-bubble-meta">09:40 · {isAr ? "رد تلقائي" : "automatic reply"}</span>
              </div>

              <div className="auth-phone-action">{isAr ? "احجز زيارة" : "Book a visit"}</div>
            </>
          )}

          {variant === "plan" && (
            <>
              <div className="auth-phone-bubble auth-phone-bubble--in">
                <span>{isAr ? "أريد حجز غسيل كامل" : "I want to book a full wash"}</span>
                <span className="auth-phone-bubble-meta">09:30</span>
              </div>

              <div className="auth-phone-bubble auth-phone-bubble--out">
                <span>
                  {isAr
                    ? "تم الحجز: غسيل كامل، الخميس 17:00 في السد. سنرسل لك تذكيراً في اليوم السابق."
                    : "Booked: Full wash, Thursday 17:00 at Al Sadd. We will remind you the day before."}
                </span>
                <span className="auth-phone-bubble-meta">09:31 · {isAr ? "رد تلقائي" : "automatic reply"}</span>
              </div>
            </>
          )}
        </div>

        {/* WhatsApp Footer */}
        <div className="auth-phone-foot">
          <div
            style={{
              flex: 1,
              height: "2.125rem",
              borderRadius: "1rem",
              backgroundColor: "var(--subtle)",
              display: "flex",
              alignItems: "center",
              paddingInline: "var(--space-md)",
              fontSize: "var(--text-xs)",
              color: "var(--text-faint)"
            }}
          >
            {isAr ? "رسالة" : "Message"}
          </div>
          <div
            style={{
              width: "2.125rem",
              height: "2.125rem",
              borderRadius: "50%",
              backgroundColor: "var(--band)",
              color: "var(--text-inv)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--text-xs)"
            }}
          >
            ➤
          </div>
        </div>
      </div>

      {caption && <span className="auth-phone-caption">{caption}</span>}
    </div>
  );
}
