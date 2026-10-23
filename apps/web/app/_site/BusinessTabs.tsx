"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  label: string;
  /** One tab per panel, in order; each id is its panel's anchor (#bakery). The icon is a
   * line drawing of the business, beside its name. */
  tabs: { id: string; name: string; icon?: ReactNode }[];
  /** The panels, drawn on the server, the first one with `is-on`. */
  children: ReactNode;
};

/**
 * The homepage's businesses as tabs. The panels are server HTML: without scripts they all
 * show, one under the other, and the tab row is not drawn (home.css, `al-js`); with scripts
 * only the chosen one shows. This component only keeps which one is chosen. Each panel has
 * its own anchor, so the hero's chips, an advert or a message can open the right tab.
 */
export function BusinessTabs({ label, tabs, children }: Props) {
  const [active, setActive] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const root = useRef<HTMLDivElement>(null);

  // A link to #bakery opens that tab and brings the section into view: the browser cannot
  // scroll to a panel that is not shown, so it is done here.
  useEffect(() => {
    function open() {
      const index = tabs.findIndex((tab) => tab.id === window.location.hash.slice(1));
      if (index < 0) return;
      setActive(index);
      requestAnimationFrame(() => root.current?.scrollIntoView({ block: "start" }));
    }
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [tabs]);

  // Show the chosen panel. The panels are the server's HTML, so their class is set here
  // rather than re-drawn.
  useEffect(() => {
    root.current?.querySelectorAll<HTMLElement>(":scope > [role='tabpanel']").forEach((panel) => {
      panel.classList.toggle("is-on", panel.id === tabs[active]?.id);
    });
    // On a narrow screen the tab row scrolls sideways: keep the chosen tab in view without
    // moving the page.
    const tab = buttons.current[active];
    const row = tab?.parentElement;
    if (tab && row && row.scrollWidth > row.clientWidth) {
      row.scrollTo({ left: tab.offsetLeft - row.offsetLeft - 8, behavior: "smooth" });
    }
  }, [active, tabs]);

  function choose(index: number, focus = false) {
    setActive(index);
    if (focus) buttons.current[index]?.focus();
  }

  function onKey(event: React.KeyboardEvent) {
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[event.key];
    if (step) {
      event.preventDefault();
      choose((active + step + tabs.length) % tabs.length, true);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      choose(event.key === "Home" ? 0 : tabs.length - 1, true);
    }
  }

  return (
    <div className="biz" ref={root}>
      <div className="biz-tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(node) => { buttons.current[index] = node; }}
            role="tab"
            type="button"
            id={`biz-tab-${tab.id}`}
            aria-selected={index === active}
            aria-controls={tab.id}
            tabIndex={index === active ? 0 : -1}
            className="biz-tab"
            onClick={() => choose(index)}
          >
            {tab.icon && <span className="biz-ico" aria-hidden="true">{tab.icon}</span>}
            <span>{tab.name}</span>
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
