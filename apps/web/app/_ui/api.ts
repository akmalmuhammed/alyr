// The one small fetch client for the product's screens (Product UI foundation). It replaces the
// ten ad-hoc wrappers the old screens grew (`api()` in catalogApi.ts, documentsApi.ts,
// discoveryApi.ts, `getJson` in Screens.tsx and the rest) with the behaviour they already share:
//
//   - JSON in and out, `cache: "no-store"`, same-origin cookies (the API answers on /api/*);
//   - a refusal throws `ApiError` with the HTTP `status`, the API's `code`, the API's own words
//     (`message`, and `ar` when it sends `message_ar`) and the whole body in `detail`;
//   - no answer at all (offline, a dropped request) is `ApiError` with status 0 and code "offline";
//   - `say(error, lang)` turns any of that into a sentence in the person's language;
//   - 401 signs the person out the way the workspace shell does: to /login, once, coming back to
//     this page after (`loginUrl`, the same safe `next` the sign-in page reads). A screen that
//     shows its own sign-in state (the back office) passes `signOut: false`.
//
// No dependency and no cache: a screen that polls uses `usePolling` (_workspace/poll.ts). The
// three refusal shapes the API sends are all read: {detail: "words"}, {detail: {code, message,
// message_ar}} and {detail: "words", code, message_ar}; FastAPI's 422 list is "invalid".
// Erasable TypeScript with relative `.ts` imports, so `node --test` runs the pure parts.

import { API_COPY, type Say } from "./apiCopy.ts";
import type { Lang } from "./format.ts";
import { loginUrl } from "../(product)/login/next.ts";

/** A refusal from the API, or no answer at all (status 0, code "offline"). */
export class ApiError extends Error {
  status: number;
  code: string;
  /** The API's Arabic sentence, when it sent one (`message_ar`). */
  ar: string;
  /** The parsed body of the refusal, whatever it was. */
  detail: unknown;
  constructor(status: number, code: string, message: string, ar = "", detail: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.ar = ar;
    this.detail = detail;
  }
}

export type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Sent as JSON, unless it is FormData, a Blob or a string, which go as they are. */
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** On 401, go to /login (default). `false` leaves the refusal to the screen. */
  signOut?: boolean;
};

// ── signing out ───────────────────────────────────────────

let signedOut = false;
let onSignedOut: () => void = () => {
  // The same destination as the shell's `router.replace("/login")`, plus the way back.
  if (typeof window === "undefined" || signedOut) return;
  signedOut = true;
  window.location.replace(loginUrl(window.location.pathname + window.location.search));
};

/** Replace what a 401 does, for a screen that routes with Next's router, and for tests. Returns a function that restores the default. */
export function setSignedOutHandler(handler: () => void): () => void {
  const previous = onSignedOut;
  signedOut = false;
  onSignedOut = handler;
  return () => {
    onSignedOut = previous;
  };
}

// ── reading a refusal ─────────────────────────────────────

/** Where the API answers a sign-in attempt: a 401 there is a wrong code, not an ended sign-in. */
const SIGN_IN_CALLS = /^\/api\/auth\//;

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** The `ApiError` for a refusal, from its status and parsed body (null when the body was not JSON). */
export function refusal(status: number, body: unknown): ApiError {
  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const detail = data.detail;
  if (Array.isArray(detail)) return new ApiError(status, "invalid", "", "", body);
  const inner = detail && typeof detail === "object" ? (detail as Record<string, unknown>) : data;
  const code = asText(inner.code) || asText(data.code);
  const message = typeof detail === "string" ? detail : asText(inner.message);
  const ar = asText(inner.message_ar) || asText(data.message_ar);
  return new ApiError(status, code, message, ar, body);
}

// ── the call ──────────────────────────────────────────────

/** Calls the API and returns its JSON (undefined for an empty answer). A refusal throws `ApiError`. */
export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, headers, signal } = options;
  const raw = body instanceof FormData || body instanceof Blob || typeof body === "string";
  const init: RequestInit = {
    method,
    cache: "no-store",
    signal,
    headers: body === undefined || raw ? headers : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : raw ? (body as BodyInit) : JSON.stringify(body),
  };
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    // A call the screen cancelled is not an outage.
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError(0, "offline", "offline");
  }
  const text = await response.text().catch(() => "");
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (response.ok) return (text ? data : undefined) as T;
  const error = refusal(response.status, data);
  if (response.status === 401 && options.signOut !== false && !SIGN_IN_CALLS.test(path)) onSignedOut();
  throw error;
}

// ── saying it ─────────────────────────────────────────────

/**
 * The sentence for any failure, in the person's language. Order: a sentence the screen wrote
 * for this `code` (`known`), then the API's own words (its Arabic in Arabic; its English only
 * when it is a short sentence, never a stack trace), then the standard sentence for the status.
 */
export function say(error: unknown, lang: Lang, known: Record<string, Say> = {}): string {
  if (!(error instanceof ApiError)) return API_COPY.failed[lang];
  if (error.code && known[error.code]) return known[error.code][lang];
  if (error.code === "offline") return API_COPY.offline[lang];
  if (error.status === 401) return API_COPY.signedOut[lang];
  if (lang === "ar" && error.ar) return error.ar;
  if (lang === "en" && error.message && error.message.length < 200 && !/^[\[{<]/.test(error.message)) return error.message;
  if (error.status === 403) return API_COPY.forbidden[lang];
  if (error.status === 404) return API_COPY.gone[lang];
  if (error.status === 409) return API_COPY.changed[lang];
  if (error.status === 422 || error.code === "invalid") return API_COPY.invalid[lang];
  if (error.status === 429) return API_COPY.tooMany[lang];
  if (error.status >= 500) return API_COPY.server[lang];
  return API_COPY.failed[lang];
}
