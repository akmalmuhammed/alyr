import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

import {
  PasswordValidationError,
  hashPassword,
  verifyPassword,
} from "./passwords.mjs";
import {
  MAX_RECOVERY_REQUEST_BYTES,
  RecoveryKitBoundaryError,
  validateEncryptedRecoveryKitUpload,
} from "./recoveryKitBoundary.mjs";
import { LocalDurableStore, LocalStoreError } from "./localStore.mjs";

const AUTH_BODY_LIMIT = 32 * 1024;
const SESSION_COOKIE_NAME = "alyr_local_session";
const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAILURE_LIMIT = 8;
const DEFAULT_BACKUP_HISTORY_LIMIT = 20;
const MAX_BACKUP_HISTORY_LIMIT = 100;
const BACKUP_ROLES = new Set(["owner", "admin"]);

class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

function apiError(message, code = "INVALID_REQUEST", status = 400) {
  throw new ApiError(message, code, status);
}

function nowIso(now) {
  const value = typeof now === "function" ? now() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("Clock is invalid.");
  return date.toISOString();
}

function addMilliseconds(iso, milliseconds) {
  return new Date(Date.parse(iso) + milliseconds).toISOString();
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function newCredential() {
  return randomBytes(32).toString("base64url");
}

function normalizeEmail(value) {
  if (typeof value !== "string") {
    apiError("Enter a valid email address.", "INVALID_EMAIL", 422);
  }
  const email = value.normalize("NFKC").trim().toLowerCase();
  if (
    email.length < 3 ||
    email.length > 254 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u.test(
      email,
    )
  ) {
    apiError("Enter a valid email address.", "INVALID_EMAIL", 422);
  }
  return email;
}

function normalizeText(value, label, maximum) {
  if (typeof value !== "string") {
    apiError(`${label} is required.`, "INVALID_INPUT", 422);
  }
  const normalized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/gu, "")
    .trim();
  if (!normalized || normalized.length > maximum) {
    apiError(
      `${label} must be between 1 and ${maximum} characters.`,
      "INVALID_INPUT",
      422,
    );
  }
  return normalized;
}

function normalizeOptionalId(value, label) {
  if (value == null || value === "") return null;
  if (
    typeof value !== "string" ||
    value.length > 100 ||
    !/^[a-zA-Z0-9_-]+$/u.test(value)
  ) {
    apiError(`${label} is invalid.`, "INVALID_INPUT", 422);
  }
  return value;
}

function normalizeBackupHistoryLimit(value) {
  if (value == null || value === "") return DEFAULT_BACKUP_HISTORY_LIMIT;
  if (!/^[1-9][0-9]*$/u.test(value)) {
    apiError("Backup history limit is invalid.", "INVALID_INPUT", 422);
  }
  const limit = Number(value);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_BACKUP_HISTORY_LIMIT
  ) {
    apiError(
      `Backup history limit must be between 1 and ${MAX_BACKUP_HISTORY_LIMIT}.`,
      "INVALID_INPUT",
      422,
    );
  }
  return limit;
}

function publicBackupMetadata(backup) {
  return {
    backupId: backup.backupId,
    version: backup.version,
    baseBackupId: backup.baseBackupId || null,
    checksum: backup.checksum,
    byteLength: backup.byteLength,
    createdAt: backup.createdAt,
    storedAt: backup.storedAt,
    retention: backup.retention,
  };
}

function requireBackupRole(session) {
  if (!BACKUP_ROLES.has(session?.role)) {
    apiError("This action is unavailable.", "FORBIDDEN", 403);
  }
}

function requireExactKeys(value, requiredKeys, optionalKeys = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    apiError("Request body must be a JSON object.", "INVALID_INPUT", 422);
  }
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      apiError(`Unsupported request field: ${key}`, "INVALID_INPUT", 422);
    }
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) {
      apiError(`Missing request field: ${key}`, "INVALID_INPUT", 422);
    }
  }
  return value;
}

function setSecurityHeaders(response, requestId, secureTransport) {
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  );
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("X-Request-Id", requestId);
  response.setHeader("Cache-Control", "no-store");
  if (secureTransport) {
    response.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
}

function sendJson(response, status, value) {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", body.byteLength);
  response.end(body);
}

