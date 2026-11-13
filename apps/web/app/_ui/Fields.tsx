"use client";

import { cloneElement, useEffect, useId, useRef } from "react";
import type { InputHTMLAttributes, ReactElement, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { UiIcon } from "./UiIcon";
import { cx, fieldIds, joinIds } from "./variants";

// ── Field: a label, one control, and what to say about it ───────────────────────────────

/**
 * A visible label, one control, a hint and an error. The control gets its id, its hint and its
 * error by reference (aria-describedby) and aria-invalid when there is an error. Pass a kit
 * control (Input, Textarea, Select) or any element that takes `id` and `aria-*`. A placeholder
 * is never the label.
 */
export function Field({ label, hint, error, optional, className, children }: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** The word for "optional", shown after the label. Required fields need no mark. */
  optional?: ReactNode;
  className?: string;
  children: ReactElement<Record<string, unknown>>;
}) {
  const id = useId();
  const ids = fieldIds(id, { hint: !!hint, error: !!error });
  const control = cloneElement(children, {
    id,
    "aria-describedby": joinIds(children.props["aria-describedby"] as string | undefined, ids.describedBy),
    "aria-invalid": error ? true : children.props["aria-invalid"],
    // The kit's controls draw the bad border from `invalid`; a plain element would not know the prop.
    ...(error ? { invalid: true } : {}),
  });
  return (
    <div className={cx("u-field", !!error && "u-field--bad", className)}>
      <label className="u-field-label" htmlFor={id}>
        {label}
        {optional ? <span className="u-field-optional">{optional}</span> : null}
      </label>
      {control}
      {hint ? <p className="u-field-hint" id={ids.hint}>{hint}</p> : null}
      {error ? <p className="u-field-error" id={ids.error}>{error}</p> : null}
    </div>
  );
}

/**
 * A group of controls with one label (a set of radios or checks, a run of related inputs).
 * It is a fieldset, so a screen reader reads the label before each control, and it names its
 * help and its error by reference.
 */
export function FormSection({ label, help, error, className, children }: {
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const ids = fieldIds(id, { hint: !!help, error: !!error });
  return (
    <fieldset className={cx("u-formsec", !!error && "u-field--bad", className)} aria-describedby={ids.describedBy}>
      <legend className="u-field-label">{label}</legend>
      {help ? <p className="u-field-hint" id={ids.hint}>{help}</p> : null}
      <div className="u-formsec-body">{children}</div>
      {error ? <p className="u-field-error" id={ids.error}>{error}</p> : null}
    </fieldset>
  );
}

// ── Input, Textarea ────────────────────────────────────────────────────────────────────

type InputOwn = {
  /** Mono text inside the box before the value ("QAR", "+974"). */
  prefix?: ReactNode;
  /** Mono text inside the box after the value ("min", "%"). */
  suffix?: ReactNode;
  /** Drawn with the bad border. Field sets it from `error`. */
  invalid?: boolean;
  className?: string;
};

export function Input({ prefix, suffix, invalid, className, ...native }: InputOwn & Omit<InputHTMLAttributes<HTMLInputElement>, "prefix" | "className">) {
  return (
    <span className={cx("u-input", invalid && "u-input--bad", native.disabled && "u-input--off", className)}>
      {prefix ? <span className="u-input-pre u-mono">{prefix}</span> : null}
      <input {...native} className="u-input-el" aria-invalid={native["aria-invalid"] ?? (invalid || undefined)} />
      {suffix ? <span className="u-input-suf u-mono">{suffix}</span> : null}
    </span>
  );
}

export function Textarea({ invalid, className, rows = 3, ...native }: Pick<InputOwn, "invalid" | "className"> & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <span className={cx("u-input u-input--area", invalid && "u-input--bad", native.disabled && "u-input--off", className)}>
      <textarea {...native} rows={rows} className="u-input-el" aria-invalid={native["aria-invalid"] ?? (invalid || undefined)} />
    </span>
  );
}

// ── Select ─────────────────────────────────────────────────────────────────────────────

/**
 * A native select with the kit's look. `variant="filter"` is the compact one for a row of
 * filters: its visible `label` ("Payment") sits before the chosen value, which is set in mono.
 * Without a label it needs a Field around it or an aria-label.
 */
