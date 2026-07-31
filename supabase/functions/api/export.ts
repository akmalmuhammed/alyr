import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.110.8";

import {
  apiError,
  corsHeaders,
  json,
} from "../_shared/http.ts";
import { readBoundedJsonObject } from "../_shared/requestBody.ts";
import { classifyStorageCapacityFailure } from "../_shared/storageCapacity.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const exportMaintenanceToken =
  Deno.env.get("ALYR_EXPORT_MAINTENANCE_TOKEN") ?? "";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const checksumPattern = /^[a-f0-9]{64}$/;
const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{16,128}$/;
const maximumExportBytes = 5 * 1024 * 1024;
const exportRetentionMilliseconds = 7 * 24 * 60 * 60 * 1000;
const maximumMaintenanceBatch = 100;
const apiErrorVersion = 1 as const;

export interface ExportAuthenticatedContext {
  readonly client: SupabaseClient;
  readonly userId: string;
  readonly email: string;
}

type ExportFormat = "pdf" | "json-manifest";

interface ExportCreateBody {
  readonly apiVersion: 1;
  readonly householdId: string;
  readonly format: ExportFormat;
  readonly assetIds: readonly string[];
  readonly redacted: boolean;
  readonly idempotencyKey: string;
}

interface ExportSnapshotRow {
  readonly id: string;
  readonly household_id: string;
  readonly requested_by: string;
  readonly scope: Record<string, unknown>;
  readonly status: "queued" | "processing" | "ready" | "failed" | "expired";
  readonly processing_token: string | null;
  readonly processing_started_at: string | null;
  readonly object_key: string | null;
  readonly file_name: string | null;
  readonly mime_type: string | null;
  readonly byte_size: number | string | null;
  readonly checksum_sha256: string | null;
  readonly expires_at: string | null;
  readonly completed_at: string | null;
  readonly error_code: string | null;
  readonly error_message: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface ExportArtifact {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly mimeType: "application/json" | "application/pdf";
  readonly checksumSha256: string;
}

interface StoredArtifactPointer {
  readonly objectKey: string;
  readonly fileName: string;
  readonly mimeType: "application/json" | "application/pdf";
  readonly byteSize: number;
  readonly checksumSha256: string;
  readonly expiresAt: string;
}

interface ExportManifest {
  readonly schema: "alyr.continuity-manifest";
  readonly schemaVersion: 1;
  readonly export: {
    readonly id: string;
    readonly generatedAt: string;
    readonly format: ExportFormat;
    readonly redacted: boolean;
    readonly selectedAssetIds: readonly string[];
  };
  readonly household: Record<string, unknown>;
  readonly summary: {
    readonly places: number;
    readonly spaces: number;
    readonly assets: number;
    readonly liabilities: number;
    readonly liabilityReviews: number;
    readonly valueAssertions: number;
    readonly locationRevisions: number;
    readonly evidence: number;
    readonly evidenceVersions: number;
  };
  readonly records: {
    readonly places: readonly Record<string, unknown>[];
    readonly spaces: readonly Record<string, unknown>[];
    readonly assets: readonly Record<string, unknown>[];
    readonly liabilities: readonly Record<string, unknown>[];
    readonly liabilityReviews: readonly Record<string, unknown>[];
    readonly valueAssertions: readonly Record<string, unknown>[];
    readonly locationRevisions: readonly Record<string, unknown>[];
    readonly evidence: readonly Record<string, unknown>[];
    readonly evidenceVersions: readonly Record<string, unknown>[];
    readonly blobs: readonly Record<string, unknown>[];
  };
  readonly evidenceOriginals: {
    readonly included: false;
    readonly note: string;
  };
}

const snapshotColumns = [
  "id",
  "household_id",
  "requested_by",
  "scope",
  "status",
  "processing_token",
  "processing_started_at",
  "object_key",
  "file_name",
  "mime_type",
  "byte_size",
  "checksum_sha256",
  "expires_at",
  "completed_at",
  "error_code",
  "error_message",
  "created_at",
  "updated_at",
].join(", ");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  body: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(body).every((key) => allowed.has(key));
}

async function readCreateBody(request: Request): Promise<ExportCreateBody | null> {
  let parsed: Record<string, unknown>;
  try {
    parsed = await readBoundedJsonObject(request, 64 * 1024);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const householdId =
    typeof parsed.householdId === "string" ? parsed.householdId : "";
  const format = parsed.format;
  const assetIds = Array.isArray(parsed.assetIds) ? parsed.assetIds : [];
  const normalizedAssetIds = assetIds.map((assetId) =>
    typeof assetId === "string" ? assetId.toLowerCase() : assetId
  );
  const redacted = parsed.redacted;
  const idempotencyKey =
    typeof parsed.idempotencyKey === "string" ? parsed.idempotencyKey : "";
  if (
    !hasOnlyKeys(parsed, [
      "apiVersion",
      "householdId",
      "format",
      "assetIds",
      "redacted",
      "idempotencyKey",
    ]) ||
    parsed.apiVersion !== 1 ||
    !uuidPattern.test(householdId) ||
    (format !== "pdf" && format !== "json-manifest") ||
    assetIds.length > 500 ||
    !assetIds.every(
      (assetId) => typeof assetId === "string" && uuidPattern.test(assetId),
    ) ||
    new Set(normalizedAssetIds).size !== normalizedAssetIds.length ||
    typeof redacted !== "boolean" ||
    !idempotencyKeyPattern.test(idempotencyKey)
  ) {
    return null;
  }
  return {
    apiVersion: 1,
    householdId,
    format,
    assetIds: [...normalizedAssetIds].sort() as string[],
    redacted,
    idempotencyKey,
  };
}

function createServiceClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  try {
    return bytesToHex(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", owned.buffer as ArrayBuffer),
      ),
    );
  } finally {
    owned.fill(0);
  }
}

