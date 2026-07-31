import {
  asImmutableBlobKey,
  assertSignedUrl,
  BlobStoreError,
  chunkValues,
  expectedObjectMetadata,
  normalizeContentType,
  normalizeDeleteKeys,
  normalizeExpiry,
  type BlobDeleteBatchResult,
  type BlobHead,
  type BlobReadStream,
  type BlobStore,
  type BlobStoreProvider,
  type BlobUploadDescriptor,
  type ImmutableBlobKey,
  type SignedDownload,
  type SignedUploadIntent,
  validateUploadDescriptor,
} from "./blobStore.ts";
import type { S3CompatibleBlobStoreConfig } from "./blobStoreConfig.ts";

export interface S3PutRequest {
  readonly bucket: string;
  readonly key: string;
  readonly contentType: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly ifNoneMatch: "*";
}

export interface S3GetRequest {
  readonly bucket: string;
  readonly key: string;
}

export interface S3ObjectMetadataResponse {
  readonly contentLength?: number;
  readonly contentType?: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly etag?: string;
  readonly lastModified?: Date | string;
}

export interface S3ObjectReadResponse extends S3ObjectMetadataResponse {
  readonly body: ReadableStream<Uint8Array>;
}

export interface S3DeleteResponse {
  readonly deletedKeys?: readonly string[];
  readonly errors?: readonly {
    readonly key: string;
    readonly code?: string;
  }[];
}

export interface S3BlobStoreTransport {
  signPut(request: S3PutRequest, expiresInSeconds: number): Promise<string>;
  signGet(request: S3GetRequest, expiresInSeconds: number): Promise<string>;
  head(request: S3GetRequest): Promise<S3ObjectMetadataResponse | null>;
  get(request: S3GetRequest): Promise<S3ObjectReadResponse | null>;
  deleteObjects(
    bucket: string,
    keys: readonly string[],
  ): Promise<S3DeleteResponse>;
}

export interface S3CompatibleBlobStoreOptions {
  readonly config: S3CompatibleBlobStoreConfig;
  readonly transport: S3BlobStoreTransport;
  readonly now?: () => Date;
}

export class S3CompatibleBlobStore implements BlobStore {
  readonly provider: BlobStoreProvider;
  readonly #config: S3CompatibleBlobStoreConfig;
  readonly #transport: S3BlobStoreTransport;
  readonly #now: () => Date;

  constructor(options: S3CompatibleBlobStoreOptions) {
    this.#config = options.config;
    this.#transport = options.transport;
    this.#now = options.now ?? (() => new Date());
    this.provider = options.config.provider;
  }

