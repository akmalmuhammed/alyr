"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { Icon } from "./Icon";
import { IconButton } from "./Button";
import { Menu } from "./Menu";
import type { MenuItem } from "./Menu";
import { Skeleton } from "./Skeleton";
import { useIsPhone } from "./env";
import { ariaSort, moveRowFocus, nextSort, selectRange, selectionState, skeletonWidth, toggleAll, toggleOne } from "./tableLogic";
import type { Selected, SortState } from "./tableLogic";
import { cx } from "./variants";

/** Where a column goes on a phone's card. A column with no slot is left out of the card. */
export type TablePhoneSlot = "kicker" | "tag" | "title" | "amount" | "body" | "foot" | "foot-end";

export type TableColumn<R> = {
  key: string;
  /** The column's heading, a short label. Drawn in mono capitals in English. */
  header: ReactNode;
  cell: (row: R, index: number) => ReactNode;
  /** Any CSS length. Columns without a width share what is left. */
  width?: string;
  align?: "start" | "end";
  /** Identifiers, times, phone numbers and money in a table are mono. */
  mono?: boolean;
  strong?: boolean;
  sortable?: boolean;
  /** The heading's name for screen readers, when `header` is empty or an icon. */
  label?: string;
  /** Where the column goes on a phone's card. A column with no slot is left out of the card. */
  phone?: TablePhoneSlot;
  /** What the column's cell is on a card when it differs from the table's (the name alone, without the items beneath it). */
  phoneCell?: (row: R, index: number) => ReactNode;
  /** `table`: only in the table. `cards`: only on a phone's card (the items line, which the table folds into the customer cell). */
  showOn?: "both" | "table" | "cards";
};

export type TableSelection<R> = {
  selected: Selected;
  onChange: (next: Set<string>) => void;
  /** "Select all orders on this page". */
  selectAllLabel: string;
  /** "Select order 1042". */
  rowLabel: (row: R) => string;
};

export type TableProps<R> = {
  columns: readonly TableColumn<R>[];
  rows: readonly R[];
  rowKey: (row: R) => string;
  /** The table's name for screen readers ("Open orders"). Not drawn. */
  caption: string;
  sort?: SortState;
  onSortChange?: (next: SortState) => void;
  selection?: TableSelection<R>;
  /** The row that is open in a drawer or beside the table: drawn as selected (a quiet fill), with aria-current. */
  activeKey?: string | null;
  /** Enter, Space (without a selection) or a click on a row. */
  onRowOpen?: (row: R) => void;
  /** A "more" menu at the end of every row. */
  rowActions?: { label: string; items: (row: R) => readonly MenuItem[] };
  /** Shown above the header while something is selected: a BulkBar. */
  bulk?: ReactNode;
  loading?: boolean;
  /** "Loading orders": what screen readers hear while the skeleton rows show. */
  loadingLabel?: string;
  skeletonRows?: number;
  /** Drawn instead of the table when there are no rows (an Empty, or a dashed first-run slot). */
  empty?: ReactNode;
  /** Row height: 52, or 44 for a compact list. */
  density?: "row" | "compact";
  /** The header stays at the top while the rows scroll under it. Default on. */
  stickyHeader?: boolean;
  /** Gives the table its own scroll, and the header something to stick to. Any CSS length. */
  maxHeight?: string;
  /**
   * A table wider than its box scrolls sideways instead of squeezing its columns to nothing (the default).
   * A scrolling box cannot also keep the header at the top of the PAGE: pass `scrollX={false}` when the screen
   * knows it has the width and wants the header to stick to the page, or `maxHeight` to stick it inside the box.
   */
  scrollX?: boolean;
  /** Cards instead of columns under 48rem (the default), always, or never. */
  cards?: "auto" | "always" | "never";
  className?: string;
};

const INTERACTIVE = "a, button, input, label, select, textarea, [role='menuitem']";

