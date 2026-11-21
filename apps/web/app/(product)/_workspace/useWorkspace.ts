"use client";

// The data half of the workspace shell: what `/api/workspace` and the home say, the agent view,
// the language, the clock, the polling and the search palette's commands. It draws nothing, so
// a second shell can render the same data as `LegacyShell` does (the redesign's prep refactor).
// Moved out of the shell page unchanged: the same state, the same requests, the same order.

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentView } from "../../_agent/types";
import { subItems, viewHref, type View } from "./discoveryLogic";
import { T as DISCOVERY } from "./discoveryCopy";
import { keepLang, savedLang, type Lang } from "./lang";
import { usePolling } from "./poll";
import { crumbParent } from "./sectionRegistry";
import { T } from "./shellCopy";

export type Text = { en: string; ar: string };
export type NavItem = { key: string; label: Text; icon: string };
export type Step = { key: string; label: Text; done: boolean; screen: string; connection: string; asked: boolean };
export type Product = {
  key: string; name: Text; descriptor: Text; summary: Text;
  // included: every business has it (ALYR Agent); it has no switch.
  status: "active" | "available" | "included";
  off_note: Text | null;
  modules: string[]; includes: { key: string; label: Text }[]; steps: Step[];
};
export type Connection = { key: string; name: Text; detail: Text; connected: boolean; available: boolean };
export type State = {
  business: { name: string; name_ar: string; slug: string };
  me: { name: string; role: string; signed_in: boolean };
  can_manage: boolean;
  modules: string[];
  nav: { core: NavItem[]; products: NavItem[]; account: NavItem[] };
  products: Product[];
  connections: Connection[];
  plan: { status: "preparing" | "published" | "accepted"; monthly_total_text?: string } | null;
};
export type Card = { key: string; module: string; label: Text; value: number; text: string };
// The go-live readiness check (ALY-165, D-049): the same answer as /start and the back office.
export type Readiness = { stage: "setting_up" | "ready" | "live"; checks: { key: string; label: Text; status: string }[]; left: string[] };
export type Command = { id: string; group: string; label: string; icon: string; run: () => void; current?: boolean };

