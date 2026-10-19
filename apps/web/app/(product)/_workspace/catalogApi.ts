// What the Catalog screens read and write: the API's shapes, one fetch helper that turns a
// refusal into a sentence in the person's language, money, and the browser-side photo work
// (shrinking a photo before it is sent, and sending it with progress).

import { semantic } from "../../_tokens/tokens";
import type { Copy, Lang } from "./catalogCopy";

export type PhotoState = "ready" | "pending" | "failed" | "missing";
export type Photo = {
  id: string | null; state: PhotoState; width: number | null; height: number | null;
  urls: { thumb: string; medium: string; large: string } | null; srcset: string; position?: number;
};
export type Variant = {
  id: string; name: string; name_ar: string; sku: string; is_default: boolean; active: boolean;
  price_delta: number; daily_limit: number | null; on_hand: number; left: number | null;
  photo_id: string | null; photo?: Photo;
};
export type Option = { id: string; name: string; name_ar: string; price_delta: number; active: boolean };
export type Group = {
  id: string; name: string; name_ar: string; required: boolean; max_choices: number; options: Option[];
};
export type Window = {
  weekdays: number[]; opens: string | null; closes: string | null; lead_days: number;
  cutoff: string | null; valid_from: string | null; valid_to: string | null; closed: boolean;
};
export type Rule = "always" | "switch" | "count" | "daily_limit";
export type Status = "draft" | "live" | "hidden" | "archived";
/** A customer price group (wholesale). The default group pays the normal prices. */
export type PriceGroup = {
  id: string; name: string; name_ar: string; is_default: boolean; sort?: number; customers?: number;
};
/** What a group pays for an item, or for one of its sizes and colours (variant_id) instead of the normal price. */
export type GroupPrice = { group_id: string; variant_id: string | null; price: number; price_text: string };
export type Item = {
  id: string; name: string; name_ar: string; sku: string; group_prices: GroupPrice[];
  // An example the shop's type started it with: never for sale, its price is an example, and
  // its tile is drawn from sample_key (nothing is stored). Saving it makes it the owner's.
  sample: boolean; sample_key: string;
  description: string; description_ar: string;
  category: string; status: Status; stock_rule: Rule; available: boolean; unit: string;
  pack_size: number | null; min_order: number; tags: string[]; sort: number; low_stock_at: number | null;
  price: number; price_text: string; sale_price: number | null; sale_price_text: string | null;
  sale_starts_at: string | null; sale_ends_at: string | null; sale_active: boolean;
  current_price: number; current_price_text: string; has_orders: boolean; updated_at: string | null;
  variants: Variant[]; option_groups: Group[]; schedule: Window[];
  availability: {
    orderable: boolean; reason: string; left: number | null; next_at: string | null; next_date: string | null;
  };
  photos: Photo[]; cover: Photo; photo_id: string | null;
};
export type Access = { role: string; can_manage: boolean; can_edit: boolean; can_stock: boolean };
export type Category = { name: string; name_ar: string; sort: number };
export type Counts = {
  all: number; draft: number; sold_out: number; low_stock: number; stocked: number; archived: number; sample: number;
};
export type ListResult = {
  items: Item[]; total: number; counts: Counts; low_stock_at: number; categories: Category[]; access: Access;
};
export type Settings = {
  hold_minutes: number; day_starts: string; agents_edit_items: boolean; low_stock_at: number;
  // What customers see on the order page (ALY-112).
  sold_out_display: "grey" | "hide"; wholesale_layout: boolean; whatsapp_number: string;
};
/** Where the shop's public order page is, and the number a shared link sends customers to. */
export type ShareBase = { url: string; name: string; name_ar: string; whatsapp: string };
export type Movement = {
  id: string; item_id: string; item: string; item_ar: string; variant_id: string; variant: string;
  variant_ar: string; kind: string; delta: number; balance_after: number; day: string | null;
  reason: string; order_number: number | null; actor: { id: string | null; name: string }; via: string;
  created_at: string;
};
/**
 * What the shop's type of business gave its Catalog (GET /api/items/setup; specs/008): what the
 * section is called, how the order page lays out, what a sold-out item looks like, how a new item
 * runs out, which alerts are on, and which parts of the item form start open. The owner changes
 * sold_out, new_item.rule and alerts (PUT /api/items/setup).
 */
