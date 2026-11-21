"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, Ref } from "react";
import { Kbd } from "./Fields";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { Layer, useTopOfStack } from "./overlay";
import { useUi } from "./UiRoot";
import { cx } from "./variants";

export type MenuItem =
  | {
      type?: "item";
      id: string;
      label: ReactNode;
      /** Shown as a key cap at the end of the row. The screen binds the key; the menu only shows it. */
      shortcut?: string;
      icon?: IconName;
      /** A destructive action reads in the bad colour; it should lead to a confirm dialog. */
      tone?: "bad";
      disabled?: boolean;
      onSelect: () => void;
    }
  | { type: "separator" }
  | { type: "label"; label: string };

/** What the trigger must spread onto its button. */
export type MenuTriggerProps = {
  ref: Ref<HTMLElement>;
  onClick: (event: ReactMouseEvent) => void;
  onKeyDown: (event: ReactKeyboardEvent) => void;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
  "aria-controls": string | undefined;
};

type Anchor = { kind: "rect"; rect: DOMRect } | { kind: "point"; x: number; y: number };

const EDGE = 8;
const GAP = 4;

/** Where a menu of this size goes: below its anchor and aligned to the inline end (or start), flipped to stay on screen. */
export function placeMenu(anchor: Anchor, size: { width: number; height: number }, view: { width: number; height: number }, rtl: boolean, align: "start" | "end") {
  let left: number;
  let top: number;
  if (anchor.kind === "rect") {
    const { rect } = anchor;
    const endAligned = align === "end";
    left = (endAligned !== rtl) ? rect.right - size.width : rect.left;
    top = rect.bottom + GAP;
    if (top + size.height > view.height - EDGE && rect.top - GAP - size.height >= EDGE) top = rect.top - GAP - size.height;
  } else {
    left = rtl ? anchor.x - size.width : anchor.x;
    top = anchor.y;
    if (top + size.height > view.height - EDGE) top = Math.max(EDGE, anchor.y - size.height);
  }
  left = Math.min(Math.max(EDGE, left), Math.max(EDGE, view.width - size.width - EDGE));
  top = Math.min(Math.max(EDGE, top), Math.max(EDGE, view.height - size.height - EDGE));
  return { left, top };
}

function enabledItems(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'));
}

