import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLocalApiServer } from "../server/localApi.mjs";
import { ContinuityApi } from "../src/continuityApi.js";

const APP_ORIGIN = "http://app.local";

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function uploadFromPayload(payload, createdAt) {
  return {
    payload,
    checksum: sha256Hex(Buffer.from(payload, "utf8")),
    byteLength: Buffer.byteLength(payload, "utf8"),
    createdAt,
  };
}

function cookiePair(response) {
  return response.headers.get("set-cookie")?.split(";")[0] || "";
}

function makeRecoveryUpload(householdId, createdAt = "2026-07-25T00:00:00.000Z") {
  const plaintextBytes = 48;
  const ciphertext = randomBytes(plaintextBytes + 62);
  const kit = {
    format: "continuity-encrypted-recovery-kit",
    version: 1,
    createdAt,
    envelope: {
      version: 1,
      context: {
        householdId,
        blobId: "recovery-kit_test-opaque-id",
        purpose: "portable-recovery-kit",
      },
      contentCipher: {
        name: "AES-GCM",
        keyBits: 256,
        tagBits: 128,
        iv: randomBytes(12).toString("base64"),
      },
      wrappedKey: {
        scheme: "PBKDF2-AES-GCM",
        hash: "SHA-256",
        iterations: 310_000,
        salt: randomBytes(16).toString("base64"),
        iv: randomBytes(12).toString("base64"),
        data: randomBytes(48).toString("base64"),
      },
      ciphertext: ciphertext.toString("base64"),
      ciphertextSha256: sha256Hex(ciphertext),
      ciphertextBytes: ciphertext.byteLength,
      plaintextBytes,
      createdAt,
    },
  };
  const payload = JSON.stringify(kit);
  return uploadFromPayload(payload, createdAt);
}

async function startApi(dataDirectory, options = {}) {
  const api = await createLocalApiServer({
    dataDirectory,
    allowedOrigins: [APP_ORIGIN],
    logger: { error() {} },
    ...options,
  });
  const address = await api.listen(0);
  return {
    api,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function jsonRequest(
  baseUrl,
  pathname,
  {
    method = "GET",
    body,
    cookie,
    csrf,
    origin = APP_ORIGIN,
  } = {},
) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  if (csrf) headers["x-csrf-token"] = csrf;
  if (origin) headers.origin = origin;
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json();
  return { response, value };
}

async function register(baseUrl, suffix, householdName = "Archive household") {
  const result = await jsonRequest(baseUrl, "/api/v1/auth/register", {
    method: "POST",
    body: {
      email: `${suffix}@example.test`,
      password: "correct horse battery staple",
      displayName: `User ${suffix}`,
      householdName,
    },
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.value));
  return {
    ...result.value.session,
    cookie: cookiePair(result.response),
    setCookie: result.response.headers.get("set-cookie"),
  };
}

test("continuity client exposes conditional create, history, latest, and exact-version retrieval", async () => {
  const requests = [];
  const api = new ContinuityApi({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        async json() {
          return { ok: true };
        },
      };
    },
  });
  const baseBackupId = "backup_11111111-1111-4111-8111-111111111111";
  await api.createBackup(
    {
      payload: "{}",
      checksum: "0".repeat(64),
      byteLength: 2,
      createdAt: "2026-07-25T00:00:00.000Z",
    },
    "csrf-token",
    { baseBackupId },
  );
  await api.getLatestBackup();
  await api.getBackupHistory({ limit: 7 });
  await api.getBackupById(baseBackupId);
  await api.createBackup(
    {
      payload: "{}",
      checksum: "0".repeat(64),
      byteLength: 2,
      createdAt: "2026-07-25T00:00:00.000Z",
    },
    "csrf-token",
    { baseBackupId: null },
  );

  assert.equal(requests[0].url, "/api/v1/vault/backups/latest");
  assert.equal(requests[0].options.method, "PUT");
  assert.equal(
    JSON.parse(requests[0].options.body).baseBackupId,
    baseBackupId,
  );
  assert.equal(requests[1].url, "/api/v1/vault/backups/latest");
  assert.equal(requests[2].url, "/api/v1/vault/backups/history?limit=7");
  assert.equal(
    requests[3].url,
    `/api/v1/vault/backups/${baseBackupId}`,
  );
  assert.equal(
    JSON.parse(requests[4].options.body).baseBackupId,
    null,
  );
});