async function maintenanceTokenMatches(candidate: string): Promise<boolean> {
  const boundedCandidate = candidate.slice(0, 257);
  const encoder = new TextEncoder();
  const [expectedHash, candidateHash] = await Promise.all([
    sha256(encoder.encode(exportMaintenanceToken)),
    sha256(encoder.encode(boundedCandidate)),
  ]);
  let difference = 0;
  for (let index = 0; index < expectedHash.length; index += 1) {
    difference |= expectedHash.charCodeAt(index) ^
      candidateHash.charCodeAt(index);
  }
  return difference === 0 &&
    exportMaintenanceToken.length >= 32 &&
    exportMaintenanceToken.length <= 256 &&
    candidate.length === boundedCandidate.length;
}

async function requestHash(body: ExportCreateBody): Promise<string> {
  return sha256(
    new TextEncoder().encode(
      JSON.stringify({
        householdId: body.householdId,
        format: body.format,
        assetIds: body.assetIds,
        redacted: body.redacted,
      }),
    ),
  );
}

function exportError(
  code: string | null,
  message: string | null,
): Record<string, unknown> | null {
  if (!code || !message) return null;
  return {
    errorVersion: apiErrorVersion,
    code,
    message,
    retryable: code === "STORAGE_UNAVAILABLE" || code === "OFFLINE",
  };
}

function statusPayload(snapshot: ExportSnapshotRow): Record<string, unknown> {
  const downloadable = snapshot.status === "ready" &&
    snapshot.expires_at !== null &&
    Date.parse(snapshot.expires_at) > Date.now();
  return {
    exportId: snapshot.id,
    status: snapshot.status,
    blobObjectId: null,
    fileName: downloadable ? snapshot.file_name : null,
    mimeType: downloadable ? snapshot.mime_type : null,
    byteSize: downloadable && snapshot.byte_size !== null
      ? Number(snapshot.byte_size)
      : null,
    checksumSha256: downloadable ? snapshot.checksum_sha256 : null,
    expiresAt: snapshot.expires_at,
    completedAt: snapshot.completed_at,
    error: exportError(snapshot.error_code, snapshot.error_message),
  };
}

function stripNullish(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== null),
  );
}

function orderedIds(rows: readonly Record<string, unknown>[]): Set<string> {
  return new Set(
    rows.flatMap((row) => (typeof row.id === "string" ? [row.id] : [])),
  );
}