export type Setup = {
  type: string;
  /** The template the shop uses, usually the one for its business type (ALY-148). */
  template: { key: string; name: string; name_ar: string; builtin: boolean };
  section: {
    name: string; name_ar: string; sub: string; sub_ar: string;
    /** The owner gave their own name; the template's is `template_name`. */
    custom: boolean; template_name: string; template_name_ar: string;
  };
  optional: boolean;
  layout: { style: "menu" | "grid" | "list" | "table"; pickup_date: boolean; quick_quantity: boolean; same_as_last: boolean; show_sku: boolean };
  layout_custom: boolean;
  sold_out: "grey" | "hide";
  new_item: { rule: Rule; unit: string; lead_days: number | null; cutoff: string | null };
  low_stock_at: number;
  alerts: { low_stock: boolean; sold_out: boolean };
  focus: string[];
  /** Which features are on for this shop, by key (`GET /api/features` has the words). */
  features: Record<string, boolean>;
  samples: number;
};

/** One feature on the Features screen (GET /api/features; specs/011-feature-engine). */
export type FeatureRow = {
  key: string; name: string; name_ar: string; hint: string; hint_ar: string; changes: string; changes_ar: string;
  group: string; affects: string[]; enabled: boolean; own: boolean; depends_on: string[]; needed_by: string[];
  set_by: "template" | "owner"; updated_by: string; updated_at: string; kind: "switch" | "choice";
  config: Record<string, string>; choices: Record<string, string[]>;
  in_use: { count: number; text: string; text_ar: string } | null;
};
export type FeatureGroup = { key: string; name: string; name_ar: string; hint: string; hint_ar: string; features: FeatureRow[] };
export type FeaturesView = {
  groups: FeatureGroup[];
  core: { key: string; name: string; name_ar: string; hint: string; hint_ar: string }[];
  template: { key: string; name: string; name_ar: string; builtin: boolean };
  can_manage: boolean;
};

/** A WhatsApp number the owner registered as staff: it may change the Catalog by message. */
export type StaffNumber = {
  id: string; name: string; phone: string; lang: "en" | "ar"; manager: boolean; weekly_report: boolean;
};
export type Change = {
  id: string; name: string; name_ar: string; before: Record<string, unknown>; after: Record<string, unknown>;
  before_text?: string; after_text?: string;
};
export type Skip = { id: string; name: string; name_ar: string; code: string; message: string; message_ar: string };
export type BulkPlan = {
  action: string; params: Record<string, unknown>; hash: string; changes: Change[]; skipped: Skip[];
};
export type BulkLast = {
  id: string; action: string; params: Record<string, unknown>; changed: number; skipped: number;
  by: { id: string | null; name: string }; at: string;
};
export type ActivityRow = {
  id: string; action: string; detail: Record<string, unknown>; actor: { id: string | null; name: string }; at: string;
};
export type PriceRow = {
  price: number; price_text: string; sale_price_text: string | null; reason: string;
  changed_by: { name: string }; at: string;
};
/** One change to what a price group pays; a null price is the group going back to the normal price. */
export type GroupPriceRow = {
  group: { id: string; name: string; name_ar: string };
  variant: { id: string; name: string; name_ar: string } | null;
  price: number | null; price_text: string | null; reason: string; changed_by: { name: string }; at: string;
};

