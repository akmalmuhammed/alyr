export const MAX_BLOB_BYTES = 10 * 1024 * 1024;
export const MAX_DELETE_BATCH_KEYS = 10_000;

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const MIME_TYPE_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/;

declare const immutableBlobKeyBrand: unique symbol;

export type ImmutableBlobKey = string & {
  readonly [immutableBlobKeyBrand]: true;
};

export type BlobStoreProvider = "supabase" | "r2" | "s3";

export type BlobStoreErrorCode =
  | "INVALID_CONFIG"
  | "INVALID_OBJECT_KEY"
  | "INVALID_UPLOAD_DESCRIPTOR"
  | "INVALID_SIGNED_URL"
  | "OBJECT_NOT_FOUND"
  | "PROVIDER_UNAVAILABLE"
  | "SIGNING_FAILED"
  | "STREAM_UNAVAILABLE"
  | "DELETE_PARTIAL";

export class BlobStoreError extends Error {
  readonly code: BlobStoreErrorCode;
  readonly retryable: boolean;
  readonly causeValue: unknown;

  constructor(
    code: BlobStoreErrorCode,
    message: string,
    options: { retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "BlobStoreError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.causeValue = options.cause;
  }
}

export interface ImmutableBlobKeyParts {
  readonly householdId: string;
  readonly blobId: string;
  readonly versionId: string;
}

export interface BlobUploadDescriptor {
  readonly objectKey: ImmutableBlobKey;
  readonly byteSize: number;
  readonly contentType: string;
  readonly checksumSha256: string;
}

export interface SignedUploadIntent {
  readonly provider: BlobStoreProvider;
  readonly objectKey: ImmutableBlobKey;
  readonly method: "PUT";
  readonly url: string;
  readonly requiredHeaders: Readonly<Record<string, string>>;
  readonly expiresAt: string;
}

export interface SignedDownload {
  readonly provider: BlobStoreProvider;
  readonly objectKey: ImmutableBlobKey;
  readonly method: "GET";
  readonly url: string;
  readonly requiredHeaders: Readonly<Record<string, string>>;
  readonly expiresAt: string;
}

export interface BlobHead {
  readonly provider: BlobStoreProvider;
  readonly objectKey: ImmutableBlobKey;
  readonly byteSize: number;
  readonly contentType: string;
  readonly checksumSha256: string | null;
  readonly etag: string | null;
  readonly lastModified: string | null;
}

export interface BlobReadStream {
  readonly head: BlobHead;
  readonly stream: ReadableStream<Uint8Array>;
}

export interface BlobDeleteFailure {
  readonly objectKey: ImmutableBlobKey;
  readonly code: string;
  readonly retryable: boolean;
}

export interface BlobDeleteBatchResult {
  readonly deleted: readonly ImmutableBlobKey[];
  readonly failed: readonly BlobDeleteFailure[];
}

export interface BlobStore {
  readonly provider: BlobStoreProvider;

  createSignedUpload(
    descriptor: BlobUploadDescriptor,
  ): Promise<SignedUploadIntent>;

  headObject(objectKey: ImmutableBlobKey): Promise<BlobHead | null>;

  openReadStream(objectKey: ImmutableBlobKey): Promise<BlobReadStream>;

  createSignedDownload(objectKey: ImmutableBlobKey): Promise<SignedDownload>;

