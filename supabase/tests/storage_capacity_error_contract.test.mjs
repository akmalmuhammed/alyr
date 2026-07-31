import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { classifyStorageCapacityFailure } from "../functions/_shared/storageCapacity.ts";
import { apiError } from "../functions/_shared/http.ts";

const capacity = readFileSync(
  new URL("../functions/_shared/storageCapacity.ts", import.meta.url),
  "utf8",
);
const api = readFileSync(
  new URL("../functions/api/index.ts", import.meta.url),
  "utf8",
);
const exportsApi = readFileSync(
  new URL("../functions/api/export.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../migrations/202607310008_storage_accounting_and_readiness.sql",
    import.meta.url,
  ),
  "utf8",
);
const openapi = readFileSync(
  new URL("../openapi.yaml", import.meta.url),
  "utf8",
);
const contract = readFileSync(
  new URL("../../packages/contracts/src/core.ts", import.meta.url),
  "utf8",
);
const evidenceClient = readFileSync(
  new URL(
    "../../asset-continuity-native/src/adapters/httpEvidenceUpload.ts",
    import.meta.url,
  ),
  "utf8",
);
const exportClient = readFileSync(
  new URL(
    "../../asset-continuity-native/src/adapters/httpCloudExport.ts",
    import.meta.url,
  ),
  "utf8",
);

test("database household and global storage sentinels share one public failure", () => {
  assert.match(migration, /raise exception 'HOUSEHOLD_STORAGE_LIMIT'/u);
  assert.match(migration, /raise exception 'GLOBAL_STORAGE_LIMIT'/u);
  assert.match(
    capacity,
    /databaseCapacityMarkers[\s\S]*"HOUSEHOLD_STORAGE_LIMIT"[\s\S]*"GLOBAL_STORAGE_LIMIT"/u,
  );
  assert.match(
    capacity,
    /code: "QUOTA_EXCEEDED"[\s\S]*status: 409[\s\S]*retryable: false/u,
  );
  const publicMessage = capacity.match(
    /const publicCapacityFailure[\s\S]*?message:\s*\n?\s*"([^"]+)"/u,
  )?.[1];
  assert.ok(publicMessage, "public capacity guidance is declared");
  assert.doesNotMatch(
    publicMessage,
    /HOUSEHOLD_STORAGE_LIMIT|GLOBAL_STORAGE_LIMIT|supabase|postgres|r2|s3|byte|configured limit|usage total/iu,
  );
  assert.match(publicMessage, /Vault/u);
  assert.match(publicMessage, /support/u);

  const household = classifyStorageCapacityFailure({
    message: "HOUSEHOLD_STORAGE_LIMIT",
  });
  const service = classifyStorageCapacityFailure({
    message: "GLOBAL_STORAGE_LIMIT",
  });
  assert.deepEqual(household, service);
  assert.deepEqual(household, {
    code: "QUOTA_EXCEEDED",
    message: publicMessage,
    status: 409,
    retryable: false,
  });
  assert.equal(
    classifyStorageCapacityFailure({ message: "STORAGE_CONTROL_UNAVAILABLE" }),
    null,
  );
});

test("upload intent maps both database capacity failures before transient storage", () => {
  assert.match(
    api,
    /handleUploadIntent[\s\S]*classifyStorageCapacityFailure\(insertError\)[\s\S]*if \(capacityFailure\)[\s\S]*capacityFailure\.retryable[\s\S]*if \(accountingBusy\)/u,
  );
  assert.doesNotMatch(
    api,
    /const quotaReached = insertError\.message\.includes\("HOUSEHOLD_STORAGE_LIMIT"\)/u,
  );
});

test("export acknowledgement cleanup preserves the same capacity classification", () => {
  assert.match(
    exportsApi,
    /complete_export_snapshot[\s\S]*classifyStorageCapacityFailure\(completionError\)[\s\S]*cleanupStoredArtifact\([\s\S]*quotaExceeded \? "QUOTA_EXCEEDED" : "STORAGE_UNAVAILABLE"[\s\S]*failureMessage[\s\S]*return apiError\([\s\S]*quotaExceeded \? 409 : 503[\s\S]*!quotaExceeded/u,
  );
});

test("OpenAPI and native clients make quota saturation non-retryable", () => {
  assert.match(
    openapi,
    /StorageCapacityErrorEnvelope:[\s\S]*const: QUOTA_EXCEEDED[\s\S]*retryable:[\s\S]*const: false/u,
  );
  assert.match(
    openapi,
    /\/uploads\/intents:[\s\S]*"409":[\s\S]*StorageCapacityErrorEnvelope/u,
  );
  assert.match(
    openapi,
    /\/exports:[\s\S]*Storage[\s\S]*capacity returns QUOTA_EXCEEDED with retryable set to false/u,
  );
  assert.match(
    contract,
    /apiErrorRetryabilityIsValid[\s\S]*code !== "QUOTA_EXCEEDED" \|\| retryable === false/u,
  );
  assert.match(evidenceClient, /apiErrorRetryabilityIsValid/u);
  assert.match(exportClient, /apiErrorRetryabilityIsValid/u);
});

test("the shared HTTP envelope cannot mark quota capacity as retryable", async () => {
  const response = apiError(
    "QUOTA_EXCEEDED",
    "Cloud storage is at capacity.",
    409,
    true,
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: {
      errorVersion: 1,
      code: "QUOTA_EXCEEDED",
      message: "Cloud storage is at capacity.",
      retryable: false,
    },
  });
});