/** A refusal from the API, with the sentence to show in the person's language. */
export class ApiError extends Error {
  status: number;
  code: string;
  detail: unknown;
  constructor(status: number, code: string, message: string, detail: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

type Body = Record<string, unknown> | unknown[];

/** Calls the API. A refusal throws an `ApiError` carrying its `code` and the API's words. */
export async function api<T>(path: string, method = "GET", body?: Body): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method, cache: "no-store",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "offline", "offline", null);
  }
  if (response.ok) return response.json() as Promise<T>;
  const data = await response.json().catch(() => ({}));
  // Three shapes: {detail: "words"}, {detail: {code, message, message_ar}} and a photo
  // refusal {detail: "words", code, message_ar}.
  const inner = data && typeof data.detail === "object" && data.detail ? data.detail : data;
  const code = String(inner.code ?? "");
  const message = String(typeof data.detail === "string" ? data.detail : inner.message ?? "");
  const error = new ApiError(response.status, code, message, data);
  (error as ApiError & { ar?: string }).ar = String(inner.message_ar ?? data.message_ar ?? "");
  throw error;
}

/** The sentence for a refusal, in the person's language. */
export function sayError(error: unknown, lang: Lang, t: Copy): string {
  if (!(error instanceof ApiError)) return t.failed;
  if (error.code === "offline") return lang === "ar" ? "لا يوجد اتصال. حاول مجدداً." : "No connection. Try again.";
  if (error.status === 403 && !error.code) return t.forbidden;
  if (error.status === 404 && !error.code) return t.gone;
  const known = t.errors[error.code];
  if (known) return known;
  const ar = (error as ApiError & { ar?: string }).ar;
  if (lang === "ar") return ar || t.failed;
  return error.message && error.message.length < 200 ? error.message : t.failed;
}

// ── money ──────────────────────────────────────────────

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Digits typed on an Arabic keyboard become 0-9; a decimal comma or Arabic separator a dot. */
export function westernDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫,،]/g, ".");
}

/** "12.5" (riyals, as typed) to dirhams, 1250. Null when it is not a price. */
export function toDirhams(text: string): number | null {
  const clean = westernDigits(text).trim();
  if (!clean) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** 1250 to "12.5" for an input; empty for nothing. */
export function fromDirhams(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const riyals = value / 100;
  return Number.isInteger(riyals) ? String(riyals) : riyals.toFixed(2).replace(/0$/, "");
}

/** A signed difference in riyals, as typed ("-2", "1.5"). Null when it is not a number. */
export function toSignedDirhams(text: string): number | null {
  const clean = westernDigits(text).trim().replace(/^−/, "-");
  if (!clean) return 0;
  const negative = clean.startsWith("-");
  const value = toDirhams(negative ? clean.slice(1) : clean);
  return value === null ? null : negative ? -value : value;
}

export function toInt(text: string): number | null {
  const clean = westernDigits(text).trim();
  return /^-?\d+$/.test(clean) ? Number(clean) : null;
}

// ── names ──────────────────────────────────────────────

/** An item's name in the person's language, falling back to the other one. */
export function nameOf(thing: { name: string; name_ar: string }, lang: Lang): string {
  return (lang === "ar" ? thing.name_ar || thing.name : thing.name || thing.name_ar).trim();
}

/** "18 Oct, 14:05" on the shop's clock (Doha), whatever the device says; the month is in the
 *  screen's language (digits stay Western, as everywhere in the workspace). */
export function stamp(iso: string, lang: Lang = "en"): string {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-QA-u-nu-latn" : "en-GB", {
    timeZone: "Asia/Qatar", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(iso));
}

/** Who did it, as the record keeps it. The system's own names ("Customer", "Assistant") are said in the screen's language. */
export function whoIs(name: string, t: Copy): string {
  return t.actors[name] ?? name;
}

/** One line of an item's record, without the name of the person: "changed the price from QAR 12 to QAR 14". */
export function activityText(a: ActivityRow, t: Copy): string {
  const base = t.did[a.action] ?? a.action;
  if (a.action !== "updated") return base;
  const detail = a.detail as { fields?: string[]; from?: string; to?: string; price_from?: string; price_to?: string };
  const parts: string[] = [];
  for (const field of detail.fields ?? []) {
    if (field === "price" && detail.price_from && detail.price_to) {
      parts.push(t.priceMoved(detail.price_from, detail.price_to));
    } else if (field === "status" && detail.from && detail.to) {
      parts.push(t.statusMoved(t.status[detail.from] ?? detail.from, t.status[detail.to] ?? detail.to));
    } else {
      const word = t.fields[field] ?? field;
      if (!parts.includes(word)) parts.push(word);
    }
  }
  return `${base} ${parts.join(t.and)}`.trim();
}

