import { Readable } from "node:stream";
import {
  BackupError,
  invariant,
  parseSupabaseIdentity
} from "./backup-core.mjs";

const DEFAULT_TIMEOUT_MS = 60_000;
const PAGE_SIZE = 1_000;
const MAX_STORAGE_BUCKETS = 1_000;
const MAX_STORAGE_OBJECTS = 250_000;
const MAX_STORAGE_PREFIXES = 250_000;

function assertSafeBucketId(value) {
  invariant(
    typeof value === "string" &&
      value.length > 0 &&
      value.length <= 256 &&
      !value.includes("\0") &&
      !value.includes("/") &&
      !value.includes("\\") &&
      value !== "." &&
      value !== "..",
    "STORAGE_PATH_UNSAFE",
    "Supabase bucket identity is unsafe for a Storage URL path."
  );
  return value;
}

function assertSafeObjectName(value) {
  invariant(
    typeof value === "string" &&
      value.length > 0 &&
      value.length <= 1_024 &&
      !value.includes("\0") &&
      value
        .split("/")
        .every(
          (segment) =>
            segment.length > 0 &&
            segment !== "." &&
            segment !== ".."
        ),
    "STORAGE_PATH_UNSAFE",
    "Supabase object identity contains an unsafe URL path segment."
  );
  return value;
}

function optionalByteLength(value, message) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  invariant(
    Number.isSafeInteger(parsed) && parsed >= 0,
    "STORAGE_RESPONSE_INVALID",
    message
  );
  return parsed;
}

function decodeJwtPayload(value) {
  const parts = value.split(".");
  if (parts.length !== 3) {
    return undefined;
  }
  try {
    return JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );
  } catch {
    return undefined;
  }
}

export function assertServiceRoleKey(value) {
  invariant(
    typeof value === "string" && value.length >= 24,
    "MISSING_SERVICE_ROLE_KEY",
    "Supabase service-role key is missing."
  );
  invariant(
    !value.startsWith("sb_publishable_") &&
      !value.startsWith("sb_anon_"),
    "PUBLIC_KEY_REJECTED",
    "A public Supabase client key cannot operate backup tooling."
  );
  if (value.startsWith("sb_secret_")) {
    return value;
  }
  const payload = decodeJwtPayload(value);
  invariant(
    payload?.role === "service_role",
    "SERVICE_ROLE_KEY_REJECTED",
    "Legacy Supabase JWT must carry the service_role claim."
  );
  return value;
}

