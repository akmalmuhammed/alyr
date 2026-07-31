import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BlobStoreError,
  MAX_BLOB_BYTES,
  asImmutableBlobKey,
  assessBlobHead,
  createImmutableBlobKey,
  normalizeDeleteKeys,
  parseImmutableBlobKey,
  validateUploadDescriptor,
} from "../functions/_shared/blobStore.ts";
import {
  SUPABASE_SIGNED_UPLOAD_TTL_SECONDS,
  parseBlobStoreConfig,
} from "../functions/_shared/blobStoreConfig.ts";
import {
  S3CompatibleBlobStore,
} from "../functions/_shared/blobStoreS3.ts";
import {
  SupabaseBlobStore,
  createSupabaseStorageTransport,
} from "../functions/_shared/blobStoreSupabase.ts";

const NOW = new Date("2026-07-31T12:00:00.000Z");
const HOUSEHOLD_ID = "11111111-1111-4111-8111-111111111111";
const BLOB_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const OBJECT_KEY = createImmutableBlobKey({
  householdId: HOUSEHOLD_ID,
  blobId: BLOB_ID,
  versionId: VERSION_ID,
});
const CHECKSUM = "ab".repeat(32);
const DESCRIPTOR = Object.freeze({
  objectKey: OBJECT_KEY,
  byteSize: 4,
  contentType: "image/jpeg",
  checksumSha256: CHECKSUM,
});
const SERVICE_ROLE_JWT = [
  "header",
  Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url"),
  "signature",
].join(".");

function expectBlobError(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof BlobStoreError);
    assert.equal(error.code, code);
    return true;
  });
}

function immutableKeyFor(index) {
  return createImmutableBlobKey({
    householdId: HOUSEHOLD_ID,
    blobId: `00000000-0000-4000-8000-${index
      .toString(16)
      .padStart(12, "0")}`,
    versionId: VERSION_ID,
  });
}

function byteStream(bytes) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(Uint8Array.from(bytes));
      controller.close();
    },
  });
}

async function readAll(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(...chunk);
  return Uint8Array.from(chunks);
}

function r2Config(overrides = {}) {
  return Object.freeze({
    provider: "r2",
    bucket: "heldat-evidence",
    endpoint:
      "https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com",
    region: "auto",
    accessKeyId: "A".repeat(24),
    secretAccessKey: "s".repeat(40),
    forcePathStyle: false,
    uploadTtlSeconds: 300,
    downloadTtlSeconds: 180,
    ...overrides,
  });
}

function supabaseConfig(overrides = {}) {
  return Object.freeze({
    provider: "supabase",
    bucket: "evidence",
    supabaseUrl: "https://project-ref.supabase.co",
    publicUrl: "https://project-ref.supabase.co",
    serviceRoleKey: SERVICE_ROLE_JWT,
    uploadTtlSeconds: SUPABASE_SIGNED_UPLOAD_TTL_SECONDS,
    downloadTtlSeconds: 300,
    ...overrides,
  });
}

test("immutable keys contain only three canonical UUIDv4 identifiers", () => {
  assert.equal(
    OBJECT_KEY,
    `${HOUSEHOLD_ID}/${BLOB_ID}/${VERSION_ID}`,
  );
  assert.deepEqual(parseImmutableBlobKey(OBJECT_KEY), {
    householdId: HOUSEHOLD_ID,
    blobId: BLOB_ID,
    versionId: VERSION_ID,
  });
  assert.equal(asImmutableBlobKey(OBJECT_KEY), OBJECT_KEY);

  for (const invalid of [
    `https://bucket.example/${OBJECT_KEY}`,
    createImmutableBlobKey({
      householdId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      blobId: "bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb",
      versionId: "cccccccc-cccc-4ccc-accc-cccccccccccc",
    }).toUpperCase(),
    OBJECT_KEY.replace(`/${BLOB_ID}/`, `/../${BLOB_ID}/`),
    `${HOUSEHOLD_ID}\\${BLOB_ID}\\${VERSION_ID}`,
    `${OBJECT_KEY}?X-Amz-Signature=secret`,
    `${OBJECT_KEY}#fragment`,
  ]) {
    expectBlobError(() => asImmutableBlobKey(invalid), "INVALID_OBJECT_KEY");
  }
});

