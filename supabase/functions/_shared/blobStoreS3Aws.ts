import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "npm:@aws-sdk/client-s3@3.1098.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.1098.0";
import { BlobStoreError } from "./blobStore.ts";
import type { S3CompatibleBlobStoreConfig } from "./blobStoreConfig.ts";
import type {
  S3BlobStoreTransport,
  S3DeleteResponse,
  S3GetRequest,
  S3ObjectMetadataResponse,
  S3ObjectReadResponse,
  S3PutRequest,
} from "./blobStoreS3.ts";

export function createAwsS3Transport(
  config: S3CompatibleBlobStoreConfig,
): S3BlobStoreTransport {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return {
    async signPut(
      request: S3PutRequest,
      expiresInSeconds: number,
    ): Promise<string> {
      const metadataHeaders = new Set(
        Object.keys(request.metadata).map((key) => `x-amz-meta-${key}`),
      );
      return await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: request.bucket,
          Key: request.key,
          ContentType: request.contentType,
          Metadata: { ...request.metadata },
          IfNoneMatch: request.ifNoneMatch,
        }),
        {
          expiresIn: expiresInSeconds,
          signableHeaders: new Set(["content-type", "if-none-match"]),
          unhoistableHeaders: metadataHeaders,
        },
      );
    },

    async signGet(
      request: S3GetRequest,
      expiresInSeconds: number,
    ): Promise<string> {
      return await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: request.bucket,
          Key: request.key,
        }),
        { expiresIn: expiresInSeconds },
      );
    },

    async head(
      request: S3GetRequest,
    ): Promise<S3ObjectMetadataResponse | null> {
      try {
        const response = await client.send(
          new HeadObjectCommand({
            Bucket: request.bucket,
            Key: request.key,
          }),
        );
        return {
          contentLength: response.ContentLength,
          contentType: response.ContentType,
          metadata: response.Metadata,
          etag: response.ETag,
          lastModified: response.LastModified,
        };
      } catch (cause) {
        if (isNotFound(cause)) return null;
        throw cause;
      }
    },

    async get(
      request: S3GetRequest,
    ): Promise<S3ObjectReadResponse | null> {
      try {
        const response = await client.send(
          new GetObjectCommand({
            Bucket: request.bucket,
            Key: request.key,
          }),
        );
        if (response.Body === undefined) {
          throw new BlobStoreError(
            "STREAM_UNAVAILABLE",
            "S3 returned object metadata without a response body.",
            { retryable: true },
          );
        }
        return {
          contentLength: response.ContentLength,
          contentType: response.ContentType,
          metadata: response.Metadata,
          etag: response.ETag,
          lastModified: response.LastModified,
          body: toWebReadableStream(response.Body),
        };
      } catch (cause) {
        if (isNotFound(cause)) return null;
        throw cause;
      }
    },

    async deleteObjects(
      bucket: string,
      keys: readonly string[],
    ): Promise<S3DeleteResponse> {
      const response = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Quiet: false,
            Objects: keys.map((Key) => ({ Key })),
          },
        }),
      );
      return {
        deletedKeys: response.Deleted
          ?.map((item) => item.Key)
          .filter((key): key is string => typeof key === "string"),
        errors: response.Errors
          ?.filter((item) => typeof item.Key === "string")
          .map((item) => ({
            key: item.Key as string,
            code: item.Code,
          })),
      };
    },
  };
}

function toWebReadableStream(value: unknown): ReadableStream<Uint8Array> {
  if (value instanceof ReadableStream) return value;

  if (
    typeof value === "object" &&
    value !== null &&
    "transformToWebStream" in value &&
    typeof value.transformToWebStream === "function"
  ) {
    return value.transformToWebStream() as ReadableStream<Uint8Array>;
  }

  if (value instanceof Uint8Array) {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(value);
        controller.close();
      },
    });
  }

  if (
    typeof value === "object" &&
    value !== null &&
    Symbol.asyncIterator in value
  ) {
    const iterator = (
      value as AsyncIterable<Uint8Array>
    )[Symbol.asyncIterator]();
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        const result = await iterator.next();
        if (result.done) {
          controller.close();
        } else {
          controller.enqueue(result.value);
        }
      },
      async cancel(reason) {
        if (typeof iterator.return === "function") {
          await iterator.return(reason);
        }
      },
    });
  }

  throw new BlobStoreError(
    "STREAM_UNAVAILABLE",
    "S3 returned an unsupported response body type.",
    { retryable: true },
  );
}

function isNotFound(cause: unknown): boolean {
  if (typeof cause !== "object" || cause === null) return false;
  const candidate = cause as {
    readonly name?: string;
    readonly Code?: string;
    readonly $metadata?: { readonly httpStatusCode?: number };
  };
  return candidate.$metadata?.httpStatusCode === 404 ||
    candidate.name === "NotFound" ||
    candidate.name === "NoSuchKey" ||
    candidate.Code === "NoSuchKey";
}
