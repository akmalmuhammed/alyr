import {
  CryptoDigestAlgorithm,
  digest
} from "expo-crypto";
import { File } from "expo-file-system";

import {
  API_ERROR_VERSION,
  CONTRACT_API_VERSION,
  type ApiErrorCode,
  type ContractError,
  type JsonObject,
  type JsonPrimitive,
  type Result,
  type UploadCompletionRequest,
  type UploadCompletionResponse,
  type UploadIntentResponse
} from "@alyr/contracts";

import type {
  EvidenceUploadDescriptor,
  EvidenceUploadPort,
  EvidenceUploadTransfer
} from "@/data/evidenceUpload";
import type { MaterializedAttachment } from "@/data/attachmentStore";
import type {
  AccessTokenProvider,
  SyncFetch
} from "@/adapters/httpSyncTransport";

const apiErrorCodes: readonly ApiErrorCode[] = [
  "AUTHENTICATION_REQUIRED",
  "AUTHORIZATION_DENIED",
  "CONFLICT_REQUIRES_REVIEW",
  "IDEMPOTENCY_CONFLICT",
  "INVALID_COMMAND",
  "INVALID_CURSOR",
  "INVALID_FILE",
  "NOT_FOUND",
  "OFFLINE",
  "QUOTA_EXCEEDED",
  "RATE_LIMITED",
  "SESSION_EXPIRED",
  "STORAGE_UNAVAILABLE",
  "UNSUPPORTED_CONTRACT_VERSION",
  "VALIDATION_FAILED"
];

const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/u;

export type MaterializedByteReader = (
  uri: string
) => Promise<Uint8Array>;
export type ByteDigest = (bytes: Uint8Array) => Promise<string>;

export interface HttpEvidenceUploadOptions {
  readonly apiBaseUrl: string;
  readonly projectUrl: string;
  readonly getAccessToken: AccessTokenProvider;
  readonly fetchImpl?: SyncFetch;
  readonly readBytes?: MaterializedByteReader;
  readonly digestBytes?: ByteDigest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return (
    typeof value === "string" &&
    apiErrorCodes.some((candidate) => candidate === value)
  );
}

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean"
  );
}