test("password registration creates an HttpOnly SameSite session with secure API headers", async (t) => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), "alyr-local-api-auth-"),
  );
  t.after(async () => {
    const resolved = path.resolve(dataDirectory);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir())));
    await rm(resolved, { recursive: true, force: true });
  });
  const { api, baseUrl } = await startApi(dataDirectory);
  t.after(() => api.close());

  const owner = await register(baseUrl, "owner-auth");
  assert.match(owner.setCookie, /HttpOnly/u);
  assert.match(owner.setCookie, /SameSite=Strict/u);
  assert.doesNotMatch(owner.setCookie, /;\s*Secure/u);
  assert.ok(owner.cookie.startsWith("alyr_local_session="));

  const sessionResult = await jsonRequest(
    baseUrl,
    "/api/v1/auth/session",
    { cookie: owner.cookie },
  );
  assert.equal(sessionResult.response.status, 200);
  assert.equal(sessionResult.value.session.accountId, owner.accountId);
  assert.equal(sessionResult.value.session.role, "owner");
  assert.equal(
    sessionResult.value.session.householdName,
    "Archive household",
  );
  assert.equal(
    sessionResult.response.headers.get("x-content-type-options"),
    "nosniff",
  );
  assert.equal(sessionResult.response.headers.get("x-frame-options"), "DENY");
  assert.match(
    sessionResult.response.headers.get("content-security-policy"),
    /default-src 'none'/u,
  );
  assert.equal(sessionResult.response.headers.get("cache-control"), "no-store");

  const crossSite = await jsonRequest(baseUrl, "/api/v1/auth/register", {
    method: "POST",
    origin: "https://attacker.example",
    body: {
      email: "cross-site@example.test",
      password: "correct horse battery staple",
      displayName: "Cross site",
    },
  });
  assert.equal(crossSite.response.status, 403);
  assert.equal(crossSite.value.error.code, "ORIGIN_DENIED");
});