test("upload descriptors enforce bounded bytes, normalized MIME, and lowercase SHA-256", () => {
  assert.deepEqual(validateUploadDescriptor(DESCRIPTOR), DESCRIPTOR);

  for (const invalid of [
    { ...DESCRIPTOR, byteSize: 0 },
    { ...DESCRIPTOR, byteSize: MAX_BLOB_BYTES + 1 },
    { ...DESCRIPTOR, byteSize: 1.5 },
    { ...DESCRIPTOR, contentType: "image/jpeg; charset=utf-8" },
    { ...DESCRIPTOR, checksumSha256: CHECKSUM.toUpperCase() },
    { ...DESCRIPTOR, checksumSha256: CHECKSUM.slice(2) },
  ]) {
    expectBlobError(
      () => validateUploadDescriptor(invalid),
      "INVALID_UPLOAD_DESCRIPTOR",
    );
  }
});

test("delete keys are validated and deduplicated deterministically", () => {
  const second = immutableKeyFor(2);
  assert.deepEqual(
    normalizeDeleteKeys([OBJECT_KEY, second, OBJECT_KEY]),
    [OBJECT_KEY, second],
  );
  expectBlobError(() => normalizeDeleteKeys([]), "INVALID_OBJECT_KEY");
});

test("R2 environment validation derives the official endpoint and auto region", () => {
  const config = parseBlobStoreConfig({
    BLOB_STORE_PROVIDER: "r2",
    BLOB_STORE_BUCKET: "heldat-evidence",
    R2_ACCOUNT_ID: "a".repeat(32),
    R2_ACCESS_KEY_ID: "A".repeat(24),
    R2_SECRET_ACCESS_KEY: "s".repeat(40),
    BLOB_SIGNED_UPLOAD_TTL_SECONDS: "420",
    BLOB_SIGNED_DOWNLOAD_TTL_SECONDS: "600",
  });

  assert.deepEqual(config, {
    provider: "r2",
    bucket: "heldat-evidence",
    endpoint:
      "https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com",
    region: "auto",
    accessKeyId: "A".repeat(24),
    secretAccessKey: "s".repeat(40),
    forcePathStyle: false,
    uploadTtlSeconds: 420,
    downloadTtlSeconds: 600,
  });

  for (const overrides of [
    { R2_ACCOUNT_ID: "not-an-account" },
    { R2_SECRET_ACCESS_KEY: "short" },
    { BLOB_SIGNED_UPLOAD_TTL_SECONDS: "901" },
    { BLOB_STORE_BUCKET: "Invalid_Bucket" },
  ]) {
    expectBlobError(
      () =>
        parseBlobStoreConfig({
          BLOB_STORE_PROVIDER: "r2",
          BLOB_STORE_BUCKET: "heldat-evidence",
          R2_ACCOUNT_ID: "a".repeat(32),
          R2_ACCESS_KEY_ID: "A".repeat(24),
          R2_SECRET_ACCESS_KEY: "s".repeat(40),
          ...overrides,
        }),
      "INVALID_CONFIG",
    );
  }
});

test("generic S3 configuration rejects insecure or ambiguous values", () => {
  const config = parseBlobStoreConfig({
    BLOB_STORE_PROVIDER: "s3",
    BLOB_STORE_BUCKET: "heldat-evidence",
    S3_ENDPOINT: "https://objects.example.test",
    S3_REGION: "test-region-1",
    S3_ACCESS_KEY_ID: "A".repeat(24),
    S3_SECRET_ACCESS_KEY: "s".repeat(40),
    S3_FORCE_PATH_STYLE: "true",
  });
  assert.equal(config.provider, "s3");
  assert.equal(config.endpoint, "https://objects.example.test");
  assert.equal(config.forcePathStyle, true);

  for (const endpoint of [
    "http://objects.example.test",
    "https://user:pass@objects.example.test",
    "https://objects.example.test/path",
    "https://objects.example.test?secret=value",
  ]) {
    expectBlobError(
      () =>
        parseBlobStoreConfig({
          BLOB_STORE_PROVIDER: "s3",
          BLOB_STORE_BUCKET: "heldat-evidence",
          S3_ENDPOINT: endpoint,
          S3_REGION: "test-region-1",
          S3_ACCESS_KEY_ID: "A".repeat(24),
          S3_SECRET_ACCESS_KEY: "s".repeat(40),
        }),
      "INVALID_CONFIG",
    );
  }
});

