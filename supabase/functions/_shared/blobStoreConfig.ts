import { BlobStoreError, type BlobStoreProvider } from "./blobStore.ts";

export const SUPABASE_SIGNED_UPLOAD_TTL_SECONDS = 7_200;
export const DEFAULT_SIGNED_UPLOAD_TTL_SECONDS = 300;
export const DEFAULT_SIGNED_DOWNLOAD_TTL_SECONDS = 300;

export interface SupabaseBlobStoreConfig {
  readonly provider: "supabase";
  readonly bucket: string;
  readonly supabaseUrl: string;
  readonly publicUrl: string;
  readonly serviceRoleKey: string;
  readonly uploadTtlSeconds: typeof SUPABASE_SIGNED_UPLOAD_TTL_SECONDS;
  readonly downloadTtlSeconds: number;
}

export interface S3CompatibleBlobStoreConfig {
  readonly provider: "r2" | "s3";
  readonly bucket: string;
  readonly endpoint: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly forcePathStyle: boolean;
  readonly uploadTtlSeconds: number;
  readonly downloadTtlSeconds: number;
}

export type BlobStoreConfig =
  | SupabaseBlobStoreConfig
  | S3CompatibleBlobStoreConfig;

export type BlobStoreEnvironment = Readonly<
  Record<string, string | undefined>
>;

export function parseBlobStoreConfig(
  env: BlobStoreEnvironment,
): BlobStoreConfig {
  const provider = required(env, "BLOB_STORE_PROVIDER") as BlobStoreProvider;
  if (!["supabase", "r2", "s3"].includes(provider)) {
    throw invalidConfig(
      "BLOB_STORE_PROVIDER must be supabase, r2, or s3.",
    );
  }

  const downloadTtlSeconds = positiveInteger(
    env.BLOB_SIGNED_DOWNLOAD_TTL_SECONDS,
    DEFAULT_SIGNED_DOWNLOAD_TTL_SECONDS,
    "BLOB_SIGNED_DOWNLOAD_TTL_SECONDS",
    30,
    3_600,
  );

  if (provider === "supabase") {
    const bucket = validateSupabaseBucket(
      required(env, "BLOB_STORE_BUCKET"),
    );
    const rawSupabaseUrl = required(env, "SUPABASE_URL");
    const publicUrl = strictEndpoint(
      env.SUPABASE_PUBLIC_URL ?? rawSupabaseUrl,
      "SUPABASE_PUBLIC_URL",
    );
    const supabaseUrl = supabaseServiceEndpoint(
      rawSupabaseUrl,
      publicUrl,
    );
    const serviceRoleKey = validateSupabaseServiceRoleKey(
      required(env, "SUPABASE_SERVICE_ROLE_KEY"),
    );

    if (
      env.BLOB_SIGNED_UPLOAD_TTL_SECONDS !== undefined &&
      env.BLOB_SIGNED_UPLOAD_TTL_SECONDS !==
        String(SUPABASE_SIGNED_UPLOAD_TTL_SECONDS)
    ) {
      throw invalidConfig(
        "Supabase signed upload URLs have a provider-defined 7200-second lifetime.",
      );
    }

    return Object.freeze({
      provider,
      bucket,
      supabaseUrl,
      publicUrl,
      serviceRoleKey,
      uploadTtlSeconds: SUPABASE_SIGNED_UPLOAD_TTL_SECONDS,
      downloadTtlSeconds,
    });
  }

  const bucket = validateS3Bucket(required(env, "BLOB_STORE_BUCKET"));
  const uploadTtlSeconds = positiveInteger(
    env.BLOB_SIGNED_UPLOAD_TTL_SECONDS,
    DEFAULT_SIGNED_UPLOAD_TTL_SECONDS,
    "BLOB_SIGNED_UPLOAD_TTL_SECONDS",
    30,
    900,
  );

  if (provider === "r2") {
    const accountId = required(env, "R2_ACCOUNT_ID");
    if (!/^[a-f0-9]{32}$/.test(accountId)) {
      throw invalidConfig(
        "R2_ACCOUNT_ID must be a lowercase 32-character hexadecimal identifier.",
      );
    }
    const accessKeyId = credentialId(
      required(env, "R2_ACCESS_KEY_ID"),
      "R2_ACCESS_KEY_ID",
    );
    const secretAccessKey = credentialSecret(
      required(env, "R2_SECRET_ACCESS_KEY"),
      "R2_SECRET_ACCESS_KEY",
    );
    return Object.freeze({
      provider,
      bucket,
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      region: "auto",
      accessKeyId,
      secretAccessKey,
      forcePathStyle: false,
      uploadTtlSeconds,
      downloadTtlSeconds,
    });
  }

  const endpoint = strictEndpoint(
    required(env, "S3_ENDPOINT"),
    "S3_ENDPOINT",
  );
  const region = required(env, "S3_REGION");
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(region)) {
    throw invalidConfig(
      "S3_REGION must be a normalized region identifier.",
    );
  }

  return Object.freeze({
    provider,
    bucket,
    endpoint,
    region,
    accessKeyId: credentialId(
      required(env, "S3_ACCESS_KEY_ID"),
      "S3_ACCESS_KEY_ID",
    ),
    secretAccessKey: credentialSecret(
      required(env, "S3_SECRET_ACCESS_KEY"),
      "S3_SECRET_ACCESS_KEY",
    ),
    forcePathStyle: strictBoolean(
      env.S3_FORCE_PATH_STYLE,
      false,
      "S3_FORCE_PATH_STYLE",
    ),
    uploadTtlSeconds,
    downloadTtlSeconds,
  });
}