test("encrypted recovery kit requires CSRF, exact checksums and sizes, and survives restart", async (t) => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), "alyr-local-api-backup-"),
  );
  t.after(async () => {
    const resolved = path.resolve(dataDirectory);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir())));
    await rm(resolved, { recursive: true, force: true });
  });

  let running = await startApi(dataDirectory);
  let owner = await register(running.baseUrl, "owner-backup");
  const upload = makeRecoveryUpload(owner.householdId);

  const missingCsrf = await jsonRequest(
    running.baseUrl,
    "/api/v1/vault/backups/latest",
    {
      method: "PUT",
      cookie: owner.cookie,
      body: upload,
    },
  );
  assert.equal(missingCsrf.response.status, 403);
  assert.equal(missingCsrf.value.error.code, "CSRF_INVALID");

  const wrongLength = await jsonRequest(
    running.baseUrl,
    "/api/v1/vault/backups/latest",
    {
      method: "PUT",
      cookie: owner.cookie,
      csrf: owner.csrfToken,
      body: { ...upload, byteLength: upload.byteLength + 1 },
    },
  );
  assert.equal(wrongLength.response.status, 422);
  assert.equal(
    wrongLength.value.error.code,
    "RECOVERY_KIT_SIZE_MISMATCH",
  );

  const wrongChecksum = await jsonRequest(
    running.baseUrl,
    "/api/v1/vault/backups/latest",
    {
      method: "PUT",
      cookie: owner.cookie,
      csrf: owner.csrfToken,
      body: { ...upload, checksum: "0".repeat(64) },
    },
  );
  assert.equal(wrongChecksum.response.status, 422);
  assert.equal(
    wrongChecksum.value.error.code,
    "RECOVERY_KIT_CHECKSUM_MISMATCH",
  );

  const wrongHouseholdKit = JSON.parse(upload.payload);
  wrongHouseholdKit.envelope.context.householdId = "hh_other-household";
  const wrongHousehold = await jsonRequest(
    running.baseUrl,
    "/api/v1/vault/backups/latest",
    {
      method: "PUT",
      cookie: owner.cookie,
      csrf: owner.csrfToken,
      body: uploadFromPayload(
        JSON.stringify(wrongHouseholdKit),
        upload.createdAt,
      ),
    },
  );
  assert.equal(wrongHousehold.response.status, 422);
  assert.equal(
    wrongHousehold.value.error.code,
    "RECOVERY_KIT_CONTEXT_MISMATCH",
  );

  const tamperedCiphertextKit = JSON.parse(upload.payload);
  const ciphertext = tamperedCiphertextKit.envelope.ciphertext;
  tamperedCiphertextKit.envelope.ciphertext =
    `${ciphertext[0] === "A" ? "B" : "A"}${ciphertext.slice(1)}`;
  const tamperedCiphertext = await jsonRequest(
    running.baseUrl,
    "/api/v1/vault/backups/latest",
    {
      method: "PUT",
      cookie: owner.cookie,
      csrf: owner.csrfToken,
      body: uploadFromPayload(
        JSON.stringify(tamperedCiphertextKit),
        upload.createdAt,
      ),
    },
  );
  assert.equal(tamperedCiphertext.response.status, 422);
  assert.equal(
    tamperedCiphertext.value.error.code,
    "RECOVERY_KIT_CHECKSUM_MISMATCH",
  );

  const uploadResult = await jsonRequest(
    running.baseUrl,
    "/api/v1/vault/backups/latest",
    {
      method: "PUT",
      cookie: owner.cookie,
      csrf: owner.csrfToken,
      body: upload,
    },
  );
  assert.equal(uploadResult.response.status, 201, JSON.stringify(uploadResult.value));
  assert.match(uploadResult.value.backup.backupId, /^backup_[a-f0-9-]+$/u);
  assert.equal(uploadResult.value.backup.version, 1);
  assert.equal(uploadResult.value.backup.baseBackupId, null);
  assert.equal(uploadResult.value.backup.checksum, upload.checksum);
  assert.equal(uploadResult.value.backup.byteLength, upload.byteLength);
  assert.equal(uploadResult.value.backup.createdAt, upload.createdAt);
  assert.deepEqual(uploadResult.value.backup.retention, {
    policy: "retain-all",
    automaticDeletion: false,
    deleteAfter: null,
  });

  const firstDownload = await jsonRequest(
    running.baseUrl,
    "/api/v1/vault/backups/latest",
    { cookie: owner.cookie },
  );
  assert.equal(firstDownload.response.status, 200);
  assert.equal(firstDownload.value.payload, upload.payload);
  assert.equal(firstDownload.value.checksum, upload.checksum);
  assert.equal(
    firstDownload.value.backupId,
    uploadResult.value.backup.backupId,
  );

  const persistedState = JSON.parse(
    await readFile(path.join(dataDirectory, "state.json"), "utf8"),
  );
  assert.equal(persistedState.version, 2);
  assert.equal(
    persistedState.backups[owner.householdId].latestBackupId,
    uploadResult.value.backup.backupId,
  );
  assert.equal(
    persistedState.backups[owner.householdId].records[0].checksum,
    upload.checksum,
  );

  await running.api.close();
  running = await startApi(dataDirectory);
  t.after(() => running.api.close());

  const restoredSession = await jsonRequest(
    running.baseUrl,
    "/api/v1/auth/session",
    { cookie: owner.cookie },
  );
  assert.equal(restoredSession.response.status, 200);
  assert.equal(restoredSession.value.session.accountId, owner.accountId);

  const loginAfterRestart = await jsonRequest(
    running.baseUrl,
    "/api/v1/auth/login",
    {
      method: "POST",
      body: {
        email: "owner-backup@example.test",
        password: "correct horse battery staple",
        householdId: owner.householdId,
      },
    },
  );
  assert.equal(loginAfterRestart.response.status, 200);
  owner = {
    ...loginAfterRestart.value.session,
    cookie: cookiePair(loginAfterRestart.response),
  };

  const afterRestart = await jsonRequest(
    running.baseUrl,
    "/api/v1/vault/backups/latest",
    { cookie: owner.cookie },
  );
  assert.equal(afterRestart.response.status, 200);
  assert.equal(afterRestart.value.payload, upload.payload);
});