function Check({ checked, indeterminate, label, onToggle, tabIndex, className }: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onToggle: (event: { shiftKey: boolean }) => void;
  tabIndex?: number;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const shift = useRef(false);
  useEffect(() => { if (ref.current) ref.current.indeterminate = Boolean(indeterminate); }, [indeterminate]);
  return (
    <label className={cx("u-tcheck-hit", className)}>
      <input
        ref={ref}
        type="checkbox"
        className="u-tcheck"
        checked={checked}
        aria-label={label}
        tabIndex={tabIndex}
        onClick={(event) => { shift.current = event.shiftKey; }}
        onChange={() => onToggle({ shiftKey: shift.current })}
      />
    </label>
  );
}

/**
 * A table: headers in mono capitals, 52 px rows (44 compact), a sticky header, sorting, row selection
 * with a bulk bar, a "more" menu per row, keyboard row focus, skeleton rows while loading, and, under
 * 48rem, a list of cards. Cells are the screen's own nodes; the table sorts nothing (hand it rows in
 * order, or sort them with `sortRows` from tableLogic.ts) and says nothing (every word is a prop).
 *
 * Keyboard: Up, Down, Home, End, Page Up and Page Down move between rows; Enter opens the focused
 * row; Space selects it (or opens it when rows cannot be selected). Inside a row Tab reaches its
 * checkbox and its menu; rows other than the focused one are skipped, so a long table is one tab stop.
 */
