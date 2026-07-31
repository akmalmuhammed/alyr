import {
  asImmutableBlobKey,
  assertSignedUrl,
  type BlobDeleteBatchResult,
  type BlobHead,
  type BlobReadStream,
  type BlobStore,
  BlobStoreError,
  type BlobUploadDescriptor,
  chunkValues,
  type ImmutableBlobKey,
  normalizeContentType,
  normalizeDeleteKeys,
  normalizeExpiry,
  type SignedDownload,
  type SignedUploadIntent,
  validateUploadDescriptor,
} from "./blobStore.ts";
import type { SupabaseBlobStoreConfig } from "./blobStoreConfig.ts";

export interface SupabaseObjectMetadataResponse {
  readonly contentLength: number;
  readonly contentType: string;
  readonly checksumSha256?: string;
  readonly etag?: string;
  readonly lastModified?: string;
}

export interface SupabaseObjectReadResponse
  extends SupabaseObjectMetadataResponse {
  readonly body: ReadableStream<Uint8Array>;
}

export interface SupabaseDeleteResponse {
  readonly deletedKeys: readonly string[];
  readonly errors?: readonly {
    readonly key: string;
    readonly code: string;
    readonly retryable: boolean;
  }[];
}

export interface SupabaseBlobStoreTransport {
  createSignedUpload(
    bucket: string,
    key: string,
    options: { readonly upsert: false },
  ): Promise<string>;
  createSignedDownload(
    bucket: string,
    key: string,
    expiresInSeconds: number,
  ): Promise<string>;
  head(
    bucket: string,
    key: string,
  ): Promise<SupabaseObjectMetadataResponse | null>;
  get(
    bucket: string,
    key: string,
  ): Promise<SupabaseObjectReadResponse | null>;
  deleteObjects(
    bucket: string,
    keys: readonly string[],
  ): Promise<SupabaseDeleteResponse>;
}

export interface SupabaseBlobStoreOptions {
  readonly config: SupabaseBlobStoreConfig;
  readonly transport: SupabaseBlobStoreTransport;
  readonly now?: () => Date;
}

export class SupabaseBlobStore implements BlobStore {
  readonly provider = "supabase" as const;
  readonly #config: SupabaseBlobStoreConfig;
  readonly #transport: SupabaseBlobStoreTransport;
  readonly #now: () => Date;

  constructor(options: SupabaseBlobStoreOptions) {
    this.#config = options.config;
    this.#transport = options.transport;
    this.#now = options.now ?? (() => new Date());
  }