function retainSpaceHierarchy(
  rows: readonly Record<string, unknown>[],
  requestedSpaceIds: ReadonlySet<string>,
): Record<string, unknown>[] {
  const byId = new Map(
    rows.flatMap((row) =>
      typeof row.id === "string" ? [[row.id, row] as const] : []
    ),
  );
  const retained = new Set(requestedSpaceIds);
  for (const spaceId of [...retained]) {
    let current = byId.get(spaceId);
    const visited = new Set<string>();
    while (
      current &&
      typeof current.parent_space_id === "string" &&
      !visited.has(current.parent_space_id)
    ) {
      visited.add(current.parent_space_id);
      retained.add(current.parent_space_id);
      current = byId.get(current.parent_space_id);
    }
  }
  return rows.filter((row) =>
    typeof row.id === "string" && retained.has(row.id)
  );
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function hasSelectedSubject(
  record: Record<string, unknown>,
  selectedAssetIds: ReadonlySet<string>,
  selectedPlaceIds: ReadonlySet<string>,
  selectedLiabilityIds: ReadonlySet<string>,
): boolean {
  const assetId = typeof record.asset_id === "string"
    ? record.asset_id
    : null;
  const placeId = typeof record.place_id === "string"
    ? record.place_id
    : null;
  const liabilityId = typeof record.liability_id === "string"
    ? record.liability_id
    : null;
  if (
    [assetId, placeId, liabilityId].filter((subjectId) => subjectId !== null)
      .length !== 1
  ) return false;
  if (assetId !== null) {
    return record.subject_kind === "asset" && selectedAssetIds.has(assetId);
  }
  if (placeId !== null) {
    return record.subject_kind === "place" &&
      selectedPlaceIds.has(placeId);
  }
  return record.subject_kind === "liability" &&
    liabilityId !== null &&
    selectedLiabilityIds.has(liabilityId);
}

async function buildManifest(
  context: ExportAuthenticatedContext,
  snapshotId: string,
  body: ExportCreateBody,
  requestHashSha256: string,
  claimToken: string,
): Promise<ExportManifest> {
  const { data, error } = await context.client.rpc(
    "read_export_manifest_source",
    {
      p_snapshot_id: snapshotId,
      p_request_hash: requestHashSha256,
      p_claim_token: claimToken,
    },
  );
  if (error) throw new Error(error.message);
  if (!isRecord(data) || data.snapshotFound !== true) {
    throw new Error("EXPORT_SNAPSHOT_NOT_CLAIMED");
  }
  if (!isRecord(data.household)) {
    throw new Error("EXPORT_HOUSEHOLD_NOT_FOUND");
  }

  const generatedAt =
    typeof data.readAt === "string" && Number.isFinite(Date.parse(data.readAt))
      ? data.readAt
      : "";
  if (!generatedAt) throw new Error("EXPORT_SNAPSHOT_TIME_INVALID");

  const household = data.household;
  const assets = recordArray(data.assets);
  if (
    body.assetIds.length > 0 &&
    (data.requestedAssetCount !== body.assetIds.length ||
      assets.length !== body.assetIds.length ||
      body.assetIds.some((assetId) => !orderedIds(assets).has(assetId)))
  ) {
    throw new Error("EXPORT_ASSET_NOT_FOUND");
  }
  const allValues = recordArray(data.values);
  const locations = recordArray(data.locations);
  const allEvidence = recordArray(data.evidence);
  const allLiabilities = recordArray(data.liabilities);
  const allLiabilityReviews = recordArray(data.liabilityReviews);
  const allPlaces = recordArray(data.places);
  const allSpaces = recordArray(data.spaces);
  const allEvidenceVersions = recordArray(data.evidenceVersions);
  const allBlobs = recordArray(data.blobs);

  const selectedPlaceIds = new Set(
    locations.flatMap((location) =>
      typeof location.place_id === "string" ? [location.place_id] : []
    ),
  );
  const selectedSpaceIds = new Set(
    locations.flatMap((location) =>
      typeof location.space_id === "string" ? [location.space_id] : []
    ),
  );
  const fullHousehold = body.assetIds.length === 0;
  const spaces = fullHousehold
    ? allSpaces
    : retainSpaceHierarchy(allSpaces, selectedSpaceIds);
  for (const space of spaces) {
    if (typeof space.place_id === "string") {
      selectedPlaceIds.add(space.place_id);
    }
  }
  const places = fullHousehold
    ? allPlaces
    : allPlaces.filter((place) =>
      typeof place.id === "string" && selectedPlaceIds.has(place.id)
    );
  const liabilities = fullHousehold ? allLiabilities : [];
  const liabilityReviews = fullHousehold ? allLiabilityReviews : [];
  const exportedAssetIds = orderedIds(assets);
  const exportedPlaceIds = orderedIds(places);
  const exportedLiabilityIds = orderedIds(liabilities);
  const values = allValues.filter((value) =>
    hasSelectedSubject(
      value,
      exportedAssetIds,
      exportedPlaceIds,
      exportedLiabilityIds,
    )
  );
  const evidence = allEvidence.filter((item) =>
    hasSelectedSubject(
      item,
      exportedAssetIds,
      exportedPlaceIds,
      exportedLiabilityIds,
    )
  );
  const exportedEvidenceIds = orderedIds(evidence);
  const evidenceVersions = allEvidenceVersions.filter((version) =>
    typeof version.evidence_id === "string" &&
    exportedEvidenceIds.has(version.evidence_id)
  );
  const exportedBlobIds = new Set(
    evidenceVersions.flatMap((version) =>
      typeof version.blob_object_id === "string"
        ? [version.blob_object_id]
        : []
    ),
  );
  const blobs = allBlobs.filter((blob) =>
    typeof blob.id === "string" && exportedBlobIds.has(blob.id)
  );

  const redactAsset = (asset: Record<string, unknown>) =>
    body.redacted
      ? stripNullish({
        id: asset.id,
        name: asset.name,
        category_id: asset.category_id,
        category_path: asset.category_path,
        importance: asset.importance,
        lifecycle: asset.lifecycle,
        version: asset.version,
        created_at: asset.created_at,
        updated_at: asset.updated_at,
      })
      : stripNullish(asset);
  const redactPlace = (place: Record<string, unknown>) =>
    body.redacted
      ? stripNullish({
        id: place.id,
        name: place.name,
        kind: place.kind,
        tenure: place.tenure,
        region_label: place.region_label,
        location_precision: place.location_precision,
        version: place.version,
        created_at: place.created_at,
        updated_at: place.updated_at,
      })
      : stripNullish(place);
  const redactValue = (value: Record<string, unknown>) =>
    body.redacted
      ? stripNullish({
        id: value.id,
        subject_kind: value.subject_kind,
        asset_id: value.asset_id,
        place_id: value.place_id,
        liability_id: value.liability_id,
        currency: value.currency,
        as_of: value.as_of,
        source: value.source,
        version: value.version,
        redacted: true,
      })
      : stripNullish(value);
  const redactLiability = (liability: Record<string, unknown>) =>
    body.redacted
      ? stripNullish({
        id: liability.id,
        name: "Liability",
        kind: liability.kind,
        lifecycle: liability.lifecycle,
        version: liability.version,
        created_at: liability.created_at,
        updated_at: liability.updated_at,
        redacted: true,
      })
      : stripNullish(liability);
  const redactLiabilityReview = (review: Record<string, unknown>) =>
    body.redacted
      ? stripNullish({
        id: review.id,
        status: review.status,
        reviewed_at: review.reviewed_at,
        expires_at: review.expires_at,
        invalidated_at: review.invalidated_at,
        version: review.version,
        redacted: true,
      })
      : stripNullish(review);
  const redactLocation = (location: Record<string, unknown>) =>
    body.redacted
      ? stripNullish({
        id: location.id,
        asset_id: location.asset_id,
        place_id: location.place_id,
        space_id: location.space_id,
        status: location.status,
        source: location.source,
        revision: location.revision,
        valid_from: location.valid_from,
        valid_to: location.valid_to,
      })
      : stripNullish(location);
  const redactVersion = (version: Record<string, unknown>) =>
    body.redacted
      ? stripNullish({
        ...version,
        file_name: "redacted-evidence-file",
      })
      : stripNullish(version);
  const redactEvidence = (item: Record<string, unknown>) =>
    body.redacted
      ? stripNullish({
        id: item.id,
        subject_kind: item.subject_kind,
        asset_id: item.asset_id,
        place_id: item.place_id,
        kind: item.kind,
        relation: item.relation,
        title: "Evidence",
        review_status: item.review_status,
        storage_state: item.storage_state,
        version: item.version,
        created_at: item.created_at,
        updated_at: item.updated_at,
      })
      : stripNullish(item);

  const manifest: ExportManifest = {
    schema: "alyr.continuity-manifest",
    schemaVersion: 1,
    export: {
      id: snapshotId,
      generatedAt,
      format: body.format,
      redacted: body.redacted,
      selectedAssetIds: body.assetIds,
    },
    household: stripNullish({
      id: household.id,
      name: household.name,
      version: household.version,
      created_at: household.created_at,
      updated_at: household.updated_at,
    }),
    summary: {
      places: places.length,
      spaces: spaces.length,
      assets: assets.length,
      liabilities: liabilities.length,
      liabilityReviews: liabilityReviews.length,
      valueAssertions: values.length,
      locationRevisions: locations.length,
      evidence: evidence.length,
      evidenceVersions: evidenceVersions.length,
    },
    records: {
      places: places.map(redactPlace),
      spaces: spaces.map(stripNullish),
      assets: assets.map(redactAsset),
      liabilities: liabilities.map(redactLiability),
      liabilityReviews: liabilityReviews.map(redactLiabilityReview),
      valueAssertions: values.map(redactValue),
      locationRevisions: locations.map(redactLocation),
      evidence: evidence.map(redactEvidence),
      evidenceVersions: evidenceVersions.map(redactVersion),
      blobs: blobs.map(stripNullish),
    },
    evidenceOriginals: {
      included: false,
      note:
        "This manifest records immutable evidence identifiers, byte sizes, MIME types and SHA-256 checksums. Original evidence bytes remain in the private Heldat vault.",
    },
  };
  return manifest;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function escapePdfText(value: string): string {
  return value
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/([\\()])/g, "\\$1");
}

function buildPdfWithAttachedManifest(
  manifest: ExportManifest,
  manifestBytes: Uint8Array,
): Uint8Array {
  const encoder = new TextEncoder();
  const content = [
    "BT",
    "/F1 22 Tf",
    "54 760 Td",
    `(Heldat Continuity Export) Tj`,
    "0 -36 Td",
    "/F1 11 Tf",
    `(Household: ${escapePdfText(String(manifest.household.name ?? "Heldat household"))}) Tj`,
    "0 -20 Td",
    `(Created: ${escapePdfText(manifest.export.generatedAt)}) Tj`,
    "0 -20 Td",
    `(Assets: ${manifest.summary.assets}   Liabilities: ${manifest.summary.liabilities}   Places: ${manifest.summary.places}) Tj`,
    "0 -20 Td",
    `(Evidence records: ${manifest.summary.evidence}) Tj`,
    "0 -32 Td",
    `(The complete UTF-8 JSON manifest is attached as heldat-manifest.json.) Tj`,
    "0 -20 Td",
    `(Evidence originals stay in the private Heldat vault.) Tj`,
    "ET",
  ].join("\n");
  const contentBytes = encoder.encode(content);
  const objectBodies: Uint8Array[] = [
    encoder.encode(
      "<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [(heldat-manifest.json) 7 0 R] >> >> >>",
    ),
    encoder.encode("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    encoder.encode(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    ),
    encoder.encode(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ),
    concatBytes([
      encoder.encode(`<< /Length ${contentBytes.byteLength} >>\nstream\n`),
      contentBytes,
      encoder.encode("\nendstream"),
    ]),
    concatBytes([
      encoder.encode(
        `<< /Type /EmbeddedFile /Subtype /application#2Fjson /Params << /Size ${manifestBytes.byteLength} >> /Length ${manifestBytes.byteLength} >>\nstream\n`,
      ),
      manifestBytes,
      encoder.encode("\nendstream"),
    ]),
    encoder.encode(
      "<< /Type /Filespec /F (heldat-manifest.json) /UF (heldat-manifest.json) /Desc (Heldat continuity manifest) /EF << /F 6 0 R >> >>",
    ),
  ];
  const header = encoder.encode("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n");
  const parts: Uint8Array[] = [header];
  const offsets: number[] = [0];
  let offset = header.byteLength;
  objectBodies.forEach((body, index) => {
    const object = concatBytes([
      encoder.encode(`${index + 1} 0 obj\n`),
      body,
      encoder.encode("\nendobj\n"),
    ]);
    offsets.push(offset);
    parts.push(object);
    offset += object.byteLength;
  });
  const xrefOffset = offset;
  const xref = [
    `xref\n0 ${objectBodies.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map(
      (entry) => `${String(entry).padStart(10, "0")} 00000 n `,
    ),
    `trailer\n<< /Size ${objectBodies.length + 1} /Root 1 0 R >>`,
    `startxref\n${xrefOffset}`,
    "%%EOF\n",
  ].join("\n");
  parts.push(encoder.encode(xref));
  return concatBytes(parts);
}

async function renderArtifact(
  manifest: ExportManifest,
  format: ExportFormat,
): Promise<ExportArtifact> {
  const manifestBytes = new TextEncoder().encode(
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  const date = manifest.export.generatedAt.slice(0, 10);
  const bytes = format === "pdf"
    ? buildPdfWithAttachedManifest(manifest, manifestBytes)
    : manifestBytes;
  return {
    bytes,
    fileName: `heldat-continuity-${date}.${format === "pdf" ? "pdf" : "json"}`,
    mimeType: format === "pdf" ? "application/pdf" : "application/json",
    checksumSha256: await sha256(bytes),
  };
}

async function failSnapshot(
  serviceClient: SupabaseClient,
  snapshotId: string,
  claimToken: string,
  code: "NOT_FOUND" | "QUOTA_EXCEEDED" | "STORAGE_UNAVAILABLE",
  message: string,
  retainedObject?: StoredArtifactPointer,
): Promise<boolean> {
  const failedAt = new Date().toISOString();
  const { data } = await serviceClient
    .from("export_snapshots")
    .update({
      status: "failed",
      processing_token: null,
      processing_started_at: null,
      ...(retainedObject
        ? {
          object_key: retainedObject.objectKey,
          file_name: retainedObject.fileName,
          mime_type: retainedObject.mimeType,
          byte_size: retainedObject.byteSize,
          checksum_sha256: retainedObject.checksumSha256,
          expires_at: retainedObject.expiresAt,
        }
        : {}),
      error_code: code,
      error_message: message,
      completed_at: failedAt,
      updated_at: failedAt,
    })
    .eq("id", snapshotId)
    .eq("status", "processing")
    .eq("processing_token", claimToken)
    .select("id")
    .maybeSingle();
  return data !== null;
}

async function expireStoredSnapshot(
  serviceClient: SupabaseClient,
  snapshot: ExportSnapshotRow,
): Promise<ExportSnapshotRow> {
  const expiredAt = new Date().toISOString();
  const { data: marked } = await serviceClient
    .from("export_snapshots")
    .update({
      status: "expired",
      processing_token: null,
      processing_started_at: null,
      error_code: null,
      error_message: null,
      updated_at: expiredAt,
    })
    .eq("id", snapshot.id)
    .select(snapshotColumns)
    .maybeSingle();
  let current = (marked ?? {
    ...snapshot,
    status: "expired",
    processing_token: null,
    processing_started_at: null,
    error_code: null,
    error_message: null,
    updated_at: expiredAt,
  }) as ExportSnapshotRow;

  if (!current.object_key) return current;
  const objectKey = current.object_key;
  const removal = await serviceClient.storage
    .from("exports")
    .remove([objectKey]);
  if (removal.error) {
    return current;
  }

  const { data: cleared } = await serviceClient
    .from("export_snapshots")
    .update({
      object_key: null,
      file_name: null,
      mime_type: null,
      byte_size: null,
      checksum_sha256: null,
      updated_at: expiredAt,
    })
    .eq("id", current.id)
    .eq("object_key", objectKey)
    .select(snapshotColumns)
    .maybeSingle();
  if (cleared) {
    current = cleared as unknown as ExportSnapshotRow;
  }
  return current;
}

async function removeExpiredExports(
  serviceClient: SupabaseClient,
  householdId: string,
): Promise<void> {
  const { data } = await serviceClient
    .from("export_snapshots")
    .select(snapshotColumns)
    .eq("household_id", householdId)
    .not("object_key", "is", null)
    .lt("expires_at", new Date().toISOString())
    .limit(100);
  const rows = Array.isArray(data)
    ? data.filter(isRecord) as unknown as ExportSnapshotRow[]
    : [];
  for (const snapshot of rows) {
    await expireStoredSnapshot(serviceClient, snapshot);
  }

  const { data: cleanupData } = await serviceClient
    .from("export_object_cleanup_queue")
    .select("object_key, attempt_count")
    .eq("household_id", householdId)
    .limit(100);
  const cleanupRows = Array.isArray(cleanupData)
    ? cleanupData.filter(isRecord)
    : [];
  for (const cleanupRow of cleanupRows) {
    if (typeof cleanupRow.object_key !== "string") continue;
    const removal = await serviceClient.storage
      .from("exports")
      .remove([cleanupRow.object_key]);
    if (removal.error) {
      await serviceClient
        .from("export_object_cleanup_queue")
        .update({
          attempt_count:
            typeof cleanupRow.attempt_count === "number"
              ? cleanupRow.attempt_count + 1
              : 1,
          last_attempt_at: new Date().toISOString(),
        })
        .eq("object_key", cleanupRow.object_key);
      continue;
    }
    await serviceClient
      .from("export_object_cleanup_queue")
      .delete()
      .eq("object_key", cleanupRow.object_key);
  }
}

export async function handleExportMaintenance(
  request: Request,
): Promise<Response> {
  const suppliedToken =
    request.headers.get("X-ALYR-Maintenance-Token") ?? "";
  if (!await maintenanceTokenMatches(suppliedToken)) {
    return apiError(
      "AUTHORIZATION_DENIED",
      "Export maintenance authorization failed.",
      403,
    );
  }
  const serviceClient = createServiceClient();
  if (!serviceClient) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Export maintenance storage is not configured.",
      503,
      true,
    );
  }

  const { data: snapshotData, error: snapshotError } = await serviceClient
    .from("export_snapshots")
    .select(snapshotColumns)
    .not("object_key", "is", null)
    .lt("expires_at", new Date().toISOString())
    .order("expires_at")
    .limit(maximumMaintenanceBatch);
  if (snapshotError) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Expired export records were not available.",
      503,
      true,
    );
  }

  const snapshots = Array.isArray(snapshotData)
    ? snapshotData.filter(isRecord) as unknown as ExportSnapshotRow[]
    : [];
  let processed = 0;
  let removed = 0;
  let preserved = 0;
  for (const snapshot of snapshots) {
    const result = await expireStoredSnapshot(serviceClient, snapshot);
    processed += 1;
    if (result.object_key === null) {
      removed += 1;
    } else {
      preserved += 1;
    }
  }

  const remainingCapacity = maximumMaintenanceBatch - processed;
  if (remainingCapacity > 0) {
    const { data: cleanupData, error: cleanupError } = await serviceClient
      .from("export_object_cleanup_queue")
      .select("object_key, attempt_count")
      .order("created_at")
      .limit(remainingCapacity);
    if (cleanupError) {
      return apiError(
        "STORAGE_UNAVAILABLE",
        "Pending export cleanup records were not available.",
        503,
        true,
      );
    }
    const cleanupRows = Array.isArray(cleanupData)
      ? cleanupData.filter(isRecord)
      : [];
    for (const cleanupRow of cleanupRows) {
      if (typeof cleanupRow.object_key !== "string") continue;
      processed += 1;
      const removal = await serviceClient.storage
        .from("exports")
        .remove([cleanupRow.object_key]);
      if (removal.error) {
        preserved += 1;
        await serviceClient
          .from("export_object_cleanup_queue")
          .update({
            attempt_count:
              typeof cleanupRow.attempt_count === "number"
                ? cleanupRow.attempt_count + 1
                : 1,
            last_attempt_at: new Date().toISOString(),
          })
          .eq("object_key", cleanupRow.object_key);
        continue;
      }
      removed += 1;
      await serviceClient
        .from("export_object_cleanup_queue")
        .delete()
        .eq("object_key", cleanupRow.object_key);
    }
  }

  return json({
    status: "complete",
    batchLimit: maximumMaintenanceBatch,
    processed,
    removed,
    preservedForRetry: preserved,
  });
}

export async function handleExportCreate(
  request: Request,
  context: ExportAuthenticatedContext,
): Promise<Response> {
  const body = await readCreateBody(request);
  if (!body) {
    return apiError("VALIDATION_FAILED", "The export request is invalid.");
  }
  const serviceClient = createServiceClient();
  if (!serviceClient) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Export storage is not configured.",
      503,
      true,
    );
  }

  await removeExpiredExports(serviceClient, body.householdId);
  const scope = {
    format: body.format,
    assetIds: body.assetIds,
    redacted: body.redacted,
  };
  const hash = await requestHash(body);
  const { data, error } = await context.client.rpc(
    "create_export_snapshot",
    {
      p_household_id: body.householdId,
      p_scope: scope,
      p_idempotency_key: body.idempotencyKey,
      p_request_hash: hash,
    },
  );
  if (error || !isRecord(data)) {
    const authorizationDenied = error?.message.includes("PERMISSION_DENIED");
    const idempotencyConflict = error?.message.includes(
      "IDEMPOTENCY_CONFLICT",
    );
    const quotaExceeded = error?.message.includes(
      "EXPORT_QUOTA_EXCEEDED",
    );
    const rateLimited = error?.message.includes("EXPORT_RATE_LIMITED");
    return apiError(
      authorizationDenied
        ? "AUTHORIZATION_DENIED"
        : idempotencyConflict
        ? "IDEMPOTENCY_CONFLICT"
        : rateLimited
        ? "RATE_LIMITED"
        : quotaExceeded
        ? "QUOTA_EXCEEDED"
        : "VALIDATION_FAILED",
      authorizationDenied
        ? "Your household role does not allow exports."
        : idempotencyConflict
        ? "This export key was already used for a different request."
        : rateLimited
        ? "This household has reached the pilot export rate limit."
        : quotaExceeded
        ? "This household has reached the pilot export allowance."
        : "The export request could not be recorded.",
      authorizationDenied
        ? 403
        : rateLimited
        ? 429
        : idempotencyConflict || quotaExceeded
        ? 409
        : 400,
    );
  }
  const snapshotId = typeof data.id === "string" ? data.id : "";
  if (!uuidPattern.test(snapshotId)) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "The export service returned an invalid snapshot.",
      503,
      true,
    );
  }
  const claimToken = crypto.randomUUID();
  const claim = await serviceClient.rpc("claim_export_snapshot", {
    p_snapshot_id: snapshotId,
    p_request_hash: hash,
    p_claim_token: claimToken,
  });
  if (claim.error || !isRecord(claim.data)) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "The export renderer did not acquire its database claim.",
      503,
      true,
    );
  }
  const claimedSnapshot =
    claim.data as unknown as ExportSnapshotRow;
  const ownsClaim = claimedSnapshot.status === "processing" &&
    claimedSnapshot.processing_token === claimToken;
  if (!ownsClaim) {
    return json(statusPayload(claimedSnapshot), 200);
  }

  let artifact: ExportArtifact;
  try {
    const manifest = await buildManifest(
      context,
      snapshotId,
      body,
      hash,
      claimToken,
    );
    artifact = await renderArtifact(manifest, body.format);
  } catch (caught) {
    const notFound =
      caught instanceof Error &&
      (caught.message === "EXPORT_ASSET_NOT_FOUND" ||
        caught.message === "EXPORT_HOUSEHOLD_NOT_FOUND");
    await failSnapshot(
      serviceClient,
      snapshotId,
      claimToken,
      notFound ? "NOT_FOUND" : "STORAGE_UNAVAILABLE",
      notFound
        ? "One or more selected records no longer exist."
        : "The export snapshot could not be assembled.",
    );
    return apiError(
      notFound ? "NOT_FOUND" : "STORAGE_UNAVAILABLE",
      notFound
        ? "One or more selected records no longer exist."
        : "The export snapshot could not be assembled.",
      notFound ? 404 : 503,
      !notFound,
    );
  }

  if (
    artifact.bytes.byteLength < 1 ||
    artifact.bytes.byteLength > maximumExportBytes ||
    !checksumPattern.test(artifact.checksumSha256)
  ) {
    artifact.bytes.fill(0);
    await failSnapshot(
      serviceClient,
      snapshotId,
      claimToken,
      "QUOTA_EXCEEDED",
      "The export is larger than the pilot download allowance.",
    );
    return apiError(
      "QUOTA_EXCEEDED",
      "The export is larger than the pilot download allowance.",
      409,
    );
  }

  const objectKey =
    `${body.householdId}/${snapshotId}/${claimToken}/${artifact.fileName}`;
  const upload = await serviceClient.storage
    .from("exports")
    .upload(objectKey, artifact.bytes, {
      cacheControl: "0",
      contentType: artifact.mimeType,
      upsert: false,
    });
  if (upload.error) {
    artifact.bytes.fill(0);
    await failSnapshot(
      serviceClient,
      snapshotId,
      claimToken,
      "STORAGE_UNAVAILABLE",
      "The export file was not stored.",
    );
    return apiError(
      "STORAGE_UNAVAILABLE",
      "The export file was not stored.",
      503,
      true,
    );
  }

  const retainedPointer = (
    expiresAt: string,
  ): StoredArtifactPointer => ({
    objectKey,
    fileName: artifact.fileName,
    mimeType: artifact.mimeType,
    byteSize: artifact.bytes.byteLength,
    checksumSha256: artifact.checksumSha256,
    expiresAt,
  });
  const cleanupStoredArtifact = async (
    code: "QUOTA_EXCEEDED" | "STORAGE_UNAVAILABLE",
    message: string,
  ): Promise<void> => {
    const removal = await serviceClient.storage
      .from("exports")
      .remove([objectKey]);
    const pointer = retainedPointer(new Date().toISOString());
    const attachedToSnapshot = await failSnapshot(
      serviceClient,
      snapshotId,
      claimToken,
      code,
      message,
      removal.error ? pointer : undefined,
    );
    if (removal.error && !attachedToSnapshot) {
      await serviceClient.from("export_object_cleanup_queue").insert({
        object_key: pointer.objectKey,
        household_id: body.householdId,
        snapshot_id: snapshotId,
        file_name: pointer.fileName,
        mime_type: pointer.mimeType,
        byte_size: pointer.byteSize,
        checksum_sha256: pointer.checksumSha256,
        attempt_count: 1,
        last_attempt_at: new Date().toISOString(),
      });
    }
  };

  const verification = await serviceClient.storage
    .from("exports")
    .download(objectKey);
  if (verification.error || !verification.data) {
    await cleanupStoredArtifact(
      "STORAGE_UNAVAILABLE",
      "The stored export could not be verified.",
    );
    artifact.bytes.fill(0);
    return apiError(
      "STORAGE_UNAVAILABLE",
      "The stored export could not be verified.",
      503,
      true,
    );
  }
  const verifiedBytes = new Uint8Array(
    await verification.data.arrayBuffer(),
  );
  const verifiedChecksum = await sha256(verifiedBytes);
  if (
    verifiedBytes.byteLength !== artifact.bytes.byteLength ||
    verifiedChecksum !== artifact.checksumSha256
  ) {
    verifiedBytes.fill(0);
    await cleanupStoredArtifact(
      "STORAGE_UNAVAILABLE",
      "The stored export did not pass integrity verification.",
    );
    artifact.bytes.fill(0);
    return apiError(
      "STORAGE_UNAVAILABLE",
      "The stored export did not pass integrity verification.",
      503,
      true,
    );
  }
  verifiedBytes.fill(0);

  const expiresAt = new Date(
    Date.now() + exportRetentionMilliseconds,
  ).toISOString();
  const { data: completed, error: completionError } = await serviceClient
    .rpc("complete_export_snapshot", {
      p_snapshot_id: snapshotId,
      p_request_hash: hash,
      p_claim_token: claimToken,
      p_object_key: objectKey,
      p_file_name: artifact.fileName,
      p_mime_type: artifact.mimeType,
      p_byte_size: artifact.bytes.byteLength,
      p_checksum_sha256: artifact.checksumSha256,
      p_expires_at: expiresAt,
    });
  artifact.bytes.fill(0);
  if (completionError || !completed) {
    const capacityFailure = classifyStorageCapacityFailure(completionError);
    const exportQuotaExceeded = completionError?.message.includes(
      "EXPORT_QUOTA_EXCEEDED",
    );
    const quotaExceeded = capacityFailure !== null || exportQuotaExceeded;
    const failureMessage = capacityFailure?.message ??
      (exportQuotaExceeded
        ? "This household has reached the pilot export allowance."
        : "The export acknowledgement was not recorded.");
    await cleanupStoredArtifact(
      quotaExceeded ? "QUOTA_EXCEEDED" : "STORAGE_UNAVAILABLE",
      failureMessage,
    );
    return apiError(
      quotaExceeded ? "QUOTA_EXCEEDED" : "STORAGE_UNAVAILABLE",
      failureMessage,
      quotaExceeded ? 409 : 503,
      !quotaExceeded,
    );
  }

  return json(
    statusPayload(completed as unknown as ExportSnapshotRow),
    201,
  );
}

async function expireSnapshotIfNeeded(
  snapshot: ExportSnapshotRow,
  serviceClient: SupabaseClient,
): Promise<ExportSnapshotRow> {
  if (
    snapshot.status !== "ready" ||
    !snapshot.expires_at ||
    Date.parse(snapshot.expires_at) > Date.now()
  ) {
    return snapshot;
  }
  return expireStoredSnapshot(serviceClient, snapshot);
}

export async function handleExportGet(
  exportId: string,
  context: ExportAuthenticatedContext,
): Promise<Response> {
  if (!uuidPattern.test(exportId)) {
    return apiError("NOT_FOUND", "Export not found.", 404);
  }
  const { data, error } = await context.client
    .from("export_snapshots")
    .select(snapshotColumns)
    .eq("id", exportId)
    .maybeSingle();
  if (error || !data) {
    return apiError("NOT_FOUND", "Export not found.", 404);
  }
  const serviceClient = createServiceClient();
  if (!serviceClient) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Export storage is not configured.",
      503,
      true,
    );
  }
  const snapshot = await expireSnapshotIfNeeded(
    data as unknown as ExportSnapshotRow,
    serviceClient,
  );
  return json(statusPayload(snapshot));
}

export async function handleExportDownload(
  exportId: string,
  context: ExportAuthenticatedContext,
): Promise<Response> {
  if (!uuidPattern.test(exportId)) {
    return apiError("NOT_FOUND", "Export not found.", 404);
  }
  const { data, error } = await context.client
    .from("export_snapshots")
    .select(snapshotColumns)
    .eq("id", exportId)
    .maybeSingle();
  if (error || !data) {
    return apiError("NOT_FOUND", "Export not found.", 404);
  }
  const serviceClient = createServiceClient();
  if (!serviceClient) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Export storage is not configured.",
      503,
      true,
    );
  }
  const snapshot = await expireSnapshotIfNeeded(
    data as unknown as ExportSnapshotRow,
    serviceClient,
  );
  if (snapshot.status === "expired") {
    return apiError("NOT_FOUND", "This export has expired.", 410);
  }
  if (
    snapshot.status !== "ready" ||
    !snapshot.object_key ||
    !snapshot.file_name ||
    !snapshot.mime_type ||
    snapshot.byte_size === null ||
    !snapshot.checksum_sha256
  ) {
    return apiError(
      "CONFLICT_REQUIRES_REVIEW",
      snapshot.status === "failed"
        ? snapshot.error_message ?? "This export needs another attempt."
        : "This export is still being prepared.",
      409,
      snapshot.status !== "failed",
    );
  }
  const stored = await serviceClient.storage
    .from("exports")
    .download(snapshot.object_key);
  if (stored.error || !stored.data) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "The export file is temporarily unavailable.",
      503,
      true,
    );
  }
  const bytes = new Uint8Array(await stored.data.arrayBuffer());
  const expectedSize = Number(snapshot.byte_size);
  const checksum = await sha256(bytes);
  if (
    bytes.byteLength !== expectedSize ||
    checksum !== snapshot.checksum_sha256
  ) {
    bytes.fill(0);
    return apiError(
      "INVALID_FILE",
      "The export failed integrity verification.",
      409,
    );
  }
  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "Content-Disposition":
        `attachment; filename="${snapshot.file_name}"`,
      "Content-Length": String(bytes.byteLength),
      "Content-Type": snapshot.mime_type,
      "X-ALYR-Checksum-SHA256": snapshot.checksum_sha256,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
