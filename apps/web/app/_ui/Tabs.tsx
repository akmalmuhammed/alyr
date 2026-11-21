"use client";

import { useId, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useUi } from "./UiRoot";
import { cx, nextTabIndex } from "./variants";

export type TabItem = {
  id: string;
  label: ReactNode;
  /** A count in mono after the label. */
  count?: number | string;
  disabled?: boolean;
  /** UTabs only: makes the tab a link to a page (the row then reads as navigation, not as tabs). */
  href?: string;
};

type TabsBase = {
  items: readonly TabItem[];
  value: string;
  /** The row's name for screen readers ("View", "Orders by status"). */
  label: string;
  onChange?: (id: string) => void;
  className?: string;
  /**
   * With a prefix, each tab gets an id (`${prefix}-tab-${id}`) and names `${prefix}-panel-${id}`
   * in aria-controls; give the panel that id (see tabPanelId).
   */
  idPrefix?: string;
};

export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
export const tabPanelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

function useTabRow(props: TabsBase) {
  const { dir } = useUi();
  const generated = useId();
  const prefix = props.idPrefix ?? generated;
  const refs = useRef<Array<HTMLElement | null>>([]);
  const enabled = props.items.map((item, index) => (item.disabled ? -1 : index)).filter((index) => index >= 0);

  function onKeyDown(event: KeyboardEvent) {
    const at = props.items.findIndex((item) => item.id === props.value);
    const from = Math.max(0, enabled.indexOf(at));
    const to = nextTabIndex(from, event.key, enabled.length, dir === "rtl");
    if (to === null) return;
    event.preventDefault();
    const target = enabled[to];
    refs.current[target]?.focus();
    props.onChange?.(props.items[target].id);
  }
  return { prefix, refs, onKeyDown };
}

function TabBody({ item }: { item: TabItem }) {
  return (
    <>
      <span>{item.label}</span>
      {item.count !== undefined && item.count !== "" ? <span className="u-tab-count u-mono">{item.count}</span> : null}
    </>
  );
}

/**
 * Segmented tabs: a row of views of the same data (Today / This week / 28 days). Arrow keys move
 * between tabs (the forward arrow follows the writing direction), Home and End go to the ends.
 */
export function Tabs(props: TabsBase) {
  const { prefix, refs, onKeyDown } = useTabRow(props);
  return (
    <div role="tablist" aria-label={props.label} className={cx("u-tabs", props.className)} onKeyDown={onKeyDown}>
      {props.items.map((item, index) => {
        const on = item.id === props.value;
        return (
          <button
            key={item.id}
            ref={(el) => { refs.current[index] = el; }}
            type="button"
            role="tab"
            id={tabId(prefix, item.id)}
            aria-selected={on}
            aria-controls={props.idPrefix ? tabPanelId(prefix, item.id) : undefined}
            tabIndex={on ? 0 : -1}
            disabled={item.disabled}
            className={cx("u-tab", on && "u-tab--on")}
            onClick={() => props.onChange?.(item.id)}
          >
            <TabBody item={item} />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Underline tabs: the status tabs of a list and the sections of a detail page. With `href` on
 * its items the row is navigation (links, aria-current="page"); without, it is a tab list.
 */
export function UTabs(props: TabsBase) {
  const { prefix, refs, onKeyDown } = useTabRow(props);
  const navigation = props.items.some((item) => item.href);
  if (navigation) {
    return (
      <nav aria-label={props.label} className={cx("u-utabs", props.className)}>
        {props.items.map((item) => {
          const on = item.id === props.value;
          return (
            <a
              key={item.id}
              href={item.href}
              aria-current={on ? "page" : undefined}
              className={cx("u-utab", on && "u-utab--on")}
              onClick={props.onChange ? () => props.onChange?.(item.id) : undefined}
            >
              <TabBody item={item} />
            </a>
          );
        })}
      </nav>
    );
  }
  return (
    <div role="tablist" aria-label={props.label} className={cx("u-utabs", props.className)} onKeyDown={onKeyDown}>
      {props.items.map((item, index) => {
        const on = item.id === props.value;
        return (
          <button
            key={item.id}
            ref={(el) => { refs.current[index] = el; }}
            type="button"
            role="tab"
            id={tabId(prefix, item.id)}
            aria-selected={on}
            aria-controls={props.idPrefix ? tabPanelId(prefix, item.id) : undefined}
            tabIndex={on ? 0 : -1}
            disabled={item.disabled}
            className={cx("u-utab", on && "u-utab--on")}
            onClick={() => props.onChange?.(item.id)}
          >
            <TabBody item={item} />
          </button>
        );
      })}
    </div>
  );
}