export async function send(url: string, body?: object) {
  const response = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

export function useWorkspace() {
  const router = useRouter();
  const params = useParams<{ section?: string[] }>();
  // The address after `/app`: `section` is its first part ("orders"), `segments` the parts after
  // it (`/app/orders/1001` gives ["1001"]), `id` the `?id=` an open row or drawer can name. No
  // screen reads `segments` or `id` yet; every address that works today is one part, and
  // `?show=` is read below as it always was.
  const path = params.section ?? [];
  const section = path[0] ?? "home";
  const segments = path.slice(1);
  const pathKey = path.join("/");
  const id = useSearchParams().get("id");
  const [state, setState] = useState<State | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [agent, setAgent] = useState<AgentView | null>(null);
  const [agentRise, setAgentRise] = useState(false);
  // ALYR Agent's links open a screen filtered to the rows a rule counted (`?show=`).
  const [show, setShow] = useState<string | null>(null);
  // The view Discovery's address names (`?view=`), told to the shell by `ViewReporter` so the menu can mark it.
  const [discoveryView, setDiscoveryView] = useState<View>("home");
  const agentLoaded = useRef(false);
  const [offline, setOffline] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [langReady, setLangReady] = useState(false);
  // The language a person chose is kept on this device (_workspace/lang.ts, shared with
  // sign-in). Each screen of the workspace is a new page component, so without it a card on
  // the home screen (or any link inside ALYR Agent) would send an Arabic reader back to
  // English. A browser that refuses storage starts in English every time.
  useEffect(() => {
    const read = setTimeout(() => {
      const saved = savedLang();
      if (saved) setLang(saved);
      setLangReady(true);
    }, 0);
    return () => clearTimeout(read);
  }, []);
  const chooseLang = useCallback((next: Lang) => {
    setLang(next);
    keepLang(next);
  }, []);
  // The home's help box and the Products screen's confirm keep their state here, not in their
  // sections, so a section that is drawn again (a language switch) keeps them as it always did.
  const [help, setHelp] = useState("");
  const [helpSent, setHelpSent] = useState("");
  const [confirming, setConfirming] = useState("");
  const [busy, setBusy] = useState("");
  const [clock, setClock] = useState<{ hour: number; text: string } | null>(null);
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const t = T[lang];
  const pick = useCallback((text: Text) => text[lang], [lang]);

  const load = useCallback(async () => {
    // Signed out (or the session ended): the sign-in page, not "cannot reach ALYR".
    let signedOut = false;
    const json = (r: Response) => {
      if (r.status === 401) signedOut = true;
      return r.ok ? r.json() : Promise.reject();
    };
    try {
      const [s, h] = await Promise.all([
        fetch("/api/workspace", { cache: "no-store" }).then(json),
        fetch("/api/workspace/home", { cache: "no-store" }).then(json),
      ]);
      setState(s);
      setCards(h.cards);
      setOffline(false);
      // Only those who can act on it see what is left to go live.
      if (s.can_manage) {
        const r = await fetch("/api/onboarding/readiness", { cache: "no-store" });
        if (r.ok) setReadiness(await r.json());
      }
    } catch {
      if (signedOut) {
        router.replace("/login");
        return;
      }
      setOffline(true);
    }
  }, [router]);

  // Every 15 s while the workspace is on show, and at once when the person comes back to it.
  usePolling(load, 15_000);

  // ALYR Agent on the home screen. A poll replaces the numbers and never re-animates them;
  // they rise once a session, on the first load.
  const loadAgent = useCallback(async () => {
    try {
      const response = await fetch(`/api/agent?lang=${lang}`, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const view: AgentView = await response.json();
      if (!agentLoaded.current) {
        agentLoaded.current = true;
        let first = false;
        try {
          first = !sessionStorage.getItem("alyr-agent-rose");
          sessionStorage.setItem("alyr-agent-rose", "1");
        } catch {
          first = false;
        }
        setAgentRise(first);
        // Once a session: a later remount (a language switch) does not rise again.
        if (first) setTimeout(() => setAgentRise(false), 1500);
      }
      setAgent(view);
    } catch {
      // The last numbers stay on screen; the shell's offline line says why.
    }
  }, [lang]);

  // Not before the saved language is known, or an Arabic reader would first be sent English.
  usePolling(loadAgent, 15_000, section === "home" && langReady);

  useEffect(() => {
    const read = setTimeout(() => setShow(new URLSearchParams(window.location.search).get("show")), 0);
    return () => clearTimeout(read);
    // pathKey, not section: a deeper address (`/app/orders/1001?show=unpaid`) reads it again too
  }, [pathKey]);

  async function notNow(key: string, fingerprint: string) {
    await send("/api/agent/not-now", { key, fingerprint });
    await loadAgent();
  }

  // Shop time is Doha time, whatever the laptop says.
  useEffect(() => {
    const tickClock = () => {
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Qatar", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).formatToParts(now);
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
      setClock({ hour: Number(get("hour")), text: `${get("weekday")} ${get("day")} ${get("month")} · ${get("hour")}:${get("minute")}` });
    };
    const first = setTimeout(tickClock, 0);
    const timer = setInterval(tickClock, 30_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((open) => !open);
        setQuery("");
        setCursor(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function setProduct(product: Product, on: boolean) {
    setBusy(product.key);
    try {
      await send(`/api/workspace/products/${product.key}/${on ? "enable" : "disable"}`);
      setConfirming("");
      await load();
    } finally {
      setBusy("");
    }
  }

  async function ask(productKey: string, stepKey: string, note = "") {
    await send("/api/workspace/setup-requests", { product: productKey, step: stepKey, note });
    load();
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const allNav = useMemo(
    () => (state ? [...state.nav.core, ...state.nav.products, ...state.nav.account] : []),
    [state],
  );

  const commands: Command[] = useMemo(() => {
    // A section with views beneath it (only Discovery) lists them under its own name, the current one marked.
    const list: Command[] = allNav.flatMap((item) => [
      {
        id: `go-${item.key}`, group: t.go, label: pick(item.label), icon: item.icon,
        run: () => router.push(item.key === "home" ? "/app" : `/app/${item.key}`),
      },
      ...subItems(item.key, state?.can_manage ?? false).map((v) => ({
        id: `go-${item.key}-${v}`, group: t.go, label: `${pick(item.label)} · ${DISCOVERY[lang].views[v]}`, icon: item.icon,
        run: () => router.push(viewHref(v)), current: section === item.key && discoveryView === v,
      })),
    ]);
    list.push(
      { id: "ask", group: t.actions, label: t.ask, icon: "chat", run: () => router.push("/app#ask") },
      // Not in the navigation: ALYR Agent links to it when a message fails (specs/036).
      { id: "go-unsent", group: t.go, label: t.notSent, icon: "inbox", run: () => router.push("/app/unsent") },
      { id: "lang", group: t.actions, label: t.langName, icon: "globe", run: () => chooseLang(lang === "en" ? "ar" : "en") },
    );
    if (state?.me.signed_in) list.push({ id: "out", group: t.actions, label: t.signOut, icon: "out", run: signOut });
    return list;
    // signOut only uses router, which is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allNav, discoveryView, lang, pick, router, section, state?.can_manage, state?.me.signed_in, t]);

  const matches = commands.filter((c) => c.label.toLowerCase().includes(query.trim().toLowerCase()));

  function runCommand(command: Command | undefined) {
    if (!command) return;
    setPalette(false);
    command.run();
  }

  function openPalette() {
    setPalette(true);
    setQuery("");
    setCursor(0);
  }

  // What the shell and its sections read from the loaded state. Empty until the state has come.
  const enabledScreens = new Set(allNav.map((n) => n.key));
  const shopName = !state ? "" : lang === "ar" && state.business.name_ar ? state.business.name_ar : state.business.name;
  // The two connection screens (ALY-142, ALY-292) live under Connections in the breadcrumb
  // (their registry entries say so).
  const crumb = crumbParent(section);
  const current = allNav.find((n) => n.key === section)
    ?? (crumb ? allNav.find((n) => n.key === crumb) : undefined);
  const documentsOn = state?.modules.includes("documents") ?? false;

  return {
    router, section, segments, id,
    state, cards, readiness, agent, agentRise, offline,
    show, setShow, discoveryView, setDiscoveryView,
    lang, langReady, chooseLang, t, pick,
    help, setHelp, helpSent, setHelpSent, confirming, setConfirming, busy,
    clock,
    palette: { isOpen: palette, open: openPalette, close: () => setPalette(false), query, setQuery, cursor, setCursor, matches, run: runCommand },
    load, notNow, setProduct, ask, signOut,
    allNav, enabledScreens, shopName, current, documentsOn,
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;
/** A workspace whose state has come: what every section is given. */
export type ReadyWorkspace = Workspace & { state: State };

export function isReady(ws: Workspace): ws is ReadyWorkspace {
  return ws.state !== null;
}