// ── photos: shrink in the browser, send with progress ──

export const MAX_PHOTOS = 8;
const LONG_SIDE = 1600;
const QUALITY = 0.82;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export class PhotoProblem extends Error {
  kind: "unreadable" | "too_big";
  constructor(kind: "unreadable" | "too_big") {
    super(kind);
    this.kind = kind;
  }
}

async function decode(file: Blob): Promise<{ draw: CanvasImageSource; width: number; height: number; free: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      // "from-image" turns a phone photo upright as the camera saw it.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { draw: bitmap, width: bitmap.width, height: bitmap.height, free: () => bitmap.close() };
    } catch {
      // fall through to an image element
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return { draw: image, width: image.naturalWidth, height: image.naturalHeight, free: () => undefined };
  } catch {
    throw new PhotoProblem("unreadable");
  } finally {
    // The image has been decoded by now; the address is no longer needed.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * A photo as a smaller JPEG: the long side at most 1,600 pixels (the server keeps that as
 * its largest size anyway), turned upright, with no location or camera data. A 12 MB phone
 * photo becomes a few hundred KB, which uploads on weak data. A photo that is already small
 * is sent as it is.
 */
export async function shrink(file: File): Promise<Blob> {
  const small = file.size <= 900 * 1024;
  const kind = ACCEPTED.includes(file.type) ? file.type : "";
  const picture = await decode(file).catch((error: unknown) => {
    // The browser cannot read it. A small photo of a kind the server accepts goes as it is.
    if (small && kind) return null;
    throw error instanceof PhotoProblem ? error : new PhotoProblem("unreadable");
  });
  if (!picture) return file;
  try {
    const scale = Math.min(1, LONG_SIDE / Math.max(picture.width, picture.height));
    if (scale === 1 && small && (kind === "image/jpeg" || kind === "image/webp")) return file;
    const width = Math.max(1, Math.round(picture.width * scale));
    const height = Math.max(1, Math.round(picture.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new PhotoProblem("unreadable");
    context.fillStyle = semantic.surface; // a PNG with a clear background must not turn black
    context.fillRect(0, 0, width, height);
    context.drawImage(picture.draw, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob) throw new PhotoProblem("unreadable");
    if (blob.size > 12 * 1024 * 1024) throw new PhotoProblem("too_big");
    return blob;
  } finally {
    picture.free();
  }
}

export type Sent = { photo: Photo; duplicate: boolean };

/** Sends the photo as the request body and reports how much has gone. Resolves with the API's answer. */
export function sendPhoto(blob: Blob, onProgress: (percent: number) => void, signal?: AbortSignal): Promise<Sent> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/media/photos");
    request.setRequestHeader("content-type", blob.type || "image/jpeg");
    request.timeout = 90_000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    request.onload = () => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(request.responseText || "{}");
      } catch {
        data = {};
      }
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve(data as unknown as Sent);
        return;
      }
      const inner = data.detail && typeof data.detail === "object" ? (data.detail as Record<string, unknown>) : data;
      const error = new ApiError(request.status, String(inner.code ?? ""), String(typeof data.detail === "string" ? data.detail : ""), data);
      (error as ApiError & { ar?: string }).ar = String(inner.message_ar ?? data.message_ar ?? "");
      reject(error);
    };
    request.onerror = request.ontimeout = () => reject(new ApiError(0, "offline", "offline", null));
    signal?.addEventListener("abort", () => {
      request.abort();
      reject(new ApiError(0, "aborted", "aborted", null));
    });
    request.send(blob);
  });
}

