import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SHARED = path.join(ROOT, "supabase", "functions", "_shared");

async function source(name) {
  return await readFile(path.join(SHARED, name), "utf8");
}

test("provider SDK dependencies are exact, reviewed versions", async () => {
  const [aws, factory] = await Promise.all([
    source("blobStoreS3Aws.ts"),
    source("blobStoreFactory.ts"),
  ]);
  const npmSpecifiers = [...`${aws}\n${factory}`.matchAll(/npm:[^"'\s)]+/g)]
    .map((match) => match[0])
    .sort();

  assert.deepEqual(npmSpecifiers, [
    "npm:@aws-sdk/client-s3@3.1098.0",
    "npm:@aws-sdk/s3-request-presigner@3.1098.0",
    "npm:@supabase/supabase-js@2.111.0",
  ]);
});

test("AWS signing statically binds overwrite and verification headers", async () => {
  const aws = await source("blobStoreS3Aws.ts");
  for (const requiredFragment of [
    "IfNoneMatch: request.ifNoneMatch",
    'signableHeaders: new Set(["content-type", "if-none-match"])',
    "unhoistableHeaders: metadataHeaders",
    'requestChecksumCalculation: "WHEN_REQUIRED"',
    'responseChecksumValidation: "WHEN_REQUIRED"',
  ]) {
    assert.ok(
      aws.includes(requiredFragment),
      `missing required AWS signing fragment: ${requiredFragment}`,
    );
  }
  assert.doesNotMatch(aws, /ChecksumSHA256/);
});

test("canonical core identifiers contain no provider endpoint or URL shape", async () => {
  const core = await source("blobStore.ts");
  assert.doesNotMatch(core, /r2\.cloudflarestorage\.com/);
  assert.doesNotMatch(core, /supabase\.co/);
  assert.doesNotMatch(core, /storage\/v1/);
  assert.match(
    core,
    /return `\$\{householdId\}\/\$\{blobId\}\/\$\{versionId\}`/,
  );
});

test("integration note documents active wiring and primary provider references", async () => {
  const note = await source("BLOB_STORE_INTEGRATION.md");
  for (const requiredReference of [
    "https://developers.cloudflare.com/r2/api/s3/presigned-urls/",
    "https://developers.cloudflare.com/r2/api/s3/api/",
    "https://developers.cloudflare.com/r2/buckets/cors/",
    "https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-request-presigner/",
    "https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl",
    "https://supabase.com/docs/guides/storage/uploads/standard-uploads",
  ]) {
    assert.ok(
      note.includes(requiredReference),
      `missing primary reference: ${requiredReference}`,
    );
  }
  assert.match(note, /active provider-neutral Evidence object boundary/);
  assert.match(note, /streamed completion\s+verification/);
  assert.match(note, /object_key.*canonical identifier/s);
  assert.match(note, /Never place S3 credentials/);
});

test("the active API uses BlobStore rather than provider-specific Evidence calls", async () => {
  const api = await readFile(
    path.join(ROOT, "supabase", "functions", "api", "index.ts"),
    "utf8",
  );
  assert.match(api, /createBlobStoreFromEnv/);
  assert.match(api, /store\.createSignedUpload/);
  assert.match(api, /store\.openReadStream/);
  assert.match(api, /store\.createSignedDownload/);
  assert.match(api, /store\.deleteBatch/);
  assert.doesNotMatch(
    api,
    /context\.client\.storage[\s\S]{0,100}\.from\("evidence"\)/,
  );
});

test("blob cleanup is bounded, token-gated, and pointer-acknowledged", async () => {
  const api = await readFile(
    path.join(ROOT, "supabase", "functions", "api", "index.ts"),
    "utf8",
  );
  const controls = await readFile(
    path.join(
      ROOT,
      "supabase",
      "functions",
      "_shared",
      "requestControls.ts",
    ),
    "utf8",
  );
  assert.match(api, /path === "\/maintenance\/blobs"/);
  assert.match(api, /maintenanceTokenMatches\(suppliedToken\)/);
  assert.match(api, /"enqueue_blob_object_cleanup"[\s\S]*p_limit: 100/);
  assert.match(api, /"claim_blob_object_cleanup"[\s\S]*p_limit: 25/);
  assert.match(api, /store\.deleteBatch/);
  assert.match(api, /"complete_blob_object_cleanup"/);
  assert.match(api, /"release_blob_object_cleanup"/);
  assert.match(controls, /POST \/maintenance\/blobs/);
});

test("new blob-store sources contain no ad-hoc console logging", async () => {
  const names = [
    "blobStore.ts",
    "blobStoreConfig.ts",
    "blobStoreFactory.ts",
    "blobStoreS3.ts",
    "blobStoreS3Aws.ts",
    "blobStoreSupabase.ts",
  ];
  const contents = await Promise.all(names.map(source));
  for (let index = 0; index < names.length; index += 1) {
    assert.doesNotMatch(
      contents[index],
      /\bconsole\.(?:debug|info|log|warn|error)\s*\(/,
      `${names[index]} must not emit URLs or credentials to console output`,
    );
  }
});
