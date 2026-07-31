import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.110.8";
import { createHash, createHmac } from "node:crypto";
import { apiError, corsHeaders, json } from "../_shared/http.ts";
import {
  assessBlobHead,
  asImmutableBlobKey,
  BlobStoreError,
  chunkValues,
  createImmutableBlobKey,
  type BlobStore,
  type BlobUploadDescriptor,
  type ImmutableBlobKey,
} from "../_shared/blobStore.ts";
import { createBlobStoreFromEnv } from "../_shared/blobStoreFactory.ts";
import {
  authenticatedRateLimitPolicy,
  browserOriginAllowed,
  consumeRateLimit,
  logRequestCompletion,
  networkScope,
  publicRateLimitPolicy,
  requestId,
  withOperationalHeaders,
} from "../_shared/requestControls.ts";
import { readBoundedJsonObject } from "../_shared/requestBody.ts";
import { classifyStorageCapacityFailure } from "../_shared/storageCapacity.ts";
import {
  handleExportCreate,
  handleExportDownload,
  handleExportGet,
  handleExportMaintenance,
} from "./export.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const supabaseServiceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const allowedBrowserOrigins =
  Deno.env.get("HELDAT_ALLOWED_WEB_ORIGINS") ?? "";
const blobMaintenanceToken =
  Deno.env.get("HELDAT_MAINTENANCE_TOKEN") ??
  Deno.env.get("ALYR_EXPORT_MAINTENANCE_TOKEN") ??
  "";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const launchModeContract = "heldat-signup-mode-v1";
const launchModeLifetimeMilliseconds = 5 * 60 * 1000;
const launchModes = new Set([
  "closed_pilot",
  "public_email",
  "public_email_google",
]);
type LaunchMode =
  | "closed_pilot"
  | "public_email"
  | "public_email_google";
type LaunchModeState = {
  readonly signupMode: LaunchMode;
  readonly configVersion: string;
};
type LaunchModeAttestation = {
  readonly contract: typeof launchModeContract;
  readonly signupMode: LaunchMode;
  readonly configVersion: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly signature: string;
};
const launchModeCacheFreshMilliseconds = 15_000;
const launchModeCacheStaleIfErrorMilliseconds = 60_000;
let launchModeCache: {
  readonly value: LaunchModeState;
  readonly freshUntil: number;
  readonly staleUntil: number;
} | null = null;
let launchModeRefreshPromise: Promise<LaunchModeState | null> | null = null;
const allowedEvidenceMimeTypes = new Set([
  "application/msword",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

let blobStorePromise: Promise<BlobStore> | null = null;

function activeBlobStore(): Promise<BlobStore> {
  if (blobStorePromise === null) {
    const publicSupabaseUrl =
      Deno.env.get("SUPABASE_PUBLIC_URL") ??
      (
          supabaseUrl === "http://kong:8000"
        ? "http://127.0.0.1:54321"
        : supabaseUrl
      );
    blobStorePromise = createBlobStoreFromEnv({
      ...Deno.env.toObject(),
      SUPABASE_PUBLIC_URL: publicSupabaseUrl,
      BLOB_STORE_PROVIDER:
        Deno.env.get("BLOB_STORE_PROVIDER") ?? "supabase",
      BLOB_STORE_BUCKET:
        Deno.env.get("BLOB_STORE_BUCKET") ?? "evidence",
      BLOB_SIGNED_DOWNLOAD_TTL_SECONDS:
        Deno.env.get("BLOB_SIGNED_DOWNLOAD_TTL_SECONDS") ?? "300",
    });
  }
  return blobStorePromise;
}

async function digestBlobStream(
  stream: ReadableStream<Uint8Array>,
  maximumBytes: number,
): Promise<{
  readonly byteSize: number;
  readonly checksumSha256: string;
  readonly overflowed: boolean;
}> {
  const hash = createHash("sha256");
  const reader = stream.getReader();
  let byteSize = 0;
  let overflowed = false;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      byteSize += chunk.value.byteLength;
      if (byteSize > maximumBytes) {
        chunk.value.fill(0);
        overflowed = true;
        await reader.cancel("bounded Evidence verification exceeded size");
        break;
      }
      hash.update(chunk.value);
      chunk.value.fill(0);
    }
  } finally {
    reader.releaseLock();
  }
  return {
    byteSize,
    checksumSha256: overflowed ? "" : hash.digest("hex"),
    overflowed,
  };
}

function providerFailure(
  error: unknown,
  missingMessage: string,
  unavailableMessage: string,
): Response {
  if (error instanceof BlobStoreError && error.code === "OBJECT_NOT_FOUND") {
    return apiError("NOT_FOUND", missingMessage, 404);
  }
  return apiError(
    "STORAGE_UNAVAILABLE",
    unavailableMessage,
    503,
    error instanceof BlobStoreError ? error.retryable : true,
  );
}

type AuthenticatedContext = {
  client: SupabaseClient;
  userId: string;
  email: string;
};

function routePath(request: Request): string {
  const pathname = new URL(request.url).pathname;
  for (const functionSegment of ["/functions/v1/api", "/api"]) {
    const index = pathname.indexOf(functionSegment);
    if (index >= 0) {
      const suffix = pathname.slice(index + functionSegment.length);
      return suffix.replace(/\/+$/, "") || "/";
    }
  }
  return pathname.replace(/\/+$/, "") || "/";
}

function requiresPersistentNetworkRateLimit(
  request: Request,
  path: string,
): boolean {
  // This signed, user-independent read is coalesced and cached per Edge
  // isolate. Avoiding one database write per app open is essential for the
  // 10K-user envelope; every state-changing/public credential route remains
  // behind the persistent network limiter below.
  return !(request.method === "GET" && path === "/signup/mode");
}

function serviceControlClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalizedConfigVersion(value: unknown): string | null {
  const candidate = typeof value === "number"
    ? Number.isSafeInteger(value) && value >= 1
      ? String(value)
      : ""
    : typeof value === "string"
    ? value
    : "";
  return /^[1-9][0-9]{0,18}$/u.test(candidate) ? candidate : null;
}

async function readLaunchModeFromStore(): Promise<LaunchModeState | null> {
  const client = serviceControlClient();
  if (!client) return null;
  const { data, error } = await client.rpc("read_launch_enrollment_mode");
  if (error?.code === "PGRST202") {
    // Migration 007 deliberately remains approval-gated because its separate
    // cron jobs can delete orphaned blobs. Until that reviewed migration is
    // installed, the already-verified pilot may only stay closed; it can never
    // fall forward into public registration.
    return { signupMode: "closed_pilot", configVersion: "1" };
  }
  const row = Array.isArray(data) ? data[0] : data;
  const signupMode = row?.signup_mode;
  const configVersion = normalizedConfigVersion(row?.config_version);
  if (
    error ||
    typeof signupMode !== "string" ||
    !launchModes.has(signupMode) ||
    !configVersion
  ) {
    return null;
  }
  return {
    signupMode: signupMode as LaunchMode,
    configVersion,
  };
}

async function readLaunchMode(): Promise<LaunchModeState | null> {
  const now = Date.now();
  if (launchModeCache && launchModeCache.freshUntil > now) {
    return launchModeCache.value;
  }
  if (launchModeRefreshPromise) return await launchModeRefreshPromise;

  const previous = launchModeCache;
  launchModeRefreshPromise = (async () => {
    const current = await readLaunchModeFromStore();
    const refreshedAt = Date.now();
    if (current) {
      launchModeCache = {
        value: current,
        freshUntil: refreshedAt + launchModeCacheFreshMilliseconds,
        staleUntil:
          refreshedAt + launchModeCacheStaleIfErrorMilliseconds,
      };
      return current;
    }
    // A stale public attestation still cannot create an account after the
    // control-plane version changes: both preflight paths re-read and compare
    // the current server version. This short grace removes transient database
    // reads from the public app-open path without weakening signup admission.
    if (previous && previous.staleUntil > refreshedAt) return previous.value;
    return null;
  })();
  try {
    return await launchModeRefreshPromise;
  } finally {
    launchModeRefreshPromise = null;
  }
}

function launchModeMessage(
  value: Omit<LaunchModeAttestation, "signature">,
): string {
  return [
    value.contract,
    value.signupMode,
    value.configVersion,
    value.issuedAt,
    value.expiresAt,
  ].join("\n");
}

function signLaunchMode(
  value: Omit<LaunchModeAttestation, "signature">,
): string {
  return createHmac("sha256", supabaseServiceRoleKey)
    .update(launchModeMessage(value), "utf8")
    .digest("hex");
}

function constantTimeHexMatch(expected: string, candidate: string): boolean {
  if (!/^[a-f0-9]{64}$/u.test(expected) || !/^[a-f0-9]{64}$/u.test(candidate)) {
    return false;
  }
  const expectedHash = createHash("sha256").update(expected).digest();
  const candidateHash = createHash("sha256").update(candidate).digest();
  let difference = 0;
  for (let index = 0; index < expectedHash.byteLength; index += 1) {
    difference |= (expectedHash[index] ?? 0) ^ (candidateHash[index] ?? 0);
  }
  expectedHash.fill(0);
  candidateHash.fill(0);
  return difference === 0;
}

function parseLaunchModeAttestation(value: unknown): LaunchModeAttestation | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (
    !hasOnlyKeys(candidate, [
      "contract",
      "signupMode",
      "configVersion",
      "issuedAt",
      "expiresAt",
      "signature",
    ]) ||
    candidate.contract !== launchModeContract ||
    typeof candidate.signupMode !== "string" ||
    !launchModes.has(candidate.signupMode) ||
    normalizedConfigVersion(candidate.configVersion) !== candidate.configVersion ||
    typeof candidate.issuedAt !== "string" ||
    typeof candidate.expiresAt !== "string" ||
    typeof candidate.signature !== "string" ||
    !/^[a-f0-9]{64}$/u.test(candidate.signature)
  ) {
    return null;
  }
  const issuedAt = Date.parse(candidate.issuedAt);
  const expiresAt = Date.parse(candidate.expiresAt);
  if (
    Number.isNaN(issuedAt) ||
    Number.isNaN(expiresAt) ||
    expiresAt <= Date.now() ||
    issuedAt > Date.now() + 30_000 ||
    expiresAt - issuedAt !== launchModeLifetimeMilliseconds
  ) {
    return null;
  }
  return candidate as unknown as LaunchModeAttestation;
}

async function launchModeAttestationIsCurrent(
  value: unknown,
  allowedModes: ReadonlySet<LaunchMode>,
): Promise<boolean> {
  const attestation = parseLaunchModeAttestation(value);
  if (!attestation || !allowedModes.has(attestation.signupMode)) return false;
  // Admission never trusts the public read cache. Re-read the control plane so
  // an emergency switch back to closed pilot takes effect immediately.
  const current = await readLaunchModeFromStore();
  if (
    !current ||
    current.signupMode !== attestation.signupMode ||
    current.configVersion !== attestation.configVersion
  ) {
    if (current) launchModeCache = null;
    return false;
  }
  return constantTimeHexMatch(
    signLaunchMode(attestation),
    attestation.signature,
  );
}

function maintenanceTokenMatches(candidate: string): boolean {
  if (
    blobMaintenanceToken.length < 32 ||
    blobMaintenanceToken.length > 256 ||
    candidate.length < 32 ||
    candidate.length > 256
  ) {
    return false;
  }
  const expectedHash = createHash("sha256")
    .update(blobMaintenanceToken)
    .digest();
  const candidateHash = createHash("sha256").update(candidate).digest();
  let difference = expectedHash.byteLength ^ candidateHash.byteLength;
  for (
    let index = 0;
    index < Math.min(expectedHash.byteLength, candidateHash.byteLength);
    index += 1
  ) {
    difference |= (expectedHash[index] ?? 0) ^ (candidateHash[index] ?? 0);
  }
  expectedHash.fill(0);
  candidateHash.fill(0);
  return difference === 0;
}

type BlobCleanupClaim = {
  readonly blob_object_id: string;
  readonly object_key: string;
  readonly claim_token: string;
};

function validBlobCleanupClaim(value: unknown): value is BlobCleanupClaim {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.blob_object_id === "string" &&
    uuidPattern.test(row.blob_object_id) &&
    typeof row.object_key === "string" &&
    typeof row.claim_token === "string" &&
    uuidPattern.test(row.claim_token)
  );
}