export function Table<R>(props: TableProps<R>) {
  const {
    columns, rows, rowKey, caption, sort = null, onSortChange, selection, activeKey = null, onRowOpen, rowActions, bulk,
    loading = false, loadingLabel, skeletonRows = 6, empty, density = "row", stickyHeader = true, maxHeight, scrollX = true,
    cards = "auto", className,
  } = props;
  const phone = useIsPhone();
  const asCards = cards === "always" || (cards === "auto" && phone);
  const keys = rows.map(rowKey);
  const tableColumns = columns.filter((c) => c.showOn !== "cards");
  const cardColumns = columns.filter((c) => c.phone && c.showOn !== "table");
  const interactive = Boolean(onRowOpen || selection);
  const [focusAt, setFocusAt] = useState(0);
  const rowEls = useRef<Array<HTMLElement | null>>([]);
  const lastKey = useRef<string | null>(null);
  const focused = Math.min(focusAt, Math.max(0, rows.length - 1));
  const selectedCount = selection ? keys.filter((k) => selection.selected.has(k)).length : 0;

  function toggleRow(key: string, shiftKey: boolean) {
    if (!selection) return;
    const was = selection.selected.has(key);
    if (shiftKey && lastKey.current && lastKey.current !== key) selection.onChange(selectRange(selection.selected, keys, lastKey.current, key, !was));
    else selection.onChange(toggleOne(selection.selected, key));
    lastKey.current = key;
  }

  function onRowClick(event: ReactMouseEvent, row: R) {
    if (!onRowOpen || (event.target as HTMLElement).closest(INTERACTIVE)) return;
    onRowOpen(row);
  }

  function onRowKeyDown(event: ReactKeyboardEvent, row: R, index: number) {
    if (event.target !== event.currentTarget) return;
    const to = moveRowFocus(index, rows.length, event.key);
    if (to !== null) {
      event.preventDefault();
      setFocusAt(to);
      rowEls.current[to]?.focus();
      return;
    }
    if (event.key === "Enter" && onRowOpen) { event.preventDefault(); onRowOpen(row); }
    else if (event.key === " ") {
      event.preventDefault();
      if (selection) toggleRow(keys[index], event.shiftKey);
      else onRowOpen?.(row);
    }
  }

  const actionsCell = (row: R, tabIndex: number | undefined) => rowActions ? (
    <Menu
      label={rowActions.label}
      items={rowActions.items(row)}
      trigger={(p) => <IconButton {...p} size="xs" bare icon={<Icon name="dots" />} label={rowActions.label} tabIndex={tabIndex} />}
    />
  ) : null;

  const bar = selection && selectedCount > 0 ? bulk : null;

  if (!loading && rows.length === 0 && empty) return <div className={cx("u-tbl-wrap", className)}>{empty}</div>;

  if (asCards) {
    const slots: TablePhoneSlot[] = ["kicker", "tag", "title", "amount", "body", "foot", "foot-end"];
    return (
      <div className={cx("u-tbl-wrap", "u-tbl-wrap--cards", className)}>
        {bar}
        <ul className="u-tbl-cards" aria-label={caption} aria-busy={loading || undefined}>
          {loading ? Array.from({ length: Math.min(skeletonRows, 4) }, (_, r) => (
            <li key={r} className="u-tbl-card u-tbl-card--skel" aria-hidden="true">
              <Skeleton width={30 + (r % 3) * 10} />
              <Skeleton width={70} />
              <Skeleton width={90} />
            </li>
          )) : rows.map((row, index) => {
            const key = keys[index];
            return (
              <li
                key={key}
                ref={(el) => { rowEls.current[index] = el; }}
                className={cx("u-tbl-card", activeKey === key && "u-tbl-card--active", onRowOpen && "u-tbl-card--open")}
                tabIndex={interactive ? 0 : undefined}
                aria-current={activeKey === key ? "true" : undefined}
                onClick={(event) => onRowClick(event, row)}
                onKeyDown={(event) => onRowKeyDown(event, row, index)}
              >
                {selection ? (
                  <Check className="u-tbl-card-check" checked={selection.selected.has(key)} label={selection.rowLabel(row)} onToggle={(e) => toggleRow(key, e.shiftKey)} />
                ) : null}
                <div className="u-tbl-card-grid">
                  {slots.map((slot) => {
                    const mine = cardColumns.filter((c) => c.phone === slot);
                    if (mine.length === 0) return null;
                    return (
                      <div key={slot} className={cx("u-tbl-slot", `u-tbl-slot--${slot}`)}>
                        {mine.map((c) => <Fragment key={c.key}>{(c.phoneCell ?? c.cell)(row, index)}</Fragment>)}
                      </div>
                    );
                  })}
                </div>
                {rowActions ? <div className="u-tbl-card-actions">{actionsCell(row, undefined)}</div> : null}
              </li>
            );
          })}
        </ul>
        {loading && loadingLabel ? <p className="u-sr" role="status">{loadingLabel}</p> : null}
      </div>
    );
  }

  // The narrowest the table gets before it scrolls: its fixed columns, the select and menu columns, and room for the one that fills.
  const fixed = tableColumns.map((c) => c.width).filter((w): w is string => Boolean(w));
  const extra = [selection && "(var(--ui-size-touch) + var(--ui-space-12))", rowActions && "(var(--ui-size-touch) + var(--ui-space-12))", fixed.length < tableColumns.length && "var(--ui-size-side-column)"].filter(Boolean);
  const floor = `calc(${[...fixed, ...extra].join(" + ") || "0px"})`;
  const columnCount = tableColumns.length + (selection ? 1 : 0) + (rowActions ? 1 : 0);

  return (
    <div
      className={cx("u-tbl-wrap", !scrollX && "u-tbl-wrap--clip", maxHeight && "u-tbl-wrap--scroll", className)}
      style={maxHeight ? { maxBlockSize: maxHeight } : undefined}
    >
      {bar}
      <table className={cx("u-tbl", `u-tbl--${density}`, stickyHeader && "u-tbl--sticky")} style={scrollX ? { minInlineSize: floor } : undefined} aria-busy={loading || undefined} aria-rowcount={loading ? undefined : rows.length + 1}>
        <caption className="u-sr">{caption}</caption>
        <colgroup>
          {selection ? <col className="u-tbl-col-check" /> : null}
          {tableColumns.map((c) => <col key={c.key} style={c.width ? { inlineSize: c.width } : undefined} />)}
          {rowActions ? <col className="u-tbl-col-actions" /> : null}
        </colgroup>
        <thead>
          <tr>
            {selection ? (
              <th scope="col" className="u-tbl-th u-tbl-th--check">
                <Check
                  checked={selectionState(selection.selected, keys) === "all"}
                  indeterminate={selectionState(selection.selected, keys) === "some"}
                  label={selection.selectAllLabel}
                  onToggle={() => selection.onChange(toggleAll(selection.selected, keys))}
                />
              </th>
            ) : null}
            {tableColumns.map((c) => {
              const sorted = sort?.key === c.key ? sort.dir : null;
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={cx("u-tbl-th", c.align === "end" && "u-tbl-th--end")}
                  aria-sort={c.sortable ? ariaSort(sort, c.key) : undefined}
                  aria-label={c.label}
                >
                  {c.sortable ? (
                    <button type="button" className="u-tbl-sort" onClick={() => onSortChange?.(nextSort(sort, c.key))}>
                      <span>{c.header}</span>
                      <span className={cx("u-tbl-sortmark", sorted && `u-tbl-sortmark--${sorted}`)} aria-hidden="true" />
                    </button>
                  ) : c.header}
                </th>
              );
            })}
            {rowActions ? <th scope="col" className="u-tbl-th u-tbl-th--actions"><span className="u-sr">{rowActions.label}</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {loading ? Array.from({ length: skeletonRows }, (_, r) => (
            <tr key={r} className="u-tbl-row u-tbl-row--skel" aria-hidden="true">
              {Array.from({ length: columnCount }, (_, k) => (
                <td key={k} className="u-tbl-cell">
                  {(selection && k === 0) || (rowActions && k === columnCount - 1) ? null : <Skeleton width={skeletonWidth(r, k)} />}
                </td>
              ))}
            </tr>
          )) : rows.map((row, index) => {
            const key = keys[index];
            const active = activeKey === key;
            const picked = selection?.selected.has(key) ?? false;
            const stop = interactive && index !== focused ? -1 : undefined;
            return (
              <tr
                key={key}
                ref={(el) => { rowEls.current[index] = el; }}
                className={cx("u-tbl-row", (active || picked) && "u-tbl-row--on", onRowOpen && "u-tbl-row--open")}
                tabIndex={interactive ? (index === focused ? 0 : -1) : undefined}
                aria-current={active ? "true" : undefined}
                aria-selected={selection ? picked : undefined}
                aria-rowindex={index + 2}
                onClick={(event) => onRowClick(event, row)}
                onFocus={(event) => { if (event.target === event.currentTarget) setFocusAt(index); }}
                onKeyDown={(event) => onRowKeyDown(event, row, index)}
              >
                {selection ? (
                  <td className="u-tbl-cell u-tbl-cell--check">
                    <Check checked={picked} label={selection.rowLabel(row)} tabIndex={stop} onToggle={(e) => toggleRow(key, e.shiftKey)} />
                  </td>
                ) : null}
                {tableColumns.map((c) => (
                  <td key={c.key} className={cx("u-tbl-cell", c.mono && "u-tbl-cell--mono", c.strong && "u-tbl-cell--strong", c.align === "end" && "u-tbl-cell--end")}>
                    {c.cell(row, index)}
                  </td>
                ))}
                {rowActions ? <td className="u-tbl-cell u-tbl-cell--actions">{actionsCell(row, stop)}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      {loading && loadingLabel ? <p className="u-sr" role="status">{loadingLabel}</p> : null}
    </div>
  );
}

/**
 * What shows above a table while rows are selected: how many, a way to select the rest, and the actions
 * that apply to them. Put it in `bulk`; the Table shows it only while something is selected.
 */
export function BulkBar({ count, label, children, className }: {
  /** "4 selected", with "Select all 14" and "Clear" beside it as links or quiet buttons in `children`'s first group. */
  count: ReactNode;
  /** The toolbar's name for screen readers ("Actions for the selected items"). */
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("u-bulk", className)} role="toolbar" aria-label={label}>
      <p className="u-bulk-count" aria-live="polite">{count}</p>
      <div className="u-bulk-actions">{children}</div>
    </div>
  );
}