test("backup history is append-only, rejects stale admin uploads, and retrieves exact versions after restart", async (t) => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), "alyr-local-api-history-"),
  );
  t.after(async () => {
    const resolved = path.resolve(dataDirectory);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir())));
    await rm(resolved, { recursive: true, force: true });
  });

  let running = await startApi(dataDirectory);
  t.after(() => running.api.close());
  const owner = await register(
    running.baseUrl,
    "history-owner",
    "Versioned archive",
  );
  await register(
    running.baseUrl,
    "history-admin",
    "Admin personal archive",
  );
  await register(
    running.baseUrl,
    "history-viewer",
    "Viewer personal archive",
  );

  const grantAdmin = await jsonRequest(
    running.baseUrl,
    "/api/v1/access/grants",
    {
      method: "POST",
      cookie: owner.cookie,
      csrf: owner.csrfToken,
      body: { email: "history-admin@example.test", role: "admin" },
    },
  );
  assert.equal(grantAdmin.response.status, 201);
  const grantViewer = await jsonRequest(
    running.baseUrl,
    "/api/v1/access/grants",
    {
      method: "POST",
      cookie: owner.cookie,
      csrf: owner.csrfToken,
      body: { email: "history-viewer@example.test", role: "viewer" },
    },
  );
  assert.equal(grantViewer.response.status, 201);

  const adminLogin = await jsonRequest(
    running.baseUrl,
    "/api/v1/auth/login",
    {
      method: "POST",
      body: {
        email: "history-admin@example.test",
        password: "correct horse battery staple",
        householdId: owner.householdId,
      },
    },
  );
  assert.equal(adminLogin.response.status, 200);
  const admin = {
    ...adminLogin.value.session,
    cookie: cookiePair(adminLogin.response),
  };
  assert.equal(admin.role, "admin");

  const viewerLogin = await jsonRequest(
    running.baseUrl,
    "/api/v1/auth/login",
    {
      method: "POST",
      body: {
        email: "history-viewer@example.test",
        password: "correct horse battery staple",
        householdId: owner.householdId,
      },
    },
  );
  assert.equal(viewerLogin.response.status, 200);
  const viewer = {
    ...viewerLogin.value.session,
    cookie: cookiePair(viewerLogin.response),
  };

  const firstUpload = makeRecoveryUpload(
    owner.householdId,
    "2026-07-25T01:00:00.000Z",
  );
  const firstStored = await jsonRequest(
    running.baseUrl,
    "/api/v1/vault/backups/latest",
    {
      method: "PUT",
      cookie: owner.cookie,
      csrf: owner.csrfToken,
      body: {
        ...firstUpload,
        baseBackupId: null,
      },
    },
  );
  assert.equal(firstStored.response.status, 201);
  const first = firstStored.value.backup;
  assert.equal(first.version, 1);

  const competingFirst = await jsonRequest(
    running.baseUrl,
    "/api/v1/vault/backups/latest",
    {
      method: "PUT",
      cookie: admin.cookie,
      csrf: admin.csrfToken,
      body: {
        ...makeRecoveryUpload(
          owner.householdId,
          "2026-07-25T01:30:00.000Z",
        ),
        baseBackupId: null,
      },
    },
  );
  assert.equal(competingFirst.response.status, 409);
  assert.equal(competingFirst.value.error.code, "BACKUP_STALE");
  assert.equal(
    competingFirst.value.error.details.latest.backupId,
    first.backupId,
  );

  const adminObserved = await jsonRequest(
    running.baseUrl,
    "/api/v1/vault/backups/latest",
    { cookie: admin.cookie },
  );
  assert.equal(adminObserved.response.status, 200);
  assert.equal(adminObserved.value.backupId, first.backupId);

  const secondUpload = makeRecoveryUpload(
    owner.householdId,
    "2026-07-25T02:00:00.000Z",
  );
  const secondStored = await jsonRequest(
    running.baseUrl,
    "/api/v1/vault/backups/latest",
    {
      method: "PUT",
      cookie: owner.cookie,
      csrf: owner.csrfToken,
      body: {
        ...secondUpload,
        baseBackupId: first.backupId,
      },
    },
  );
  assert.equal(secondStored.response.status, 201);
  const second = secondStored.value.backup;
  assert.equal(second.version, 2);
  assert.equal(second.baseBackupId, first.backupId);

  const staleUpload = makeRecoveryUpload(
    owner.householdId,
    "2026-07-25T03:00:00.000Z",
  );
  const stale = await jsonRequest(
    running.baseUrl,
    "/api/v1/vault/backups/latest",
    {
      method: "PUT",
      cookie: admin.cookie,
      csrf: admin.csrfToken,
      body: {
        ...staleUpload,
        baseBackupId: first.backupId,
      },
    },
  );
  assert.equal(stale.response.status, 409);
  assert.equal(stale.value.error.code, "BACKUP_STALE");
  assert.equal(stale.value.error.details.latest.backupId, second.backupId);
  assert.equal(stale.value.error.details.latest.version, 2);
  assert.equal(
    stale.value.error.details.latest.checksum,
    secondUpload.checksum,
  );
  assert.equal("payload" in stale.value.error.details.latest, false);
  assert.equal(
    "uploadedByAccountId" in stale.value.error.details.latest,
    false,
  );

  const history = await jsonRequest(
    running.baseUrl,
    "/api/v1/vault/backups/history",
    { cookie: admin.cookie },
  );
  assert.equal(history.response.status, 200);
  assert.equal(history.value.total, 2);
  assert.equal(history.value.latestBackupId, second.backupId);
  assert.deepEqual(
    history.value.backups.map((backup) => [
      backup.backupId,
      backup.version,
    ]),
    [
      [second.backupId, 2],
      [first.backupId, 1],
    ],
  );
  assert.deepEqual(history.value.retention, {
    policy: "retain-all",
    automaticDeletion: false,
    deleteAfter: null,
    historyLimitApplied: 20,
  });

  const boundedHistory = await jsonRequest(
    running.baseUrl,
    "/api/v1/vault/backups/history?limit=1",
    { cookie: owner.cookie },
  );
  assert.equal(boundedHistory.response.status, 200);
  assert.equal(boundedHistory.value.total, 2);
  assert.equal(boundedHistory.value.backups.length, 1);
  assert.equal(boundedHistory.value.backups[0].backupId, second.backupId);
  assert.equal(boundedHistory.value.retention.historyLimitApplied, 1);
  const excessiveHistory = await jsonRequest(
    running.baseUrl,
    "/api/v1/vault/backups/history?limit=101",
    { cookie: owner.cookie },
  );
  assert.equal(excessiveHistory.response.status, 422);
  assert.equal(excessiveHistory.value.error.code, "INVALID_INPUT");

  const oldVersion = await jsonRequest(
    running.baseUrl,
    `/api/v1/vault/backups/${first.backupId}`,
    { cookie: admin.cookie },
  );
  assert.equal(oldVersion.response.status, 200);
  assert.equal(oldVersion.value.backupId, first.backupId);
  assert.equal(oldVersion.value.version, 1);
  assert.equal(oldVersion.value.payload, firstUpload.payload);

  for (const pathname of [
    "/api/v1/vault/backups/latest",
    "/api/v1/vault/backups/history",
    `/api/v1/vault/backups/${first.backupId}`,
  ]) {
    const denied = await jsonRequest(running.baseUrl, pathname, {
      cookie: viewer.cookie,
    });
    assert.equal(denied.response.status, 403);
    assert.equal(denied.value.error.code, "FORBIDDEN");
  }
  const deniedUpload = await jsonRequest(
    running.baseUrl,
    "/api/v1/vault/backups/latest",
    {
      method: "PUT",
      cookie: viewer.cookie,
      csrf: viewer.csrfToken,
      body: staleUpload,
    },
  );
  assert.equal(deniedUpload.response.status, 403);
  assert.equal(deniedUpload.value.error.code, "FORBIDDEN");

  const persistedState = JSON.parse(
    await readFile(path.join(dataDirectory, "state.json"), "utf8"),
  );
  const persistedVault = persistedState.backups[owner.householdId];
  assert.equal(persistedVault.records.length, 2);
  assert.equal(persistedVault.latestBackupId, second.backupId);
  assert.deepEqual(
    persistedVault.records.map((backup) => backup.backupId),
    [first.backupId, second.backupId],
  );

  await running.api.close();
  running = await startApi(dataDirectory);

  const restartedHistory = await jsonRequest(
    running.baseUrl,
    "/api/v1/vault/backups/history",
    { cookie: owner.cookie },
  );
  assert.equal(restartedHistory.response.status, 200);
  assert.deepEqual(
    restartedHistory.value.backups.map((backup) => backup.backupId),
    [second.backupId, first.backupId],
  );
  const restartedOldVersion = await jsonRequest(
    running.baseUrl,
    `/api/v1/vault/backups/${first.backupId}`,
    { cookie: owner.cookie },
  );
  assert.equal(restartedOldVersion.response.status, 200);
  assert.equal(restartedOldVersion.value.payload, firstUpload.payload);
});