function cleanupErrorCode(value: string): string {
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return normalized || "PROVIDER_UNAVAILABLE";
}

async function releaseBlobCleanupClaim(
  client: SupabaseClient,
  claim: BlobCleanupClaim,
  errorCode: string,
): Promise<boolean> {
  const { data, error } = await client.rpc(
    "release_blob_object_cleanup",
    {
      p_blob_object_id: claim.blob_object_id,
      p_claim_token: claim.claim_token,
      p_error_code: cleanupErrorCode(errorCode),
      p_retry_delay: "5 minutes",
    },
  );
  return error === null && data === true;
}

async function handleBlobMaintenance(request: Request): Promise<Response> {
  const suppliedToken =
    request.headers.get("X-Heldat-Maintenance-Token") ??
    request.headers.get("X-ALYR-Maintenance-Token") ??
    "";
  if (!maintenanceTokenMatches(suppliedToken)) {
    return apiError(
      "AUTHORIZATION_DENIED",
      "Blob maintenance authorization failed.",
      403,
    );
  }

  const client = serviceControlClient();
  if (client === null) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Blob maintenance is not configured.",
      503,
      true,
    );
  }

  const { data: enqueuedData, error: enqueueError } = await client.rpc(
    "enqueue_blob_object_cleanup",
    {
      p_limit: 100,
      p_orphan_grace: "24 hours",
    },
  );
  if (enqueueError !== null) {
    if (
      enqueueError.code === "40001" ||
      enqueueError.code === "40P01" ||
      enqueueError.message.includes("STORAGE_ACCOUNTING_BUSY") ||
      enqueueError.message.includes("STORAGE_UPLOAD_AUTHORIZATION_ACTIVE")
    ) {
      return storageAccountingBusyResponse(
        "Private-file cleanup is waiting for an active upload authorization.",
        60,
      );
    }
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Blob cleanup candidates could not be queued.",
      503,
      true,
    );
  }

  const { data: claimedData, error: claimError } = await client.rpc(
    "claim_blob_object_cleanup",
    {
      p_limit: 25,
      p_lease: "5 minutes",
    },
  );
  if (claimError !== null) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Blob cleanup candidates could not be claimed.",
      503,
      true,
    );
  }
  const claims = Array.isArray(claimedData)
    ? claimedData.filter(validBlobCleanupClaim)
    : [];
  if (claims.length === 0) {
    return json({
      enqueued: Number(enqueuedData ?? 0),
      claimed: 0,
      deleted: 0,
      released: 0,
      completionFailed: 0,
    });
  }

  const validClaims: Array<{
    readonly claim: BlobCleanupClaim;
    readonly objectKey: ImmutableBlobKey;
  }> = [];
  let released = 0;
  for (const claim of claims) {
    try {
      validClaims.push({
        claim,
        objectKey: asImmutableBlobKey(claim.object_key),
      });
    } catch {
      if (
        await releaseBlobCleanupClaim(
          client,
          claim,
          "INVALID_OBJECT_KEY",
        )
      ) {
        released += 1;
      }
    }
  }

  let deleted = 0;
  let completionFailed = 0;
  if (validClaims.length > 0) {
    let result;
    try {
      const store = await activeBlobStore();
      result = await store.deleteBatch(
        validClaims.map((entry) => entry.objectKey),
      );
    } catch {
      for (const { claim } of validClaims) {
        if (
          await releaseBlobCleanupClaim(
            client,
            claim,
            "PROVIDER_UNAVAILABLE",
          )
        ) {
          released += 1;
        }
      }
      return json({
        enqueued: Number(enqueuedData ?? 0),
        claimed: claims.length,
        deleted,
        released,
        completionFailed,
      }, 503);
    }

    const deletedKeys = new Set(result.deleted);
    const failures = new Map(
      result.failed.map((failure) => [
        failure.objectKey,
        failure.code,
      ]),
    );
    for (const { claim, objectKey } of validClaims) {
      if (deletedKeys.has(objectKey)) {
        const completion = await client.rpc(
          "complete_blob_object_cleanup",
          {
            p_blob_object_id: claim.blob_object_id,
            p_claim_token: claim.claim_token,
          },
        );
        if (completion.error === null && completion.data === true) {
          deleted += 1;
        } else {
          completionFailed += 1;
        }
        continue;
      }
      if (
        await releaseBlobCleanupClaim(
          client,
          claim,
          failures.get(objectKey) ?? "DELETE_UNCONFIRMED",
        )
      ) {
        released += 1;
      }
    }
  }

  return json({
    enqueued: Number(enqueuedData ?? 0),
    claimed: claims.length,
    deleted,
    released,
    completionFailed,
  }, completionFailed > 0 || released > 0 ? 503 : 200);
}

async function handleSyncMaintenance(request: Request): Promise<Response> {
  const suppliedToken =
    request.headers.get("X-Heldat-Maintenance-Token") ??
    request.headers.get("X-ALYR-Maintenance-Token") ??
    "";
  if (!maintenanceTokenMatches(suppliedToken)) {
    return apiError(
      "AUTHORIZATION_DENIED",
      "Sync maintenance authorization failed.",
      403,
    );
  }

  const client = serviceControlClient();
  if (client === null) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Sync maintenance is not configured.",
      503,
      true,
    );
  }

  const { data, error } = await client.rpc("maintain_due_sync_households", {
    p_limit: 20,
    p_due_interval: "24 hours",
  });
  if (
    error !== null ||
    typeof data !== "object" ||
    data === null ||
    Array.isArray(data)
  ) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Sync retention could not be completed.",
      503,
      true,
    );
  }

  return json(data);
}

async function handleReadinessMaintenance(request: Request): Promise<Response> {
  const suppliedToken =
    request.headers.get("X-Heldat-Maintenance-Token") ??
    request.headers.get("X-ALYR-Maintenance-Token") ??
    "";
  if (!maintenanceTokenMatches(suppliedToken)) {
    return apiError(
      "AUTHORIZATION_DENIED",
      "Readiness monitoring authorization failed.",
      403,
    );
  }

  const client = serviceControlClient();
  if (client === null) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Readiness monitoring is not configured.",
      503,
      true,
    );
  }

  const { data, error } = await client.rpc("read_backend_readiness_summary");
  if (
    error !== null ||
    typeof data !== "object" ||
    data === null ||
    Array.isArray(data)
  ) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Backend readiness signals are temporarily unavailable.",
      503,
      true,
    );
  }
  return json(data);
}

function rateLimitResponse(
  retryAfterSeconds: number,
  unavailable = false,
): Response {
  const response = unavailable
    ? apiError(
      "STORAGE_UNAVAILABLE",
      "Request protection is temporarily unavailable.",
      503,
      true,
    )
    : apiError(
      "RATE_LIMITED",
      "Too many requests. Try again shortly.",
      429,
      true,
    );
  const headers = new Headers(response.headers);
  headers.set("Retry-After", String(Math.max(retryAfterSeconds, 1)));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function storageAccountingBusyResponse(
  message: string,
  retryAfterSeconds = 5,
): Response {
  const response = apiError(
    "STORAGE_UNAVAILABLE",
    message,
    503,
    true,
  );
  const headers = new Headers(response.headers);
  headers.set("Retry-After", String(Math.max(retryAfterSeconds, 1)));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function enforceNetworkRateLimit(
  request: Request,
  path: string,
): Promise<Response | null> {
  const client = serviceControlClient();
  if (!client) return rateLimitResponse(30, true);
  const result = await consumeRateLimit(
    client,
    networkScope(request),
    publicRateLimitPolicy(request.method, path),
  );
  if (result.ok) return null;
  return rateLimitResponse(
    result.retryAfterSeconds,
    result.unavailable === true,
  );
}

async function enforceUserRateLimit(
  request: Request,
  path: string,
  userId: string,
): Promise<Response | null> {
  const client = serviceControlClient();
  if (!client) return rateLimitResponse(30, true);
  const result = await consumeRateLimit(
    client,
    `user:${userId}`,
    authenticatedRateLimitPolicy(request.method, path),
  );
  if (result.ok) return null;
  return rateLimitResponse(
    result.retryAfterSeconds,
    result.unavailable === true,
  );
}

async function authenticate(
  request: Request,
): Promise<AuthenticatedContext | Response> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return apiError("AUTHENTICATION_REQUIRED", "Sign in to continue.", 401);
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "The pilot API is not configured.",
      503,
      true,
    );
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authorization },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email) {
    return apiError("SESSION_EXPIRED", "Your session has expired.", 401);
  }

  return { client, userId: data.user.id, email: data.user.email };
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  return await readBoundedJsonObject(request);
}

function requireApiVersion(body: Record<string, unknown>): void {
  if (body.apiVersion !== 1) {
    throw new Error("UNSUPPORTED_CONTRACT_VERSION");
  }
}

function hasOnlyKeys(
  body: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(body).every((key) => allowed.has(key));
}

const analyticsCommonKeys = [
  "schemaVersion",
  "platform",
  "appVersion",
  "locale",
  "occurredOffline",
] as const;
const analyticsSpecificKeys = {
  pilot_invitation_accepted: ["invitationChannel"],
  household_created: ["creationMode"],
  first_asset_passport_created: ["captureSource", "elapsedTimeBand"],
  asset_location_confirmed: ["locationPrecision", "hierarchyDepth"],
  first_evidence_reviewed: ["evidenceKind", "hasOriginal"],
  critical_register_25_completed: ["completionTimeBand"],
  asset_retrieval_completed: ["resultEntityType", "retrievalSource"],
  access_grant_created: ["role", "expiryBand"],
  continuity_snapshot_exported: ["format", "assetCountBand", "redacted"],
  household_returned_day_30_45: ["returnDayBand"],
  reservation_paid: ["planCode", "currency", "amountBand"],
  pilot_contract_signed: ["partnerType", "annualizedValueBand"],
} as const;

type ProductEventName = keyof typeof analyticsSpecificKeys;

function isProductEventName(value: unknown): value is ProductEventName {
  return (
    typeof value === "string" &&
    Object.hasOwn(analyticsSpecificKeys, value)
  );
}

function oneOf(value: unknown, options: readonly unknown[]): boolean {
  return options.includes(value);
}