  async createSignedUpload(
    descriptor: BlobUploadDescriptor,
  ): Promise<SignedUploadIntent> {
    const validated = validateUploadDescriptor(descriptor);
    const metadata = expectedObjectMetadata(validated);
    const requiredHeaders = Object.freeze({
      "content-type": validated.contentType,
      "if-none-match": "*",
      "x-amz-meta-heldat-sha256": metadata["heldat-sha256"] ?? "",
      "x-amz-meta-heldat-byte-size": metadata["heldat-byte-size"] ?? "",
      "x-amz-meta-heldat-content-type":
        metadata["heldat-content-type"] ?? "",
      "x-amz-meta-heldat-schema": metadata["heldat-schema"] ?? "",
    });

    try {
      const url = await this.#transport.signPut(
        {
          bucket: this.#config.bucket,
          key: validated.objectKey,
          contentType: validated.contentType,
          metadata,
          ifNoneMatch: "*",
        },
        this.#config.uploadTtlSeconds,
      );
      return Object.freeze({
        provider: this.provider,
        objectKey: validated.objectKey,
        method: "PUT",
        url: assertSignedUrl(url),
        requiredHeaders,
        expiresAt: normalizeExpiry(
          this.#now(),
          this.#config.uploadTtlSeconds,
        ),
      });
    } catch (cause) {
      throw wrapProviderError(
        cause,
        "SIGNING_FAILED",
        "Unable to sign the immutable object upload.",
      );
    }
  }

  async headObject(objectKey: ImmutableBlobKey): Promise<BlobHead | null> {
    const key = asImmutableBlobKey(objectKey);
    try {
      const response = await this.#transport.head({
        bucket: this.#config.bucket,
        key,
      });
      return response === null
        ? null
        : mapS3Metadata(this.provider, key, response);
    } catch (cause) {
      throw wrapProviderError(
        cause,
        "PROVIDER_UNAVAILABLE",
        "Unable to read immutable object metadata.",
      );
    }
  }

  async openReadStream(
    objectKey: ImmutableBlobKey,
  ): Promise<BlobReadStream> {
    const key = asImmutableBlobKey(objectKey);
    try {
      const response = await this.#transport.get({
        bucket: this.#config.bucket,
        key,
      });
      if (response === null) {
        throw new BlobStoreError(
          "OBJECT_NOT_FOUND",
          "The immutable object does not exist.",
        );
      }
      if (!(response.body instanceof ReadableStream)) {
        throw new BlobStoreError(
          "STREAM_UNAVAILABLE",
          "The object provider did not return a web-readable stream.",
          { retryable: true },
        );
      }
      return Object.freeze({
        head: mapS3Metadata(this.provider, key, response),
        stream: response.body,
      });
    } catch (cause) {
      if (cause instanceof BlobStoreError) throw cause;
      throw wrapProviderError(
        cause,
        "PROVIDER_UNAVAILABLE",
        "Unable to stream the immutable object.",
      );
    }
  }

  async createSignedDownload(
    objectKey: ImmutableBlobKey,
  ): Promise<SignedDownload> {
    const key = asImmutableBlobKey(objectKey);
    try {
      const url = await this.#transport.signGet(
        { bucket: this.#config.bucket, key },
        this.#config.downloadTtlSeconds,
      );
      return Object.freeze({
        provider: this.provider,
        objectKey: key,
        method: "GET",
        url: assertSignedUrl(url),
        requiredHeaders: Object.freeze({}),
        expiresAt: normalizeExpiry(
          this.#now(),
          this.#config.downloadTtlSeconds,
        ),
      });
    } catch (cause) {
      throw wrapProviderError(
        cause,
        "SIGNING_FAILED",
        "Unable to sign the immutable object download.",
      );
    }
  }

  async deleteBatch(
    objectKeys: readonly ImmutableBlobKey[],
  ): Promise<BlobDeleteBatchResult> {
    const keys = normalizeDeleteKeys(objectKeys);
    const deleted = new Set<ImmutableBlobKey>();
    const failed = new Map<ImmutableBlobKey, {
      objectKey: ImmutableBlobKey;
      code: string;
      retryable: boolean;
    }>();

    for (const chunk of chunkValues(keys, 1_000)) {
      let response: S3DeleteResponse;
      try {
        response = await this.#transport.deleteObjects(
          this.#config.bucket,
          chunk,
        );
      } catch {
        for (const objectKey of chunk) {
          failed.set(objectKey, {
            objectKey,
            code: "PROVIDER_UNAVAILABLE",
            retryable: true,
          });
        }
        continue;
      }

      const errorByKey = new Map(
        (response.errors ?? []).map((error) => [
          error.key,
          error.code ?? "DELETE_FAILED",
        ]),
      );
      for (const objectKey of chunk) {
        const code = errorByKey.get(objectKey);
        if (code !== undefined) {
          failed.set(objectKey, {
            objectKey,
            code,
            retryable: isRetryableDeleteCode(code),
          });
        } else {
          deleted.add(objectKey);
        }
      }
    }

    return Object.freeze({
      deleted: Object.freeze([...deleted]),
      failed: Object.freeze(
        [...failed.values()].map((failure) => Object.freeze(failure)),
      ),
    });
  }
}

function mapS3Metadata(
  provider: BlobStoreProvider,
  objectKey: ImmutableBlobKey,
  response: S3ObjectMetadataResponse,
): BlobHead {
  if (
    !Number.isSafeInteger(response.contentLength) ||
    (response.contentLength ?? -1) < 0
  ) {
    throw new BlobStoreError(
      "PROVIDER_UNAVAILABLE",
      "The object provider omitted a valid content length.",
      { retryable: true },
    );
  }

  const metadata = lowerCaseMetadata(response.metadata ?? {});
  const lastModified = response.lastModified === undefined
    ? null
    : new Date(response.lastModified).toISOString();
  return Object.freeze({
    provider,
    objectKey,
    byteSize: response.contentLength as number,
    contentType: normalizeContentType(response.contentType ?? ""),
    checksumSha256: metadata["heldat-sha256"] ?? null,
    etag: response.etag ?? null,
    lastModified,
  });
}

function lowerCaseMetadata(
  metadata: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(metadata).map(([key, value]) => [
        key.toLowerCase(),
        value,
      ]),
    ),
  );
}

function isRetryableDeleteCode(code: string): boolean {
  return ![
    "AccessDenied",
    "InvalidAccessKeyId",
    "InvalidArgument",
    "SignatureDoesNotMatch",
  ].includes(code);
}

function wrapProviderError(
  cause: unknown,
  code: "SIGNING_FAILED" | "PROVIDER_UNAVAILABLE",
  message: string,
): BlobStoreError {
  if (cause instanceof BlobStoreError) return cause;
  return new BlobStoreError(code, message, {
    cause,
    retryable: code === "PROVIDER_UNAVAILABLE",
  });
}