test("Supabase configuration accepts only server credentials and fixed upload TTL", () => {
  const config = parseBlobStoreConfig({
    BLOB_STORE_PROVIDER: "supabase",
    BLOB_STORE_BUCKET: "evidence",
    SUPABASE_URL: "https://project-ref.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_JWT,
  });
  assert.equal(config.provider, "supabase");
  assert.equal(config.publicUrl, "https://project-ref.supabase.co");
  assert.equal(
    config.uploadTtlSeconds,
    SUPABASE_SIGNED_UPLOAD_TTL_SECONDS,
  );

  const modernSecretConfig = parseBlobStoreConfig({
    BLOB_STORE_PROVIDER: "supabase",
    BLOB_STORE_BUCKET: "evidence",
    SUPABASE_URL: "https://project-ref.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${"a".repeat(32)}`,
    BLOB_SIGNED_UPLOAD_TTL_SECONDS: "7200",
  });
  assert.equal(modernSecretConfig.provider, "supabase");

  const localCliConfig = parseBlobStoreConfig({
    BLOB_STORE_PROVIDER: "supabase",
    BLOB_STORE_BUCKET: "evidence",
    SUPABASE_URL: "http://kong:8000",
    SUPABASE_PUBLIC_URL: "http://127.0.0.1:54321",
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_JWT,
  });
  assert.equal(localCliConfig.supabaseUrl, "http://kong:8000");
  assert.equal(localCliConfig.publicUrl, "http://127.0.0.1:54321");

  expectBlobError(
    () =>
      parseBlobStoreConfig({
        BLOB_STORE_PROVIDER: "supabase",
        BLOB_STORE_BUCKET: "evidence",
        SUPABASE_URL: "http://kong:8000",
        SUPABASE_PUBLIC_URL: "https://project-ref.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_JWT,
      }),
    "INVALID_CONFIG",
  );

  const anonJwt = [
    "header",
    Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url"),
    "signature",
  ].join(".");
  for (const [key, ttl] of [
    [`sb_publishable_${"a".repeat(32)}`, undefined],
    [anonJwt, undefined],
    [SERVICE_ROLE_JWT, "300"],
  ]) {
    expectBlobError(
      () =>
        parseBlobStoreConfig({
          BLOB_STORE_PROVIDER: "supabase",
          BLOB_STORE_BUCKET: "evidence",
          SUPABASE_URL: "https://project-ref.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: key,
          ...(ttl === undefined
            ? {}
            : { BLOB_SIGNED_UPLOAD_TTL_SECONDS: ttl }),
        }),
      "INVALID_CONFIG",
    );
  }
});

test("S3/R2 upload intent binds immutable key, type, overwrite guard, and verification metadata", async () => {
  const calls = [];
  const transport = {
    async signPut(request, expiresInSeconds) {
      calls.push({ request, expiresInSeconds });
      return "https://bucket.example.test/object?X-Amz-Signature=test";
    },
    async signGet() {
      throw new Error("not used");
    },
    async head() {
      return null;
    },
    async get() {
      return null;
    },
    async deleteObjects() {
      return {};
    },
  };
  const store = new S3CompatibleBlobStore({
    config: r2Config(),
    transport,
    now: () => NOW,
  });

  const intent = await store.createSignedUpload(DESCRIPTOR);
  assert.equal(intent.provider, "r2");
  assert.equal(intent.objectKey, OBJECT_KEY);
  assert.equal(intent.method, "PUT");
  assert.equal(intent.expiresAt, "2026-07-31T12:05:00.000Z");
  assert.equal(
    intent.url,
    "https://bucket.example.test/object?X-Amz-Signature=test",
  );
  assert.deepEqual(intent.requiredHeaders, {
    "content-type": "image/jpeg",
    "if-none-match": "*",
    "x-amz-meta-heldat-sha256": CHECKSUM,
    "x-amz-meta-heldat-byte-size": "4",
    "x-amz-meta-heldat-content-type": "image/jpeg",
    "x-amz-meta-heldat-schema": "1",
  });
  assert.deepEqual(calls, [{
    request: {
      bucket: "heldat-evidence",
      key: OBJECT_KEY,
      contentType: "image/jpeg",
      metadata: {
        "heldat-sha256": CHECKSUM,
        "heldat-byte-size": "4",
        "heldat-content-type": "image/jpeg",
        "heldat-schema": "1",
      },
      ifNoneMatch: "*",
    },
    expiresInSeconds: 300,
  }]);
});