function validProductEventProperties(
  eventName: ProductEventName,
  value: unknown,
): value is Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const properties = value as Record<string, unknown>;
  const allowedKeys = [
    ...analyticsCommonKeys,
    ...analyticsSpecificKeys[eventName],
  ];
  if (
    !hasOnlyKeys(properties, allowedKeys) ||
    allowedKeys.some((key) => !Object.hasOwn(properties, key)) ||
    Object.values(properties).some((field) =>
      field !== null &&
      typeof field !== "string" &&
      typeof field !== "number" &&
      typeof field !== "boolean"
    ) ||
    properties.schemaVersion !== 1 ||
    !oneOf(properties.platform, ["ios", "android", "web"]) ||
    typeof properties.appVersion !== "string" ||
    !/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,39}$/u.test(properties.appVersion) ||
    !oneOf(properties.locale, ["en", "ar"]) ||
    typeof properties.occurredOffline !== "boolean"
  ) {
    return false;
  }

  switch (eventName) {
    case "pilot_invitation_accepted":
      return oneOf(properties.invitationChannel, [
        "manual-code",
        "deep-link",
      ]);
    case "household_created":
      return oneOf(properties.creationMode, ["sample", "personal"]);
    case "first_asset_passport_created":
      return (
        oneOf(properties.captureSource, [
          "camera",
          "image-library",
          "document-import",
          "manual",
        ]) &&
        oneOf(properties.elapsedTimeBand, [
          "under-2-minutes",
          "under-5-minutes",
          "5-10-minutes",
          "over-10-minutes",
        ])
      );
    case "asset_location_confirmed":
      return (
        oneOf(properties.locationPrecision, [
          "exact",
          "user_placed",
          "approximate",
          "locality_only",
          "unknown",
        ]) &&
        typeof properties.hierarchyDepth === "number" &&
        Number.isInteger(properties.hierarchyDepth) &&
        properties.hierarchyDepth >= 0 &&
        properties.hierarchyDepth <= 4
      );
    case "first_evidence_reviewed":
      return (
        oneOf(properties.evidenceKind, [
          "paper",
          "artifact",
          "media",
          "record",
          "note",
          "link",
        ]) &&
        typeof properties.hasOriginal === "boolean"
      );
    case "critical_register_25_completed":
      return oneOf(properties.completionTimeBand, [
        "same-day",
        "2-7-days",
        "8-30-days",
        "over-30-days",
      ]);
    case "asset_retrieval_completed":
      return (
        oneOf(properties.resultEntityType, [
          "asset",
          "place",
          "space",
          "evidence",
          "member",
        ]) &&
        oneOf(properties.retrievalSource, [
          "search",
          "asset-list",
          "place-view",
          "deep-link",
        ])
      );
    case "access_grant_created":
      return (
        oneOf(properties.role, ["owner", "editor", "viewer"]) &&
        oneOf(properties.expiryBand, [
          "24-hours",
          "7-days",
          "30-days",
          "no-expiry",
        ])
      );
    case "continuity_snapshot_exported":
      return (
        oneOf(properties.format, ["pdf", "json-manifest"]) &&
        oneOf(properties.assetCountBand, [
          "1-5",
          "6-24",
          "25-49",
          "50-plus",
        ]) &&
        typeof properties.redacted === "boolean"
      );
    case "household_returned_day_30_45":
      return oneOf(properties.returnDayBand, [
        "30-34",
        "35-39",
        "40-45",
      ]);
    case "reservation_paid":
      return (
        oneOf(properties.planCode, [
          "pilot-household",
          "pilot-partner",
        ]) &&
        typeof properties.currency === "string" &&
        /^[A-Z]{3}$/u.test(properties.currency) &&
        oneOf(properties.amountBand, [
          "under-100",
          "100-499",
          "500-4999",
          "5000-plus",
        ])
      );
    case "pilot_contract_signed":
      return (
        oneOf(properties.partnerType, [
          "broker",
          "insurer",
          "adviser",
          "family-office",
          "estate-professional",
          "residence-manager",
          "other",
        ]) &&
        oneOf(properties.annualizedValueBand, [
          "under-5000",
          "5000-9999",
          "10000-24999",
          "25000-plus",
        ])
      );
  }
}

async function handleProductEvent(
  request: Request,
  context: AuthenticatedContext,
): Promise<Response> {
  const body = await readJson(request);
  requireApiVersion(body);
  const householdId = body.householdId;
  const idempotencyKey = body.idempotencyKey;
  const eventName = body.eventName;
  if (
    !hasOnlyKeys(body, [
      "apiVersion",
      "householdId",
      "idempotencyKey",
      "eventName",
      "properties",
    ]) ||
    typeof householdId !== "string" ||
    !uuidPattern.test(householdId) ||
    typeof idempotencyKey !== "string" ||
    !uuidPattern.test(idempotencyKey) ||
    !isProductEventName(eventName) ||
    !validProductEventProperties(eventName, body.properties)
  ) {
    return apiError(
      "VALIDATION_FAILED",
      "The product event did not match the privacy-safe contract.",
      400,
    );
  }

  const { error } = await context.client.rpc("record_product_event", {
    p_event_name: eventName,
    p_household_id: householdId,
    p_properties: body.properties,
    p_client_event_id: idempotencyKey,
  });
  if (error) {
    const permissionDenied = error.message.includes("PERMISSION_DENIED");
    const idempotencyConflict = error.message.includes(
      "ANALYTICS_IDEMPOTENCY_CONFLICT",
    );
    const retryable = error.message.includes(
      "ANALYTICS_ACKNOWLEDGEMENT_UNAVAILABLE",
    );
    return apiError(
      permissionDenied
        ? "AUTHORIZATION_DENIED"
        : idempotencyConflict
        ? "IDEMPOTENCY_CONFLICT"
        : retryable
        ? "STORAGE_UNAVAILABLE"
        : "VALIDATION_FAILED",
      permissionDenied
        ? "The active account cannot record events for this household."
        : idempotencyConflict
        ? "This product event key was already used for another event."
        : retryable
        ? "The product event acknowledgement is temporarily unavailable."
        : "The product event did not match the privacy-safe contract.",
      permissionDenied
        ? 403
        : idempotencyConflict
        ? 409
        : retryable
        ? 503
        : 400,
      retryable,
    );
  }
  return json({
    apiVersion: 1,
    accepted: true,
    idempotencyKey,
  }, 202);
}

async function handleSignupMode(): Promise<Response> {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Account registration availability is temporarily unavailable.",
      503,
      true,
    );
  }
  const current = await readLaunchMode();
  if (!current) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Account registration availability is temporarily unavailable.",
      503,
      true,
    );
  }
  const issuedAtDate = new Date();
  const launchMode: Omit<LaunchModeAttestation, "signature"> = {
    contract: launchModeContract,
    signupMode: current.signupMode,
    configVersion: current.configVersion,
    issuedAt: issuedAtDate.toISOString(),
    expiresAt: new Date(
      issuedAtDate.getTime() + launchModeLifetimeMilliseconds,
    ).toISOString(),
  };
  return json({
    apiVersion: 1,
    ...launchMode,
    signature: signLaunchMode(launchMode),
  });
}

async function handlePilotPreflight(request: Request): Promise<Response> {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Pilot access is not configured.",
      503,
      true,
    );
  }

  const body = await readJson(request);
  requireApiVersion(body);
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const accessCode = typeof body.accessCode === "string"
    ? body.accessCode.trim().toUpperCase().replace(/[\s-]+/gu, "")
    : "";
  if (
    !hasOnlyKeys(body, [
      "apiVersion",
      "email",
      "accessCode",
      "launchMode",
    ]) ||
    email.length < 3 ||
    email.length > 254 ||
    !email.includes("@") ||
    accessCode.length < 16 ||
    accessCode.length > 64 ||
    !/^[A-Z0-9]+$/u.test(accessCode)
  ) {
    return apiError(
      "AUTHORIZATION_DENIED",
      "This pilot invitation is not available.",
      403,
    );
  }
  if (
    !await launchModeAttestationIsCurrent(
      body.launchMode,
      new Set<LaunchMode>(["closed_pilot"]),
    )
  ) {
    return apiError(
      "CONFLICT_REQUIRES_REVIEW",
      "Refresh account registration availability and try again.",
      409,
      true,
    );
  }

  const serviceClient = createClient(
    supabaseUrl,
    supabaseServiceRoleKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await serviceClient.rpc(
    "issue_pilot_signup_grant",
    {
      p_email: email,
      p_access_code: accessCode,
    },
  );
  if (error) {
    const capacityReached = error.message.includes(
      "PILOT_CAPACITY_REACHED",
    );
    return apiError(
      capacityReached ? "QUOTA_EXCEEDED" : "AUTHORIZATION_DENIED",
      capacityReached
        ? "The current pilot group is full."
        : "This pilot invitation is not available.",
      capacityReached ? 409 : 403,
    );
  }

  const grant = Array.isArray(data) ? data[0] : data;
  const enrollmentGrant =
    typeof grant?.enrollment_grant === "string"
      ? grant.enrollment_grant
      : "";
  const expiresAt =
    typeof grant?.expires_at === "string" ? grant.expires_at : "";
  if (
    !/^[a-f0-9]{64}$/u.test(enrollmentGrant) ||
    !expiresAt ||
    Number.isNaN(Date.parse(expiresAt))
  ) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Pilot access verification returned an invalid acknowledgement.",
      503,
      true,
    );
  }

  return json({
    apiVersion: 1,
    enrollmentGrant,
    expiresAt,
  });
}

async function handlePublicSignupPreflight(
  request: Request,
): Promise<Response> {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Account registration is temporarily unavailable.",
      503,
      true,
    );
  }

  const body = await readJson(request);
  requireApiVersion(body);
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const idempotencyKey =
    typeof body.idempotencyKey === "string"
      ? body.idempotencyKey.trim().toLowerCase()
      : "";
  if (
    !hasOnlyKeys(body, [
      "apiVersion",
      "email",
      "idempotencyKey",
      "launchMode",
    ]) ||
    email.length < 3 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ||
    !uuidPattern.test(idempotencyKey)
  ) {
    return apiError(
      "VALIDATION_FAILED",
      "Enter a valid email address and retry identity.",
      400,
    );
  }
  if (
    !await launchModeAttestationIsCurrent(
      body.launchMode,
      new Set<LaunchMode>(["public_email", "public_email_google"]),
    )
  ) {
    return apiError(
      "CONFLICT_REQUIRES_REVIEW",
      "Refresh account registration availability and try again.",
      409,
      true,
    );
  }

  const networkScopeHash = createHash("sha256")
    .update(networkScope(request), "utf8")
    .digest("hex");
  const serviceClient = createClient(
    supabaseUrl,
    supabaseServiceRoleKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await serviceClient.rpc(
    "issue_public_email_signup_grant",
    {
      p_email: email,
      p_network_scope_hash: networkScopeHash,
      p_idempotency_key: idempotencyKey,
    },
  );
  if (error) {
    const message = error.message;
    if (message.includes("PUBLIC_SIGNUP_RATE_LIMITED")) {
      return apiError(
        "RATE_LIMITED",
        "Too many registration attempts. Try again later.",
        429,
        true,
      );
    }
    if (message.includes("PUBLIC_SIGNUP_CAPACITY_REACHED")) {
      return apiError(
        "QUOTA_EXCEEDED",
        "New account capacity is temporarily full.",
        409,
      );
    }
    if (message.includes("PUBLIC_SIGNUP_IDEMPOTENCY_CONFLICT")) {
      return apiError(
        "IDEMPOTENCY_CONFLICT",
        "This registration retry identity was used for another request.",
        409,
      );
    }
    if (
      message.includes("PUBLIC_SIGNUP_ALREADY_PENDING") ||
      message.includes("PUBLIC_SIGNUP_REQUEST_EXPIRED")
    ) {
      return apiError(
        "AUTHORIZATION_DENIED",
        "A current registration request already exists. Restart account setup.",
        409,
      );
    }
    if (message.includes("PUBLIC_SIGNUP_CLOSED")) {
      return apiError(
        "AUTHORIZATION_DENIED",
        "New account registration is not open yet.",
        403,
      );
    }
    if (message.includes("PUBLIC_SIGNUP_REQUEST_INVALID")) {
      return apiError(
        "VALIDATION_FAILED",
        "The registration request is invalid.",
        400,
      );
    }
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Account registration is temporarily unavailable.",
      503,
      true,
    );
  }

  const grant = Array.isArray(data) ? data[0] : data;
  const enrollmentGrant =
    typeof grant?.enrollment_grant === "string"
      ? grant.enrollment_grant
      : "";
  const expiresAt =
    typeof grant?.expires_at === "string" ? grant.expires_at : "";
  const signupChannel =
    typeof grant?.signup_channel === "string" ? grant.signup_channel : "";
  if (
    !/^[a-f0-9]{64}$/u.test(enrollmentGrant) ||
    !expiresAt ||
    Number.isNaN(Date.parse(expiresAt)) ||
    signupChannel !== "heldat-public-email-v1"
  ) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Account registration returned an invalid acknowledgement.",
      503,
      true,
    );
  }

  return json({
    apiVersion: 1,
    enrollmentGrant,
    expiresAt,
    signupChannel,
  });
}

async function handleHouseholdInvitePreflight(
  request: Request,
): Promise<Response> {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Household invitation access is not configured.",
      503,
      true,
    );
  }
  const body = await readJson(request);
  requireApiVersion(body);
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const oneTimeCode = typeof body.oneTimeCode === "string"
    ? body.oneTimeCode.trim().toUpperCase()
    : "";
  if (
    !hasOnlyKeys(body, ["apiVersion", "email", "oneTimeCode"]) ||
    email.length < 3 ||
    email.length > 254 ||
    !email.includes("@") ||
    oneTimeCode.length < 1 ||
    oneTimeCode.length > 128 ||
    /[\u0000-\u001f\u007f-\u009f]/u.test(oneTimeCode)
  ) {
    return apiError(
      "AUTHORIZATION_DENIED",
      "This household invitation is not available.",
      403,
    );
  }

  const serviceClient = createClient(
    supabaseUrl,
    supabaseServiceRoleKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await serviceClient.rpc(
    "issue_household_invite_signup_grant",
    {
      p_email: email,
      p_invite_code: oneTimeCode,
    },
  );
  if (error) {
    return apiError(
      "AUTHORIZATION_DENIED",
      "This household invitation is not available.",
      403,
    );
  }
  const grant = Array.isArray(data) ? data[0] : data;
  const enrollmentGrant =
    typeof grant?.enrollment_grant === "string"
      ? grant.enrollment_grant
      : "";
  const expiresAt =
    typeof grant?.expires_at === "string" ? grant.expires_at : "";
  if (
    !/^[a-f0-9]{64}$/u.test(enrollmentGrant) ||
    !expiresAt ||
    Number.isNaN(Date.parse(expiresAt))
  ) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Household invitation verification returned an invalid acknowledgement.",
      503,
      true,
    );
  }
  return json({
    apiVersion: 1,
    enrollmentGrant,
    expiresAt,
  });
}

