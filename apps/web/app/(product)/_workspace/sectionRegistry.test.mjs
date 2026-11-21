// The section registry (sectionRegistry.ts) and the `?show=` filters (screens/shared.tsx) must keep
// every address the API builds working: the nav keys of apps/api/src/alyr/catalog.py are the
// workspace's routes, and ALYR Agent's links (`/app/orders?show=unconfirmed`) are built by the API.
// Source-reading, like the other tests of the workspace: the registry imports next/dynamic, which
// Node cannot load. Run with `pnpm test`.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const HERE = import.meta.dirname;
const REPO = join(HERE, "../../../../..");
const read = (path) => readFileSync(path, "utf8");
const registry = read(join(HERE, "sectionRegistry.ts"));
const shared = read(join(HERE, "screens/shared.tsx"));

/** Every `.py` file under a folder. */
function pythonFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pythonFiles(path);
    return entry.name.endsWith(".py") ? [path] : [];
  });
}

const entries = [...registry.matchAll(/\{ key: "([^"]+)", route: "([^"]+)", depth: (\d), gate: "(\w+)"/g)]
  .map(([, key, route, depth, gate]) => ({ key, route, depth: Number(depth), gate }));
const keys = entries.map((e) => e.key);

test("every entry has a unique key, and a route that is /app or /app/<key>", () => {
  assert.equal(new Set(keys).size, keys.length, "a key is listed twice");
  for (const { key, route } of entries) assert.equal(route, key === "home" ? "/app" : `/app/${key}`, key);
});

test("every screen key of the API's catalogue is a section", () => {
  const catalog = read(join(REPO, "apps/api/src/alyr/catalog.py"));
  const screens = [...catalog.matchAll(/Screen\("([a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(screens.length >= 10, "found the catalogue's screens");
  for (const screen of screens) assert.ok(keys.includes(screen), `/app/${screen} has no section`);
});

test("every /app address the API writes opens a section, and its ?show= a filter that screen knows", () => {
  const shows = new Map([...shared.matchAll(/^  (\w+): \{ tab: "(\w+)"/gm)].map((m) => [m[1], m[2]]));
  const found = new Set();
  for (const file of pythonFiles(join(REPO, "apps/api/src/alyr"))) {
    for (const [, section, query] of read(file).matchAll(/"\/app\/([a-z-]+)(\?[^"#]*)?/g)) found.add(`${section}${query ?? ""}`);
  }
  assert.ok(found.size >= 15, "found the API's links");
  for (const link of found) {
    const [section, query] = link.split("?");
    assert.ok(keys.includes(section), `the API links to /app/${section}, which has no section`);
    const show = new URLSearchParams(query ?? "").get("show");
    // The work screens (inbox, orders, bookings, credit accounts) filter by SHOWS; Catalog and
    // Documents read their own `?show=`.
    if (show && ["inbox", "orders", "bookings", "ledger"].includes(section)) {
      assert.equal(shows.get(show), section, `?show=${show} is not a filter of /app/${section}`);
    }
  }
});

test("the sections that read an address deeper than their key say how deep; none does yet", () => {
  for (const { key, depth } of entries) assert.equal(depth, 0, `${key} reads ${depth} more address parts: say so in this test`);
});

test("only the Documents module gates a section by itself, and the two connection screens sit under Connections", () => {
  assert.deepEqual(entries.filter((e) => e.gate === "documents").map((e) => e.key), ["connect"]);
  assert.match(registry, /key: "connect", [^}]*crumbUnder: "connections"/);
  assert.match(registry, /key: "connect-ai", [^}]*crumbUnder: "connections"/);
});
