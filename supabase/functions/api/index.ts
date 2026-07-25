import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { apiError, corsHeaders, json } from "../_shared/http.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const supabaseServiceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

type AuthenticatedContext = {
  client: SupabaseClient;
  userId: string;
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
  if (error || !data.user) {
    return apiError("SESSION_EXPIRED", "Your session has expired.", 401);
  }

  return { client, userId: data.user.id };
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("CONTENT_TYPE_REQUIRED");
  }
  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 1_048_576) {
    throw new Error("REQUEST_TOO_LARGE");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 1_048_576) {
    throw new Error("REQUEST_TOO_LARGE");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("INVALID_JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("INVALID_JSON");
  }
  return parsed as Record<string, unknown>;
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
  if (commandType === "evidence.version.add") {
    const { data } = await context.client
      .from("evidence_versions")
      .select("version_number")
      .eq("evidence_id", entityId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    return Number(data?.version_number ?? 0);
  }

  const table = entityType === "evidence" ? "evidence" : "assets";
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
      const versionConflict = error.message.includes("VERSION_CONFLICT") ||
        error.message.includes("LOCATION_CONFLICT");
      const permissionConflict = error.message.includes("PERMISSION");
      const serverVersion =
        versionConflict && uuidPattern.test(entityId)
          ? await currentServerVersion(
            context,
            entityType,
            commandType === "evidence.version.add"
              ? String(payload.evidenceId ?? entityId)
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
          : "lifecycle",
        serverVersion,
        message: idempotencyConflict
          ? "This idempotency key was already used for a different change."
          : permissionConflict
          ? "Your household role does not allow this change."
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

  const { data, error } = await context.client.rpc(
    "pull_sync_operations",
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

  const operations = data ?? [];
  const nextCursor = operations.length > 0
    ? operations[operations.length - 1].cursor
    : cursor;

  return json({
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
        tombstoned: operation.command === "asset.archive",
        body: {
          command: operation.command,
          payload: operation.payload ?? {},
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
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (
    !hasOnlyKeys(body, ["name"]) ||
    name.length < 1 ||
    name.length > 120
  ) {
    return apiError("VALIDATION_FAILED", "The household name is invalid.");
  }
  const { data, error } = await context.client.rpc(
    "create_household",
    { p_name: name },
  );

  if (error) {
    const quotaReached = error.message.includes("PILOT_HOUSEHOLD_LIMIT");
    const enrollmentRequired = error.message.includes(
      "PILOT_ENROLLMENT_REQUIRED",
    );
    return apiError(
      quotaReached
        ? "QUOTA_EXCEEDED"
        : enrollmentRequired
        ? "AUTHORIZATION_DENIED"
        : "VALIDATION_FAILED",
      quotaReached
        ? "The closed pilot has reached its household limit."
        : enrollmentRequired
        ? "This account is not enrolled in the closed pilot."
        : "Unable to create the household.",
      quotaReached ? 409 : enrollmentRequired ? 403 : 400,
    );
  }
  return json({ household: data }, 201);
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

async function handleExportCreate(
  request: Request,
  context: AuthenticatedContext,
): Promise<Response> {
  const body = await readJson(request);
  requireApiVersion(body);
  const householdId = typeof body.householdId === "string"
    ? body.householdId
    : "";
  const format = body.format;
  const assetIds = Array.isArray(body.assetIds) ? body.assetIds : [];
  const redacted = body.redacted;
  if (
    !hasOnlyKeys(body, [
      "apiVersion",
      "householdId",
      "format",
      "assetIds",
      "redacted",
    ]) ||
    !uuidPattern.test(householdId) ||
    (format !== "pdf" && format !== "json-manifest") ||
    assetIds.length > 500 ||
    !assetIds.every((assetId) =>
      typeof assetId === "string" && uuidPattern.test(assetId)
    ) ||
    typeof redacted !== "boolean"
  ) {
    return apiError("VALIDATION_FAILED", "The export request is invalid.");
  }
  const scope = { format, assetIds, redacted };

  const { data, error } = await context.client.rpc(
    "create_export_snapshot",
    {
      p_household_id: householdId,
      p_scope: scope,
    },
  );

  if (error) {
    return apiError(
      error.message.includes("PERMISSION")
        ? "AUTHORIZATION_DENIED"
        : "VALIDATION_FAILED",
      error.message.includes("PERMISSION")
        ? "Your household role does not allow exports."
        : "Unable to create this export.",
      error.message.includes("PERMISSION") ? 403 : 400,
    );
  }

  return json({
    exportId: data.id,
    status: data.status,
    blobObjectId: null,
    expiresAt: data.expires_at,
    error: null,
  }, 202);
}

async function handleExportGet(
  exportId: string,
  context: AuthenticatedContext,
): Promise<Response> {
  const { data, error } = await context.client
    .from("export_snapshots")
    .select("id, household_id, status, version, object_key, expires_at, created_at")
    .eq("id", exportId)
    .maybeSingle();

  if (error || !data) {
    return apiError("NOT_FOUND", "Export not found.", 404);
  }

  return json({
    exportId: data.id,
    status: data.status,
    blobObjectId: null,
    expiresAt: data.expires_at,
    error: null,
  });
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

  const objectKey = `${householdId}/${blobId}/${versionId}`;
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
    const quotaReached = insertError.message.includes("HOUSEHOLD_STORAGE_LIMIT");
    return apiError(
      quotaReached ? "QUOTA_EXCEEDED" : "STORAGE_UNAVAILABLE",
      quotaReached
        ? "This pilot household has reached its cloud file allowance."
        : "Unable to prepare this upload.",
      quotaReached ? 409 : 400,
      !quotaReached,
    );
  }

  const { data, error } = await context.client.storage
    .from("evidence")
    .createSignedUploadUrl(objectKey);

  if (error || !data) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Unable to prepare this upload.",
      503,
      true,
    );
  }

  return json({
    uploadId: blobId,
    blobObjectId: blobId,
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
    uploadTarget: {
      provider: "supabase-storage",
      bucket: "evidence",
      objectKey,
      token: data.token,
      path: data.path,
    },
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
    .select("id, household_id, object_key, checksum_sha256, byte_size, status")
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

  const { data: storedFile, error: downloadError } = await context.client.storage
    .from("evidence")
    .download(blob.object_key);

  if (downloadError || !storedFile) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "The file is not yet available in cloud storage.",
      409,
      true,
    );
  }

  const storedBytes = await storedFile.arrayBuffer();
  const serverSize = storedBytes.byteLength;
  if (serverSize !== Number(blob.byte_size)) {
    return apiError(
      "INVALID_FILE",
      "The uploaded file size does not match the capture record.",
      409,
    );
  }

  const serverChecksum = bytesToHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", storedBytes)),
  );
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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const context = await authenticate(request);
  if (context instanceof Response) return context;

  const path = routePath(request);

  try {
    if (request.method === "POST" && path === "/households") {
      return await handleHouseholdCreate(request, context);
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
    if (request.method === "POST" && path === "/invites/accept") {
      return await handleInviteAccept(request, context);
    }
    if (request.method === "POST" && path === "/exports") {
      return await handleExportCreate(request, context);
    }
    if (
      request.method === "GET" &&
      /^\/exports\/[0-9a-f-]+$/i.test(path)
    ) {
      return await handleExportGet(path.split("/")[2], context);
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

    console.error(error);
    return apiError(
      "STORAGE_UNAVAILABLE",
      "The request could not be completed.",
      500,
      true,
    );
  }
});