  async createSignedUpload(
    descriptor: BlobUploadDescriptor,
  ): Promise<SignedUploadIntent> {
    const validated = validateUploadDescriptor(descriptor);
    try {
      const url = await this.#transport.createSignedUpload(
        this.#config.bucket,
        validated.objectKey,
        { upsert: false },
      );
      return Object.freeze({
        provider: this.provider,
        objectKey: validated.objectKey,
        method: "PUT",
        url: assertSignedUrl(url),
        requiredHeaders: Object.freeze({
          "cache-control": "max-age=3600",
          "content-type": validated.contentType,
          "x-upsert": "false",
        }),
        expiresAt: normalizeExpiry(
          this.#now(),
          this.#config.uploadTtlSeconds,
        ),
      });
    } catch (cause) {
      throw wrapProviderError(
        cause,
        "SIGNING_FAILED",
        "Unable to sign the Supabase object upload.",
      );
    }
  }

  async headObject(objectKey: ImmutableBlobKey): Promise<BlobHead | null> {
    const key = asImmutableBlobKey(objectKey);
    try {
      const response = await this.#transport.head(
        this.#config.bucket,
        key,
      );
      return response === null ? null : mapSupabaseMetadata(key, response);
    } catch (cause) {
      throw wrapProviderError(
        cause,
        "PROVIDER_UNAVAILABLE",
        "Unable to read Supabase object metadata.",
      );
    }
  }

  async openReadStream(
    objectKey: ImmutableBlobKey,
  ): Promise<BlobReadStream> {
    const key = asImmutableBlobKey(objectKey);
    try {
      const response = await this.#transport.get(
        this.#config.bucket,
        key,
      );
      if (response === null) {
        throw new BlobStoreError(
          "OBJECT_NOT_FOUND",
          "The immutable object does not exist.",
        );
      }
      if (!(response.body instanceof ReadableStream)) {
        throw new BlobStoreError(
          "STREAM_UNAVAILABLE",
          "Supabase Storage did not return a web-readable stream.",
          { retryable: true },
        );
      }
      return Object.freeze({
        head: mapSupabaseMetadata(key, response),
        stream: response.body,
      });
    } catch (cause) {
      if (cause instanceof BlobStoreError) throw cause;
      throw wrapProviderError(
        cause,
        "PROVIDER_UNAVAILABLE",
        "Unable to stream the Supabase object.",
      );
    }
  }

  async createSignedDownload(
    objectKey: ImmutableBlobKey,
  ): Promise<SignedDownload> {
    const key = asImmutableBlobKey(objectKey);
    try {
      const url = await this.#transport.createSignedDownload(
        this.#config.bucket,
        key,
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
        "Unable to sign the Supabase object download.",
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
      let response: SupabaseDeleteResponse;
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
        (response.errors ?? []).map((error) => [error.key, error]),
      );
      const providerDeleted = new Set(response.deletedKeys);
      for (const objectKey of chunk) {
        const error = errorByKey.get(objectKey);
        if (error !== undefined) {
          failed.set(objectKey, {
            objectKey,
            code: error.code,
            retryable: error.retryable,
          });
        } else if (providerDeleted.has(objectKey)) {
          deleted.add(objectKey);
        } else {
          failed.set(objectKey, {
            objectKey,
            code: "DELETE_UNCONFIRMED",
            retryable: true,
          });
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

export interface SupabaseStorageBucketClientLike {
  createSignedUploadUrl(
    key: string,
    options: { readonly upsert: false },
  ): Promise<{
    readonly data: {
      readonly signedUrl?: string;
      readonly token?: string;
      readonly path?: string;
    } | null;
    readonly error: { readonly message?: string } | null;
  }>;
  createSignedUrl(
    key: string,
    expiresInSeconds: number,
  ): Promise<{
    readonly data: { readonly signedUrl?: string } | null;
    readonly error: { readonly message?: string } | null;
  }>;
  remove(keys: readonly string[]): Promise<{
    readonly data: readonly { readonly name?: string }[] | null;
    readonly error: { readonly message?: string } | null;
  }>;
}

export interface SupabaseStorageClientLike {
  readonly storage: {
    from(bucket: string): SupabaseStorageBucketClientLike;
  };
}

export interface SupabaseStorageTransportOptions {
  readonly client: SupabaseStorageClientLike;
  readonly supabaseUrl: string;
  readonly publicSupabaseUrl?: string;
  readonly serviceRoleKey: string;
  readonly fetchImpl?: typeof fetch;
}

export function createSupabaseStorageTransport(
  options: SupabaseStorageTransportOptions,
): SupabaseBlobStoreTransport {
  const fetchImpl = options.fetchImpl ?? fetch;
  const serviceOrigin = new URL(options.supabaseUrl).origin;
  const publicOrigin = new URL(
    options.publicSupabaseUrl ?? options.supabaseUrl,
  ).origin;

  return {
    async createSignedUpload(bucket, key, uploadOptions) {
      const { data, error } = await options.client.storage
        .from(bucket)
        .createSignedUploadUrl(key, uploadOptions);
      if (error !== null || data?.signedUrl === undefined) {
        throw new BlobStoreError(
          "SIGNING_FAILED",
          "Supabase Storage did not create a signed upload URL.",
          { cause: error },
        );
      }
      return exposeSignedUrl(
        data.signedUrl,
        serviceOrigin,
        publicOrigin,
      );
    },

    async createSignedDownload(bucket, key, expiresInSeconds) {
      const { data, error } = await options.client.storage
        .from(bucket)
        .createSignedUrl(key, expiresInSeconds);
      if (error !== null || data?.signedUrl === undefined) {
        throw new BlobStoreError(
          "SIGNING_FAILED",
          "Supabase Storage did not create a signed download URL.",
          { cause: error },
        );
      }
      return exposeSignedUrl(
        data.signedUrl,
        serviceOrigin,
        publicOrigin,
      );
    },

    async head(bucket, key) {
      const response = await fetchImpl(
        authenticatedObjectUrl(serviceOrigin, bucket, key),
        {
          method: "HEAD",
          headers: serviceHeaders(options.serviceRoleKey),
          cache: "no-store",
        },
      );
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new BlobStoreError(
          "PROVIDER_UNAVAILABLE",
          "Supabase Storage HEAD request failed.",
          { retryable: response.status >= 500 },
        );
      }
      return responseMetadata(response);
    },

    async get(bucket, key) {
      const response = await fetchImpl(
        authenticatedObjectUrl(serviceOrigin, bucket, key),
        {
          method: "GET",
          headers: serviceHeaders(options.serviceRoleKey),
          cache: "no-store",
        },
      );
      if (response.status === 404) return null;
      if (!response.ok || response.body === null) {
        throw new BlobStoreError(
          "PROVIDER_UNAVAILABLE",
          "Supabase Storage streaming download failed.",
          { retryable: response.status >= 500 },
        );
      }
      return {
        ...responseMetadata(response),
        body: response.body,
      };
    },

    async deleteObjects(bucket, keys) {
      const { data, error } = await options.client.storage
        .from(bucket)
        .remove(keys);
      if (error !== null) {
        throw new BlobStoreError(
          "PROVIDER_UNAVAILABLE",
          "Supabase Storage batch deletion failed.",
          { cause: error, retryable: true },
        );
      }
      const returnedNames = new Set(
        (data ?? [])
          .map((item) => item.name)
          .filter((name): name is string => typeof name === "string"),
      );
      return {
        // Older Storage API responses may omit names after an idempotent
        // deletion, so a successful request confirms every requested key.
        deletedKeys: returnedNames.size === 0 ? [...keys] : [...returnedNames],
      };
    },
  };
}

function exposeSignedUrl(
  value: string,
  serviceOrigin: string,
  publicOrigin: string,
): string {
  let signed: URL;
  try {
    signed = new URL(value);
  } catch (cause) {
    throw new BlobStoreError(
      "SIGNING_FAILED",
      "Supabase Storage returned an invalid signed URL.",
      { cause },
    );
  }
  if (
    signed.origin !== serviceOrigin ||
    signed.username !== "" ||
    signed.password !== "" ||
    signed.hash !== ""
  ) {
    throw new BlobStoreError(
      "SIGNING_FAILED",
      "Supabase Storage returned a signed URL for an unexpected origin.",
    );
  }
  const exposed = new URL(`${signed.pathname}${signed.search}`, publicOrigin);
  return exposed.toString();
}

function mapSupabaseMetadata(
  objectKey: ImmutableBlobKey,
  response: SupabaseObjectMetadataResponse,
): BlobHead {
  if (
    !Number.isSafeInteger(response.contentLength) ||
    response.contentLength < 0
  ) {
    throw new BlobStoreError(
      "PROVIDER_UNAVAILABLE",
      "Supabase Storage omitted a valid content length.",
      { retryable: true },
    );
  }
  return Object.freeze({
    provider: "supabase",
    objectKey,
    byteSize: response.contentLength,
    contentType: normalizeContentType(response.contentType),
    checksumSha256: response.checksumSha256 ?? null,
    etag: response.etag ?? null,
    lastModified: response.lastModified ?? null,
  });
}

function authenticatedObjectUrl(
  origin: string,
  bucket: string,
  key: string,
): string {
  const encodedBucket = encodeURIComponent(bucket);
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${origin}/storage/v1/object/authenticated/${encodedBucket}/${encodedKey}`;
}

function serviceHeaders(serviceRoleKey: string): Headers {
  return new Headers({
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
  });
}

function responseMetadata(response: Response): SupabaseObjectMetadataResponse {
  const contentLength = Number(response.headers.get("content-length"));
  const rawContentType = response.headers.get("content-type") ?? "";
  // Storage may append a charset while serving text objects. The immutable
  // descriptor records the normalized media type, not transport parameters.
  const contentType = rawContentType.split(";", 1)[0].trim().toLowerCase();
  return {
    contentLength,
    contentType,
    checksumSha256: response.headers.get("x-amz-meta-heldat-sha256") ??
      undefined,
    etag: response.headers.get("etag") ?? undefined,
    lastModified: response.headers.get("last-modified") ?? undefined,
  };
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