async function currentServerVersion(
  context: AuthenticatedContext,
  entityType: string,
  entityId: string,
  commandType: string,
): Promise<number> {
  if (commandType === "asset.move") {
    const { data } = await context.client
      .from("asset_location_revisions")
      .select("revision")
      .eq("asset_id", entityId)
      .is("valid_to", null)
      .maybeSingle();
    return Number(data?.revision ?? 0);
  }
  if (
    commandType === "evidence.version.add" ||
    commandType === "place-document.version.add"
  ) {
    const { data } = await context.client
      .from("evidence_versions")
      .select("version_number")
      .eq("evidence_id", entityId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    return Number(data?.version_number ?? 0);
  }
  if (entityType === "value") {
    const { data } = await context.client
      .from("asset_value_assertions")
      .select("version")
      .eq("id", entityId)
      .maybeSingle();
    return Number(data?.version ?? 0);
  }

  const versionTables: Readonly<Record<string, string>> = {
    place: "places",
    space: "spaces",
    asset: "assets",
    liability: "liabilities",
    "liability-review": "liability_reviews",
    evidence: "evidence",
  };
  const table = versionTables[entityType];
  if (!table) return 0;
  const { data } = await context.client
    .from(table)
    .select("version")
    .eq("id", entityId)
    .maybeSingle();
  return Number(data?.version ?? 0);
}

async function handleSyncPush(
  request: Request,
  context: AuthenticatedContext,
): Promise<Response> {
  const body = await readJson(request);
  requireApiVersion(body);
  const operations = Array.isArray(body.operations) ? body.operations : [];
  if (
    !hasOnlyKeys(body, ["apiVersion", "operations"]) ||
    operations.length === 0 ||
    operations.length > 100
  ) {
    return apiError(
      "VALIDATION_FAILED",
      "Provide between 1 and 100 operations.",
    );
  }

  const acknowledgedOperationIds: string[] = [];
  const conflicts: Array<Record<string, unknown>> = [];
  let highestCursor = 0;
  for (const operation of operations) {
    const record = operation && typeof operation === "object"
      ? operation as Record<string, unknown>
      : {};
    const command = record.command && typeof record.command === "object"
      ? record.command as Record<string, unknown>
      : {};
    const entityId = String(command.aggregateId ?? record.entityId ?? "");
    const commandType = String(command.type ?? record.command ?? "");
    const payload = command.payload && typeof command.payload === "object"
      ? command.payload as Record<string, unknown>
      : record.payload && typeof record.payload === "object"
      ? record.payload as Record<string, unknown>
      : {};
    const entityType = String(
      record.entityType ?? commandType.split(".")[0] ?? "",
    );
    const operationId = String(record.operationId ?? record.id ?? "");
    const { data, error } = await context.client.rpc(
      "apply_sync_operation",
      { p_operation: operation },
    );
    if (error) {
      const idempotencyConflict = error.message.includes(
        "IDEMPOTENCY_CONFLICT",
      );
      const liabilityReviewConflict = error.message.includes(
        "LIABILITY_REVIEW_CONFLICT",
      );
      const versionConflict = error.message.includes("VERSION_CONFLICT") ||
        error.message.includes("LOCATION_CONFLICT") ||
        liabilityReviewConflict;
      const permissionConflict = error.message.includes("PERMISSION");
      const serverVersion =
        versionConflict && uuidPattern.test(entityId)
          ? await currentServerVersion(
            context,
            entityType,
            commandType === "evidence.version.add"
              ? String(payload.evidenceId ?? entityId)
              : commandType === "place-document.version.add"
              ? String(payload.placeDocumentId ?? entityId)
              : entityId,
            commandType,
          )
          : 0;
      conflicts.push({
        operationId,
        entityId,
        conflictKind: permissionConflict
          ? "permission"
          : error.message.includes("LOCATION")
          ? "location"
          : commandType.startsWith("value.")
          ? "value"
          : commandType === "asset.category.set" ||
              commandType === "asset.primary-photo.set"
          ? "metadata"
          : commandType.startsWith("place.") ||
              commandType.startsWith("space.")
          ? "location"
          : "lifecycle",
        serverVersion,
        message: idempotencyConflict
          ? "This idempotency key was already used for a different change."
          : permissionConflict
          ? "Your household role does not allow this change."
          : liabilityReviewConflict
          ? "Review the household Liability register before confirming that none are recorded."
          : versionConflict
          ? "This record changed on another device and needs review before it can sync."
          : "The server rejected this queued change; earlier acknowledgements remain valid.",
      });
      continue;
    }
    const acknowledgedOperationId = typeof data?.operationId === "string"
      ? data.operationId
      : "";
    if (acknowledgedOperationId) {
      acknowledgedOperationIds.push(acknowledgedOperationId);
    }
    const cursor = Number(data?.cursor ?? 0);
    if (Number.isSafeInteger(cursor)) highestCursor = Math.max(highestCursor, cursor);
  }

  return json({
    acknowledgedOperationIds,
    conflicts,
    cursor: {
      cursorVersion: 1,
      value: highestCursor > 0 ? String(highestCursor) : null,
      issuedAt: new Date().toISOString(),
    },
  });
}

async function handleSyncPull(
  request: Request,
  context: AuthenticatedContext,
): Promise<Response> {
  const url = new URL(request.url);
  const householdId = url.searchParams.get("householdId");
  const cursor = Number(url.searchParams.get("cursor") ?? "0");
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? "250"), 1),
    500,
  );

  if (!householdId || !Number.isSafeInteger(cursor) || cursor < 0) {
    return apiError("INVALID_CURSOR", "The sync cursor is invalid.");
  }

  // Establish active membership before returning either metadata or changes.
  // `pull_sync_operations` deliberately returns no rows when authorization is
  // absent, which is indistinguishable from an empty household. This explicit
  // check prevents a revoked clean device from materializing a stale vault.
  const { data: membership, error: membershipError } = await context.client
    .from("memberships")
    .select("id, household_id, user_id, role, version")
    .eq("household_id", householdId)
    .eq("user_id", context.userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();
  if (membershipError) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Unable to verify household access.",
      503,
      true,
    );
  }
  if (!membership) {
    return apiError(
      "AUTHORIZATION_DENIED",
      "You no longer have access to this household.",
      403,
    );
  }

  const { data: household, error: householdError } = await context.client
    .from("households")
    .select("id, name, version, created_at")
    .eq("id", householdId)
    .is("deleted_at", null)
    .maybeSingle();
  if (householdError) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Unable to load this household.",
      503,
      true,
    );
  }
  if (!household) {
    return apiError(
      "AUTHORIZATION_DENIED",
      "You no longer have access to this household.",
      403,
    );
  }

  const { data, error } = await context.client.rpc(
    "pull_sync_batch",
    {
      p_household_id: householdId,
      p_after_cursor: cursor,
      p_limit: limit,
    },
  );

  if (error) {
    return apiError(
      error.message.includes("PERMISSION")
        ? "AUTHORIZATION_DENIED"
        : "STORAGE_UNAVAILABLE",
      error.message.includes("PERMISSION")
        ? "You no longer have access to this household."
        : "Unable to refresh this household.",
      error.message.includes("PERMISSION") ? 403 : 503,
      !error.message.includes("PERMISSION"),
    );
  }

  const batch =
    data && typeof data === "object" && !Array.isArray(data)
      ? data as Record<string, unknown>
      : {};
  const operations = Array.isArray(batch.operations)
    ? batch.operations.filter(
      (operation): operation is Record<string, unknown> =>
        operation !== null &&
        typeof operation === "object" &&
        !Array.isArray(operation),
    )
    : [];
  const scannedCursor = Number(batch.nextCursor ?? cursor);
  const nextCursor =
    Number.isSafeInteger(scannedCursor) && scannedCursor >= cursor
      ? scannedCursor
      : cursor;

  return json({
    workspace: {
      householdId: household.id,
      householdName: household.name,
      householdVersion: Number(household.version),
      householdCreatedAt: household.created_at,
      membershipId: membership.id,
      accountId: membership.user_id,
      role: membership.role,
      membershipVersion: Number(membership.version),
    },
    changes: operations.map((operation: Record<string, unknown>) => {
      const result = operation.result && typeof operation.result === "object"
        ? operation.result as Record<string, unknown>
        : {};
      return {
        sequence: Number(operation.cursor),
        entityType: operation.entity_type,
        entityId: operation.entity_id,
        householdId,
        version: Number(result.entityVersion ?? 1),
        // Archive/restore are reversible lifecycle states, not deletion.
        tombstoned:
          operation.command === "value.delete" ||
          operation.command === "liability.delete",
        body:
          operation.command === "value.delete" ||
            operation.command === "liability.delete"
          ? null
          : {
            operationId: operation.operation_id,
            command: operation.command,
            payload: operation.payload ?? {},
            result,
          },
        changedAt: operation.received_at,
      };
    }),
    cursor: {
      cursorVersion: 1,
      value: String(nextCursor),
      issuedAt: new Date().toISOString(),
    },
  });
}

async function handleHouseholdCreate(
  request: Request,
  context: AuthenticatedContext,
): Promise<Response> {
  const body = await readJson(request);
  requireApiVersion(body);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const operationId = typeof body.operationId === "string"
    ? body.operationId
    : "";
  const householdId = typeof body.householdId === "string"
    ? body.householdId
    : "";
  if (
    !hasOnlyKeys(
      body,
      ["apiVersion", "operationId", "householdId", "name"],
    ) ||
    !uuidPattern.test(operationId) ||
    !uuidPattern.test(householdId) ||
    name.length < 1 ||
    name.length > 120
  ) {
    return apiError(
      "VALIDATION_FAILED",
      "The household creation request is invalid.",
    );
  }
  const { data, error } = await context.client.rpc(
    "create_household",
    {
      p_name: name,
      p_operation_id: operationId,
      p_household_id: householdId,
    },
  );

  if (error) {
    const quotaReached = error.message.includes("PILOT_HOUSEHOLD_LIMIT");
    const capacityReached = error.message.includes(
      "PILOT_CAPACITY_REACHED",
    );
    const enrollmentRequired = error.message.includes(
      "PILOT_ENROLLMENT_REQUIRED",
    );
    const idempotencyConflict = error.message.includes(
      "IDEMPOTENCY_CONFLICT",
    );
    const operationLimited = error.message.includes(
      "HOUSEHOLD_OPERATION_LIMIT",
    );
    const recoveryDenied =
      error.message.includes("HOUSEHOLD_RECOVERY_DENIED") ||
      error.message.includes("IDEMPOTENCY_RECEIPT_INVALID");
    return apiError(
      operationLimited
        ? "RATE_LIMITED"
        : recoveryDenied
        ? "AUTHORIZATION_DENIED"
        : idempotencyConflict
        ? "IDEMPOTENCY_CONFLICT"
        : quotaReached || capacityReached
        ? "QUOTA_EXCEEDED"
        : enrollmentRequired
        ? "AUTHORIZATION_DENIED"
        : "VALIDATION_FAILED",
      operationLimited
        ? "Household setup has reached its retry limit. Try again after the retention window."
        : recoveryDenied
        ? "This household setup operation is not available to this account."
        : idempotencyConflict
        ? "This household creation identity was already used for a different request."
        : quotaReached || capacityReached
        ? "The closed pilot has reached its household limit."
        : enrollmentRequired
        ? "This account is not enrolled in the closed pilot."
        : "The household could not be created.",
      operationLimited
        ? 429
        : recoveryDenied
        ? 403
        : idempotencyConflict || quotaReached || capacityReached
        ? 409
        : enrollmentRequired
        ? 403
        : 400,
      operationLimited,
    );
  }
  return json({ operationId, household: data }, 201);
}