function isJsonValue(value: unknown): boolean {
  if (isJsonPrimitive(value)) return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isContractError(value: unknown): value is ContractError {
  return (
    isRecord(value) &&
    value.errorVersion === API_ERROR_VERSION &&
    isApiErrorCode(value.code) &&
    typeof value.message === "string" &&
    typeof value.retryable === "boolean"
  );
}

function errorFromPayload(value: unknown): ContractError | null {
  if (isRecord(value) && isContractError(value.error)) {
    return value.error;
  }
  return isContractError(value) ? value : null;
}

function failure(
  code: ContractError["code"],
  message: string,
  retryable: boolean
): ContractError {
  return {
    errorVersion: API_ERROR_VERSION,
    code,
    message,
    retryable
  };
}

function offline<T>(): Result<T> {
  return {
    ok: false,
    error: failure(
      "OFFLINE",
      "The Evidence upload service could not be reached.",
      true
    )
  };
}

function malformed<T>(): Result<T> {
  return {
    ok: false,
    error: failure(
      "VALIDATION_FAILED",
      "The Evidence upload service returned a malformed response.",
      false
    )
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function defaultDigest(bytes: Uint8Array): Promise<string> {
  const checksum = await digest(
    CryptoDigestAlgorithm.SHA256,
    new Uint8Array(bytes)
  );
  return bytesToHex(new Uint8Array(checksum));
}

async function defaultReadBytes(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}

function normalizeHttpsBase(value: string, label: string): string {
  const normalized = value.trim().replace(/\/+$/u, "");
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL.`);
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${label} must be a valid HTTPS URL.`);
  }
  return parsed.toString().replace(/\/+$/u, "");
}

function isUploadIntentResponse(
  value: unknown
): value is UploadIntentResponse {
  return (
    isRecord(value) &&
    typeof value.uploadId === "string" &&
    typeof value.blobObjectId === "string" &&
    typeof value.expiresAt === "string" &&
    Number.isFinite(Date.parse(value.expiresAt)) &&
    isJsonObject(value.uploadTarget)
  );
}

function isUploadCompletionResponse(
  value: unknown
): value is UploadCompletionResponse {
  return (
    isRecord(value) &&
    isRecord(value.upload) &&
    typeof value.upload.id === "string" &&
    typeof value.upload.objectKey === "string" &&
    value.upload.status === "stored" &&
    typeof value.note === "string"
  );
}

function encodedObjectPath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/**
 * Upload adapter for signed native builds. Intent/completion calls use a fresh
 * user bearer. The raw byte transfer is sent only to a URL reconstructed from
 * the trusted project origin plus the opaque short-lived token; the bearer is
 * deliberately omitted from that request.
 */
export class HttpEvidenceUploadPort implements EvidenceUploadPort {
  private readonly apiBaseUrl: string;
  private readonly storageBaseUrl: string;
  private readonly getAccessToken: AccessTokenProvider;
  private readonly fetchImpl: SyncFetch;
  private readonly readBytes: MaterializedByteReader;
  private readonly digestBytes: ByteDigest;

  constructor(options: HttpEvidenceUploadOptions) {
    this.apiBaseUrl = normalizeHttpsBase(
      options.apiBaseUrl,
      "The API base URL"
    );
    const projectUrl = normalizeHttpsBase(
      options.projectUrl,
      "The Supabase project URL"
    );
    if (
      new URL(this.apiBaseUrl).origin !== new URL(projectUrl).origin
    ) {
      throw new Error(
        "The API and storage project must use the same trusted origin."
      );
    }
    this.storageBaseUrl = `${projectUrl}/storage/v1`;
    this.getAccessToken = options.getAccessToken;
    this.fetchImpl =
      options.fetchImpl ??
      ((url, init) => globalThis.fetch(url, init));
    this.readBytes = options.readBytes ?? defaultReadBytes;
    this.digestBytes = options.digestBytes ?? defaultDigest;
  }

  async createIntent(
    descriptor: EvidenceUploadDescriptor
  ): Promise<Result<UploadIntentResponse>> {
    return this.apiRequest(
      `${this.apiBaseUrl}/uploads/intents`,
      JSON.stringify(descriptor),
      isUploadIntentResponse
    );
  }

  async complete(
    descriptor: EvidenceUploadDescriptor,
    uploadId: string
  ): Promise<Result<UploadCompletionResponse>> {
    const request: UploadCompletionRequest = {
      apiVersion: CONTRACT_API_VERSION,
      checksumSha256: descriptor.checksumSha256,
      byteSize: descriptor.byteSize
    };
    const result = await this.apiRequest(
      `${this.apiBaseUrl}/uploads/${encodeURIComponent(uploadId)}/complete`,
      JSON.stringify(request),
      isUploadCompletionResponse
    );
    if (!result.ok) return result;

    const expectedObjectKey =
      `${descriptor.householdId}/${descriptor.blobId}/` +
      descriptor.evidenceVersionId;
    if (
      result.value.upload.id !== descriptor.blobId ||
      result.value.upload.objectKey !== expectedObjectKey
    ) {
      return malformed();
    }
    return result;
  }

  async upload(
    descriptor: EvidenceUploadDescriptor,
    intent: UploadIntentResponse,
    attachment: MaterializedAttachment
  ): Promise<Result<EvidenceUploadTransfer>> {
    const target = intent.uploadTarget;
    const expectedPath =
      `${descriptor.householdId}/${descriptor.blobId}/` +
      descriptor.evidenceVersionId;
    if (
      intent.uploadId !== descriptor.blobId ||
      intent.blobObjectId !== descriptor.blobId ||
      target.provider !== "supabase-storage" ||
      target.bucket !== "evidence" ||
      target.objectKey !== expectedPath ||
      target.path !== expectedPath ||
      typeof target.token !== "string" ||
      target.token.length < 16 ||
      !attachment.temporary ||
      attachment.integrity !== "aes-gcm-and-sha256"
    ) {
      return malformed();
    }

    let bytes: Uint8Array;
    try {
      bytes = await this.readBytes(attachment.uri);
    } catch {
      return {
        ok: false,
        error: failure(
          "INVALID_FILE",
          "The verified temporary Evidence file could not be read.",
          false
        )
      };
    }

    let body: ArrayBuffer | null = null;
    try {
      if (
        bytes.byteLength !== descriptor.byteSize ||
        bytes.byteLength !== attachment.byteSize
      ) {
        return {
          ok: false,
          error: failure(
            "INVALID_FILE",
            "The temporary Evidence file size changed before upload.",
            false
          )
        };
      }
      const checksum = (await this.digestBytes(bytes)).toLowerCase();
      if (
        !CHECKSUM_PATTERN.test(checksum) ||
        checksum !== descriptor.checksumSha256 ||
        checksum !== attachment.checksumSha256
      ) {
        return {
          ok: false,
          error: failure(
            "INVALID_FILE",
            "The temporary Evidence file checksum changed before upload.",
            false
          )
        };
      }

      // Copy into a tightly sized ArrayBuffer for React Native fetch. Both the
      // source and transfer copy are zeroed after the request resolves.
      body = new Uint8Array(bytes).buffer;
      const url =
        `${this.storageBaseUrl}/object/upload/sign/` +
        `${encodedObjectPath(expectedPath)}?token=` +
        encodeURIComponent(target.token);
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: "PUT",
          headers: {
            "Cache-Control": "max-age=3600",
            "Content-Type": descriptor.mimeType,
            "x-upsert": "false"
          },
          body
        });
      } catch {
        return offline();
      }

      // A conflict means the immutable object already exists. It is not
      // labelled stored here; the coordinator immediately calls `/complete`,
      // whose server-side download/checksum is the only success boundary.
      if (response.status === 409) {
        return {
          ok: true,
          value: { outcome: "already-present" }
        };
      }
      if (!response.ok) {
        if (response.status === 413) {
          return {
            ok: false,
            error: failure(
              "INVALID_FILE",
              "The Evidence file exceeds the cloud upload limit.",
              false
            )
          };
        }
        if (response.status === 429) {
          return {
            ok: false,
            error: failure(
              "RATE_LIMITED",
              "The upload service is busy. ALYR will retry.",
              true
            )
          };
        }
        return {
          ok: false,
          error: failure(
            "STORAGE_UNAVAILABLE",
            response.status >= 400 && response.status < 500
              ? "The signed upload target expired or was rejected."
              : "The cloud file store did not accept the Evidence bytes.",
            true
          )
        };
      }
      return {
        ok: true,
        value: { outcome: "uploaded" }
      };
    } finally {
      bytes.fill(0);
      if (body) new Uint8Array(body).fill(0);
    }
  }

  private async apiRequest<T>(
    url: string,
    body: string,
    guard: (value: unknown) => value is T
  ): Promise<Result<T>> {
    let accessToken: string;
    try {
      accessToken = (await this.getAccessToken()).trim();
    } catch {
      return offline();
    }
    if (!accessToken) {
      return {
        ok: false,
        error: failure(
          "AUTHENTICATION_REQUIRED",
          "Sign in before uploading Evidence.",
          false
        )
      };
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body
      });
    } catch {
      return offline();
    }

    let payload: unknown;
    try {
      payload = JSON.parse(await response.text()) as unknown;
    } catch {
      return malformed();
    }
    if (!response.ok) {
      const error = errorFromPayload(payload);
      return error ? { ok: false, error } : malformed();
    }
    return guard(payload)
      ? { ok: true, value: payload }
      : malformed();
  }
}
