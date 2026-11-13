"use client";

// The Products screen: every product, its switch and what it includes. Moved out of the shell
// page unchanged.

import { Icon, stagger } from "../shellParts";
import type { Product } from "../useWorkspace";
import type { SectionProps } from "../sectionRegistry";

// Module and product names come from the catalogue (`catalog.py`) through the API.
const MODULE_ICON: Record<string, string> = {
  inbox: "inbox", bookings: "calendar", orders: "receipt", payments: "card", ledger: "book",
};
const PRODUCT_ICON: Record<string, string> = {
  chat: "chat", bookings: "calendar", agent: "chart", accounts: "book", shelf: "catalog", docs: "doc",
};

// An included product (ALYR Agent) is in use and looks it, though it has no switch.
const inUse = (p: Product) => p.status === "active" || p.status === "included";
const pillClass = (p: Product) => (p.status === "included" ? "active" : p.status);

export default function ProductsSection({ ws }: SectionProps) {
  const { state, t, pick, current, confirming, setConfirming, busy, setProduct } = ws;
  const activeProducts = state.products.filter((p) => p.status === "active");

  return (
  <>
    <header className="sh-head" style={stagger(0)}>
      <span className="sh-eyebrow">{t.productsEyebrow} · {activeProducts.length} {t.active.toLowerCase()}</span>
      <h1>{current ? pick(current.label) : t.productsTitle}</h1>
      <p>{t.productsSub}</p>
    </header>
    {!state.can_manage && <p className="sh-note">{t.managersOnly}</p>}
    <ul className="sh-products" style={stagger(1)}>
      {state.products.map((product) => {
        const on = product.status === "active";
        return (
          <li key={product.key} className={`sh-product ${pillClass(product)}`}>
            <div className="sh-product-top">
              <span className={`sh-glyph ${inUse(product) ? "" : "idle"}`}><Icon name={PRODUCT_ICON[product.key] ?? "apps"} /></span>
              <span className={`sh-pill ${pillClass(product)}`}>{t[product.status]}</span>
            </div>
            <div>
              <span className="sh-eyebrow">{pick(product.descriptor)}</span>
              <h2>{pick(product.name)}</h2>
              <p>{pick(product.summary)}</p>
            </div>
            <div className="sh-modules" aria-label={t.includes}>
              {product.includes.map((part) => (
                <span key={part.key || part.label.en}>
                  <Icon name={MODULE_ICON[part.key] ?? PRODUCT_ICON[product.key] ?? "apps"} />{pick(part.label)}
                </span>
              ))}
            </div>
            <div className="sh-product-foot">
              {product.status === "included" ? <span className="sh-note">{t.includedNote}</span>
                : confirming === product.key ? (
                  <div className="sh-confirm" role="alertdialog" aria-label={product.off_note ? pick(product.off_note) : t.confirmOff}>
                    <span>{product.off_note ? pick(product.off_note) : t.confirmOff}</span>
                    <button className="btn small" onClick={() => setConfirming("")}>{t.keep}</button>
                    <button className="btn small danger" disabled={busy === product.key} onClick={() => setProduct(product, false)}>{t.turnOff}</button>
                  </div>
                ) : (
                  <label className="sh-switch-row">
                    <button type="button" role="switch" className="sh-switch" aria-checked={on}
                      aria-label={pick(product.name)} disabled={!state.can_manage || busy === product.key}
                      onClick={() => (on ? setConfirming(product.key) : setProduct(product, true))} />
                    {on ? t.on : t.off}
                  </label>
                )}
            </div>
          </li>
        );
      })}
    </ul>
  </>
  );
}
