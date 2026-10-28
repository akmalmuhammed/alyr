"use client";

// The bakery sales demo's engine (ALY-263, docs/work/ALY-263-demo-bakery/04-brief.md): one
// full-screen stage, the setup panel and nine scenes, each a few beats. The founder drives it
// from the keyboard or a presenter clicker; the owner taps the pain cards and the cake. The
// next scene cuts in along the fold's 45° diagonal; reduced motion cuts without travel.
// Nothing is fetched: every word is in copy.ts and every number is the visit's own or a
// labelled sample. The visit is kept in this browser only (localStorage), so a reload in the
// shop loses nothing; R clears it for the next shop.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Symbol } from "../../../_site/brand";
import { COPY } from "./copy";
import { CAKE_DEFAULT, NO_CAKE, type SceneProps, type Visit } from "./ctx";
import {
  LAST, RUN, SCENES, SETUP, START, TARGET, beats, progress, shopName, step,
  type Lang, type Pos, type Setup,
} from "./logic";
import { Icon, shopVar } from "./parts";
import { Bakery, How, Money, Next, SetupPanel } from "./SceneOpen";
import { Order } from "./SceneOrder";
import { Pains } from "./ScenePains";
import { Found, Sunday, System } from "./SceneSystem";
import { register } from "./offline";
import "./demo.css";

const KEY = "alyr-demo-bakery";
const THEME_KEY = "alyr-demo-theme";

type Saved = { lang: Lang; setup: Setup };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try { localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value)); } catch { /* private window */ }
}

const FRESH: Visit = { numbers: START, formula: false, tapped: [], cake: NO_CAKE, answers: [], checkup: null };

const SCENE_VIEW: Record<(typeof SCENES)[number], (p: SceneProps) => ReactNode> = {
  setup: SetupPanel, bakery: Bakery, money: Money, order: Order, pains: Pains,
  system: System, found: Found, sunday: Sunday, how: How, next: Next,
};

/** Scenes drawn on Carbon: the stage around them turns Carbon too. */
const CARBON = new Set([1, 9]);

const REDUCED = "(prefers-reduced-motion: reduce)";
const onReduced = (fn: () => void) => {
  const query = matchMedia(REDUCED);
  query.addEventListener("change", fn);
  return () => query.removeEventListener("change", fn);
};