function required(env: BlobStoreEnvironment, name: string): string {
  const value = env[name];
  if (typeof value !== "string" || value === "" || value !== value.trim()) {
    throw invalidConfig(
      `${name} is required and must not contain edge whitespace.`,
    );
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw invalidConfig(`${name} contains control characters.`);
  }
  return value;
}

function positiveInteger(
  value: string | undefined,
  defaultValue: number,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const normalized = value ?? String(defaultValue);
  if (!/^[0-9]+$/.test(normalized)) {
    throw invalidConfig(`${name} must be a base-10 integer.`);
  }
  const numberValue = Number(normalized);
  if (
    !Number.isSafeInteger(numberValue) ||
    numberValue < minimum ||
    numberValue > maximum
  ) {
    throw invalidConfig(
      `${name} must be between ${minimum} and ${maximum}.`,
    );
  }
  return numberValue;
}

function strictBoolean(
  value: string | undefined,
  defaultValue: boolean,
  name: string,
): boolean {
  if (value === undefined) return defaultValue;
  if (value === "true") return true;
  if (value === "false") return false;
  throw invalidConfig(`${name} must be exactly true or false.`);
}

function strictEndpoint(value: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (cause) {
    throw new BlobStoreError(
      "INVALID_CONFIG",
      `${name} must be an absolute URL.`,
      { cause },
    );
  }

  const localHttp = parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  const normalizedPath = parsed.pathname === "/" ? "" : parsed.pathname;
  if (
    (parsed.protocol !== "https:" && !localHttp) ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    normalizedPath !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw invalidConfig(
      `${name} must be an HTTPS origin without credentials, path, query, or fragment.`,
    );
  }
  return parsed.origin;
}

function supabaseServiceEndpoint(
  value: string,
  publicUrl: string,
): string {
  try {
    return strictEndpoint(value, "SUPABASE_URL");
  } catch (cause) {
    let parsed: URL;
    let publicEndpoint: URL;
    try {
      parsed = new URL(value);
      publicEndpoint = new URL(publicUrl);
    } catch {
      throw cause;
    }

    const localCliBridge = parsed.protocol === "http:" &&
      parsed.hostname === "kong" &&
      parsed.port === "8000" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      parsed.username === "" &&
      parsed.password === "" &&
      publicEndpoint.protocol === "http:" &&
      (
        publicEndpoint.hostname === "localhost" ||
        publicEndpoint.hostname === "127.0.0.1"
      );
    if (!localCliBridge) throw cause;
    return parsed.origin;
  }
}

function validateSupabaseBucket(value: string): string {
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(value)) {
    throw invalidConfig(
      "BLOB_STORE_BUCKET is not a valid private Supabase bucket identifier.",
    );
  }
  return value;
}

function validateS3Bucket(value: string): string {
  if (
    value.length < 3 ||
    value.length > 63 ||
    !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(value) ||
    value.includes("..") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)
  ) {
    throw invalidConfig(
      "BLOB_STORE_BUCKET is not a valid S3-compatible bucket name.",
    );
  }
  return value;
}

function credentialId(value: string, name: string): string {
  if (
    value.length < 16 ||
    value.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw invalidConfig(`${name} has an invalid credential identifier format.`);
  }
  return value;
}

function credentialSecret(value: string, name: string): string {
  if (
    value.length < 32 ||
    value.length > 256 ||
    /\s/.test(value)
  ) {
    throw invalidConfig(`${name} has an invalid secret format.`);
  }
  return value;
}

function validateSupabaseServiceRoleKey(value: string): string {
  if (
    value.length < 24 ||
    value.length > 4096 ||
    /\s/.test(value) ||
    value.startsWith("sb_publishable_")
  ) {
    throw invalidConfig(
      "SUPABASE_SERVICE_ROLE_KEY is not a valid server-only key.",
    );
  }

  if (value.startsWith("sb_secret_")) return value;

  const segments = value.split(".");
  if (segments.length !== 3) {
    throw invalidConfig(
      "SUPABASE_SERVICE_ROLE_KEY must be a secret key or service-role JWT.",
    );
  }

  try {
    const payload = JSON.parse(decodeBase64Url(segments[1] ?? ""));
    if (payload?.role !== "service_role") {
      throw new Error("unexpected role");
    }
  } catch (cause) {
    throw new BlobStoreError(
      "INVALID_CONFIG",
      "SUPABASE_SERVICE_ROLE_KEY JWT does not declare the service_role.",
      { cause },
    );
  }
  return value;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - normalized.length % 4) % 4),
    "=",
  );
  return atob(padded);
}

function invalidConfig(message: string): BlobStoreError {
  return new BlobStoreError("INVALID_CONFIG", message);
}