test("household roles are enforced on member and whole-vault backup access", async (t) => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), "alyr-local-api-roles-"),
  );
  t.after(async () => {
    const resolved = path.resolve(dataDirectory);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir())));
    await rm(resolved, { recursive: true, force: true });
  });
  const { api, baseUrl } = await startApi(dataDirectory);
  t.after(() => api.close());

  const owner = await register(baseUrl, "owner-roles", "Shared archive");
  await register(baseUrl, "member-roles", "Member personal archive");

  const grantViewer = await jsonRequest(
    baseUrl,
    "/api/v1/access/grants",
    {
      method: "POST",
      cookie: owner.cookie,
      csrf: owner.csrfToken,
      body: { email: "member-roles@example.test", role: "viewer" },
    },
  );
  assert.equal(grantViewer.response.status, 201);
  assert.equal(grantViewer.value.member.status, "active");
  assert.equal(grantViewer.value.member.role, "viewer");

  const viewerLogin = await jsonRequest(baseUrl, "/api/v1/auth/login", {
    method: "POST",
    body: {
      email: "member-roles@example.test",
      password: "correct horse battery staple",
      householdId: owner.householdId,
    },
  });
  assert.equal(viewerLogin.response.status, 200);
  const viewer = {
    ...viewerLogin.value.session,
    cookie: cookiePair(viewerLogin.response),
  };
  assert.equal(viewer.role, "viewer");

  const viewerMembers = await jsonRequest(
    baseUrl,
    "/api/v1/access/members",
    { cookie: viewer.cookie },
  );
  assert.equal(viewerMembers.response.status, 403);
  assert.equal(viewerMembers.value.error.code, "FORBIDDEN");

  const viewerBackup = await jsonRequest(
    baseUrl,
    "/api/v1/vault/backups/latest",
    { cookie: viewer.cookie },
  );
  assert.equal(viewerBackup.response.status, 403);

  const promote = await jsonRequest(baseUrl, "/api/v1/access/grants", {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrfToken,
    body: { email: "member-roles@example.test", role: "admin" },
  });
  assert.equal(promote.response.status, 201);
  assert.equal(promote.value.member.role, "admin");

  const adminMembers = await jsonRequest(
    baseUrl,
    "/api/v1/access/members",
    { cookie: viewer.cookie },
  );
  assert.equal(adminMembers.response.status, 200);
  assert.equal(adminMembers.value.members.length, 2);

  const adminCannotGrantAdmin = await jsonRequest(
    baseUrl,
    "/api/v1/access/grants",
    {
      method: "POST",
      cookie: viewer.cookie,
      csrf: viewer.csrfToken,
      body: { email: "pending@example.test", role: "admin" },
    },
  );
  assert.equal(adminCannotGrantAdmin.response.status, 403);

  const adminCanInviteViewer = await jsonRequest(
    baseUrl,
    "/api/v1/access/grants",
    {
      method: "POST",
      cookie: viewer.cookie,
      csrf: viewer.csrfToken,
      body: { email: "pending@example.test", role: "viewer" },
    },
  );
  assert.equal(adminCanInviteViewer.response.status, 201);
  assert.equal(adminCanInviteViewer.value.member.status, "pending");
});