export function createStorageClient({
  supabaseUrl,
  serviceRoleKey,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const identity = parseSupabaseIdentity(supabaseUrl);
  const key = assertServiceRoleKey(serviceRoleKey);
  invariant(
    Number.isInteger(timeoutMs) &&
      timeoutMs >= 1_000 &&
      timeoutMs <= 10 * 60_000,
    "INVALID_STORAGE_TIMEOUT",
    "Storage request timeout must be between 1 second and 10 minutes."
  );

  async function request(
    pathname,
    {
      method = "GET",
      body,
      headers = {},
      expected = [200]
    } = {}
  ) {
    try {
      const response = await fetchImpl(
        `${identity.canonical}${pathname}`,
        {
          method,
          headers: {
            apikey: key,
            authorization: `Bearer ${key}`,
            ...headers
          },
          body,
          // Never forward the service-role apikey through an HTTP redirect.
          redirect: "error",
          // Keep the timeout signal attached to the response body so a
          // stalled download cannot continue indefinitely after headers.
          signal: AbortSignal.timeout(timeoutMs),
          ...(body && typeof body.pipe === "function"
            ? { duplex: "half" }
            : {})
        }
      );
      if (!expected.includes(response.status)) {
        // Do not echo provider response bodies: they may contain object
        // metadata that belongs inside the encrypted manifest.
        await response.body?.cancel().catch(() => {});
        throw new BackupError(
          "STORAGE_HTTP_ERROR",
          `Supabase Storage request failed with HTTP ${response.status}.`
        );
      }
      return response;
    } catch (error) {
      if (error instanceof BackupError) {
        throw error;
      }
      throw new BackupError(
        "STORAGE_REQUEST_FAILED",
        "Supabase Storage request failed.",
        error
      );
    }
  }

  async function requestJson(pathname, options) {
    const response = await request(pathname, options);
    try {
      return await response.json();
    } catch (error) {
      throw new BackupError(
        "STORAGE_RESPONSE_INVALID",
        "Supabase Storage response was not valid JSON.",
        error
      );
    }
  }

  return {
    identity,

    async listPrivateBuckets() {
      const buckets = await requestJson(
        "/storage/v1/bucket"
      );
      invariant(
        Array.isArray(buckets) &&
          buckets.length <= MAX_STORAGE_BUCKETS &&
          buckets.every(
            (bucket) =>
              typeof bucket?.public === "boolean"
          ),
        "STORAGE_RESPONSE_INVALID",
        "Supabase bucket list response is invalid."
      );
      invariant(
        buckets.every(
          (bucket) => bucket.public === false
        ),
        "PUBLIC_STORAGE_BUCKET_UNSUPPORTED",
        "Operator backup v1 requires every Supabase Storage bucket to be private."
      );
      return buckets
        .map((bucket) => {
          invariant(
            typeof bucket.id === "string" &&
              bucket.id.length > 0 &&
              !bucket.id.includes("\0") &&
              (bucket.name === undefined ||
                (typeof bucket.name === "string" &&
                  bucket.name.length > 0 &&
                  !bucket.name.includes("\0"))),
            "STORAGE_RESPONSE_INVALID",
            "Supabase bucket identity is invalid."
          );
          assertSafeBucketId(bucket.id);
          const rawFileSizeLimit =
            bucket.file_size_limit ??
            bucket.fileSizeLimit ??
            null;
          const fileSizeLimit =
            rawFileSizeLimit === null
              ? null
              : Number(rawFileSizeLimit);
          invariant(
            fileSizeLimit === null ||
              (Number.isSafeInteger(fileSizeLimit) &&
                fileSizeLimit >= 0),
            "STORAGE_RESPONSE_INVALID",
            "Supabase bucket file-size limit is invalid."
          );
          const allowedMimeTypes =
            bucket.allowed_mime_types ??
            bucket.allowedMimeTypes ??
            null;
          invariant(
            allowedMimeTypes === null ||
              (Array.isArray(allowedMimeTypes) &&
                allowedMimeTypes.every(
                  (value) =>
                    typeof value === "string" &&
                    value.length > 0 &&
                    value.length <= 256 &&
                    /^[\x20-\x7e]+$/u.test(value)
                )),
            "STORAGE_RESPONSE_INVALID",
            "Supabase bucket MIME-type constraints are invalid."
          );
          return {
            id: String(bucket.id),
            name: String(bucket.name ?? bucket.id),
            public: false,
            fileSizeLimit,
            allowedMimeTypes
          };
        })
        .sort((left, right) =>
          left.id.localeCompare(right.id)
        );
    },

    async listObjects(bucketId) {
      assertSafeBucketId(bucketId);
      const objects = [];
      const pendingPrefixes = [""];
      const seenPrefixes = new Set();
      while (pendingPrefixes.length > 0) {
        const prefix = pendingPrefixes.shift();
        if (seenPrefixes.has(prefix)) {
          continue;
        }
        seenPrefixes.add(prefix);
        let offset = 0;
        while (true) {
          const entries = await requestJson(
            `/storage/v1/object/list/${encodeURIComponent(
              bucketId
            )}`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json"
              },
              body: JSON.stringify({
                limit: PAGE_SIZE,
                offset,
                prefix,
                sortBy: {
                  column: "name",
                  order: "asc"
                }
              })
            }
          );
          invariant(
            Array.isArray(entries),
            "STORAGE_RESPONSE_INVALID",
            "Supabase object-list response is invalid."
          );
          for (const entry of entries) {
            invariant(
              typeof entry?.name === "string" &&
                entry.name.length > 0 &&
                entry.name.length <= 1_024 &&
                !entry.name.includes("\0"),
              "STORAGE_RESPONSE_INVALID",
              "Supabase object-list entry has an invalid name."
            );
            const fullName = prefix
              ? `${prefix}/${entry.name}`
              : entry.name;
            assertSafeObjectName(fullName);
            const folder =
              entry.id === null ||
              entry.id === undefined;
            if (folder) {
              pendingPrefixes.push(fullName);
              invariant(
                pendingPrefixes.length +
                    seenPrefixes.size <=
                  MAX_STORAGE_PREFIXES,
                "STORAGE_PREFIX_LIMIT_EXCEEDED",
                "Storage prefix count exceeded the reviewed backup limit."
              );
            } else {
              const size = optionalByteLength(
                entry.metadata?.size,
                "Supabase object size is invalid."
              );
              objects.push({
                name: fullName,
                contentType:
                  entry.metadata?.mimetype ??
                  entry.metadata?.contentType ??
                  "application/octet-stream",
                size,
                updatedAt:
                  entry.updated_at ??
                  entry.updatedAt ??
                  null
              });
              invariant(
                objects.length <= MAX_STORAGE_OBJECTS,
                "STORAGE_OBJECT_LIMIT_EXCEEDED",
                "Storage object count exceeded the reviewed backup limit."
              );
            }
          }
          if (entries.length < PAGE_SIZE) {
            break;
          }
          offset += entries.length;
        }
      }
      return objects.sort((left, right) =>
        left.name.localeCompare(right.name)
      );
    },

    async downloadObject(bucketId, objectName) {
      assertSafeBucketId(bucketId);
      const encodedPath = assertSafeObjectName(objectName)
        .split("/")
        .map(encodeURIComponent)
        .join("/");
      const response = await request(
        `/storage/v1/object/authenticated/${encodeURIComponent(
          bucketId
        )}/${encodedPath}`
      );
      invariant(
        response.body,
        "STORAGE_RESPONSE_INVALID",
        "Storage download returned no body."
      );
      return {
        readable: Readable.fromWeb(response.body),
        contentType:
          response.headers.get("content-type") ??
          "application/octet-stream",
        contentLength: optionalByteLength(
          response.headers.get("content-length"),
          "Storage download Content-Length is invalid."
        )
      };
    },

    async ensurePrivateBucket(bucket) {
      assertSafeBucketId(bucket?.id);
      const buckets = await requestJson(
        "/storage/v1/bucket"
      );
      const existing = Array.isArray(buckets)
        ? buckets.find(
            (candidate) => candidate?.id === bucket.id
          )
        : undefined;
      if (existing) {
        invariant(
          existing.public === false,
          "RESTORE_BUCKET_PUBLIC",
          "A restore target bucket exists but is public."
        );
        return { created: false };
      }
      await requestJson("/storage/v1/bucket", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          id: bucket.id,
          name: bucket.name ?? bucket.id,
          public: false,
          file_size_limit: bucket.fileSizeLimit ?? null,
          allowed_mime_types:
            bucket.allowedMimeTypes ?? null
        }),
        expected: [200, 201]
      });
      return { created: true };
    },

    async uploadObject({
      bucketId,
      objectName,
      readable,
      contentType,
      contentLength
    }) {
      assertSafeBucketId(bucketId);
      const encodedPath = assertSafeObjectName(objectName)
        .split("/")
        .map(encodeURIComponent)
        .join("/");
      await request(
        `/storage/v1/object/${encodeURIComponent(
          bucketId
        )}/${encodedPath}`,
        {
          method: "POST",
          headers: {
            "content-type":
              contentType || "application/octet-stream",
            "x-upsert": "true",
            ...(Number.isSafeInteger(contentLength)
              ? {
                  "content-length": String(contentLength)
                }
              : {})
          },
          body: readable,
          expected: [200, 201]
        }
      );
    }
  };
}
