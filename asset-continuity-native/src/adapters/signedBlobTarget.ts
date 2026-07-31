import type {
  BlobStoreProvider,
  SignedBlobDownloadTarget,
  SignedBlobUploadTarget
} from "@alyr/contracts";

const PROVIDERS: readonly BlobStoreProvider[] = [
  "supabase",
  "r2",
  "s3"
];
const HEADER_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const R2_HOST = /^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/u;
const FORBIDDEN_HEADERS = new Set([
  "authorization",
  "connection",
  "content-length",
  "cookie",
  "host",
  "proxy-authorization",
  "set-cookie",
  "transfer-encoding"
]);
const UPLOAD_HEADERS = new Set([
  "cache-control",
  "content-type",
  "if-none-match",
  "x-amz-meta-heldat-byte-size",
  "x-amz-meta-heldat-content-type",
  "x-amz-meta-heldat-schema",
  "x-amz-meta-heldat-sha256",
  "x-upsert"
]);

export interface SignedTargetExpectation {
  readonly objectKey: string;
  readonly expiresAt: string;
  readonly trustedSupabaseOrigin?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): boolean {
  const keys = Object.keys(value).sort();
  return (
    keys.length === expected.length &&
    [...expected].sort().every((key, index) => key === keys[index])
  );
}

function isProvider(value: unknown): value is BlobStoreProvider {
  return (
    typeof value === "string" &&
    PROVIDERS.some((provider) => provider === value)
  );
}

function validSignedUrl(
  value: unknown,
  provider: BlobStoreProvider,
  trustedSupabaseOrigin?: string
): boolean {
  if (typeof value !== "string" || value.length > 8_192) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== ""
  ) {
    return false;
  }
  if (
    provider === "supabase" &&
    trustedSupabaseOrigin !== undefined &&
    parsed.origin !== trustedSupabaseOrigin
  ) {
    return false;
  }
  if (provider === "r2" && !R2_HOST.test(parsed.hostname)) {
    return false;
  }
  return true;
}

function parseHeaders(
  value: unknown,
  kind: "upload" | "download"
): Readonly<Record<string, string>> | null {
  if (!isRecord(value) || Object.keys(value).length > 12) return null;
  const headers: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(value)) {
    const name = rawName.toLowerCase();
    if (
      name !== rawName ||
      !HEADER_NAME.test(name) ||
      FORBIDDEN_HEADERS.has(name) ||
      (kind === "upload"
        ? !UPLOAD_HEADERS.has(name)
        : name !== "accept" && !name.startsWith("x-amz-")) ||
      typeof rawValue !== "string" ||
      rawValue.length > 1_024 ||
      /[\u0000-\u001f\u007f]/u.test(rawValue)
    ) {
      return null;
    }
    headers[name] = rawValue;
  }
  return headers;
}

function validCommonTarget(
  value: Record<string, unknown>,
  expectedMethod: "PUT" | "GET",
  expectation: SignedTargetExpectation
): {
  readonly provider: BlobStoreProvider;
  readonly requiredHeaders: Readonly<Record<string, string>>;
} | null {
  if (
    !hasExactKeys(value, [
      "provider",
      "objectKey",
      "method",
      "url",
      "requiredHeaders",
      "expiresAt"
    ]) ||
    !isProvider(value.provider) ||
    value.objectKey !== expectation.objectKey ||
    value.method !== expectedMethod ||
    value.expiresAt !== expectation.expiresAt ||
    !Number.isFinite(Date.parse(expectation.expiresAt)) ||
    !validSignedUrl(
      value.url,
      value.provider,
      expectation.trustedSupabaseOrigin
    )
  ) {
    return null;
  }
  const headers = parseHeaders(
    value.requiredHeaders,
    expectedMethod === "PUT" ? "upload" : "download"
  );
  return headers === null
    ? null
    : { provider: value.provider, requiredHeaders: headers };
}

export function parseSignedBlobUploadTarget(
  value: unknown,
  expectation: SignedTargetExpectation & {
    readonly mimeType: string;
  }
): SignedBlobUploadTarget | null {
  if (!isRecord(value)) return null;
  const parsed = validCommonTarget(value, "PUT", expectation);
  if (
    parsed === null ||
    parsed.requiredHeaders["content-type"] !== expectation.mimeType
  ) {
    return null;
  }
  if (
    parsed.provider === "supabase" &&
    parsed.requiredHeaders["x-upsert"] !== "false"
  ) {
    return null;
  }
  if (
    (parsed.provider === "r2" || parsed.provider === "s3") &&
    parsed.requiredHeaders["if-none-match"] !== "*"
  ) {
    return null;
  }
  return value as unknown as SignedBlobUploadTarget;
}

export function parseSignedBlobDownloadTarget(
  value: unknown,
  expectation: SignedTargetExpectation
): SignedBlobDownloadTarget | null {
  if (!isRecord(value)) return null;
  const parsed = validCommonTarget(value, "GET", expectation);
  return parsed === null
    ? null
    : value as unknown as SignedBlobDownloadTarget;
}
