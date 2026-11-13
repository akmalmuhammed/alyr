"use client";

import React, { useState } from "react";
import { Button, Panel, Radio, UiIcon } from "../../../_ui";
import { copy, type Lang } from "./copy";

export interface InboxWindowClosedProps {
  customerName: string;
  onSendTemplate: (templateName: string) => void;
  lang: Lang;
}

export function InboxWindowClosed({ customerName, onSendTemplate, lang }: InboxWindowClosedProps) {
  const t = copy(lang);
  const [selectedTemplate, setSelectedTemplate] = useState("slot_free");

  const templates = [
    {
      id: "slot_free",
      name: "Slot still free",
      sub: "Utility · Arabic and English",
      locked: false,
      preview: `Hello ${customerName.split(" ")[0]}, you asked about Interior detail. Thu 12 Nov 18:30 is still free. Reply here and we will hold it for you.`,
      buttons: "Hold it · No thanks",
    },
    {
      id: "tried_reach",
      name: "We tried to reach you",
      sub: "Utility · Arabic and English",
      locked: false,
      preview: `Hello ${customerName.split(" ")[0]}, we tried to reach you regarding your inquiry. Please reply when convenient.`,
      buttons: "Reply · Call us",
    },
    {
      id: "payment_reminder",
      name: "Payment reminder",
      sub: "Utility · she owes nothing",
      locked: true,
      preview: "",
      buttons: "",
    },
    {
      id: "november_offer",
      name: "November offer",
      sub: "Marketing · no OK to offers",
      locked: true,
      preview: "",
      buttons: "",
    },
  ];

  const current = templates.find((tpl) => tpl.id === selectedTemplate) || templates[0];

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* 24h Window Closed Banner */}
      <div className="ibx-window-closed-bar">
        <UiIcon name="info" className="u-ico" style={{ color: "var(--warn)" }} />
        <span>{t.windowClosedBanner}</span>
      </div>

      {/* Template Chooser Panel */}
      <div style={{ padding: "var(--space-4) var(--space-5)", background: "var(--surface)", borderTop: "var(--rule-hairline) solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
          <h2 style={{ margin: 0, fontSize: "var(--font-size-sm)", fontWeight: 600 }}>{t.sendTemplateTitle}</h2>
          <span style={{ fontFamily: "var(--font-ui-mono)", fontSize: "var(--font-size-xs)", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
            {t.templateCanGoCount(2, 4)}
          </span>
        </div>

        <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "flex-start", marginBottom: "var(--space-4)" }}>
          {/* Template Choices */}
          <Panel style={{ flex: 1 }}>
            {templates.map((tpl) => {
              const isSelected = selectedTemplate === tpl.id;
              return (
                <div
                  key={tpl.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-3)",
                    padding: "var(--space-3) var(--space-4)",
                    borderBottom: "var(--rule-hairline) solid var(--line)",
                    background: isSelected ? "var(--surface-subtle)" : "transparent",
                    cursor: tpl.locked ? "not-allowed" : "pointer",
                    opacity: tpl.locked ? 0.5 : 1,
                  }}
                  onClick={() => {
                    if (!tpl.locked) setSelectedTemplate(tpl.id);
                  }}
                >
                  <Radio checked={isSelected} disabled={tpl.locked} onChange={() => {}} />
                  <div>
                    <div style={{ fontSize: "var(--font-size-sm)", fontWeight: isSelected ? 600 : 400, color: "var(--text)" }}>
                      {tpl.name}
                    </div>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                      {tpl.sub}
                    </div>
                  </div>
                  {tpl.locked && (
                    <span style={{ marginInlineStart: "auto", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                      (Locked)
                    </span>
                  )}
                </div>
              );
            })}
          </Panel>

          {/* Template Live Preview */}
          <div style={{ inlineSize: "16rem", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <div
              style={{
                background: "var(--wa-out)",
                color: "var(--wa-ink)",
                borderRadius: "var(--radius-sm)",
                padding: "var(--space-2) var(--space-3)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-1)",
              }}
            >
              <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--wa-soft)" }}>
                Template · {current.name}
              </span>
              <p style={{ margin: 0, fontSize: "var(--font-size-sm)", lineHeight: 1.45 }}>
                {current.preview}
              </p>
            </div>
            {current.buttons && (
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                {t.buttonsCues(current.buttons)}
              </span>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "var(--rule-hairline) solid var(--line)", paddingTop: "var(--space-3)" }}>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
            {t.metaBillingDisclaimer}
          </span>
          <Button kind="volt" size="sm" onClick={() => onSendTemplate(current.name)}>
            {t.btnSendTemplate}
          </Button>
        </div>
      </div>
    </div>
  );
}
