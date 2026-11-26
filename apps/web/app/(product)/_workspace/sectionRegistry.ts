// The workspace's sections as a list: its key (the first part of the address after `/app`), the
// address, when it opens and the component that draws it. A shell looks a section up here instead
// of walking an if-chain, so a new section is one entry and one file, not an edit to the shell.
//
// Every section but Home is loaded when it is first opened (`next/dynamic`), so the page ships
// only the screens a person opens. A section's component is given the loaded workspace
// (`useWorkspace()`), and reads what it needs from it.
//
// The keys are the API's nav keys (`apps/api/src/alyr/catalog.py`): do not rename one here
// without changing the API and ALYR Agent's links (`?show=`) with it.

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import HomeSection from "./sections/HomeSection";
import type { ReadyWorkspace } from "./useWorkspace";

export type SectionProps = { ws: ReadyWorkspace };

/** When a section opens: always; only when the API's nav lists it (its module is on for this
 * shop); or only where the Documents module is on. Otherwise the shell says it isn't switched on. */
export type Gate = "always" | "nav" | "documents";

export type SectionDef = {
  key: string;
  /** The address of the section's own page. A section that reads deeper addresses
   * (`/app/orders/<id>`) says so in `depth`. */
  route: string;
  /** How many parts after the key the section reads from the address (`ws.segments`). None do yet. */
  depth: 0 | 1 | 2;
  gate: Gate;
  /** The section the breadcrumb sits under, where the nav has no item of its own for this one. */
  crumbUnder?: string;
  /** The component that draws it; lazy except Home, which most visits land on. */
  load: ComponentType<SectionProps>;
  /** The redesigned screen of this section, drawn in `NewShell` when a visitor opts in with
   * `?ui=2` (and then remembered on their device). `defaultUi` is what a visitor who never chose
   * gets: it is 1 (the classic look) for every section until the founder flips it. `fill` is a
   * screen that owns the whole page below the top bar (the Inbox's panes) instead of sitting in
   * the padded column. */
  v2?: { load: ComponentType<SectionProps>; defaultUi: 1 | 2; fill?: boolean };
};

export const SECTIONS: SectionDef[] = [
  { key: "home", route: "/app", depth: 0, gate: "always", load: HomeSection },
  { key: "account", route: "/app/account", depth: 0, gate: "always", load: dynamic(() => import("./sections/AccountSection")), v2: { load: dynamic(() => import("./sections/v2/AccountV2Section")), defaultUi: 1 } },
  { key: "products", route: "/app/products", depth: 0, gate: "always", load: dynamic(() => import("./sections/ProductsSection")) },
  { key: "connections", route: "/app/connections", depth: 0, gate: "always", load: dynamic(() => import("./sections/ConnectionsSection")) },
  { key: "unsent", route: "/app/unsent", depth: 0, gate: "always", load: dynamic(() => import("./sections/NotSentSection")) },
  { key: "connect", route: "/app/connect", depth: 0, gate: "documents", crumbUnder: "connections", load: dynamic(() => import("./sections/ConnectSection")) },
  { key: "connect-ai", route: "/app/connect-ai", depth: 0, gate: "always", crumbUnder: "connections", load: dynamic(() => import("./sections/McpSection")) },
  { key: "catalog", route: "/app/catalog", depth: 0, gate: "nav", load: dynamic(() => import("./sections/CatalogSection")) },
  { key: "documents", route: "/app/documents", depth: 0, gate: "nav", load: dynamic(() => import("./sections/DocumentsSection")) },
  { key: "discovery", route: "/app/discovery", depth: 0, gate: "nav", load: dynamic(() => import("./sections/DiscoverySection")), v2: { load: dynamic(() => import("./discovery-v2/DiscoveryV2Section")), defaultUi: 1 } },
  { key: "inbox", route: "/app/inbox", depth: 0, gate: "nav", load: dynamic(() => import("./sections/InboxSection")), v2: { load: dynamic(() => import("./sections/v2/InboxV2Section")), defaultUi: 1, fill: true } },
  { key: "ledger", route: "/app/ledger", depth: 0, gate: "nav", load: dynamic(() => import("./sections/CreditSection")), v2: { load: dynamic(() => import("./sections/v2/CreditV2Section")), defaultUi: 1 } },
  { key: "orders", route: "/app/orders", depth: 0, gate: "nav", load: dynamic(() => import("./sections/OrdersSection")), v2: { load: dynamic(() => import("./sections/v2/OrdersV2Section")), defaultUi: 1 } },
  { key: "bookings", route: "/app/bookings", depth: 0, gate: "nav", load: dynamic(() => import("./sections/BookingsSection")) },
  { key: "team", route: "/app/team", depth: 0, gate: "nav", load: dynamic(() => import("./sections/TeamSection")), v2: { load: dynamic(() => import("./sections/v2/TeamV2Section")), defaultUi: 1 } },
];

export function findSection(key: string): SectionDef | undefined {
  return SECTIONS.find((s) => s.key === key);
}

/** The nav key a section's breadcrumb sits under ("connect" is under "connections"), if any. */
export function crumbParent(key: string): string | undefined {
  return findSection(key)?.crumbUnder;
}

/** Whether the section may be drawn for this workspace. A key no entry names never opens. */
export function sectionOpens(def: SectionDef, ws: ReadyWorkspace): boolean {
  if (def.gate === "nav") return ws.enabledScreens.has(def.key);
  if (def.gate === "documents") return ws.documentsOn;
  return true;
}

/** The redesigned screen of a section, when it has one. */
export function v2Of(key: string): SectionDef["v2"] {
  return findSection(key)?.v2;
}