async function handleOnboardingComplete(
  request: Request,
  context: AuthenticatedContext,
): Promise<Response> {
  const body = await readJson(request);
  requireApiVersion(body);
  const householdId = typeof body.householdId === "string"
    ? body.householdId
    : "";
  if (
    !hasOnlyKeys(body, ["apiVersion", "householdId"]) ||
    !uuidPattern.test(householdId)
  ) {
    return apiError(
      "VALIDATION_FAILED",
      "The household onboarding request is invalid.",
    );
  }

  const { error } = await context.client.rpc(
    "complete_household_onboarding",
    { p_household_id: householdId },
  );
  if (error) {
    const denied = error.message.includes("HOUSEHOLD_ADMIN_REQUIRED");
    return apiError(
      denied ? "AUTHORIZATION_DENIED" : "VALIDATION_FAILED",
      denied
        ? "Only a household owner can complete setup."
        : "Unable to complete household setup.",
      denied ? 403 : 400,
    );
  }
  return json({ householdId, onboarding: "complete" });
}

async function handleInviteAccept(
  request: Request,
  context: AuthenticatedContext,
): Promise<Response> {
  const body = await readJson(request);
  requireApiVersion(body);
  const code = typeof body.oneTimeCode === "string"
    ? body.oneTimeCode.trim()
    : "";
  if (
    !hasOnlyKeys(body, ["apiVersion", "oneTimeCode"]) ||
    code.length < 1 ||
    code.length > 128
  ) {
    return apiError("VALIDATION_FAILED", "The invitation code is invalid.");
  }
  const { data, error } = await context.client.rpc(
    "accept_household_invite",
    { p_code: code },
  );

  if (error) {
    return apiError(
      "NOT_FOUND",
      "This invitation is invalid or has expired.",
      404,
    );
  }

  return json({ membership: data });
}

async function handleInvitePreview(
  request: Request,
  context: AuthenticatedContext,
): Promise<Response> {
  const body = await readJson(request);
  requireApiVersion(body);
  const code = typeof body.oneTimeCode === "string"
    ? body.oneTimeCode.trim().toUpperCase()
    : "";
  if (
    !hasOnlyKeys(body, ["apiVersion", "oneTimeCode"]) ||
    code.length < 1 ||
    code.length > 128 ||
    /[\u0000-\u001f\u007f-\u009f]/u.test(code)
  ) {
    return apiError("VALIDATION_FAILED", "The invitation code is invalid.");
  }

  const { data, error } = await context.client.rpc(
    "preview_household_invite",
    { p_code: code },
  );
  if (error) {
    return apiError(
      "NOT_FOUND",
      "This invitation is invalid or has expired.",
      404,
    );
  }

  const candidate = Array.isArray(data) ? data[0] : data;
  const householdName = typeof candidate?.household_name === "string"
    ? candidate.household_name.trim()
    : "";
  const role = candidate?.role;
  const expiresAt = typeof candidate?.expires_at === "string"
    ? candidate.expires_at
    : "";
  if (
    householdName.length < 1 ||
    householdName.length > 120 ||
    (role !== "editor" && role !== "viewer") ||
    !expiresAt ||
    Number.isNaN(Date.parse(expiresAt))
  ) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Invitation review returned an invalid acknowledgement.",
      503,
      true,
    );
  }

  return json(
    {
      review: {
        householdName,
        role,
        expiresAt,
      },
    },
    200,
    { "Cache-Control": "no-store" },
  );
}

async function handleInviteCreate(
  request: Request,
  context: AuthenticatedContext,
): Promise<Response> {
  const body = await readJson(request);
  requireApiVersion(body);
  const householdId = typeof body.householdId === "string"
    ? body.householdId
    : "";
  const role = body.role;
  const expiresInHours = body.expiresInHours;

  if (
    !hasOnlyKeys(body, [
      "apiVersion",
      "householdId",
      "role",
      "expiresInHours",
    ]) ||
    !uuidPattern.test(householdId) ||
    (role !== "editor" && role !== "viewer") ||
    typeof expiresInHours !== "number" ||
    !Number.isSafeInteger(expiresInHours) ||
    expiresInHours < 1 ||
    expiresInHours > 30 * 24
  ) {
    return apiError(
      "VALIDATION_FAILED",
      "The household invitation is invalid.",
    );
  }

  const { data, error } = await context.client.rpc(
    "create_household_invite",
    {
      p_household_id: householdId,
      p_role: role,
      p_ttl: `${expiresInHours} hours`,
    },
  );

  if (error) {
    const denied = error.message.includes("PERMISSION");
    return apiError(
      denied ? "AUTHORIZATION_DENIED" : "VALIDATION_FAILED",
      denied
        ? "Only a household owner can create an invitation."
        : "Unable to create this invitation.",
      denied ? 403 : 400,
    );
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (
    !result ||
    typeof result.invite_id !== "string" ||
    typeof result.invite_code !== "string" ||
    typeof result.expires_at !== "string"
  ) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "The invitation was not returned by the server.",
      503,
      true,
    );
  }

  return json({
    inviteId: result.invite_id,
    oneTimeCode: result.invite_code,
    role,
    expiresAt: result.expires_at,
  }, 201);
}

function householdAdministrationError(error: { message: string }): Response {
  if (error.message.includes("IDEMPOTENCY_CONFLICT")) {
    return apiError(
      "IDEMPOTENCY_CONFLICT",
      "This administration request conflicts with an earlier request.",
      409,
    );
  }
  if (error.message.includes("VERSION_CONFLICT")) {
    return apiError(
      "CONFLICT_REQUIRES_REVIEW",
      "Household access changed on another device. Refresh before continuing.",
      409,
    );
  }
  if (
    error.message.includes("PERMISSION_DENIED") ||
    error.message.includes("OWNER_ROLE_PROTECTED") ||
    error.message.includes("SELF_REVOCATION_FORBIDDEN") ||
    error.message.includes("INVALID_OWNERSHIP_TARGET")
  ) {
    return apiError(
      "AUTHORIZATION_DENIED",
      "Your current household role does not allow this change.",
      403,
    );
  }
  if (
    error.message.includes("NOT_FOUND") ||
    error.message.includes("NOT_PENDING")
  ) {
    return apiError(
      "NOT_FOUND",
      "This household access record is no longer available.",
      404,
    );
  }
  return apiError(
    "VALIDATION_FAILED",
    "The household access request is invalid.",
    400,
  );
}

async function householdAccessSnapshot(
  context: AuthenticatedContext,
  householdId: string,
): Promise<{ data: unknown; error: { message: string } | null }> {
  const { data, error } = await context.client.rpc(
    "household_access_snapshot",
    { p_household_id: householdId },
  );
  return { data, error };
}

type HouseholdStorageRpcRow = {
  readonly household_id: string;
  readonly used_bytes: number;
  readonly allowance_bytes: number;
  readonly measured_at: string;
};

const householdStorageRpcFields = [
  "allowance_bytes",
  "household_id",
  "measured_at",
  "used_bytes",
] as const;

function parseHouseholdStorageRpcRow(
  value: unknown,
  expectedHouseholdId: string,
): HouseholdStorageRpcRow | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const fields = Object.keys(row).sort();
  if (
    fields.length !== householdStorageRpcFields.length ||
    fields.some((field, index) => field !== householdStorageRpcFields[index])
  ) {
    return null;
  }
  if (
    row.household_id !== expectedHouseholdId ||
    typeof row.used_bytes !== "number" ||
    !Number.isSafeInteger(row.used_bytes) ||
    row.used_bytes < 0 ||
    typeof row.allowance_bytes !== "number" ||
    !Number.isSafeInteger(row.allowance_bytes) ||
    row.allowance_bytes <= 0 ||
    typeof row.measured_at !== "string"
  ) {
    return null;
  }
  const measuredAtMilliseconds = Date.parse(row.measured_at);
  if (!Number.isFinite(measuredAtMilliseconds)) return null;

  return {
    household_id: row.household_id,
    used_bytes: row.used_bytes,
    allowance_bytes: row.allowance_bytes,
    measured_at: new Date(measuredAtMilliseconds).toISOString(),
  };
}

function householdStorageAuthorizationDenied(): Response {
  return apiError(
    "AUTHORIZATION_DENIED",
    "You no longer have access to this household.",
    403,
  );
}

async function handleHouseholdStorageUsage(
  request: Request,
  context: AuthenticatedContext,
): Promise<Response> {
  const url = new URL(request.url);
  const queryEntries = [...url.searchParams.entries()];
  const rawHouseholdId = queryEntries.length === 1 &&
      queryEntries[0]?.[0] === "householdId"
    ? queryEntries[0][1]
    : "";
  if (
    url.search.length > 64 ||
    !uuidPattern.test(rawHouseholdId)
  ) {
    return apiError(
      "VALIDATION_FAILED",
      "Choose a valid household before loading storage usage.",
      400,
    );
  }
  const householdId = rawHouseholdId.toLowerCase();

  const { data, error } = await context.client.rpc(
    "read_household_storage_usage",
    { p_household_id: householdId },
  );
  if (error) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Cloud storage usage is temporarily unavailable.",
      503,
      true,
    );
  }
  if (!Array.isArray(data)) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Cloud storage usage is temporarily unavailable.",
      503,
      true,
    );
  }
  if (data.length === 0) return householdStorageAuthorizationDenied();
  if (data.length !== 1) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Cloud storage usage is temporarily unavailable.",
      503,
      true,
    );
  }

  const usage = parseHouseholdStorageRpcRow(data[0], householdId);
  if (!usage) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Cloud storage usage is temporarily unavailable.",
      503,
      true,
    );
  }

  return json({
    householdId: usage.household_id,
    source: "server-confirmed",
    usedBytes: usage.used_bytes,
    allowanceBytes: usage.allowance_bytes,
    measuredAt: usage.measured_at,
  }, 200, { "Cache-Control": "no-store" });
}

async function handleHouseholdAccessSnapshot(
  request: Request,
  context: AuthenticatedContext,
): Promise<Response> {
  const householdId = new URL(request.url).searchParams.get("householdId") ??
    "";
  if (!uuidPattern.test(householdId)) {
    return apiError(
      "VALIDATION_FAILED",
      "Choose a valid household before refreshing access.",
    );
  }
  const { data, error } = await householdAccessSnapshot(context, householdId);
  if (error) return householdAdministrationError(error);
  return json({ snapshot: data }, 200, {
    "Cache-Control": "no-store",
  });
}

async function handleHouseholdMemberRoleChange(
  request: Request,
  context: AuthenticatedContext,
): Promise<Response> {
  const body = await readJson(request);
  requireApiVersion(body);
  const householdId = typeof body.householdId === "string"
    ? body.householdId
    : "";
  const membershipId = typeof body.membershipId === "string"
    ? body.membershipId
    : "";
  const operationId = typeof body.operationId === "string"
    ? body.operationId
    : "";
  const expectedVersion = body.expectedVersion;
  const role = body.role;
  if (
    !hasOnlyKeys(body, [
      "apiVersion",
      "householdId",
      "membershipId",
      "expectedVersion",
      "role",
      "operationId",
    ]) ||
    !uuidPattern.test(householdId) ||
    !uuidPattern.test(membershipId) ||
    !uuidPattern.test(operationId) ||
    typeof expectedVersion !== "number" ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1 ||
    (role !== "editor" && role !== "viewer")
  ) {
    return apiError("VALIDATION_FAILED", "The role change is invalid.");
  }
  const { data, error } = await context.client.rpc(
    "change_household_member_role",
    {
      p_household_id: householdId,
      p_membership_id: membershipId,
      p_expected_version: expectedVersion,
      p_role: role,
      p_operation_id: operationId,
    },
  );
  if (error) return householdAdministrationError(error);
  const snapshot = await householdAccessSnapshot(context, householdId);
  if (snapshot.error) return householdAdministrationError(snapshot.error);
  return json({ receipt: data, snapshot: snapshot.data });
}