test("S3/R2 HEAD assessment distinguishes mismatch from required stream verification", async () => {
  let metadata = { "HELDAT-SHA256": CHECKSUM };
  const transport = {
    async signPut() {
      throw new Error("not used");
    },
    async signGet() {
      throw new Error("not used");
    },
    async head() {
      return {
        contentLength: 4,
        contentType: "image/jpeg",
        metadata,
        etag: '"etag"',
        lastModified: "2026-07-31T11:00:00.000Z",
      };
    },
    async get() {
      return null;
    },
    async deleteObjects() {
      return {};
    },
  };
  const store = new S3CompatibleBlobStore({
    config: r2Config(),
    transport,
  });

  const verifiedHead = await store.headObject(OBJECT_KEY);
  assert.deepEqual(assessBlobHead(verifiedHead, DESCRIPTOR), {
    ok: true,
    requiresStreamChecksum: false,
  });

  metadata = {};
  const streamRequiredHead = await store.headObject(OBJECT_KEY);
  assert.deepEqual(assessBlobHead(streamRequiredHead, DESCRIPTOR), {
    ok: true,
    requiresStreamChecksum: true,
  });

  assert.deepEqual(
    assessBlobHead(
      { ...streamRequiredHead, byteSize: 5 },
      DESCRIPTOR,
    ),
    { ok: false, code: "BYTE_SIZE_MISMATCH" },
  );
  assert.deepEqual(
    assessBlobHead(
      { ...streamRequiredHead, checksumSha256: "cd".repeat(32) },
      DESCRIPTOR,
    ),
    { ok: false, code: "CHECKSUM_METADATA_MISMATCH" },
  );
});

test("S3/R2 exposes streaming reads, signed downloads, and 1000-key delete chunks", async () => {
  const deleteCalls = [];
  const failedKey = immutableKeyFor(1001);
  const transport = {
    async signPut() {
      throw new Error("not used");
    },
    async signGet(request, expiresInSeconds) {
      assert.deepEqual(request, {
        bucket: "heldat-evidence",
        key: OBJECT_KEY,
      });
      assert.equal(expiresInSeconds, 180);
      return "https://bucket.example.test/object?X-Amz-Signature=get";
    },
    async head() {
      return null;
    },
    async get(request) {
      assert.equal(request.key, OBJECT_KEY);
      return {
        contentLength: 4,
        contentType: "image/jpeg",
        metadata: {},
        body: byteStream([1, 2, 3, 4]),
      };
    },
    async deleteObjects(bucket, keys) {
      deleteCalls.push({ bucket, keys: [...keys] });
      return keys.includes(failedKey)
        ? { errors: [{ key: failedKey, code: "AccessDenied" }] }
        : {};
    },
  };
  const store = new S3CompatibleBlobStore({
    config: r2Config(),
    transport,
    now: () => NOW,
  });

  const read = await store.openReadStream(OBJECT_KEY);
  assert.deepEqual(await readAll(read.stream), Uint8Array.from([1, 2, 3, 4]));
  assert.equal(read.head.checksumSha256, null);

  const download = await store.createSignedDownload(OBJECT_KEY);
  assert.equal(download.objectKey, OBJECT_KEY);
  assert.equal(download.method, "GET");
  assert.equal(download.expiresAt, "2026-07-31T12:03:00.000Z");

  const keys = Array.from({ length: 1001 }, (_, index) =>
    immutableKeyFor(index + 1));
  const deletion = await store.deleteBatch(keys);
  assert.equal(deleteCalls.length, 2);
  assert.equal(deleteCalls[0].keys.length, 1000);
  assert.equal(deleteCalls[1].keys.length, 1);
  assert.equal(deletion.deleted.length, 1000);
  assert.deepEqual(deletion.failed, [{
    objectKey: failedKey,
    code: "AccessDenied",
    retryable: false,
  }]);
});