  deleteBatch(
    objectKeys: readonly ImmutableBlobKey[],
  ): Promise<BlobDeleteBatchResult>;
}

export type BlobHeadMismatchCode =
  | "OBJECT_MISSING"
  | "BYTE_SIZE_MISMATCH"
  | "CONTENT_TYPE_MISMATCH"
  | "CHECKSUM_METADATA_MISMATCH";

export type BlobHeadAssessment =
  | {
      readonly ok: true;
      readonly requiresStreamChecksum: boolean;
    }
  | {
      readonly ok: false;
      readonly code: BlobHeadMismatchCode;
    };

export function createImmutableBlobKey(
  parts: ImmutableBlobKeyParts,
): ImmutableBlobKey {
  const householdId = assertUuidV4(parts.householdId, "householdId");
  const blobId = assertUuidV4(parts.blobId, "blobId");
  const versionId = assertUuidV4(parts.versionId, "versionId");
  return `${householdId}/${blobId}/${versionId}` as ImmutableBlobKey;
}

export function parseImmutableBlobKey(
  value: string,
): ImmutableBlobKeyParts {
  if (
    typeof value !== "string" ||
    value.length !== 110 ||
    value.includes("\\") ||
    value.includes("%") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("..") ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  ) {
    throw new BlobStoreError(
      "INVALID_OBJECT_KEY",
      "Blob object keys must be canonical immutable identifiers.",
    );
  }

  const segments = value.split("/");
  if (segments.length !== 3) {
    throw new BlobStoreError(
      "INVALID_OBJECT_KEY",
      "Blob object keys must contain exactly three UUID segments.",
    );
  }

  const householdId = assertUuidV4(segments[0] ?? "", "householdId");
  const blobId = assertUuidV4(segments[1] ?? "", "blobId");
  const versionId = assertUuidV4(segments[2] ?? "", "versionId");
  const canonical = createImmutableBlobKey({
    householdId,
    blobId,
    versionId,
  });

  if (canonical !== value) {
    throw new BlobStoreError(
      "INVALID_OBJECT_KEY",
      "Blob object keys must use lowercase canonical UUIDs.",
    );
  }

  return { householdId, blobId, versionId };
}

export function asImmutableBlobKey(value: string): ImmutableBlobKey {
  parseImmutableBlobKey(value);
  return value as ImmutableBlobKey;
}

export function validateUploadDescriptor(
  descriptor: BlobUploadDescriptor,
): BlobUploadDescriptor {
  const objectKey = asImmutableBlobKey(descriptor.objectKey);
  const byteSize = descriptor.byteSize;
  const contentType = normalizeContentType(descriptor.contentType);
  const checksumSha256 = descriptor.checksumSha256;

  if (
    !Number.isSafeInteger(byteSize) ||
    byteSize < 1 ||
    byteSize > MAX_BLOB_BYTES
  ) {
    throw new BlobStoreError(
      "INVALID_UPLOAD_DESCRIPTOR",
      `Blob byte size must be between 1 and ${MAX_BLOB_BYTES}.`,
    );
  }

  if (!SHA256_HEX_PATTERN.test(checksumSha256)) {
    throw new BlobStoreError(
      "INVALID_UPLOAD_DESCRIPTOR",
      "Blob SHA-256 must be a lowercase 64-character hexadecimal digest.",
    );
  }

  return {
    objectKey,
    byteSize,
    contentType,
    checksumSha256,
  };
}

export function normalizeContentType(value: string): string {
  if (
    typeof value !== "string" ||
    value.length > 160 ||
    !MIME_TYPE_PATTERN.test(value)
  ) {
    throw new BlobStoreError(
      "INVALID_UPLOAD_DESCRIPTOR",
      "Blob content type must be a normalized media type without parameters.",
    );
  }
  return value;
}

export function assertSignedUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (cause) {
    throw new BlobStoreError(
      "INVALID_SIGNED_URL",
      "The provider returned an invalid signed URL.",
      { cause },
    );
  }

  const localHttp =
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  if (
    (parsed.protocol !== "https:" && !localHttp) ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== ""
  ) {
    throw new BlobStoreError(
      "INVALID_SIGNED_URL",
      "Signed URLs must use HTTPS and contain no credentials or fragment.",
    );
  }
  return parsed.toString();
}

export function normalizeExpiry(
  now: Date,
  ttlSeconds: number,
): string {
  if (
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime()) ||
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < 1 ||
    ttlSeconds > 604_800
  ) {
    throw new BlobStoreError(
      "INVALID_CONFIG",
      "Signed URL expiry must be between 1 second and 7 days.",
    );
  }
  return new Date(now.getTime() + ttlSeconds * 1000).toISOString();
}

export function expectedObjectMetadata(
  descriptor: BlobUploadDescriptor,
): Readonly<Record<string, string>> {
  const validated = validateUploadDescriptor(descriptor);
  return Object.freeze({
    "heldat-sha256": validated.checksumSha256,
    "heldat-byte-size": String(validated.byteSize),
    "heldat-content-type": validated.contentType,
    "heldat-schema": "1",
  });
}

export function assessBlobHead(
  head: BlobHead | null,
  descriptor: BlobUploadDescriptor,
): BlobHeadAssessment {
  const expected = validateUploadDescriptor(descriptor);
  if (head === null) {
    return { ok: false, code: "OBJECT_MISSING" };
  }
  if (head.byteSize !== expected.byteSize) {
    return { ok: false, code: "BYTE_SIZE_MISMATCH" };
  }
  if (head.contentType !== expected.contentType) {
    return { ok: false, code: "CONTENT_TYPE_MISMATCH" };
  }
  if (
    head.checksumSha256 !== null &&
    head.checksumSha256 !== expected.checksumSha256
  ) {
    return { ok: false, code: "CHECKSUM_METADATA_MISMATCH" };
  }
  return {
    ok: true,
    requiresStreamChecksum: head.checksumSha256 === null,
  };
}

export function normalizeDeleteKeys(
  objectKeys: readonly ImmutableBlobKey[],
): readonly ImmutableBlobKey[] {
  if (
    !Array.isArray(objectKeys) ||
    objectKeys.length < 1 ||
    objectKeys.length > MAX_DELETE_BATCH_KEYS
  ) {
    throw new BlobStoreError(
      "INVALID_OBJECT_KEY",
      `Delete batches must contain between 1 and ${MAX_DELETE_BATCH_KEYS} keys.`,
    );
  }

  const unique = new Set<ImmutableBlobKey>();
  for (const value of objectKeys) {
    unique.add(asImmutableBlobKey(value));
  }
  return Object.freeze([...unique]);
}

export function chunkValues<T>(
  values: readonly T[],
  chunkSize: number,
): readonly (readonly T[])[] {
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) {
    throw new BlobStoreError(
      "INVALID_CONFIG",
      "Chunk size must be a positive integer.",
    );
  }
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

function assertUuidV4(value: string, field: string): string {
  if (!UUID_V4_PATTERN.test(value)) {
    throw new BlobStoreError(
      "INVALID_OBJECT_KEY",
      `${field} must be a lowercase UUIDv4.`,
    );
  }
  return value;
}