function MenuPanel({ id, items, label, anchor, align, onClose, onPicked, opener }: {
  id: string;
  items: readonly MenuItem[];
  label: string;
  anchor: Anchor;
  align: "start" | "end";
  onClose: () => void;
  onPicked: () => void;
  /** The button that opened it: a press on it is the button's own toggle, not "outside". */
  opener?: HTMLElement | null;
}) {
  const { dir } = useUi();
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  useTopOfStack(true, onClose);

  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const { left, top } = placeMenu(anchor, { width: el.offsetWidth, height: el.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }, dir === "rtl", align);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = "visible";
    enabledItems(el)[0]?.focus({ preventScroll: true });
  }, [anchor, dir, align]);

  // A press outside, a resize or a scroll elsewhere closes it.
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current && !panel.current.contains(target) && !opener?.contains(target)) onClose();
    };
    const away = (event: Event) => {
      if (panel.current && event.target instanceof Node && panel.current.contains(event.target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", away);
    window.addEventListener("scroll", away, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", away);
      window.removeEventListener("scroll", away, true);
    };
  }, [onClose, opener]);

  function onKeyDown(event: ReactKeyboardEvent) {
    const el = panel.current;
    if (!el) return;
    const stops = enabledItems(el);
    const at = stops.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => { event.preventDefault(); stops[(i + stops.length) % stops.length]?.focus(); };
    if (event.key === "ArrowDown") return go(at + 1);
    if (event.key === "ArrowUp") return go(at < 0 ? -1 : at - 1);
    if (event.key === "Home") return go(0);
    if (event.key === "End") return go(-1);
    if (event.key === "Tab") { event.preventDefault(); onClose(); return; }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== " ") {
      const now = Date.now();
      typed.current.text = now - typed.current.at > 600 ? event.key.toLowerCase() : typed.current.text + event.key.toLowerCase();
      typed.current.at = now;
      const from = typed.current.text.length > 1 ? at : at + 1;
      for (let k = 0; k < stops.length; k += 1) {
        const candidate = stops[(from + k + stops.length) % stops.length];
        if ((candidate.textContent ?? "").trim().toLowerCase().startsWith(typed.current.text)) { event.preventDefault(); candidate.focus(); break; }
      }
    }
  }

  return (
    <div ref={root} className="u-layer u-layer--menu" data-u-live>
      <div ref={panel} id={id} role="menu" aria-label={label} className="u-menu" onKeyDown={onKeyDown} style={{ visibility: "hidden" }}>
        {items.map((item, i) => {
          if (item.type === "separator") return <div key={i} role="separator" className="u-menu-sep" />;
          if (item.type === "label") return <div key={i} className="u-menu-label" role="presentation">{item.label}</div>;
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-disabled={item.disabled || undefined}
              className={cx("u-menu-item", item.tone === "bad" && "u-menu-item--bad")}
              onClick={() => {
                if (item.disabled) return;
                item.onSelect();
                onPicked();
              }}
            >
              {item.icon ? <Icon name={item.icon} /> : null}
              <span className="u-menu-text">{item.label}</span>
              {item.shortcut ? <Kbd>{item.shortcut}</Kbd> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A list of actions that opens from a button. The trigger is yours (any button; an icon button with a
 * label for a row's "more"), drawn by `trigger`, which must spread the props it is given:
 *
 *   <Menu label="Order 1042" items={items} trigger={(p) => <IconButton {...p} icon={…} label="Actions" />} />
 *
 * Opens on click, Enter, Space or the Down arrow (Up opens at the last item). Arrows, Home, End and
 * typing move through it; Enter or Space picks; Escape closes and gives the focus back; a press outside,
 * a scroll or a resize closes it. A destructive item (`tone: "bad"`) should open a confirm dialog, not act.
 */
export function Menu({ items, label, trigger, align = "end", className }: {
  items: readonly MenuItem[];
  /** The menu's name for screen readers ("Actions for order 1042"). */
  label: string;
  trigger: (props: MenuTriggerProps) => ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const id = useId();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [button, setButton] = useState<HTMLElement | null>(null);

  const open = useCallback(() => {
    const rect = button?.getBoundingClientRect();
    if (rect) setAnchor({ kind: "rect", rect });
  }, [button]);
  const closeAndReturn = useCallback(() => { setAnchor(null); button?.focus({ preventScroll: true }); }, [button]);

  const props: MenuTriggerProps = {
    ref: setButton,
    onClick: () => (anchor ? closeAndReturn() : open()),
    onKeyDown: (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); open(); }
    },
    "aria-haspopup": "menu",
    "aria-expanded": anchor !== null,
    "aria-controls": anchor ? id : undefined,
  };

  return (
    <>
      {className ? <span className={className}>{trigger(props)}</span> : trigger(props)}
      {anchor ? (
        <Layer>
          <MenuPanel id={id} items={items} label={label} anchor={anchor} align={align} onClose={closeAndReturn} onPicked={closeAndReturn} opener={button} />
        </Layer>
      ) : null}
    </>
  );
}

/**
 * The same list, opened where the pointer is: a right-click (or the context-menu key, or Shift+F10)
 * on anything inside. A touch screen has no right-click, so every action in it must also be reachable
 * another way (a row's own "more" button); this is a shortcut, never the only door.
 */
export function ContextMenu({ items, label, children, className }: {
  items: readonly MenuItem[];
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setAnchor(null);
  }, []);

  return (
    <div
      ref={host}
      className={className}
      onContextMenu={(event) => {
        event.preventDefault();
        setAnchor({ kind: "point", x: event.clientX, y: event.clientY });
      }}
      onKeyDown={(event) => {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          event.preventDefault();
          const rect = (event.target as HTMLElement).getBoundingClientRect();
          setAnchor({ kind: "point", x: rect.left + Math.min(rect.width, 24), y: rect.bottom });
        }
      }}
    >
      {children}
      {anchor ? (
        <Layer>
          <MenuPanel id={id} items={items} label={label} anchor={anchor} align="start" onClose={close} onPicked={close} />
        </Layer>
      ) : null}
    </div>
  );
}