test("download revalidates the content-addressed object before returning it", async (t) => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), "alyr-local-api-corrupt-"),
  );
  t.after(async () => {
    const resolved = path.resolve(dataDirectory);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir())));
    await rm(resolved, { recursive: true, force: true });
  });
  const { api, baseUrl } = await startApi(dataDirectory);
  t.after(() => api.close());

  const owner = await register(baseUrl, "owner-corrupt");
  const upload = makeRecoveryUpload(owner.householdId);
  const stored = await jsonRequest(
    baseUrl,
    "/api/v1/vault/backups/latest",
    {
      method: "PUT",
      cookie: owner.cookie,
      csrf: owner.csrfToken,
      body: upload,
    },
  );
  assert.equal(stored.response.status, 201);

  const objectPath = path.join(
    dataDirectory,
    "vault",
    owner.householdId,
    `${upload.checksum}.alyr`,
  );
  await writeFile(objectPath, "tampered", "utf8");

  const download = await jsonRequest(
    baseUrl,
    "/api/v1/vault/backups/latest",
    { cookie: owner.cookie },
  );
  assert.equal(download.response.status, 500);
  assert.equal(download.value.error.code, "STORED_BACKUP_CORRUPT");
  assert.equal(
    download.value.error.message,
    "The local service could not complete this request.",
  );
});

test("logout is CSRF protected and revokes the persisted session", async (t) => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), "alyr-local-api-logout-"),
  );
  t.after(async () => {
    const resolved = path.resolve(dataDirectory);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir())));
    await rm(resolved, { recursive: true, force: true });
  });
  const { api, baseUrl } = await startApi(dataDirectory);
  t.after(() => api.close());

  const owner = await register(baseUrl, "owner-logout");
  const denied = await jsonRequest(baseUrl, "/api/v1/auth/logout", {
    method: "POST",
    cookie: owner.cookie,
  });
  assert.equal(denied.response.status, 403);

  const loggedOut = await jsonRequest(baseUrl, "/api/v1/auth/logout", {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrfToken,
  });
  assert.equal(loggedOut.response.status, 200);
  assert.match(loggedOut.response.headers.get("set-cookie"), /Max-Age=0/u);

  const session = await jsonRequest(baseUrl, "/api/v1/auth/session", {
    cookie: owner.cookie,
  });
  assert.equal(session.response.status, 401);
});