function parseCookies(header) {
  if (!header) return new Map();
  if (header.length > 8192) {
    apiError("Authentication is required.", "AUTH_REQUIRED", 401);
  }
  const cookies = new Map();
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (cookies.has(name)) {
      apiError("Authentication is required.", "AUTH_REQUIRED", 401);
    }
    cookies.set(name, value);
  }
  return cookies;
}

function sessionCookie(token, maxAgeSeconds, secure) {
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

function clearSessionCookie(secure) {
  return sessionCookie("", 0, secure);
}

async function readJson(request, maximumBytes) {
  const contentType = request.headers["content-type"] || "";
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    apiError(
      "Content-Type must be application/json.",
      "UNSUPPORTED_MEDIA_TYPE",
      415,
    );
  }
  const contentLength = Number(request.headers["content-length"]);
  if (
    Number.isFinite(contentLength) &&
    (contentLength < 0 || contentLength > maximumBytes)
  ) {
    apiError("Request body is too large.", "PAYLOAD_TOO_LARGE", 413);
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.byteLength;
    if (bytes > maximumBytes) {
      apiError("Request body is too large.", "PAYLOAD_TOO_LARGE", 413);
    }
    chunks.push(chunk);
  }
  if (!bytes) apiError("Request body is required.", "INVALID_INPUT", 422);
  try {
    return JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
  } catch {
    apiError("Request body is not valid JSON.", "INVALID_JSON", 400);
  }
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}

class LoginFailureLimiter {
  #failures = new Map();

  assertAllowed(key, at) {
    const cutoff = at - LOGIN_WINDOW_MS;
    const recent = (this.#failures.get(key) || []).filter(
      (timestamp) => timestamp >= cutoff,
    );
    this.#failures.set(key, recent);
    if (recent.length >= LOGIN_FAILURE_LIMIT) {
      apiError(
        "Too many sign-in attempts. Try again later.",
        "RATE_LIMITED",
        429,
      );
    }
  }

  fail(key, at) {
    const entries = this.#failures.get(key) || [];
    entries.push(at);
    this.#failures.set(key, entries);
  }

  clear(key) {
    this.#failures.delete(key);
  }
}

function normalizeOrigins(input) {
  const values = Array.isArray(input) ? input : input ? [input] : [];
  return new Set(
    values.map((value) => {
      const url = new URL(value);
      return url.origin;
    }),
  );
}

