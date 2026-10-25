// The demo's stand-in for the API (ALY-246). Read answers come from the recorded files in
// /demo/<shop>.json; changes are refused in plain words; sign-up (/start) is played by a small
// state machine kept in this browser tab (see ./signup.ts). Nothing here talks to a server.

import { signup } from "./signup";

export const DEMO_SHOPS = [
  { key: "qirfa", name: "Qirfa Bakery", name_ar: "مخبز قرفة", about: "Orders, bookings, chat and accounts" },
  { key: "salon", name: "Lumi Salon & Spa", name_ar: "صالون لومي للتجميل والسبا", about: "Bookings, services and the catalog" },
  { key: "wholesale", name: "Rawda Trading", name_ar: "روضة للتجارة", about: "Wholesale orders, price groups and accounts" },
] as const;

export type Blocked = { method: string; path: string };
type Pack = { me: Record<string, unknown> | null; get: Record<string, { status: number; body: unknown }> };

const KEY = "alyr-demo-shop";
export function currentShop(): string {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored && DEMO_SHOPS.some((s) => s.key === stored)) return stored;
  } catch { /* storage blocked: the first shop */ }
  return DEMO_SHOPS[0].key;
}
export function setShop(key: string) {
  try { localStorage.setItem(KEY, key); } catch { /* storage blocked */ }
}

const packs: Record<string, Promise<Pack>> = {};
export const loadPack = (real: typeof fetch, key: string) =>
  (packs[key] ??= real(`/demo/${key}.json`).then((r) => r.json() as Promise<Pack>));

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function answer(real: typeof fetch, method: string, url: URL, body: unknown): Promise<Response> {
  const path = url.pathname;
  const mine = await signup(real, method, url, body);
  if (mine) return mine;

  if (path === "/api/auth/code") return json({ sent: true, dev_code: "482913" });
  if (path === "/api/auth/verify") {
    const pack = await loadPack(real, currentShop());
    return json(pack.me ?? { signed_in: true, name: "Demo owner", role: "owner" });
  }
  if (path === "/api/auth/logout") return json({ ok: true });

  if (method === "GET" || method === "HEAD") {
    const pack = await loadPack(real, currentShop());
    // The exact address first; else the same address with whatever query string was recorded.
    const exact = pack.get[path + url.search];
    const near = exact ?? pack.get[path] ?? pack.get[Object.keys(pack.get).find((k) => k.startsWith(path + "?")) ?? ""];
    if (near) return json(near.body, near.status);
    return json({ detail: "This part is not in the demo." }, 404);
  }

  window.dispatchEvent(new CustomEvent<Blocked>("alyr-demo-blocked", { detail: { method, path } }));
  return json({ detail: "This is a demo, so that change was not saved." }, 409);
}
