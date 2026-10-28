"use client";

// The setup panel and the scenes that open and close the visit: 1 their bakery, 2 where the
// money goes, 8 how we work, 9 next step.

import { useId, type CSSProperties } from "react";
import type { SceneProps } from "./ctx";
import {
  DAYS, LIMITS, PAINS, SHARE, SHOP_COLOURS, clamp, estimate, painOrder, qar, testLine,
  type Numbers, type Pain,
} from "./logic";
import { Icon, Label, Labels, Line, M, Monogram, Qr } from "./parts";

const i = (n: number) => ({ "--i": n }) as CSSProperties;

// ── Setup ─────────────────────────────────────────────────────────────────────

export function SetupPanel({ w, setup, setSetup, start, shop }: SceneProps) {
  const id = useId();
  const s = w.setup;
  return (
    <div className="dm-setup">
      <div className="dm-setup-copy">
        <p className="dm-eyebrow">{s.eyebrow}</p>
        <Line>{s.title}</Line>
        <p className="dm-lead">{s.lead}</p>
        <div className="dm-setup-preview dm-in" style={i(2)}>
          <span className="dm-eyebrow">{s.preview}</span>
          <div className="dm-shopbar">
            <Monogram name={shop} big />
            <b dir="auto">{shop}</b>
          </div>
        </div>
      </div>
      <form className="dm-form" onSubmit={(e) => { e.preventDefault(); start(); }}>
        <div className="dm-field">
          <label htmlFor={`${id}-name`}>{s.name}</label>
          <input id={`${id}-name`} value={setup.name} dir="auto" autoComplete="off" placeholder={w.fallback.en}
            aria-describedby={`${id}-name-h`} onChange={(e) => setSetup({ name: e.target.value })} />
          <small id={`${id}-name-h`}>{s.nameHint}</small>
        </div>
        <div className="dm-field">
          <label htmlFor={`${id}-ar`}>{s.nameAr}</label>
          <input id={`${id}-ar`} value={setup.nameAr} dir="rtl" lang="ar" autoComplete="off" placeholder={w.fallback.ar}
            onChange={(e) => setSetup({ nameAr: e.target.value })} />
        </div>
        <fieldset className="dm-field dm-swatches">
          <legend>{s.colour}</legend>
          <div className="dm-swatch-row">
            {SHOP_COLOURS.map((c) => (
              <label key={c} className="dm-swatch" style={{ "--shop": `var(--shop-${c})` } as CSSProperties}>
                <input type="radio" name={`${id}-colour`} value={c} checked={setup.colour === c}
                  onChange={() => setSetup({ colour: c })} />
                <span className="dm-swatch-chip" aria-hidden="true" />
                <span className="dm-swatch-name">{s.colours[c]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="dm-field">
          <label htmlFor={`${id}-line`}>{s.line}</label>
          <input id={`${id}-line`} value={setup.line} dir="ltr" inputMode="url" autoComplete="off" placeholder="wa.me/974…"
            aria-describedby={`${id}-line-h`} onChange={(e) => setSetup({ line: e.target.value })} />
          <small id={`${id}-line-h`}>{s.lineHint}</small>
        </div>
        <button type="submit" className="dm-btn is-volt">
          <span>{s.start}</span><Icon name="arrow-right" className="dm-ico dm-ico-fwd" />
        </button>
      </form>
    </div>
  );
}

// ── 1 · Their bakery ──────────────────────────────────────────────────────────

export function Bakery({ w, beat, shop }: SceneProps) {
  const b = w.bakery;
  return (
    <div className={`dm-open ${beat ? "is-chats" : ""}`}>
      <div className="dm-open-type">
        <p className="dm-open-shop dm-rise" dir="auto">{shop}.</p>
        <p className="dm-open-day dm-rise" style={i(3)}>{b.day}</p>
        <p className="dm-open-clock dm-rise" style={i(6)}><bdi>{b.clock}</bdi></p>
        {beat >= 1 ? <Line size="title" className="dm-open-unread dm-in">{b.unread}</Line> : null}
      </div>
      {beat >= 1 ? (
        <div className="dm-chats" role="img" aria-label={`${b.list} · ${w.labels.sample}`}>
          <div className="dm-chats-head">
            <span>{b.list}</span>
            <Label kind="sample">{w.labels.sample}</Label>
          </div>
          <ol className="dm-chats-list">
            {b.previews.map(([who, said, at], n) => (
              <li key={who} className="dm-chat-row dm-in" style={i(n)}>
                <span className="dm-chat-av" aria-hidden="true">{who.charAt(0)}</span>
                <span className="dm-chat-who" dir="auto">{who}</span>
                <span className="dm-chat-time"><bdi>{at}</bdi></span>
                <span className="dm-chat-said" dir="auto">{said}</span>
                <span className="dm-chat-dot" aria-hidden="true" />
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

// ── 2 · Where the money goes ──────────────────────────────────────────────────

function Stepper({ label, value, unit, onChange, limits, lang, fewer, more }: {
  label: string; value: number; unit?: "qar" | "pct"; onChange: (n: number) => void;
  limits: { min: number; max: number; step: number }; lang: "en" | "ar"; fewer: string; more: string;
}) {
  const shown = unit === "qar" ? qar(value, lang) : unit === "pct" ? `${value}%` : String(value);
  return (
    <div className="dm-step">
      <span className="dm-step-label">{label}</span>
      <output className="dm-step-value" aria-live="polite"><M>{shown}</M></output>
      <div className="dm-step-btns">
        <button type="button" className="dm-sq" aria-label={fewer} disabled={value <= limits.min}
          onClick={() => onChange(clamp(value - limits.step, limits.min, limits.max))}>
          <Icon name="minus" className="dm-ico" />
        </button>
        <button type="button" className="dm-sq" aria-label={more} disabled={value >= limits.max}
          onClick={() => onChange(clamp(value + limits.step, limits.min, limits.max))}>
          <Icon name="plus" className="dm-ico" />
        </button>
      </div>
    </div>
  );
}

export function Money({ w, lang, beat, visit, change }: SceneProps) {
  const m = w.money;
  const n = visit.numbers;
  const set = (patch: Partial<Numbers>) => {
    const out = { ...n, ...patch };
    change({ numbers: { ...out, after: Math.min(out.after, out.daily) } });
  };
  const total = estimate(n);

  if (beat >= 2) {
    const toggle = (p: Pain) => {
      const has = visit.tapped.includes(p);
      change({ tapped: has ? visit.tapped.filter((x) => x !== p) : [...visit.tapped, p] });
    };
    return (
      <div className="dm-pains-pick">
        <div className="dm-pick-head">
          <Line>{m.painsTitle}</Line>
          <span className="dm-pick-count" aria-live="polite">{visit.tapped.length ? m.tapped(visit.tapped.length) : m.none}</span>
        </div>
        <div className="dm-pick-grid">
          {PAINS.map((p, k) => {
            const at = visit.tapped.indexOf(p);
            return (
              <button key={p} type="button" className={`dm-pain dm-in ${at >= 0 ? "is-on" : ""}`} style={i(k)}
                aria-pressed={at >= 0} onClick={() => toggle(p)}>
                <span className="dm-pain-n" aria-hidden="true">{at >= 0 ? at + 1 : ""}</span>
                <span className="dm-pain-text">{m.pains[p]}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const L = LIMITS;
  return (
    <div className="dm-cash">
      <Line>{m.title}</Line>
      <div className="dm-steps">
        <Stepper label={m.inputs.daily} value={n.daily} limits={L.daily} lang={lang}
          fewer={m.fewer(m.inputs.daily)} more={m.more(m.inputs.daily)} onChange={(v) => set({ daily: v })} />
        <Stepper label={m.inputs.after} value={n.after} limits={{ ...L.after, max: Math.min(L.after.max, n.daily) }} lang={lang}
          fewer={m.fewer(m.inputs.after)} more={m.more(m.inputs.after)} onChange={(v) => set({ after: v })} />
        <Stepper label={m.inputs.average} value={n.average} unit="qar" limits={L.average} lang={lang}
          fewer={m.fewer(m.inputs.average)} more={m.more(m.inputs.average)} onChange={(v) => set({ average: v })} />
      </div>
      {beat >= 1 ? (
        <div className="dm-leak dm-in">
          <p className="dm-leak-line">
            {m.month[0]}<M>{qar(total, lang)}</M>{m.month[1]}
          </p>
          <Labels>
            <Label kind="estimate">{w.labels.estimate}</Label>
            <button type="button" className="dm-link" aria-expanded={visit.formula} onClick={() => change({ formula: !visit.formula })}>
              {visit.formula ? m.hide : m.how}
            </button>
          </Labels>
          {visit.formula ? (
            <div className="dm-formula dm-in">
              <div className="dm-terms">
                <span className="dm-term"><b><M>{Math.min(n.after, n.daily)}</M></b><small>{m.terms.after}</small></span>
                <span className="dm-x" aria-hidden="true">×</span>
                <span className="dm-term"><b><M>{DAYS}</M></b><small>{m.terms.days}</small></span>
                <span className="dm-x" aria-hidden="true">×</span>
                <span className="dm-term is-share">
                  <b><M>{`${n.share}%`}</M></b><small>{m.terms.share}</small>
                  <span className="dm-step-btns">
                    <button type="button" className="dm-sq is-sm" aria-label={m.fewer(m.terms.share)} disabled={n.share <= SHARE.min}
                      onClick={() => set({ share: clamp(n.share - SHARE.step, SHARE.min, SHARE.max) })}><Icon name="minus" className="dm-ico" /></button>
                    <button type="button" className="dm-sq is-sm" aria-label={m.more(m.terms.share)} disabled={n.share >= SHARE.max}
                      onClick={() => set({ share: clamp(n.share + SHARE.step, SHARE.min, SHARE.max) })}><Icon name="plus" className="dm-ico" /></button>
                  </span>
                </span>
                <span className="dm-x" aria-hidden="true">×</span>
                <span className="dm-term"><b><M>{qar(n.average, lang)}</M></b><small>{m.terms.average}</small></span>
                <span className="dm-x" aria-hidden="true">≈</span>
                <span className="dm-term is-total"><b><M>{qar(total, lang)}</M></b><small>{m.terms.month}</small></span>
              </div>
              <p className="dm-note">{m.share}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── 8 · How we work ───────────────────────────────────────────────────────────

export function How({ w, beat, visit, change }: SceneProps) {
  const h = w.how;
  return (
    <div className="dm-how">
      <p className="dm-eyebrow">{h.title}</p>
      <ol className={`dm-how-steps ${beat ? "is-small" : ""}`}>
        {h.steps.map((s, k) => (
          <li key={s} className="dm-how-step dm-in" style={i(k * 2)}>
            <span className="dm-disc" aria-hidden="true">{k + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      {beat >= 1 ? (
        <div className="dm-objs dm-in">
          <p className="dm-eyebrow">{h.objTitle}</p>
          <div className="dm-obj-grid">
            {h.objections.map(([q, a], k) => {
              const open = visit.answers.includes(k);
              return (
                <button key={q} type="button" className={`dm-obj ${open ? "is-open" : ""}`} aria-expanded={open}
                  onClick={() => change({ answers: open ? visit.answers.filter((x) => x !== k) : [...visit.answers, k] })}>
                  <span className="dm-obj-q">{q}</span>
                  {open ? <span className="dm-obj-a dm-in">{a}</span> : <Icon name="plus" className="dm-ico" />}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── 9 · Next step ─────────────────────────────────────────────────────────────

function days(lang: "en" | "ar") {
  const out: string[] = [];
  const day = new Date();
  for (let k = 1; out.length < 6 && k < 10; k++) {
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate() + k);
    out.push(d.toLocaleDateString(lang === "ar" ? "ar-u-nu-latn" : "en-GB", { weekday: "long", day: "numeric", month: "long" }));
  }
  return out;
}

export function Next({ w, lang, beat, visit, change, setup, next }: SceneProps) {
  const x = w.next;
  const link = testLine(setup.line);
  const chosen = visit.checkup;
  const list = days(lang);
  const pains = visit.tapped.length ? painOrder(visit.tapped) : [];
  return (
    <div className="dm-close">
      <div className="dm-close-copy">
        <Line size="hero" className="dm-rise">{x.title}</Line>
        {beat === 0 ? (
          <button type="button" className="dm-btn is-volt is-big dm-in" style={i(4)} onClick={next}>
            <span>{x.book}</span><Icon name="arrow-right" className="dm-ico dm-ico-fwd" />
          </button>
        ) : (
          <div className="dm-book dm-in">
            <p className="dm-eyebrow">{x.pick}</p>
            <div className="dm-days">
              {list.map((d, k) => (
                <button key={d} type="button" className={`dm-chip ${chosen === k ? "is-on" : ""}`} aria-pressed={chosen === k}
                  onClick={() => change({ checkup: k })}>{d}</button>
              ))}
            </div>
            {chosen !== null && chosen >= 0 ? <p className="dm-booked dm-in" role="status">{x.booked(list[chosen])}</p> : null}
            <div className="dm-kept">
              <p className="dm-eyebrow">{x.start}</p>
              <ul>
                {pains.length ? pains.map((p) => <li key={p}>{w.money.pains[p]}</li>) : <li>{x.none}</li>}
              </ul>
              <small>{x.kept}</small>
            </div>
          </div>
        )}
      </div>
      {link ? (
        <figure className="dm-close-qr dm-in" style={i(6)}>
          <Qr link={link} label={x.scan} />
          <figcaption>{x.scan}</figcaption>
        </figure>
      ) : null}
    </div>
  );
}