test("Supabase upload intent is no-overwrite and uses the provider-defined two-hour expiry", async () => {
  const calls = [];
  const transport = {
    async createSignedUpload(bucket, key, options) {
      calls.push({ bucket, key, options });
      return "https://project-ref.supabase.co/storage/v1/upload/sign/object?token=test";
    },
    async createSignedDownload() {
      throw new Error("not used");
    },
    async head() {
      return null;
    },
    async get() {
      return null;
    },
    async deleteObjects() {
      return { deletedKeys: [] };
    },
  };
  const store = new SupabaseBlobStore({
    config: supabaseConfig(),
    transport,
    now: () => NOW,
  });

  const intent = await store.createSignedUpload(DESCRIPTOR);
  assert.equal(intent.provider, "supabase");
  assert.equal(intent.objectKey, OBJECT_KEY);
  assert.equal(intent.expiresAt, "2026-07-31T14:00:00.000Z");
  assert.deepEqual(intent.requiredHeaders, {
    "cache-control": "max-age=3600",
    "content-type": "image/jpeg",
    "x-upsert": "false",
  });
  assert.deepEqual(calls, [{
    bucket: "evidence",
    key: OBJECT_KEY,
    options: { upsert: false },
  }]);
});

test("Supabase supports streamed verification, signed download, and explicit partial deletion", async () => {
  const secondKey = immutableKeyFor(2);
  const transport = {
    async createSignedUpload() {
      throw new Error("not used");
    },
    async createSignedDownload(bucket, key, expiresInSeconds) {
      assert.equal(bucket, "evidence");
      assert.equal(key, OBJECT_KEY);
      assert.equal(expiresInSeconds, 300);
      return "https://project-ref.supabase.co/storage/v1/object/sign/evidence/key?token=test";
    },
    async head() {
      return {
        contentLength: 4,
        contentType: "image/jpeg",
        etag: '"etag"',
      };
    },
    async get() {
      return {
        contentLength: 4,
        contentType: "image/jpeg",
        body: byteStream([4, 3, 2, 1]),
      };
    },
    async deleteObjects() {
      return {
        deletedKeys: [OBJECT_KEY],
        errors: [],
      };
    },
  };
  const store = new SupabaseBlobStore({
    config: supabaseConfig(),
    transport,
    now: () => NOW,
  });

  const head = await store.headObject(OBJECT_KEY);
  assert.deepEqual(assessBlobHead(head, DESCRIPTOR), {
    ok: true,
    requiresStreamChecksum: true,
  });
  const read = await store.openReadStream(OBJECT_KEY);
  assert.deepEqual(await readAll(read.stream), Uint8Array.from([4, 3, 2, 1]));
  const download = await store.createSignedDownload(OBJECT_KEY);
  assert.equal(download.expiresAt, "2026-07-31T12:05:00.000Z");

  const deletion = await store.deleteBatch([OBJECT_KEY, secondKey]);
  assert.deepEqual(deletion.deleted, [OBJECT_KEY]);
  assert.deepEqual(deletion.failed, [{
    objectKey: secondKey,
    code: "DELETE_UNCONFIRMED",
    retryable: true,
  }]);
});

