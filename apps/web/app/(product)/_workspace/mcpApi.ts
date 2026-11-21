// What the connected-apps screen reads and writes (ALY-292, specs/067-mcp-connector): the
// workspace's side of the connector, `/api/mcp` (routes/mcp_manage.py). The answers are read
// defensively: a field that is missing or of another kind becomes its quiet default, never a crash,
// and nothing here is ever treated as markup. App names and what an app asked for are written by
// someone outside ALYR; they are drawn as text only (React escapes them) and never as HTML.

export type Settings = {
  enabled: boolean; enabledBy: string | null; enabledAt: string | null;
  paused: boolean; pausedBy: string | null; pausedAt: string | null; capHitAt: string | null;
};
export type Grant = {
  id: string; client: string; person: string; scopes: string[];
  createdAt: string | null; expiresAt: string | null; lastUsedAt: string | null;
  revokedAt: string | null; revokedBy: string | null; revokedWhy: string | null; live: boolean;
};
export type Overview = {
  settings: Settings; grants: Grant[]; changesPerDay: number | null; sendsPerDay: number | null; address: string;
};
/** One row of the activity record with channel `mcp`: a request (`action` "call") or a change to the connection. */
export type Row = {
  id: string; grantId: string; action: string; person: string; at: string | null; detail: Record<string, unknown>;
};

/**
 * Text written outside ALYR (an app's name, a person's name, what an app asked for), made safe to
 * show: control characters, zero-width characters and the marks that reorder a line (a right-to-left
 * override can make "end" read as "dne") are taken out; a line break stays only where asked.
 * Escaping is React's job and is never skipped; this is for what escaping does not stop.
 */
export function clean(value: string, { lines = false }: { lines?: boolean } = {}): string {
  return value.replace(lines ? WITH_LINES : NO_LINES, "");
}
// Written with escapes so the pattern can be read: C0 and C1 controls (a tab and a line break stay in
// WITH_LINES), the zero-width characters, the left-to-right and right-to-left marks, the embeddings
// and overrides (U+202A to U+202E), the word joiner and the isolates (U+2060 to U+2069), the BOM.
const NO_LINES = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;
const WITH_LINES = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;
const NAME_MAX = 80;
const text = (v: unknown): string => (typeof v === "string" ? clean(v).slice(0, NAME_MAX) : "");
const maybe = (v: unknown): string | null => (typeof v === "string" && clean(v) ? clean(v).slice(0, NAME_MAX) : null);
/** An ID or a time as the API wrote it: kept whole, and only if it is text. */
const id = (v: unknown): string => (typeof v === "string" ? v : "");
const stamp = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
/** What the record holds about a request, with every string in it made safe (it came from outside). */
function cleanDetail(value: unknown, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(object(value))) out[clean(k).slice(0, 80)] = cleanValue(v, depth);
  return out;
}
function cleanValue(v: unknown, depth: number): unknown {
  if (typeof v === "string") return clean(v, { lines: true }).slice(0, 2000);
  if (Array.isArray(v)) return depth > 4 ? [] : v.slice(0, 50).map((x) => cleanValue(x, depth + 1));
  if (v && typeof v === "object") return depth > 4 ? {} : cleanDetail(v, depth + 1);
  return typeof v === "number" || typeof v === "boolean" || v === null ? v : null;
}
const count = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const object = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function parseOverview(raw: unknown): Overview {
  const root = object(raw);
  const s = object(root.settings);
  const caps = object(root.caps);
  const grants = (Array.isArray(root.grants) ? root.grants : []).map((g): Grant => {
    const o = object(g);
    return {
      id: id(o.id), client: text(o.client), person: text(o.person),
      scopes: (Array.isArray(o.scopes) ? o.scopes : []).filter((x): x is string => typeof x === "string"),
      createdAt: stamp(o.created_at), expiresAt: stamp(o.expires_at), lastUsedAt: stamp(o.last_used_at),
      revokedAt: stamp(o.revoked_at), revokedBy: maybe(o.revoked_by), revokedWhy: maybe(o.revoked_why), live: o.live === true,
    };
  }).filter((g) => g.id);
  return {
    settings: {
      enabled: s.enabled === true, enabledBy: maybe(s.enabled_by), enabledAt: stamp(s.enabled_at),
      paused: s.paused === true, pausedBy: maybe(s.paused_by), pausedAt: stamp(s.paused_at), capHitAt: stamp(s.cap_hit_at),
    },
    grants, changesPerDay: count(caps.changes_per_day), sendsPerDay: count(caps.sends_per_day), address: id(root.address),
  };
}

export function parseRows(raw: unknown): Row[] {
  const list = object(raw).calls;
  return (Array.isArray(list) ? list : []).map((r): Row => {
    const o = object(r);
    // The record's detail is JSON; a driver that hands it over as text is read too.
    let detail = o.detail;
    if (typeof detail === "string") {
      try { detail = JSON.parse(detail); } catch { detail = {}; }
    }
    return { id: id(o.id), grantId: id(o.grant_id), action: text(o.action), person: text(o.person), at: stamp(o.at), detail: cleanDetail(object(detail)) };
  }).filter((r) => r.id);
}

/** How many a call ended (`{ended: n}`), 0 when the answer is not that shape. */
export const endedCount = (raw: unknown): number => count(object(raw).ended) ?? 0;