async function handleHouseholdMemberRevoke(
  request: Request,
  context: AuthenticatedContext,
): Promise<Response> {
  const body = await readJson(request);
  requireApiVersion(body);
  const householdId = typeof body.householdId === "string"
    ? body.householdId
    : "";
  const membershipId = typeof body.membershipId === "string"
    ? body.membershipId
    : "";
  const operationId = typeof body.operationId === "string"
    ? body.operationId
    : "";
  const expectedVersion = body.expectedVersion;
  if (
    !hasOnlyKeys(body, [
      "apiVersion",
      "householdId",
      "membershipId",
      "expectedVersion",
      "operationId",
    ]) ||
    !uuidPattern.test(householdId) ||
    !uuidPattern.test(membershipId) ||
    !uuidPattern.test(operationId) ||
    typeof expectedVersion !== "number" ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1
  ) {
    return apiError("VALIDATION_FAILED", "The member removal is invalid.");
  }
  const { data, error } = await context.client.rpc(
    "revoke_household_member",
    {
      p_household_id: householdId,
      p_membership_id: membershipId,
      p_expected_version: expectedVersion,
      p_operation_id: operationId,
    },
  );
  if (error) return householdAdministrationError(error);
  const snapshot = await householdAccessSnapshot(context, householdId);
  if (snapshot.error) return householdAdministrationError(snapshot.error);
  return json({ receipt: data, snapshot: snapshot.data });
}

async function handleHouseholdInviteCancel(
  request: Request,
  context: AuthenticatedContext,
): Promise<Response> {
  const body = await readJson(request);
  requireApiVersion(body);
  const householdId = typeof body.householdId === "string"
    ? body.householdId
    : "";
  const inviteId = typeof body.inviteId === "string" ? body.inviteId : "";
  const operationId = typeof body.operationId === "string"
    ? body.operationId
    : "";
  const expectedVersion = body.expectedVersion;
  if (
    !hasOnlyKeys(body, [
      "apiVersion",
      "householdId",
      "inviteId",
      "expectedVersion",
      "operationId",
    ]) ||
    !uuidPattern.test(householdId) ||
    !uuidPattern.test(inviteId) ||
    !uuidPattern.test(operationId) ||
    typeof expectedVersion !== "number" ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1
  ) {
    return apiError(
      "VALIDATION_FAILED",
      "The invitation cancellation is invalid.",
    );
  }
  const { data, error } = await context.client.rpc(
    "cancel_household_invite",
    {
      p_household_id: householdId,
      p_invite_id: inviteId,
      p_expected_version: expectedVersion,
      p_operation_id: operationId,
    },
  );
  if (error) return householdAdministrationError(error);
  const snapshot = await householdAccessSnapshot(context, householdId);
  if (snapshot.error) return householdAdministrationError(snapshot.error);
  return json({ receipt: data, snapshot: snapshot.data });
}

async function handleHouseholdOwnershipTransfer(
  request: Request,
  context: AuthenticatedContext,
): Promise<Response> {
  const body = await readJson(request);
  requireApiVersion(body);
  const householdId = typeof body.householdId === "string"
    ? body.householdId
    : "";
  const targetMembershipId = typeof body.targetMembershipId === "string"
    ? body.targetMembershipId
    : "";
  const operationId = typeof body.operationId === "string"
    ? body.operationId
    : "";
  const expectedOwnerVersion = body.expectedOwnerVersion;
  const expectedTargetVersion = body.expectedTargetVersion;
  if (
    !hasOnlyKeys(body, [
      "apiVersion",
      "householdId",
      "targetMembershipId",
      "expectedOwnerVersion",
      "expectedTargetVersion",
      "operationId",
      "acknowledgeOwnerTransfer",
    ]) ||
    !uuidPattern.test(householdId) ||
    !uuidPattern.test(targetMembershipId) ||
    !uuidPattern.test(operationId) ||
    typeof expectedOwnerVersion !== "number" ||
    !Number.isSafeInteger(expectedOwnerVersion) ||
    expectedOwnerVersion < 1 ||
    typeof expectedTargetVersion !== "number" ||
    !Number.isSafeInteger(expectedTargetVersion) ||
    expectedTargetVersion < 1 ||
    body.acknowledgeOwnerTransfer !== true
  ) {
    return apiError(
      "VALIDATION_FAILED",
      "The ownership transfer is invalid.",
    );
  }
  const { data, error } = await context.client.rpc(
    "transfer_household_ownership",
    {
      p_household_id: householdId,
      p_target_membership_id: targetMembershipId,
      p_expected_owner_version: expectedOwnerVersion,
      p_expected_target_version: expectedTargetVersion,
      p_operation_id: operationId,
    },
  );
  if (error) return householdAdministrationError(error);
  const snapshot = await householdAccessSnapshot(context, householdId);
  if (snapshot.error) return householdAdministrationError(snapshot.error);
  return json({ receipt: data, snapshot: snapshot.data });
}

async function handleUploadIntent(
  request: Request,
  context: AuthenticatedContext,
): Promise<Response> {
  const body = await readJson(request);
  requireApiVersion(body);
  const householdId = typeof body.householdId === "string"
    ? body.householdId
    : "";
  const evidenceId = typeof body.evidenceId === "string"
    ? body.evidenceId
    : "";
  const fileName = typeof body.fileName === "string"
    ? body.fileName.trim()
    : "";
  const blobId = typeof body.blobId === "string" ? body.blobId : "";
  const versionId = typeof body.evidenceVersionId === "string"
    ? body.evidenceVersionId
    : "";
  const checksum = typeof body.checksumSha256 === "string"
    ? body.checksumSha256.toLowerCase()
    : "";
  const byteSize = Number(body.byteSize);
  const mimeType = typeof body.mimeType === "string"
    ? body.mimeType
    : "application/octet-stream";

  if (
    !hasOnlyKeys(body, [
      "apiVersion",
      "householdId",
      "evidenceId",
      "evidenceVersionId",
      "blobId",
      "fileName",
      "mimeType",
      "byteSize",
      "checksumSha256",
    ]) ||
    !householdId ||
    !uuidPattern.test(householdId) ||
    !uuidPattern.test(evidenceId) ||
    !blobId ||
    !uuidPattern.test(blobId) ||
    !versionId ||
    !uuidPattern.test(versionId) ||
    !fileName ||
    fileName.length > 255 ||
    /[\/\\\u0000-\u001f]/.test(fileName) ||
    !allowedEvidenceMimeTypes.has(mimeType) ||
    !/^[a-f0-9]{64}$/.test(checksum) ||
    !Number.isSafeInteger(byteSize) ||
    byteSize < 1 ||
    byteSize > 10 * 1024 * 1024
  ) {
    return apiError("INVALID_FILE", "The file metadata is invalid.");
  }

  let objectKey;
  try {
    objectKey = createImmutableBlobKey({
      householdId,
      blobId,
      versionId,
    });
  } catch {
    return apiError("INVALID_FILE", "The file identifiers are invalid.");
  }
  const { error: insertError } = await context.client.rpc(
    "create_blob_upload_intent",
    {
      p_id: blobId,
      p_household_id: householdId,
      p_evidence_id: evidenceId,
      p_evidence_version_id: versionId,
      p_object_key: objectKey,
      p_checksum_sha256: checksum,
      p_byte_size: byteSize,
      p_mime_type: mimeType,
    },
  );

  if (insertError) {
    const capacityFailure = classifyStorageCapacityFailure(insertError);
    const accountingBusy = insertError.code === "40001" ||
      insertError.code === "40P01" ||
      insertError.message.includes("STORAGE_ACCOUNTING_BUSY") ||
      insertError.message.includes("STORAGE_UPLOAD_AUTHORIZATION_ACTIVE");
    if (capacityFailure) {
      return apiError(
        capacityFailure.code,
        capacityFailure.message,
        capacityFailure.status,
        capacityFailure.retryable,
      );
    }
    if (accountingBusy) {
      return storageAccountingBusyResponse(
        "Storage is changing for this household. Retry the upload shortly.",
      );
    }
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Unable to prepare this upload.",
      400,
      true,
    );
  }

  let signedUpload;
  try {
    const store = await activeBlobStore();
    signedUpload = await store.createSignedUpload({
      objectKey,
      byteSize,
      contentType: mimeType,
      checksumSha256: checksum,
    });
  } catch {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Unable to prepare this upload.",
      503,
      true,
    );
  }

  const { error: authorizationRecordError } = await context.client.rpc(
    "record_blob_upload_authorization",
    {
      p_blob_id: blobId,
      p_expires_at: signedUpload.expiresAt,
    },
  );
  if (authorizationRecordError) {
    return storageAccountingBusyResponse(
      "The upload authorization was not activated. Retry to get a new upload URL.",
    );
  }

  return json({
    uploadId: blobId,
    blobObjectId: blobId,
    expiresAt: signedUpload.expiresAt,
    uploadTarget: signedUpload,
  }, 201);
}

async function handleUploadComplete(
  request: Request,
  uploadId: string,
  context: AuthenticatedContext,
): Promise<Response> {
  const body = await readJson(request);
  requireApiVersion(body);
  const checksum = typeof body.checksumSha256 === "string"
    ? body.checksumSha256.toLowerCase()
    : "";
  const declaredByteSize = Number(body.byteSize);

  if (
    !hasOnlyKeys(body, ["apiVersion", "checksumSha256", "byteSize"]) ||
    !/^[a-f0-9]{64}$/.test(checksum) ||
    !Number.isSafeInteger(declaredByteSize) ||
    declaredByteSize < 1 ||
    declaredByteSize > 10 * 1024 * 1024
  ) {
    return apiError("INVALID_FILE", "The file metadata is invalid.");
  }

  const { data: blob, error: blobError } = await context.client
    .from("blob_objects")
    .select(
      "id, household_id, object_key, checksum_sha256, byte_size, mime_type, status",
    )
    .eq("id", uploadId)
    .maybeSingle();

  if (blobError || !blob) {
    return apiError("NOT_FOUND", "Upload not found.", 404);
  }
  if (blob.checksum_sha256 !== checksum) {
    return apiError(
      "INVALID_FILE",
      "The uploaded file checksum does not match the capture record.",
      409,
    );
  }
  if (
    !Number.isSafeInteger(declaredByteSize) ||
    declaredByteSize !== Number(blob.byte_size)
  ) {
    return apiError(
      "INVALID_FILE",
      "The uploaded file size does not match the capture record.",
      409,
    );
  }

  if (blob.status === "stored") {
    return json({
      upload: {
        id: blob.id,
        objectKey: blob.object_key,
        status: "stored",
      },
      note:
        "Cloud presence, byte size, and SHA-256 checksum were previously confirmed.",
    });
  }

  let descriptor: BlobUploadDescriptor;
  try {
    descriptor = {
      objectKey: asImmutableBlobKey(blob.object_key),
      byteSize: Number(blob.byte_size),
      contentType: blob.mime_type,
      checksumSha256: checksum,
    };
  } catch {
    return apiError(
      "INVALID_FILE",
      "The cloud object identity is invalid.",
      409,
    );
  }

  let serverSize = 0;
  let serverChecksum = "";
  try {
    const store = await activeBlobStore();
    const head = await store.headObject(descriptor.objectKey);
    const headAssessment = assessBlobHead(head, descriptor);
    if (!headAssessment.ok) {
      return apiError(
        headAssessment.code === "OBJECT_MISSING"
          ? "STORAGE_UNAVAILABLE"
          : "INVALID_FILE",
        headAssessment.code === "OBJECT_MISSING"
          ? "The file is not yet available in cloud storage."
          : "The uploaded file metadata does not match the capture record.",
        409,
        headAssessment.code === "OBJECT_MISSING",
      );
    }
    const opened = await store.openReadStream(descriptor.objectKey);
    const streamHeadAssessment = assessBlobHead(opened.head, descriptor);
    if (!streamHeadAssessment.ok) {
      return apiError(
        "INVALID_FILE",
        "The uploaded file metadata changed during verification.",
        409,
      );
    }
    const digest = await digestBlobStream(
      opened.stream,
      descriptor.byteSize,
    );
    serverSize = digest.byteSize;
    serverChecksum = digest.checksumSha256;
    if (digest.overflowed) {
      return apiError(
        "INVALID_FILE",
        "The uploaded file size does not match the capture record.",
        409,
      );
    }
  } catch (error) {
    return providerFailure(
      error,
      "The file is not yet available in cloud storage.",
      "The uploaded file could not be verified.",
    );
  }

  if (serverSize !== Number(blob.byte_size)) {
    return apiError(
      "INVALID_FILE",
      "The uploaded file size does not match the capture record.",
      409,
    );
  }
  if (serverChecksum !== checksum) {
    return apiError(
      "INVALID_FILE",
      "The stored file bytes do not match the capture checksum.",
      409,
    );
  }

  if (!supabaseServiceRoleKey) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Upload verification is not configured.",
      503,
      true,
    );
  }
  const verificationClient = createClient(
    supabaseUrl,
    supabaseServiceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
  const { data, error } = await verificationClient.rpc(
    "mark_blob_stored",
    {
      p_id: uploadId,
      p_checksum_sha256: checksum,
      p_byte_size: serverSize,
      p_verified_actor_id: context.userId,
    },
  );

  if (error) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Unable to complete this upload.",
      503,
      true,
    );
  }

  return json({
    upload: {
      id: data.id,
      objectKey: data.object_key,
      status: data.status,
    },
    note:
      "Cloud presence, byte size, and SHA-256 checksum are confirmed.",
  });
}