const clock = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function Demo() {
  const [saved] = useState<Saved>(() => load<Saved>(KEY, { lang: "en", setup: SETUP }));
  const [lang, setLang] = useState<Lang>(saved.lang);
  const [setup, setSetupState] = useState<Setup>(saved.setup);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try { return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"; } catch { return "light"; }
  });
  const [pos, setPos] = useState<Pos>({ scene: 0, beat: 0 });
  const [leaving, setLeaving] = useState<Pos | null>(null);
  const [visit, setVisit] = useState<Visit>(FRESH);
  const [notes, setNotes] = useState(false);
  const [back, setBack] = useState<Pos | null>(null);
  const [started, setStarted] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const menu = useRef<HTMLDialogElement>(null);
  const reduced = useSyncExternalStore(onReduced, () => matchMedia(REDUCED).matches, () => true);

  const w = COPY[lang];
  const shop = shopName(setup, lang, w.fallback);

  useEffect(() => { save(KEY, { lang, setup }); }, [lang, setup]);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    save(THEME_KEY, theme);
  }, [theme]);
  useEffect(() => { register(); }, []);
  // The notes' clock: only while the notes are open.
  useEffect(() => {
    if (!notes) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [notes]);

  const go = useCallback((to: Pos, from?: Pos) => {
    setPos((current) => {
      if (to.scene === current.scene && to.beat === current.beat) return current;
      if (to.scene !== current.scene && !reduced) setLeaving(current);
      if (current.scene === 0 && to.scene > 0) setStarted((s) => s ?? Date.now());
      return to;
    });
    setBack(from ?? null);
  }, [reduced]);

  const change = useCallback((patch: Partial<Visit>) => setVisit((v) => ({ ...v, ...patch })), []);
  const setSetup = useCallback((patch: Partial<Setup>) => setSetupState((s) => ({ ...s, ...patch })), []);

  const next = useCallback(() => {
    // The cake: whatever the owner left untapped, the founder's Next fills in.
    if (SCENES[pos.scene] === "order" && pos.beat === 2) {
      const c = visit.cake;
      change({ cake: {
        size: c.size ?? CAKE_DEFAULT.size, flavour: c.flavour ?? CAKE_DEFAULT.flavour,
        message: c.message ?? CAKE_DEFAULT.message, day: c.day ?? CAKE_DEFAULT.day,
      } });
    }
    go(step(pos, 1, visit.tapped));
  }, [pos, visit.cake, visit.tapped, go, change]);

  const prev = useCallback(() => go(step(pos, -1, visit.tapped)), [pos, visit.tapped, go]);
  const start = useCallback(() => go({ scene: 1, beat: 0 }), [go]);
  const restart = useCallback(() => {
    setVisit(FRESH);
    setStarted(null);
    setNotes(false);
    go({ scene: 0, beat: 0 });
  }, [go]);

  const openMenu = useCallback(() => { menu.current?.showModal(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (menu.current?.open) return; // the dialog handles its own keys, Escape included
      const el = e.target as HTMLElement | null;
      const typing = !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
      if (typing) return;
      const control = !!el && (el.tagName === "BUTTON" || el.tagName === "A");
      const k = e.key;
      if (k === "PageDown" || k === "ArrowRight" || k === "ArrowDown" || (k === " " && !control)) {
        e.preventDefault();
        if (pos.scene === 0) start(); else next();
      } else if (k === "PageUp" || k === "ArrowLeft" || k === "ArrowUp") {
        e.preventDefault();
        prev();
      } else if (k === "Home") {
        e.preventDefault(); go({ scene: 1, beat: 0 });
      } else if (k === "End") {
        e.preventDefault(); go({ scene: LAST, beat: 0 });
      } else if (k === "n" || k === "N") {
        setNotes((n) => !n);
      } else if (k === "m" || k === "M") {
        e.preventDefault(); openMenu();
      } else if (k === "r" || k === "R") {
        restart();
      } else if (k === "l" || k === "L") {
        setLang((l) => (l === "en" ? "ar" : "en"));
      } else if (k === "d" || k === "D") {
        setTheme((t) => (t === "light" ? "dark" : "light"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pos.scene, next, prev, start, restart, go, openMenu]);

  const props = (at: Pos): SceneProps => ({
    w, lang, beat: at.beat, shop, setup, visit, change, setSetup, go, next, start,
  });

  const name = SCENES[pos.scene];
  const View = SCENE_VIEW[name];
  const Before = leaving ? SCENE_VIEW[SCENES[leaving.scene]] : null;
  const share = progress(pos, visit.tapped);
  const elapsed = started ? (now - started) / 1000 : 0;
  const count = beats(pos.scene, visit.tapped);
  const carbon = CARBON.has(pos.scene);

  const segments = useMemo(() => Array.from({ length: LAST }, (_, i) => i + 1), []);

  return (
    <div
      className={`dm ${carbon ? "is-carbon" : ""}`}
      dir={lang === "ar" ? "rtl" : "ltr"}
      lang={lang}
      style={shopVar(setup.colour)}
      data-scene={name}
    >
      <header className="dm-rail">
        <div className="dm-progress" aria-hidden="true">
          {segments.map((s) => {
            const fill = Math.min(1, Math.max(0, share * LAST - (s - 1)));
            return <span key={s} className="dm-seg"><i style={{ transform: `scaleX(${fill})` }} /></span>;
          })}
        </div>
        <div className="dm-rail-in">
          <span className="dm-brand">
            <Symbol className="dm-symbol" />
            <span className="dm-brand-name">ALYR</span>
          </span>
          <span className="dm-where" aria-live="polite">
            {pos.scene > 0 ? (
              <>
                <span className="dm-where-n">{String(pos.scene).padStart(2, "0")}</span>
                <span className="dm-sr">{w.ui.progress(pos.scene, LAST)}</span>
                <span className="dm-where-name">{w.scenes[pos.scene]}</span>
                <span className="dm-where-beat" aria-hidden="true">
                  {Array.from({ length: count }, (_, i) => <i key={i} className={i <= pos.beat ? "is-on" : ""} />)}
                </span>
              </>
            ) : <span className="dm-where-name">{w.scenes[0]}</span>}
            {lang === "ar" ? <span className="dm-draft">{w.draft}</span> : null}
          </span>
          <nav className="dm-tools" aria-label={w.ui.stage}>
            {back && pos.scene !== back.scene ? (
              <button type="button" className="dm-tool is-return" onClick={() => go(back)}>
                <Icon name="arrow-right" className="dm-ico dm-ico-back" />
                <span>{w.ui.jump(back.scene)}</span>
              </button>
            ) : null}
            <button type="button" className="dm-tool" onClick={openMenu} aria-haspopup="dialog">
              <Icon name="menu" className="dm-ico" /><span>{w.ui.scenes}</span>
            </button>
            <button type="button" className="dm-tool" onClick={() => setNotes((n) => !n)} aria-pressed={notes}>
              <Icon name="notes" className="dm-ico" /><span>{w.ui.notes}</span>
            </button>
            <button type="button" className="dm-tool" onClick={() => setLang(lang === "en" ? "ar" : "en")}
              lang={lang === "en" ? "ar" : "en"} aria-label={w.ui.langName}>
              <span>{w.ui.lang}</span>
            </button>
            <button type="button" className="dm-tool is-icon" onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label={theme === "light" ? w.ui.dark : w.ui.light}>
              <Icon name={theme === "light" ? "moon" : "sun"} className="dm-ico" />
            </button>
            <span className="dm-tools-gap" aria-hidden="true" />
            <button type="button" className="dm-tool is-icon" onClick={prev} disabled={pos.scene <= 1 && pos.beat === 0} aria-label={w.ui.back}>
              <Icon name="arrow-right" className="dm-ico dm-ico-back" />
            </button>
            <button type="button" className="dm-tool is-next" onClick={pos.scene === 0 ? start : next}
              disabled={pos.scene === LAST && pos.beat === count - 1}>
              <span>{w.ui.next}</span><Icon name="arrow-right" className="dm-ico dm-ico-fwd" />
            </button>
          </nav>
        </div>
      </header>

      <main className="dm-stage">
        <h1 className="dm-sr">{`ALYR · ${w.title}`}</h1>
        {leaving && Before ? (
          <section className={`dm-scene is-leaving ${CARBON.has(leaving.scene) ? "is-carbon" : ""}`} aria-hidden="true" inert key={`out-${leaving.scene}`}>
            <Before {...props(leaving)} />
          </section>
        ) : null}
        <section
          key={pos.scene}
          className={`dm-scene ${leaving ? "is-entering" : ""} ${carbon ? "is-carbon" : ""}`}
          data-beat={pos.beat}
          onAnimationEnd={(e) => { if (e.target === e.currentTarget) setLeaving(null); }}
        >
          <View {...props(pos)} />
        </section>
      </main>

      {notes ? (
        <aside className="dm-notes" aria-label={w.ui.notesTitle}>
          <div className="dm-notes-head">
            <b>{w.ui.notesTitle}</b>
            <span className="dm-notes-time">
              {w.ui.target} <bdi>{clock(TARGET[pos.scene])}</bdi> · {w.ui.elapsed} <bdi>{clock(elapsed)}</bdi> / <bdi>{clock(RUN)}</bdi>
            </span>
            <button type="button" className="dm-tool is-icon" onClick={() => setNotes(false)} aria-label={w.ui.close}>
              <Icon name="close" className="dm-ico" />
            </button>
          </div>
          {w.says[pos.scene].map((line) => <p key={line}>{line}</p>)}
        </aside>
      ) : null}

      <dialog ref={menu} className="dm-menu" aria-labelledby="dm-menu-title"
        onClick={(e) => { if (e.target === e.currentTarget) menu.current?.close(); }}>
        <div className="dm-menu-in">
          <div className="dm-menu-head">
            <h2 id="dm-menu-title">{w.ui.menuTitle}</h2>
            <button type="button" className="dm-tool is-icon" onClick={() => menu.current?.close()} aria-label={w.ui.close}>
              <Icon name="close" className="dm-ico" />
            </button>
          </div>
          <ol className="dm-menu-list">
            {SCENES.map((s, i) => (
              <li key={s}>
                <button type="button" className={`dm-menu-row ${i === pos.scene ? "is-on" : ""}`}
                  aria-current={i === pos.scene ? "step" : undefined}
                  onClick={() => { menu.current?.close(); go({ scene: i, beat: 0 }); }}>
                  <span className="dm-menu-n">{i === 0 ? "00" : String(i).padStart(2, "0")}</span>
                  <span>{w.scenes[i]}</span>
                  <span className="dm-menu-t"><bdi>{i ? clock(TARGET[i]) : ""}</bdi></span>
                </button>
              </li>
            ))}
          </ol>
          <dl className="dm-keys">
            {w.ui.keys.map(([key, what]) => (
              <div key={key}><dt><bdi dir="ltr">{key}</bdi></dt><dd>{what}</dd></div>
            ))}
          </dl>
          <button type="button" className="dm-tool" onClick={() => { menu.current?.close(); restart(); }}>
            <span>{w.ui.restart}</span>
          </button>
        </div>
      </dialog>
    </div>
  );
}
