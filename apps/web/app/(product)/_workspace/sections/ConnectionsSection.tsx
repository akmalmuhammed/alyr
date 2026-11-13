"use client";

// The Connections screen: the accounts ALYR works through, and the doors to the connection
// screens. Moved out of the shell page unchanged.

import { ConnectLink } from "../ConnectSettings";
import { McpLink } from "../McpLink";
import { Icon, stagger } from "../shellParts";
import type { SectionProps } from "../sectionRegistry";

const CONNECTION_ICON: Record<string, string> = { whatsapp: "chat", payments: "card" };

export default function ConnectionsSection({ ws }: SectionProps) {
  const { state, t, lang, pick, ask, documentsOn } = ws;

  return (
  <>
    <header className="sh-head" style={stagger(0)}>
      <span className="sh-eyebrow">{t.connectionsEyebrow}</span>
      <h1>{t.connectionsTitle}</h1>
      <p>{t.connectionsSub}</p>
    </header>
    <ul className="sh-conns" style={stagger(1)}>
      {state.connections.map((c) => {
        const needer = state.products.find((p) => p.steps.some((s) => s.connection === c.key));
        const step = needer?.steps.find((s) => s.connection === c.key);
        return (
          <li key={c.key} className={`sh-conn ${c.connected ? "on" : ""}`}>
            <span className="sh-glyph"><Icon name={CONNECTION_ICON[c.key] ?? "plug"} /></span>
            <div className="sh-conn-text">
              <h2>{pick(c.name)} <span className={`sh-pill ${c.connected ? "active" : "idle"}`}>
                {c.connected ? t.connected : c.available ? t.notConnected : t.setUpWithAlyr}</span></h2>
              <p>{pick(c.detail)}</p>
            </div>
            {!c.connected && needer && step && (step.asked
              ? <span className="sh-pill wait">{t.asked}</span>
              : <button className="btn" onClick={() => ask(needer.key, step.key)}>{t.askSetup}</button>)}
          </li>
        );
      })}
    </ul>
    {documentsOn && state.can_manage && (
      <ConnectLink lang={lang} href="/app/connect" icon={<Icon name="plug" />} arrow={<Icon name="arrow" className="sh-ico" />} />
    )}
    {/* The connected-apps screen (ALY-292): drawn only where the API says the connector is on. */}
    <McpLink lang={lang} canManage={state.can_manage} icon={<Icon name="plug" />} arrow={<Icon name="arrow" className="sh-ico" />} />
  </>
  );
}