async function handleEvidenceDownload(
  request: Request,
  context: AuthenticatedContext,
): Promise<Response> {
  const body = await readJson(request);
  requireApiVersion(body);
  const householdId = typeof body.householdId === "string"
    ? body.householdId
    : "";
  const evidenceId = typeof body.evidenceId === "string"
    ? body.evidenceId
    : "";
  const evidenceVersionId = typeof body.evidenceVersionId === "string"
    ? body.evidenceVersionId
    : "";
  const blobId = typeof body.blobId === "string" ? body.blobId : "";
  const fileName = typeof body.fileName === "string"
    ? body.fileName
    : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
  const byteSize = Number(body.byteSize);
  const checksum = typeof body.checksumSha256 === "string"
    ? body.checksumSha256.toLowerCase()
    : "";

  if (
    !hasOnlyKeys(body, [
      "apiVersion",
      "householdId",
      "evidenceId",
      "evidenceVersionId",
      "blobId",
      "fileName",
      "mimeType",
      "byteSize",
      "checksumSha256",
    ]) ||
    !uuidPattern.test(householdId) ||
    !uuidPattern.test(evidenceId) ||
    !uuidPattern.test(evidenceVersionId) ||
    !uuidPattern.test(blobId) ||
    !fileName.trim() ||
    fileName.length > 255 ||
    /[\/\\\u0000-\u001f]/.test(fileName) ||
    !allowedEvidenceMimeTypes.has(mimeType) ||
    !Number.isSafeInteger(byteSize) ||
    byteSize < 1 ||
    byteSize > 10 * 1024 * 1024 ||
    !/^[a-f0-9]{64}$/.test(checksum)
  ) {
    return apiError("INVALID_FILE", "The Evidence download metadata is invalid.");
  }

  // Every lookup uses the caller's bearer. RLS therefore hides records from
  // revoked or cross-household accounts before any Storage request is made.
  const { data: evidence, error: evidenceError } = await context.client
    .from("evidence")
    .select("id")
    .eq("id", evidenceId)
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .maybeSingle();
  if (evidenceError) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "The Evidence record could not be checked.",
      503,
      true,
    );
  }
  if (!evidence) {
    return apiError("NOT_FOUND", "Evidence not found.", 404);
  }

  const { data: version, error: versionError } = await context.client
    .from("evidence_versions")
    .select(
      "id, household_id, evidence_id, blob_object_id, file_name, mime_type, byte_size, checksum_sha256",
    )
    .eq("id", evidenceVersionId)
    .eq("household_id", householdId)
    .eq("evidence_id", evidenceId)
    .eq("blob_object_id", blobId)
    .maybeSingle();
  if (versionError) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "The Evidence version could not be checked.",
      503,
      true,
    );
  }
  if (
    !version ||
    version.file_name !== fileName ||
    version.mime_type !== mimeType ||
    Number(version.byte_size) !== byteSize ||
    version.checksum_sha256 !== checksum
  ) {
    return apiError("NOT_FOUND", "Evidence version not found.", 404);
  }

  const { data: blob, error: blobError } = await context.client
    .from("blob_objects")
    .select(
      "id, household_id, expected_evidence_id, expected_evidence_version_id, object_key, checksum_sha256, byte_size, mime_type, status",
    )
    .eq("id", blobId)
    .eq("household_id", householdId)
    .eq("expected_evidence_id", evidenceId)
    .eq("expected_evidence_version_id", evidenceVersionId)
    .eq("status", "stored")
    .is("deleted_at", null)
    .maybeSingle();
  if (blobError) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "The protected cloud object could not be checked.",
      503,
      true,
    );
  }
  if (
    !blob ||
    blob.checksum_sha256 !== checksum ||
    Number(blob.byte_size) !== byteSize ||
    blob.mime_type !== mimeType
  ) {
    return apiError("NOT_FOUND", "Evidence file not found.", 404);
  }

  let descriptor: BlobUploadDescriptor;
  try {
    descriptor = {
      objectKey: asImmutableBlobKey(blob.object_key),
      byteSize,
      contentType: mimeType,
      checksumSha256: checksum,
    };
  } catch {
    return apiError(
      "INVALID_FILE",
      "The cloud Evidence object identity is invalid.",
      409,
    );
  }

  try {
    const store = await activeBlobStore();
    const head = await store.headObject(descriptor.objectKey);
    const assessment = assessBlobHead(head, descriptor);
    if (!assessment.ok) {
      return apiError(
        assessment.code === "OBJECT_MISSING" ? "NOT_FOUND" : "INVALID_FILE",
        assessment.code === "OBJECT_MISSING"
          ? "Evidence file not found."
          : "The cloud Evidence metadata does not match its immutable record.",
        assessment.code === "OBJECT_MISSING" ? 404 : 409,
      );
    }
    const downloadTarget = await store.createSignedDownload(
      descriptor.objectKey,
    );
    return json({ downloadTarget });
  } catch (error) {
    return providerFailure(
      error,
      "Evidence file not found.",
      "The Evidence file is temporarily unavailable.",
    );
  }
}

type AccountDeletionMembership = {
  id: string;
  household_id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
  status: "active" | "revoked";
  deleted_at: string | null;
};

function isHouseholdRole(
  value: unknown,
): value is AccountDeletionMembership["role"] {
  return value === "owner" || value === "editor" || value === "viewer";
}

function normalizeAccountEmail(value: string): string {
  return value.trim().toLowerCase();
}

function validAccountDeletionReceipt(
  value: unknown,
  accountId: string,
): value is {
  accountId: string;
  deletedHouseholdIds: string[];
  departedHouseholdIds: string[];
  deletedAt: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.accountId === accountId &&
    Array.isArray(candidate.deletedHouseholdIds) &&
    candidate.deletedHouseholdIds.every((id) =>
      typeof id === "string" && uuidPattern.test(id)
    ) &&
    Array.isArray(candidate.departedHouseholdIds) &&
    candidate.departedHouseholdIds.every((id) =>
      typeof id === "string" && uuidPattern.test(id)
    ) &&
    typeof candidate.deletedAt === "string" &&
    Number.isFinite(Date.parse(candidate.deletedAt))
  );
}

function membershipFingerprint(
  memberships: readonly AccountDeletionMembership[],
): Array<Record<string, string>> {
  return [...memberships]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((membership) => ({
      membershipId: membership.id,
      householdId: membership.household_id,
      role: membership.role,
      status: membership.status,
    }));
}