export async function createLocalApiServer({
  dataDirectory,
  allowedOrigins = ["http://localhost:4173"],
  secureCookies = false,
  sessionTtlMs = DEFAULT_SESSION_TTL_MS,
  now = () => new Date(),
  logger = console,
} = {}) {
  if (
    !Number.isSafeInteger(sessionTtlMs) ||
    sessionTtlMs < 60_000 ||
    sessionTtlMs > 30 * 24 * 60 * 60 * 1000
  ) {
    throw new TypeError("sessionTtlMs is outside the supported range.");
  }
  const store = await LocalDurableStore.open({ dataDirectory });
  const origins = normalizeOrigins(allowedOrigins);
  const limiter = new LoginFailureLimiter();

  function validateBrowserSource(request) {
    if (request.headers["sec-fetch-site"] === "cross-site") {
      apiError("This request source is not allowed.", "ORIGIN_DENIED", 403);
    }
    const origin = request.headers.origin;
    if (origin) {
      let normalizedOrigin;
      try {
        normalizedOrigin = new URL(origin).origin;
      } catch {
        apiError("This request source is not allowed.", "ORIGIN_DENIED", 403);
      }
      if (!origins.has(normalizedOrigin)) {
        apiError("This request source is not allowed.", "ORIGIN_DENIED", 403);
      }
    }
  }

  async function authenticate(request) {
    const token = parseCookies(request.headers.cookie).get(SESSION_COOKIE_NAME);
    if (
      typeof token !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/u.test(token)
    ) {
      apiError("Authentication is required.", "AUTH_REQUIRED", 401);
    }
    const sessionHash = sha256Hex(token);
    const session = await store.getSession(sessionHash, nowIso(now));
    if (!session) {
      apiError("Authentication is required.", "AUTH_REQUIRED", 401);
    }
    return { sessionHash, session };
  }

  function requireCsrf(request, session) {
    validateBrowserSource(request);
    const token = request.headers["x-csrf-token"];
    if (!constantTimeEqual(token, session.csrfToken)) {
      apiError(
        "The request could not be verified.",
        "CSRF_INVALID",
        403,
      );
    }
  }

  async function startSession(response, sessionInput) {
    const token = newCredential();
    const sessionHash = sha256Hex(token);
    const csrfToken = newCredential();
    const createdAt = nowIso(now);
    const expiresAt = addMilliseconds(createdAt, sessionTtlMs);
    const session = await sessionInput({
      sessionHash,
      csrfToken,
      now: createdAt,
      expiresAt,
    });
    response.setHeader(
      "Set-Cookie",
      sessionCookie(token, sessionTtlMs / 1000, secureCookies),
    );
    return session;
  }

  async function route(request, response) {
    const url = new URL(request.url, "http://local.invalid");
    const { pathname } = url;
    const method = request.method || "GET";

    if (method === "GET" && pathname === "/api/v1/health") {
      sendJson(response, 200, {
        status: "ok",
        mode: "local-development",
        cloud: false,
        persistence: "local-filesystem",
      });
      return;
    }

    if (method === "POST" && pathname === "/api/v1/auth/register") {
      validateBrowserSource(request);
      const body = requireExactKeys(
        await readJson(request, AUTH_BODY_LIMIT),
        ["email", "password", "displayName"],
        ["householdName"],
      );
      const email = normalizeEmail(body.email);
      const displayName = normalizeText(body.displayName, "Display name", 80);
      const householdName =
        body.householdName == null || body.householdName === ""
          ? null
          : normalizeText(body.householdName, "Household name", 100);
      const passwordRecord = await hashPassword(body.password);
      const session = await startSession(response, (sessionFields) =>
        store.registerWithSession({
          email,
          displayName,
          passwordRecord,
          householdName,
          ...sessionFields,
        }),
      );
      sendJson(response, 201, { session });
      return;
    }

    if (method === "POST" && pathname === "/api/v1/auth/login") {
      validateBrowserSource(request);
      const body = requireExactKeys(
        await readJson(request, AUTH_BODY_LIMIT),
        ["email", "password"],
        ["householdId"],
      );
      const email = normalizeEmail(body.email);
      const limiterKey = `${request.socket.remoteAddress || "local"}\u001f${email}`;
      const at = Date.parse(nowIso(now));
      limiter.assertAllowed(limiterKey, at);
      const account = store.getAccountForLogin(email);
      const valid = await verifyPassword(body.password, account?.password);
      if (!account || !valid) {
        limiter.fail(limiterKey, at);
        apiError(
          "Email or password is incorrect.",
          "INVALID_CREDENTIALS",
          401,
        );
      }
      limiter.clear(limiterKey);
      const requestedHouseholdId = normalizeOptionalId(
        body.householdId,
        "Household",
      );
      const session = await startSession(response, (sessionFields) =>
        store.createSession({
          accountId: account.id,
          requestedHouseholdId,
          ...sessionFields,
        }),
      );
      sendJson(response, 200, { session });
      return;
    }

    if (method === "GET" && pathname === "/api/v1/auth/session") {
      const { session } = await authenticate(request);
      sendJson(response, 200, { session });
      return;
    }

    if (method === "POST" && pathname === "/api/v1/auth/logout") {
      const { sessionHash, session } = await authenticate(request);
      requireCsrf(request, session);
      await store.deleteSession(sessionHash);
      response.setHeader("Set-Cookie", clearSessionCookie(secureCookies));
      sendJson(response, 200, { ok: true });
      return;
    }

    if (method === "GET" && pathname === "/api/v1/access/members") {
      const { session } = await authenticate(request);
      const members = await store.listMembers({
        actorAccountId: session.accountId,
        householdId: session.householdId,
      });
      sendJson(response, 200, { members });
      return;
    }

    if (method === "POST" && pathname === "/api/v1/access/grants") {
      const { session } = await authenticate(request);
      requireCsrf(request, session);
      const body = requireExactKeys(
        await readJson(request, AUTH_BODY_LIMIT),
        ["email", "role"],
      );
      const member = await store.grantMembership({
        actorAccountId: session.accountId,
        householdId: session.householdId,
        email: normalizeEmail(body.email),
        role: normalizeText(body.role, "Role", 20).toLowerCase(),
        now: nowIso(now),
      });
      sendJson(response, 201, { member });
      return;
    }

    if (method === "PUT" && pathname === "/api/v1/vault/backups/latest") {
      const { session } = await authenticate(request);
      requireBackupRole(session);
      requireCsrf(request, session);
      const body = requireExactKeys(
        await readJson(request, MAX_RECOVERY_REQUEST_BYTES),
        ["payload", "checksum", "byteLength", "createdAt"],
        ["baseBackupId"],
      );
      const validated = validateEncryptedRecoveryKitUpload(
        {
          payload: body.payload,
          checksum: body.checksum,
          byteLength: body.byteLength,
          createdAt: body.createdAt,
        },
        {
          householdId: session.householdId,
        },
      );
      const backup = await store.putLatestBackup({
        actorAccountId: session.accountId,
        householdId: session.householdId,
        ...validated,
        baseBackupId: normalizeOptionalId(
          body.baseBackupId,
          "Base backup",
        ),
        baseBackupObserved: Object.hasOwn(body, "baseBackupId"),
        now: nowIso(now),
      });
      sendJson(response, 201, {
        backup: publicBackupMetadata(backup),
      });
      return;
    }

    if (method === "GET" && pathname === "/api/v1/vault/backups/latest") {
      const { session } = await authenticate(request);
      requireBackupRole(session);
      const backup = await store.getLatestBackup({
        actorAccountId: session.accountId,
        householdId: session.householdId,
      });
      sendJson(response, 200, {
        payload: backup.payload,
        ...publicBackupMetadata(backup),
      });
      return;
    }

    if (method === "GET" && pathname === "/api/v1/vault/backups/history") {
      const { session } = await authenticate(request);
      requireBackupRole(session);
      const history = await store.listBackupHistory({
        actorAccountId: session.accountId,
        householdId: session.householdId,
        limit: normalizeBackupHistoryLimit(url.searchParams.get("limit")),
      });
      sendJson(response, 200, history);
      return;
    }

    const exactBackupMatch = pathname.match(
      /^\/api\/v1\/vault\/backups\/([^/]+)$/u,
    );
    if (method === "GET" && exactBackupMatch) {
      const { session } = await authenticate(request);
      requireBackupRole(session);
      const backup = await store.getBackupById({
        actorAccountId: session.accountId,
        householdId: session.householdId,
        backupId: normalizeOptionalId(
          exactBackupMatch[1],
          "Backup",
        ),
      });
      sendJson(response, 200, {
        payload: backup.payload,
        ...publicBackupMetadata(backup),
      });
      return;
    }

    apiError("Endpoint not found.", "NOT_FOUND", 404);
  }

  const server = createServer(async (request, response) => {
    const requestId = randomUUID();
    setSecurityHeaders(response, requestId, secureCookies);
    try {
      await route(request, response);
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const known =
        error instanceof ApiError ||
        error instanceof LocalStoreError ||
        error instanceof RecoveryKitBoundaryError ||
        error instanceof PasswordValidationError;
      const status =
        error instanceof PasswordValidationError
          ? 422
          : known
            ? error.status || 400
            : 500;
      const code =
        error instanceof PasswordValidationError
          ? error.code
          : known
            ? error.code || "REQUEST_FAILED"
            : "INTERNAL_ERROR";
      const message =
        status >= 500
          ? "The local service could not complete this request."
          : error.message;
      if (!known) {
        logger?.error?.("Local API request failed", {
          requestId,
          errorName: error?.name || "Error",
        });
      }
      const details =
        status < 500 && error?.details && typeof error.details === "object"
          ? error.details
          : null;
      sendJson(response, status, {
        error: {
          code,
          message,
          requestId,
          ...(details ? { details } : {}),
        },
      });
    }
  });

  server.headersTimeout = 15_000;
  server.requestTimeout = 180_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 1_000;
  server.on("clientError", (_error, socket) => {
    if (socket.writable) {
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    }
  });

  return {
    server,
    store,
    async listen(port = 0, host = "127.0.0.1") {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve();
        });
      });
      return server.address();
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