test("concrete Supabase transport uses authenticated private-object HEAD/GET endpoints", async () => {
  const fetchCalls = [];
  const bucketClient = {
    async createSignedUploadUrl() {
      return {
        data: {
          signedUrl:
            "https://project-ref.supabase.co/storage/v1/upload/sign/evidence/key?token=upload",
        },
        error: null,
      };
    },
    async createSignedUrl() {
      return {
        data: {
          signedUrl:
            "https://project-ref.supabase.co/storage/v1/object/sign/evidence/key?token=download",
        },
        error: null,
      };
    },
    async remove(keys) {
      return {
        data: keys.map((name) => ({ name })),
        error: null,
      };
    },
  };
  const transport = createSupabaseStorageTransport({
    client: {
      storage: {
        from(bucket) {
          assert.equal(bucket, "evidence");
          return bucketClient;
        },
      },
    },
    supabaseUrl: "https://project-ref.supabase.co",
    serviceRoleKey: SERVICE_ROLE_JWT,
    async fetchImpl(url, init) {
      fetchCalls.push({ url, init });
      if (init.method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: {
            "content-length": "4",
            "content-type": "image/jpeg; charset=binary",
            etag: '"etag"',
          },
        });
      }
      return new Response(Uint8Array.from([1, 2, 3, 4]), {
        status: 200,
        headers: {
          "content-length": "4",
          "content-type": "image/jpeg",
        },
      });
    },
  });

  const head = await transport.head("evidence", OBJECT_KEY);
  assert.equal(head.contentLength, 4);
  assert.equal(head.contentType, "image/jpeg");
  const get = await transport.get("evidence", OBJECT_KEY);
  assert.deepEqual(await readAll(get.body), Uint8Array.from([1, 2, 3, 4]));

  assert.equal(fetchCalls.length, 2);
  assert.match(
    fetchCalls[0].url,
    /^https:\/\/project-ref\.supabase\.co\/storage\/v1\/object\/authenticated\/evidence\//,
  );
  assert.equal(fetchCalls[0].init.method, "HEAD");
  assert.equal(
    fetchCalls[0].init.headers.get("authorization"),
    `Bearer ${SERVICE_ROLE_JWT}`,
  );
  assert.equal(
    fetchCalls[0].init.headers.get("apikey"),
    SERVICE_ROLE_JWT,
  );
});

test("Supabase transport keeps service calls internal and exposes local signed URLs to the client", async () => {
  const bucketClient = {
    async createSignedUploadUrl() {
      return {
        data: {
          signedUrl:
            "http://kong:8000/storage/v1/object/upload/sign/evidence/key?token=upload",
        },
        error: null,
      };
    },
    async createSignedUrl() {
      return {
        data: {
          signedUrl:
            "http://kong:8000/storage/v1/object/sign/evidence/key?token=download",
        },
        error: null,
      };
    },
    async remove(keys) {
      return { data: keys.map((name) => ({ name })), error: null };
    },
  };
  const transport = createSupabaseStorageTransport({
    client: { storage: { from: () => bucketClient } },
    supabaseUrl: "http://kong:8000",
    publicSupabaseUrl: "http://127.0.0.1:54321",
    serviceRoleKey: SERVICE_ROLE_JWT,
  });

  assert.equal(
    await transport.createSignedUpload(
      "evidence",
      OBJECT_KEY,
      { upsert: false },
    ),
    "http://127.0.0.1:54321/storage/v1/object/upload/sign/evidence/key?token=upload",
  );
  assert.equal(
    await transport.createSignedDownload("evidence", OBJECT_KEY, 300),
    "http://127.0.0.1:54321/storage/v1/object/sign/evidence/key?token=download",
  );
});

test("provider failures are mapped without leaking the provider response", async () => {
  const store = new S3CompatibleBlobStore({
    config: r2Config(),
    transport: {
      async signPut() {
        throw new Error("provider detail with secret");
      },
      async signGet() {
        throw new Error("not used");
      },
      async head() {
        throw new Error("not used");
      },
      async get() {
        throw new Error("not used");
      },
      async deleteObjects() {
        throw new Error("not used");
      },
    },
  });

  await assert.rejects(store.createSignedUpload(DESCRIPTOR), (error) => {
    assert.ok(error instanceof BlobStoreError);
    assert.equal(error.code, "SIGNING_FAILED");
    assert.equal(
      error.message,
      "Unable to sign the immutable object upload.",
    );
    assert.doesNotMatch(error.message, /secret/);
    return true;
  });
});