export function byteSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── import and export (ALY-108) ────────────────────────

export type ImportIssue = {
  level: "error" | "warning" | "info"; code: string; column: string | null;
  message: string; message_ar: string; row: number;
};
export type ImportDiff = { column: string; label: string; label_ar: string; variant: string; before: string; after: string };
export type ImportAction = "create" | "update" | "unchanged" | "skip" | "error";
export type ImportItem = {
  row: number; rows: number[]; action: ImportAction; name: string; name_ar: string; id: string | null;
  draft: boolean; variants: number; photos: number; stock_moves: number; price: number | null;
  price_text: string | null; category: string | null; diff: ImportDiff[]; issues: ImportIssue[];
};
export type ImportSummary = {
  rows: number; items: number; create: number; update: number; unchanged: number; skip: number; error: number;
  warnings: number; drafts: number; stock_moves: number; photos: number;
  new_categories: { name: string; items: number }[];
  zip: { name?: string; bytes?: number; entries?: number; used?: number; unused?: string[]; unused_count?: number; unusable?: string[] };
};
export type ImportNote = Omit<ImportIssue, "row">;
export type OnDuplicate = "create" | "update" | "skip";
export type ImportPreview = {
  id: string; status: "preview"; filename: string; kind: string; zip: { name: string } | null; at: string;
  by: { id: string | null; name: string }; hash: string; options: { on_duplicate: OnDuplicate };
  summary: ImportSummary; notes: ImportNote[]; items: ImportItem[];
};
export type ImportProblem = { row: number; rows: number[]; name: string; name_ar: string; action: ImportAction; issues: ImportIssue[] };
export type ImportPhotos = {
  state: "queued" | "running" | "done" | "failed" | null; total: number; done: number;
  failed: { file: string; code: string; message: string; message_ar: string }[];
};
export type ImportResult = {
  id: string; status: "applied" | "undone"; filename: string; kind: string; by: { id: string | null; name: string };
  at: string; undone_at: string | null; undone_by: string | null;
  summary: { counts: Omit<ImportSummary, "new_categories" | "zip">; problems: ImportProblem[] };
  photos: ImportPhotos | null; can_undo: boolean;
};
export type ImportRecent = {
  id: string; status: "applied" | "undone"; filename: string; by: { id: string | null; name: string }; at: string;
  created: number; updated: number; skipped: number; undone_at: string | null; undone_by: string | null; can_undo: boolean;
};
export type ImportKinds = { kinds: { key: string; name: string; note: string }[]; suggested: string };
export type ImportUndone = {
  id: string; filename: string; removed: number; archived: number; restored: number;
  left: { id: string; name: string; name_ar: string; code: string; message: string; message_ar: string }[];
};

/**
 * Sends a file as the request body (a sheet, or a zip of photos) and reports how much has gone.
 * Resolves with the API's answer; a refusal throws an `ApiError` like `api` does.
 */
export function sendFile<T>(method: "POST" | "PUT", path: string, file: Blob, onProgress: (percent: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(method, path);
    request.setRequestHeader("content-type", "application/octet-stream");
    request.timeout = 180_000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    request.onload = () => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(request.responseText || "{}");
      } catch {
        data = {};
      }
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve(data as T);
        return;
      }
      const inner = data.detail && typeof data.detail === "object" ? (data.detail as Record<string, unknown>) : data;
      const error = new ApiError(request.status, String(inner.code ?? ""), String(typeof data.detail === "string" ? data.detail : inner.message ?? ""), data);
      (error as ApiError & { ar?: string }).ar = String(inner.message_ar ?? data.message_ar ?? "");
      reject(error);
    };
    request.onerror = request.ontimeout = () => reject(new ApiError(0, "offline", "offline", null));
    request.send(file);
  });
}

/** An issue's sentence in the person's language. */
export function issueText(issue: { message: string; message_ar: string }, lang: Lang): string {
  return lang === "ar" ? issue.message_ar || issue.message : issue.message;
}