async function handleAccountDeletion(
  request: Request,
  context: AuthenticatedContext,
): Promise<Response> {
  const body = await readJson(request);
  requireApiVersion(body);
  const expectedAccountId = body.expectedAccountId;
  const expectedActiveHouseholdId = body.expectedActiveHouseholdId;
  const expectedActiveHouseholdRole = body.expectedActiveHouseholdRole;
  const confirmationEmail = body.confirmationEmail;
  const password = body.password;

  if (
    !hasOnlyKeys(body, [
      "apiVersion",
      "expectedAccountId",
      "expectedActiveHouseholdId",
      "expectedActiveHouseholdRole",
      "confirmationEmail",
      "password",
      "acknowledgeIrreversibleDeletion",
    ]) ||
    typeof expectedAccountId !== "string" ||
    !uuidPattern.test(expectedAccountId) ||
    expectedAccountId !== context.userId ||
    typeof expectedActiveHouseholdId !== "string" ||
    !uuidPattern.test(expectedActiveHouseholdId) ||
    !isHouseholdRole(expectedActiveHouseholdRole) ||
    typeof confirmationEmail !== "string" ||
    confirmationEmail.length > 320 ||
    normalizeAccountEmail(confirmationEmail) !==
      normalizeAccountEmail(context.email) ||
    typeof password !== "string" ||
    password.length < 1 ||
    password.length > 128 ||
    new TextEncoder().encode(password).byteLength > 512 ||
    body.acknowledgeIrreversibleDeletion !== true
  ) {
    return apiError(
      "VALIDATION_FAILED",
      "Confirm the signed-in email, password, and irreversible deletion acknowledgement.",
      400,
    );
  }

  if (!supabaseServiceRoleKey) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Account deletion is not configured.",
      503,
      true,
    );
  }

  // Password proof is performed inside the reviewed server boundary. The
  // transient session is never returned, persisted, logged, or reused.
  const reauthenticationClient = createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
  const reauthentication = await reauthenticationClient.auth
    .signInWithPassword({
      email: context.email,
      password,
    });
  void reauthenticationClient.auth.signOut({ scope: "local" });
  if (
    reauthentication.error ||
    reauthentication.data.user?.id !== context.userId
  ) {
    const rateLimited = reauthentication.error?.status === 429;
    return apiError(
      rateLimited ? "RATE_LIMITED" : "AUTHORIZATION_DENIED",
      rateLimited
        ? "Too many verification attempts. Wait, then try again."
        : "The password did not verify this account.",
      rateLimited ? 429 : 403,
      rateLimited,
    );
  }

  const serviceClient = createClient(
    supabaseUrl,
    supabaseServiceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  // Resume only a server-created retry marker. This covers an interruption
  // after domain removal but before the auth-provider deletion acknowledged.
  const { data: pendingJob, error: pendingJobError } = await serviceClient
    .from("account_deletion_jobs")
    .select(
      "account_id, deleted_household_ids, departed_household_ids, object_keys, export_object_keys, created_at",
    )
    .eq("account_id", context.userId)
    .maybeSingle();
  if (pendingJobError) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Unable to verify account deletion state.",
      503,
      true,
    );
  }

  let receipt: {
    accountId: string;
    deletedHouseholdIds: string[];
    departedHouseholdIds: string[];
    deletedAt: string;
  } | null = pendingJob
    ? {
      accountId: pendingJob.account_id,
      deletedHouseholdIds: pendingJob.deleted_household_ids ?? [],
      departedHouseholdIds: pendingJob.departed_household_ids ?? [],
      deletedAt: pendingJob.created_at,
    }
    : null;
  let objectKeys: string[] = pendingJob?.object_keys ?? [];
  let exportObjectKeys: string[] =
    pendingJob?.export_object_keys ?? [];

  if (!receipt) {
    const { data: membershipRows, error: membershipsError } =
      await serviceClient
        .from("memberships")
        .select("id, household_id, user_id, role, status, deleted_at")
        .eq("user_id", context.userId)
        .order("id");
    if (membershipsError) {
      return apiError(
        "STORAGE_UNAVAILABLE",
        "Unable to verify account memberships.",
        503,
        true,
      );
    }

    const memberships =
      (membershipRows ?? []) as AccountDeletionMembership[];
    const activeMembership = memberships.find((membership) =>
      membership.household_id === expectedActiveHouseholdId &&
      membership.role === expectedActiveHouseholdRole &&
      membership.status === "active" &&
      membership.deleted_at === null
    );
    if (!activeMembership) {
      return apiError(
        "AUTHORIZATION_DENIED",
        "The active household changed. Reopen account deletion and review the current consequences.",
        403,
      );
    }

    const ownedHouseholdIds = memberships
      .filter((membership) =>
        membership.role === "owner" &&
        membership.status === "active" &&
        membership.deleted_at === null
      )
      .map((membership) => membership.household_id);

    if (ownedHouseholdIds.length > 0) {
      const { data: householdMembers, error: householdMembersError } =
        await serviceClient
          .from("memberships")
          .select("household_id, user_id")
          .in("household_id", ownedHouseholdIds)
          .eq("status", "active")
          .is("deleted_at", null);
      if (householdMembersError) {
        return apiError(
          "STORAGE_UNAVAILABLE",
          "Unable to verify household ownership.",
          503,
          true,
        );
      }
      const hasAnotherActiveMember = (householdMembers ?? []).some(
        (membership) => membership.user_id !== context.userId,
      );
      if (hasAnotherActiveMember) {
        return apiError(
          "CONFLICT_REQUIRES_REVIEW",
          "Transfer ownership of every shared household before deleting this account.",
          409,
        );
      }

    }

    const { data: deletionData, error: deletionError } =
      await serviceClient.rpc("delete_account_domain_data", {
        p_user_id: context.userId,
        p_expected_memberships: membershipFingerprint(memberships),
      });
    if (deletionError) {
      const ownershipTransferRequired = deletionError.message.includes(
        "OWNERSHIP_TRANSFER_REQUIRED",
      );
      const stateChanged = deletionError.message.includes(
        "ACCOUNT_STATE_CHANGED",
      );
      const uploadAuthorizationActive = deletionError.message.includes(
        "STORAGE_UPLOAD_AUTHORIZATION_ACTIVE",
      );
      if (uploadAuthorizationActive) {
        return storageAccountingBusyResponse(
          "A private-file upload authorization is still active. Retry account deletion after it expires.",
          60,
        );
      }
      return apiError(
        ownershipTransferRequired || stateChanged
          ? "CONFLICT_REQUIRES_REVIEW"
          : "STORAGE_UNAVAILABLE",
        ownershipTransferRequired
          ? "Transfer ownership of every shared household before deleting this account."
          : stateChanged
          ? "Account access changed during deletion. Review the current consequences and try again."
          : "Account records were not removed.",
        ownershipTransferRequired || stateChanged ? 409 : 503,
        !ownershipTransferRequired && !stateChanged,
      );
    }
    if (!validAccountDeletionReceipt(deletionData, context.userId)) {
      return apiError(
        "STORAGE_UNAVAILABLE",
        "Account deletion returned an invalid acknowledgement.",
        503,
        true,
      );
    }
    receipt = deletionData;
    const { data: createdJob, error: createdJobError } = await serviceClient
      .from("account_deletion_jobs")
      .select("object_keys, export_object_keys")
      .eq("account_id", context.userId)
      .single();
    if (createdJobError) {
      return apiError(
        "STORAGE_UNAVAILABLE",
        "Account records were removed, but private evidence deletion needs another attempt.",
        503,
        true,
      );
    }
    objectKeys = createdJob.object_keys ?? [];
    exportObjectKeys = createdJob.export_object_keys ?? [];
  }

  let uniqueObjectKeys: ImmutableBlobKey[];
  try {
    uniqueObjectKeys = [...new Set(
      objectKeys.filter((key) =>
        typeof key === "string" && key.length > 0
      ),
    )].map(asImmutableBlobKey);
  } catch {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Account records were removed, but an invalid private evidence pointer requires operator review.",
      503,
      false,
    );
  }
  if (uniqueObjectKeys.length > 0) {
    let store: BlobStore;
    try {
      store = await activeBlobStore();
    } catch {
      return apiError(
        "STORAGE_UNAVAILABLE",
        "Account records were removed, but private evidence deletion needs another attempt.",
        503,
        true,
      );
    }
    for (const batch of chunkValues(uniqueObjectKeys, 10_000)) {
      let removal;
      try {
        removal = await store.deleteBatch(batch);
      } catch {
        return apiError(
          "STORAGE_UNAVAILABLE",
          "Account records were removed, but private evidence deletion needs another attempt.",
          503,
          true,
        );
      }
      if (removal.failed.length > 0) {
        return apiError(
          "STORAGE_UNAVAILABLE",
          "Account records were removed, but private evidence deletion needs another attempt.",
          503,
          removal.failed.some((failure) => failure.retryable),
        );
      }
    }
  }

  const uniqueExportObjectKeys = [...new Set(
    exportObjectKeys.filter((key) =>
      typeof key === "string" && key.length > 0
    ),
  )];
  for (
    let index = 0;
    index < uniqueExportObjectKeys.length;
    index += 100
  ) {
    const removal = await serviceClient.storage
      .from("exports")
      .remove(uniqueExportObjectKeys.slice(index, index + 100));
    if (removal.error) {
      return apiError(
        "STORAGE_UNAVAILABLE",
        "Account records were removed, but private export deletion needs another attempt.",
        503,
        true,
      );
    }
  }

  // The byte hold represents physical provider objects, not the identity row.
  // Release it only after both providers acknowledge deletion, and before
  // identity removal so a failed release remains retryable by this account.
  const { error: storageHoldReleaseError } = await serviceClient.rpc(
    "release_account_deletion_storage_hold",
    { p_account_id: context.userId },
  );
  if (storageHoldReleaseError) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Private files were removed, but storage accounting needs another attempt.",
      503,
      true,
    );
  }

  const authDeletion = await serviceClient.auth.admin.deleteUser(
    context.userId,
    false,
  );
  if (authDeletion.error) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Account records were removed, but identity deletion needs another attempt.",
      503,
      true,
    );
  }

  // A stale service-only retry marker is harmless, but remove it after the
  // identity provider confirms deletion to minimize retained metadata.
  await serviceClient
    .from("account_deletion_jobs")
    .delete()
    .eq("account_id", context.userId);

  return json(receipt);
}

async function dispatchRequest(
  request: Request,
  operationalRequestId: string,
): Promise<Response> {
  if (!browserOriginAllowed(request, allowedBrowserOrigins)) {
    return apiError(
      "AUTHORIZATION_DENIED",
      "This browser origin is not allowed.",
      403,
    );
  }

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const path = routePath(request);

  try {
    if (requiresPersistentNetworkRateLimit(request, path)) {
      const networkLimit = await enforceNetworkRateLimit(request, path);
      if (networkLimit) return networkLimit;
    }

    if (
      request.method === "GET" &&
      path === "/signup/mode"
    ) {
      return await handleSignupMode();
    }
    if (
      request.method === "POST" &&
      path === "/signup/preflight"
    ) {
      return await handlePublicSignupPreflight(request);
    }
    if (
      request.method === "POST" &&
      path === "/pilot/preflight"
    ) {
      return await handlePilotPreflight(request);
    }
    if (
      request.method === "POST" &&
      path === "/invites/preflight"
    ) {
      return await handleHouseholdInvitePreflight(request);
    }
    if (
      request.method === "POST" &&
      path === "/maintenance/exports"
    ) {
      return await handleExportMaintenance(request);
    }
    if (
      request.method === "POST" &&
      path === "/maintenance/blobs"
    ) {
      return await handleBlobMaintenance(request);
    }
    if (
      request.method === "POST" &&
      path === "/maintenance/sync"
    ) {
      return await handleSyncMaintenance(request);
    }
    if (
      request.method === "POST" &&
      path === "/maintenance/readiness"
    ) {
      return await handleReadinessMaintenance(request);
    }

    const context = await authenticate(request);
    if (context instanceof Response) return context;
    const userLimit = await enforceUserRateLimit(
      request,
      path,
      context.userId,
    );
    if (userLimit) return userLimit;

    if (request.method === "POST" && path === "/product-events") {
      return await handleProductEvent(request, context);
    }
    if (request.method === "POST" && path === "/households") {
      return await handleHouseholdCreate(request, context);
    }
    if (
      request.method === "POST" &&
      path === "/onboarding/complete"
    ) {
      return await handleOnboardingComplete(request, context);
    }
    if (request.method === "POST" && path === "/sync/push") {
      return await handleSyncPush(request, context);
    }
    if (request.method === "GET" && path === "/sync/pull") {
      return await handleSyncPull(request, context);
    }
    if (request.method === "POST" && path === "/uploads/intents") {
      return await handleUploadIntent(request, context);
    }
    if (
      request.method === "POST" &&
      /^\/uploads\/[0-9a-f-]+\/complete$/i.test(path)
    ) {
      const uploadId = path.split("/")[2];
      return await handleUploadComplete(request, uploadId, context);
    }
    if (request.method === "POST" && path === "/evidence/download") {
      return await handleEvidenceDownload(request, context);
    }
    if (request.method === "POST" && path === "/invites") {
      return await handleInviteCreate(request, context);
    }
    if (request.method === "POST" && path === "/invites/preview") {
      return await handleInvitePreview(request, context);
    }
    if (request.method === "POST" && path === "/invites/accept") {
      return await handleInviteAccept(request, context);
    }
    if (request.method === "GET" && path === "/household-access") {
      return await handleHouseholdAccessSnapshot(request, context);
    }
    if (request.method === "GET" && path === "/household-storage") {
      return await handleHouseholdStorageUsage(request, context);
    }
    if (
      request.method === "POST" &&
      path === "/household-access/member-role"
    ) {
      return await handleHouseholdMemberRoleChange(request, context);
    }
    if (
      request.method === "POST" &&
      path === "/household-access/member-revoke"
    ) {
      return await handleHouseholdMemberRevoke(request, context);
    }
    if (
      request.method === "POST" &&
      path === "/household-access/invite-cancel"
    ) {
      return await handleHouseholdInviteCancel(request, context);
    }
    if (
      request.method === "POST" &&
      path === "/household-access/ownership-transfer"
    ) {
      return await handleHouseholdOwnershipTransfer(request, context);
    }
    if (request.method === "POST" && path === "/exports") {
      return await handleExportCreate(request, context);
    }
    if (
      request.method === "GET" &&
      /^\/exports\/[0-9a-f-]+\/download$/i.test(path)
    ) {
      return await handleExportDownload(path.split("/")[2], context);
    }
    if (
      request.method === "GET" &&
      /^\/exports\/[0-9a-f-]+$/i.test(path)
    ) {
      return await handleExportGet(path.split("/")[2], context);
    }
    if (request.method === "POST" && path === "/account/deletion") {
      return await handleAccountDeletion(request, context);
    }

    return apiError("NOT_FOUND", "Route not found.", 404);
  } catch (error) {
    if (error instanceof Error && error.message === "CONTENT_TYPE_REQUIRED") {
      return apiError(
        "VALIDATION_FAILED",
        "Use application/json for this request.",
        415,
      );
    }
    if (
      error instanceof Error &&
      error.message === "CONTENT_ENCODING_UNSUPPORTED"
    ) {
      return apiError(
        "VALIDATION_FAILED",
        "Compressed API request bodies are not supported.",
        415,
      );
    }
    if (
      error instanceof Error &&
      error.message === "CONTENT_LENGTH_INVALID"
    ) {
      return apiError(
        "VALIDATION_FAILED",
        "The request body length is invalid.",
        400,
      );
    }
    if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
      return apiError(
        "VALIDATION_FAILED",
        "Requests are limited to 1 MB.",
        413,
      );
    }
    if (error instanceof Error && error.message === "INVALID_JSON") {
      return apiError(
        "VALIDATION_FAILED",
        "Provide one valid JSON object.",
        400,
      );
    }
    if (
      error instanceof Error &&
      error.message === "UNSUPPORTED_CONTRACT_VERSION"
    ) {
      return apiError(
        "UNSUPPORTED_CONTRACT_VERSION",
        "This client contract version is not supported.",
        400,
      );
    }

    console.error(JSON.stringify({
      event: "api.request.failed",
      requestId: operationalRequestId,
      method: request.method,
      path,
      errorName: error instanceof Error ? error.name : "UnknownError",
    }));
    return apiError(
      "STORAGE_UNAVAILABLE",
      "The request could not be completed.",
      500,
      true,
    );
  }
}

Deno.serve(async (request) => {
  const id = requestId(request);
  const path = routePath(request);
  const startedAt = performance.now();
  const response = await dispatchRequest(request, id);
  const protectedResponse = withOperationalHeaders(
    response,
    id,
    request,
    allowedBrowserOrigins,
  );
  logRequestCompletion({
    id,
    method: request.method,
    path,
    status: protectedResponse.status,
    durationMs: performance.now() - startedAt,
  });
  return protectedResponse;
});