export function Select({ label, variant = "form", invalid, className, children, ...native }: {
  /** A visible name drawn inside the box, before the value. It also names the select. */
  label?: ReactNode;
  variant?: "form" | "filter";
  invalid?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "children">) {
  const box = (
    <>
      {label ? <span className="u-select-name">{label}</span> : null}
      <select {...native} className="u-select-el" aria-invalid={native["aria-invalid"] ?? (invalid || undefined)}>{children}</select>
      <UiIcon name="down" className="u-select-chev" />
    </>
  );
  const classes = cx("u-select", variant === "filter" && "u-select--filter", invalid && "u-input--bad", native.disabled && "u-input--off", className);
  return label ? <label className={classes}>{box}</label> : <span className={classes}>{box}</span>;
}

// ── Search ─────────────────────────────────────────────────────────────────────────────

/**
 * A search box. It has no visible label, so `label` names it for screen readers. The clear
 * button shows only when there is text. The placeholder says what is searched, in muted text.
 */
export function Search({ value, onChange, label, placeholder, clearLabel, landmark = false, className, ...native }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  /** The name of the clear button. Without it there is no clear button. */
  clearLabel?: string;
  /** Mark it as the page’s search landmark (role=search). Only one box per page should be. */
  landmark?: boolean;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className" | "type" | "placeholder" | "aria-label">) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div role={landmark ? "search" : undefined} className={cx("u-input u-search", className)}>
      <UiIcon name="search" className="u-search-ico" />
      <input
        {...native}
        ref={input}
        type="search"
        className="u-input-el"
        value={value}
        aria-label={label}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {clearLabel && value ? (
        <button type="button" className="u-search-clear" aria-label={clearLabel} onClick={() => { onChange(""); input.current?.focus(); }}>
          <UiIcon name="x" />
        </button>
      ) : null}
    </div>
  );
}

// ── Kbd ────────────────────────────────────────────────────────────────────────────────

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cx("u-kbd u-mono", className)}>{children}</kbd>;
}

// ── Toggle, Check, Radio ───────────────────────────────────────────────────────────────

/**
 * An on/off switch. With `children` the words sit beside it and name it; without, give
 * `label`. Say the state in words beside it too where it matters ("Shown" / "Hidden"): colour
 * and position alone are not enough.
 */
export function Toggle({ checked, onChange, label, disabled, className, children }: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const id = useId();
  const button = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={children ? undefined : label}
      aria-labelledby={children ? id : undefined}
      disabled={disabled}
      className="u-toggle"
      onClick={() => onChange(!checked)}
    >
      <span className="u-toggle-knob" />
    </button>
  );
  if (!children) return <span className={cx("u-toggle-wrap", className)}>{button}</span>;
  return (
    <span className={cx("u-toggle-wrap u-toggle-wrap--row", className)}>
      {button}
      <span id={id} className="u-toggle-text">{children}</span>
    </span>
  );
}

type CheckProps = {
  /** Mixed: some of a group's boxes are checked. Shown as a dash. */
  indeterminate?: boolean;
  className?: string;
  children?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className" | "children">;

/** A checkbox in its own label, so the whole row is the target. Without children, give aria-label. */
export function Check({ indeterminate = false, className, children, ...native }: CheckProps) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current) input.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className={cx("u-check", native.disabled && "u-check--off", className)}>
      <input {...native} ref={input} type="checkbox" className="u-check-input" />
      <span className="u-check-box" aria-hidden="true">
        <UiIcon name={indeterminate ? "minus" : "check"} />
      </span>
      {children ? <span className="u-check-text">{children}</span> : null}
    </label>
  );
}

/** A radio in its own label. Give a group the same `name`, and wrap it in FormSection. */
export function Radio({ className, children, ...native }: Omit<CheckProps, "indeterminate">) {
  return (
    <label className={cx("u-check u-radio", native.disabled && "u-check--off", className)}>
      <input {...native} type="radio" className="u-check-input" />
      <span className="u-check-box" aria-hidden="true"><span className="u-radio-dot" /></span>
      {children ? <span className="u-check-text">{children}</span> : null}
    </label>
  );
}
