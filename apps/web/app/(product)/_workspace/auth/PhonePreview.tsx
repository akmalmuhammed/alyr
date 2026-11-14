"use client";

import React from "react";
import { Icon } from "../../../_ui";
import type { ServiceItem } from "./fixtures";
import type { LanguageChoice } from "./logic";

export interface PhonePreviewProps {
  businessName: string;
  variant?: "type" | "offer" | "plan";
  subTitle?: string;
  services?: ServiceItem[];
  lang?: LanguageChoice;
  caption?: string;
}

export function PhonePreview({
  businessName,
  variant = "type",
  subTitle,
  services = [],
  lang = "en",
  caption
}: PhonePreviewProps) {
  const isAr = lang === "ar";
  const avatarLetter = businessName ? businessName[0] : "N";

  return (
    <div className="auth-phone-wrap">
      <div className="auth-phone-frame">
        {/* Phone Top Status Bar */}
        <div className="auth-phone-bar">
          <span className="auth-phone-bar-time">09:40</span>
          <span className="auth-phone-bar-network">5G</span>
        </div>

        {/* WhatsApp App Bar */}
        <div className="auth-phone-header">
          <Icon name="left" size="sm" className="auth-phone-header-back" />
          <div className="auth-phone-avatar">{avatarLetter}</div>
          <div className="auth-phone-header-info">
            <span className="auth-phone-title">{businessName}</span>
            <span className="auth-phone-subtitle">
              {subTitle || (isAr ? "حساب تجاري" : "Business account")}
            </span>
          </div>
          <Icon name="dots" size="sm" className="auth-phone-header-more" />
        </div>

        {/* WhatsApp Chat Paper */}
        <div className="auth-phone-chat">
          {variant === "type" && (
            <>
              {/* Customer message */}
              <div className="auth-wa-bubble auth-wa-bubble--customer">
                <span className="auth-wa-bubble-text">
                  {isAr ? "مرحباً، كم سعر الغسيل الكامل؟" : "Hi, how much is a full wash?"}
                </span>
                <span className="auth-wa-bubble-time">09:38</span>
              </div>

              {/* Business auto-reply */}
              <div className="auth-wa-bubble auth-wa-bubble--business">
                <span className="auth-wa-bubble-text">
                  {isAr
                    ? "أهلاً بك، هذا حساب نشاطك التجاري على واتساب. الغسيل الكامل بـ 60 ر.ق ويستغرق 40 دقيقة. هل تود الحجز؟"
                    : "Hello, this is your business on WhatsApp. A full wash is QAR 60 and takes 40 minutes. Would you like to book?"}
                </span>
                <span className="auth-wa-bubble-time">
                  09:38 · {isAr ? "رد تلقائي" : "automatic reply"}
                </span>
              </div>

              {/* Quick reply buttons */}
              <div className="auth-wa-actions">
                <div className="auth-wa-chip">
                  {isAr ? "احجز زيارة" : "Book a visit"}
                </div>
                <div className="auth-wa-chips-row">
                  <div className="auth-wa-chip auth-wa-chip--half">
                    {isAr ? "قائمة الأسعار" : "Price list"}
                  </div>
                  <div className="auth-wa-chip auth-wa-chip--half">
                    {isAr ? "موظف" : "A person"}
                  </div>
                </div>
              </div>

              {/* Customer choice */}
              <div className="auth-wa-bubble auth-wa-bubble--customer">
                <span className="auth-wa-bubble-text">
                  {isAr ? "احجز زيارة" : "Book a visit"}
                </span>
                <span className="auth-wa-bubble-time">09:39</span>
              </div>

              {/* Business slot proposal */}
              <div className="auth-wa-bubble auth-wa-bubble--business">
                <span className="auth-wa-bubble-text">
                  {isAr
                    ? "اليوم في السد: 17:00 أو 17:40 أو 18:20. اضغط على الوقت لتأكيده."
                    : "Today at Al Sadd: 17:00, 17:40 or 18:20. Tap a time to book it."}
                </span>
                <span className="auth-wa-bubble-time">
                  09:39 · {isAr ? "رد تلقائي" : "automatic reply"}
                </span>
              </div>
            </>
          )}

          {variant === "offer" && (
            <>
              {/* Customer message */}
              <div className="auth-wa-bubble auth-wa-bubble--customer">
                <span className="auth-wa-bubble-text">
                  {isAr ? "ما هي أسعاركم؟" : "What are your prices?"}
                </span>
                <span className="auth-wa-bubble-time">09:40</span>
              </div>

              {/* Business auto-reply with full price list */}
              <div className="auth-wa-bubble auth-wa-bubble--business auth-wa-bubble--pricelist">
                <span className="auth-wa-bubble-text auth-wa-bubble-lead">
                  {isAr
                    ? `إليك قائمة أسعار ${businessName}:`
                    : `Here is our price list at ${businessName}:`}
                </span>

                <div className="auth-wa-prices-table">
                  {services.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`auth-wa-price-row ${idx === 1 ? "auth-wa-price-row--focus" : ""}`}
                    >
                      {idx === 1 ? <span className="auth-wa-focus-indicator" /> : null}
                      <span className={`auth-wa-service-name ${idx === 1 ? "auth-wa-service-name--focus" : ""}`}>
                        {item.name}
                      </span>
                      <div className="auth-spacer" />
                      <span className="auth-wa-service-length">{item.length}</span>
                      <span className="auth-wa-service-price">
                        {isAr ? `${item.price}\u00a0ر.ق` : `QAR ${item.price}`}
                      </span>
                    </div>
                  ))}
                </div>

                <span className="auth-wa-bubble-deposit-note">
                  {isAr
                    ? "تلميع السيراميك يتطلب عربوناً قدره 300\u00a0ر.ق لتثبيت الموعد."
                    : "Ceramic coating needs a QAR 300 deposit to hold the slot."}
                </span>

                <span className="auth-wa-bubble-time">
                  09:40 · {isAr ? "رد تلقائي" : "automatic reply"}
                </span>
              </div>

              {/* Quick action button */}
              <div className="auth-wa-actions">
                <div className="auth-wa-chip">
                  {isAr ? "احجز زيارة" : "Book a visit"}
                </div>
              </div>
            </>
          )}

          {variant === "plan" && (
            <>
              {/* Customer booking request */}
              <div className="auth-wa-bubble auth-wa-bubble--customer">
                <span className="auth-wa-bubble-text">
                  {isAr ? "أريد حجز غسيل كامل" : "I want to book a full wash"}
                </span>
                <span className="auth-wa-bubble-time">09:30</span>
              </div>

              {/* Confirmation auto-reply */}
              <div className="auth-wa-bubble auth-wa-bubble--business">
                <span className="auth-wa-bubble-text">
                  {isAr
                    ? "تم الحجز: غسيل كامل، الخميس 17:00 في فرع السد. سنرسل لك تذكيراً في اليوم السابق للموعد."
                    : "Booked: Full wash, Thursday 17:00 at Al Sadd. We will remind you the day before."}
                </span>
                <span className="auth-wa-bubble-time">
                  09:31 · {isAr ? "رد تلقائي" : "automatic reply"}
                </span>
              </div>
            </>
          )}
        </div>

        {/* WhatsApp Bottom Input Bar */}
        <div className="auth-phone-foot">
          <div className="auth-phone-input-pill">
            <span>{isAr ? "رسالة" : "Message"}</span>
          </div>
          <div className="auth-phone-send-action">
            <Icon name="send" size="sm" />
          </div>
        </div>
      </div>

      {caption ? <p className="auth-phone-caption">{caption}</p> : null}
    </div>
  );
}
