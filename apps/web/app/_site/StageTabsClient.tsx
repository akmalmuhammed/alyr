"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

type Props = {
  label: string;
  /** One tab per panel, in order; each id is its panel's anchor (#discover). */
  tabs: { id: string; n: string; name: string }[];
  /** The panels, drawn on the server, the first one with `is-on`. */
  children: ReactNode;
};

/**
 * The four stages as a segmented switch (ALY-330, section 3). The panels are server HTML:
 * without scripts they all show, one under the other, and the switch is not drawn
 * (stagetabs.css, `al-js`); with scripts they share one cell, so the page below never moves.
 * This component only keeps which one is chosen, in the same way as `BusinessTabs`. Tabs change
 * on a press, the arrow keys, Home and End, the "Next" link and the URL hash (#convert);
 * nothing advances by itself (WCAG 2.2.2). The sliding pill is one element moved by `--idx`.
 */
export function StageTabsClient({ label, tabs, children }: Props) {
  const [active, setActive] = useState(0);
  const [seen, setSeen] = useState(false);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  // A link to #convert opens that tab and brings the section into view: the browser cannot
  // scroll to a panel that is not shown, so it is done here.
  useEffect(() => {
    function open() {
      const index = tabs.findIndex((tab) => tab.id === window.location.hash.slice(1));
      if (index < 0) return;
      setActive(index);
      setSeen(true);
      requestAnimationFrame(() => root.current?.closest("section")?.scrollIntoView({ block: "start" }));
    }
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [tabs]);

  // The panel being shown plays its arrival the first time the section is on screen, and again
  // each time it is opened; before that its start state is held (stagetabs.css, `data-seen`).
  useEffect(() => {
    const node = root.current;
    if (!node || typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { threshold: 0.2 });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  // Show the chosen panel. The panels are the server's HTML, so their class is set here
  // rather than re-drawn.
  useEffect(() => {
    root.current?.querySelectorAll<HTMLElement>(":scope > .stt-panels > [role='tabpanel']").forEach((panel) => {
      panel.classList.toggle("is-on", panel.id === tabs[active]?.id);
    });
  }, [active, tabs]);

  function choose(index: number, focus = false) {
    setActive(index);
    setSeen(true);
    if (focus) buttons.current[index]?.focus();
  }

  function onKey(event: KeyboardEvent) {
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

  // The "Next" link at the end of a panel is a plain anchor (#convert), so it works without
  // scripts; with them it steps to that stage and keeps the switch in view.
  function onClick(event: MouseEvent) {
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[data-stt-to]");
    if (!link) return;
    const index = tabs.findIndex((tab) => tab.id === link.dataset.sttTo);
    if (index < 0) return;
    event.preventDefault();
    choose(index);
    window.history.replaceState(null, "", `#${tabs[index].id}`);
    buttons.current[index]?.focus({ preventScroll: true });
    list.current?.scrollIntoView({ block: "nearest" });
  }

  return (
    <div className="stt-box" ref={root} data-seen={seen ? "" : undefined} onClick={onClick}>
      <div
        className="stt-tabs"
        ref={list}
        role="tablist"
        aria-label={label}
        onKeyDown={onKey}
        style={{ "--idx": active, "--n": tabs.length } as CSSProperties}
      >
        <span className="stt-pill" aria-hidden="true" />
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(node) => { buttons.current[index] = node; }}
            role="tab"
            type="button"
            id={`stt-tab-${tab.id}`}
            aria-selected={index === active}
            aria-controls={tab.id}
            tabIndex={index === active ? 0 : -1}
            className="stt-tab"
            onClick={() => choose(index)}
          >
            <span className="stt-tab-n" aria-hidden="true">{tab.n}</span>
            <span>{tab.name}</span>
          </button>
        ))}
      </div>
      <div className="stt-panels">{children}</div>
    </div>
  );
}
