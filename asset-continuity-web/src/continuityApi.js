const API_ROOT = "/api/v1";

export class ContinuityApiError extends Error {
  constructor(message, code = "API_ERROR", status = 0, details = null) {
    super(message);
    this.name = "ContinuityApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function readResponseBody(response) {
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  try {
    const text = await response.text();
    return text ? { message: text } : null;
  } catch {
    return null;
  }
}

function xhrFetch(url, options = {}) {
  if (typeof XMLHttpRequest !== "function") {
    throw new TypeError("No browser request transport is available.");
  }
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(options.method || "GET", url, true);
    request.withCredentials = true;
    Object.entries(options.headers || {}).forEach(([name, value]) => {
      request.setRequestHeader(name, value);
    });
    request.onload = () => {
      const responseText = request.responseText || "";
      resolve({
        ok: request.status >= 200 && request.status < 300,
        status: request.status,
        headers: {
          get(name) {
            return request.getResponseHeader(name);
          },
        },
        async json() {
          return JSON.parse(responseText);
        },
        async text() {
          return responseText;
        },
      });
    };
    request.onerror = () => reject(new TypeError("Network request failed."));
    request.onabort = () => {
      const error = new Error("The request was cancelled.");
      error.name = "AbortError";
      reject(error);
    };
    if (options.signal) {
      if (options.signal.aborted) {
        request.abort();
        return;
      }
      options.signal.addEventListener("abort", () => request.abort(), {
        once: true,
      });
    }
    request.send(options.body);
  });
}

function normalizeSession(value) {
  const source = value?.session || value;
  if (!source || typeof source !== "object" || !source.accountId) return null;
  return {
    accountId: String(source.accountId),
    displayName: String(source.displayName || "Continuity member"),
    email: String(source.email || ""),
    householdId: String(source.householdId || ""),
    householdName: String(source.householdName || "My household"),
    role: String(source.role || "viewer"),
    csrfToken: String(source.csrfToken || ""),
    expiresAt: source.expiresAt ? String(source.expiresAt) : null,
  };
}

export class ContinuityApi {
  constructor({ fetchImpl = globalThis.fetch } = {}) {
    this.fetchImpl = typeof fetchImpl === "function" ? fetchImpl : null;
  }

  async request(path, {
    method = "GET",
    body,
    csrfToken,
    signal,
  } = {}) {
    let response;
    try {
      const requestOptions = {
        method,
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal,
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      };
      response = this.fetchImpl
        ? await this.fetchImpl(`${API_ROOT}${path}`, requestOptions)
        : await xhrFetch(`${API_ROOT}${path}`, requestOptions);
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      if (this.fetchImpl && typeof XMLHttpRequest === "function") {
        try {
          response = await xhrFetch(`${API_ROOT}${path}`, {
            method,
            signal,
            headers: {
              Accept: "application/json",
              ...(body === undefined
                ? {}
                : { "Content-Type": "application/json" }),
              ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          });
        } catch {
          response = null;
        }
      }
      if (response) {
        // Continue through the shared response parser below.
      } else {
      throw new ContinuityApiError(
        "The secure account service is not reachable from this build.",
        "SERVICE_UNAVAILABLE",
      );
      }
    }

    const payload = await readResponseBody(response);
    if (!response.ok) {
      const problem = payload?.error || payload;
      throw new ContinuityApiError(
        problem?.message || "The secure account request could not be completed.",
        problem?.code || `HTTP_${response.status}`,
        response.status,
        problem?.details || null,
      );
    }
    return payload;
  }

  async getSession(options = {}) {
    try {
      return normalizeSession(await this.request("/auth/session", options));
    } catch (error) {
      if (error instanceof ContinuityApiError && error.status === 401) {
        return null;
      }
      throw error;
    }
  }

  async register(
    { displayName, email, password, householdName },
    options = {},
  ) {
    return normalizeSession(
      await this.request("/auth/register", {
        ...options,
        method: "POST",
        body: {
          displayName,
          email,
          password,
          ...(String(householdName || "").trim()
            ? { householdName: String(householdName).trim() }
            : {}),
        },
      }),
    );
  }

  async login({ email, password, householdId }, options = {}) {
    return normalizeSession(
      await this.request("/auth/login", {
        ...options,
        method: "POST",
        body: {
          email,
          password,
          ...(householdId ? { householdId } : {}),
        },
      }),
    );
  }

  async logout(csrfToken, options = {}) {
    return this.request("/auth/logout", {
      ...options,
      method: "POST",
      csrfToken,
      body: {},
    });
  }

  async createBackup(backup, csrfToken, options = {}) {
    const observesBaseBackup = Object.hasOwn(
      options,
      "baseBackupId",
    );
    const { baseBackupId, ...requestOptions } = options;
    return this.request("/vault/backups/latest", {
      ...requestOptions,
      method: "PUT",
      csrfToken,
      body: {
        ...backup,
        ...(observesBaseBackup
          ? { baseBackupId: baseBackupId ?? null }
          : {}),
      },
    });
  }

  async putLatestBackup(backup, csrfToken, options = {}) {
    return this.createBackup(backup, csrfToken, options);
  }

  async getLatestBackup(options = {}) {
    return this.request("/vault/backups/latest", options);
  }

  async getBackupHistory(options = {}) {
    const { limit, ...requestOptions } = options;
    const query = limit == null ? "" : `?limit=${encodeURIComponent(limit)}`;
    return this.request(`/vault/backups/history${query}`, requestOptions);
  }

  async getBackupById(backupId, options = {}) {
    if (typeof backupId !== "string" || !backupId.trim()) {
      throw new TypeError("A backup ID is required.");
    }
    return this.request(
      `/vault/backups/${encodeURIComponent(backupId)}`,
      options,
    );
  }

  async getMembers(options = {}) {
    const payload = await this.request("/access/members", options);
    return Array.isArray(payload?.members) ? payload.members : [];
  }

  async grantAccess({ email, role }, csrfToken, options = {}) {
    return this.request("/access/grants", {
      ...options,
      method: "POST",
      csrfToken,
      body: { email, role },
    });
  }
}

export const continuityApi = new ContinuityApi();
