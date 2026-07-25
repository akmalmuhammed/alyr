import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";

const STATE_VERSION = 2;
const LEGACY_STATE_VERSION = 1;
const ACCOUNT_ROLES = new Set([
  "owner",
  "admin",
  "editor",
  "contributor",
  "viewer",
]);
const BACKUP_ROLES = new Set(["owner", "admin"]);
const MEMBER_ADMIN_ROLES = new Set(["owner", "admin"]);
const BACKUP_RETENTION = Object.freeze({
  policy: "retain-all",
  automaticDeletion: false,
  deleteAfter: null,
});

export class LocalStoreError extends Error {
  constructor(message, code, status, details = null) {
    super(message);
    this.name = "LocalStoreError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function storeError(
  message,
  code = "STORE_ERROR",
  status = 500,
  details = null,
) {
  throw new LocalStoreError(message, code, status, details);
}

function emptyState() {
  return {
    version: STATE_VERSION,
    accounts: [],
    households: [],
    memberships: [],
    sessions: [],
    backups: {},
  };
}

function clone(value) {
  return structuredClone(value);
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function opaqueId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function backupRetention() {
  return clone(BACKUP_RETENTION);
}

function createBackupVault(records = []) {
  const copied = records.map((record) => clone(record));
  return {
    latestBackupId: copied.at(-1)?.backupId || null,
    nextVersion: (copied.at(-1)?.version || 0) + 1,
    retention: backupRetention(),
    records: copied,
  };
}

function migrateLegacyState(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.version !== LEGACY_STATE_VERSION
  ) {
    return { state: value, migrated: false };
  }
  if (
    !Array.isArray(value.accounts) ||
    !Array.isArray(value.households) ||
    !Array.isArray(value.memberships) ||
    !Array.isArray(value.sessions) ||
    !value.backups ||
    typeof value.backups !== "object" ||
    Array.isArray(value.backups)
  ) {
    return { state: value, migrated: false };
  }
  const next = clone(value);
  next.version = STATE_VERSION;
  next.backups = Object.fromEntries(
    Object.entries(value.backups).map(([householdId, metadata]) => {
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return [householdId, metadata];
      }
      const record = {
        backupId: opaqueId("backup"),
        version: 1,
        baseBackupId: null,
        ...clone(metadata),
        retention: backupRetention(),
      };
      return [householdId, createBackupVault([record])];
    }),
  );
  return { state: next, migrated: true };
}

function assertStateShape(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.version !== STATE_VERSION ||
    !Array.isArray(value.accounts) ||
    !Array.isArray(value.households) ||
    !Array.isArray(value.memberships) ||
    !Array.isArray(value.sessions) ||
    !value.backups ||
    typeof value.backups !== "object" ||
    Array.isArray(value.backups)
  ) {
    storeError(
      "Local server state is unreadable. It was preserved and not reset.",
      "STATE_CORRUPT",
      500,
    );
  }
  const unique = (items, field) => {
    const seen = new Set();
    for (const item of items) {
      const id = item?.[field];
      if (typeof id !== "string" || !id || seen.has(id)) {
        storeError(
          "Local server state contains invalid or duplicate identifiers.",
          "STATE_CORRUPT",
          500,
        );
      }
      seen.add(id);
    }
  };
  unique(value.accounts, "id");
  unique(value.households, "id");
  unique(value.memberships, "id");
  unique(value.sessions, "sessionHash");
  const backupIds = new Set();
  for (const [householdId, vault] of Object.entries(value.backups)) {
    if (
      typeof householdId !== "string" ||
      !householdId ||
      !vault ||
      typeof vault !== "object" ||
      Array.isArray(vault) ||
      !Array.isArray(vault.records) ||
      !Number.isSafeInteger(vault.nextVersion) ||
      vault.nextVersion < 1 ||
      !vault.retention ||
      vault.retention.policy !== BACKUP_RETENTION.policy ||
      vault.retention.automaticDeletion !== false
    ) {
      storeError(
        "Local server state contains invalid backup history.",
        "STATE_CORRUPT",
        500,
      );
    }
    let expectedVersion = 1;
    for (const record of vault.records) {
      if (
        !record ||
        typeof record !== "object" ||
        typeof record.backupId !== "string" ||
        !record.backupId ||
        backupIds.has(record.backupId) ||
        record.version !== expectedVersion ||
        typeof record.checksum !== "string" ||
        !/^[a-f0-9]{64}$/u.test(record.checksum) ||
        !Number.isSafeInteger(record.byteLength) ||
        record.byteLength < 1 ||
        record.retention?.policy !== BACKUP_RETENTION.policy ||
        record.retention?.automaticDeletion !== false
      ) {
        storeError(
          "Local server state contains invalid backup history.",
          "STATE_CORRUPT",
          500,
        );
      }
      if (
        expectedVersion === 1
          ? record.baseBackupId != null
          : record.baseBackupId != null &&
            typeof record.baseBackupId !== "string"
      ) {
        storeError(
          "Local server state contains invalid backup ancestry.",
          "STATE_CORRUPT",
          500,
        );
      }
      backupIds.add(record.backupId);
      expectedVersion += 1;
    }
    const latest = vault.records.at(-1) || null;
    if (
      vault.latestBackupId !== (latest?.backupId || null) ||
      vault.nextVersion !== (latest?.version || 0) + 1
    ) {
      storeError(
        "Local server state contains an invalid latest-backup pointer.",
        "STATE_CORRUPT",
        500,
      );
    }
  }
  return value;
}

async function syncDirectory(directory) {
  let handle;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } catch (error) {
    if (
      !["EISDIR", "EINVAL", "EPERM", "EBADF", "ENOTSUP"].includes(error?.code)
    ) {
      throw error;
    }
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function atomicWriteFile(filePath, bytes) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporaryPath, filePath);
    await chmod(filePath, 0o600).catch(() => {});
    await syncDirectory(directory);
  } catch (error) {
    await handle?.close().catch(() => {});
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

function activeMembership(state, accountId, householdId) {
  return state.memberships.find(
    (item) =>
      item.accountId === accountId &&
      item.householdId === householdId &&
      item.status === "active",
  );
}

function requireMembership(state, accountId, householdId, roles = null) {
  const membership = activeMembership(state, accountId, householdId);
  if (!membership || (roles && !roles.has(membership.role))) {
    storeError(
      "This action is unavailable.",
      "FORBIDDEN",
      403,
    );
  }
  return membership;
}

function findAccountByEmail(state, email) {
  return state.accounts.find((item) => item.email === email) || null;
}

function materializeSession(state, session) {
  const account = state.accounts.find((item) => item.id === session.accountId);
  const household = state.households.find(
    (item) => item.id === session.householdId,
  );
  const membership = activeMembership(
    state,
    session.accountId,
    session.householdId,
  );
  if (!account || !household || !membership) return null;
  return {
    accountId: account.id,
    displayName: account.displayName,
    email: account.email,
    householdId: household.id,
    householdName: household.name,
    role: membership.role,
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
  };
}

function publicMember(state, membership) {
  const account = membership.accountId
    ? state.accounts.find((item) => item.id === membership.accountId)
    : null;
  return {
    membershipId: membership.id,
    accountId: account?.id || null,
    displayName: account?.displayName || null,
    email: membership.email,
    role: membership.role,
    status: membership.status,
    joinedAt: membership.joinedAt || null,
    updatedAt: membership.updatedAt,
  };
}

function safeBackupMetadata(record) {
  if (!record) return null;
  return {
    backupId: record.backupId,
    version: record.version,
    baseBackupId: record.baseBackupId || null,
    checksum: record.checksum,
    byteLength: record.byteLength,
    createdAt: record.createdAt,
    storedAt: record.storedAt,
    retention: clone(record.retention),
  };
}

export class LocalDurableStore {
  #dataDirectory;
  #statePath;
  #objectsDirectory;
  #state;
  #writeChain = Promise.resolve();

  constructor(dataDirectory, state) {
    this.#dataDirectory = path.resolve(dataDirectory);
    this.#statePath = path.join(this.#dataDirectory, "state.json");
    this.#objectsDirectory = path.join(this.#dataDirectory, "vault");
    this.#state = assertStateShape(state);
  }

  static async open({ dataDirectory }) {
    if (typeof dataDirectory !== "string" || !dataDirectory.trim()) {
      throw new TypeError("A local server data directory is required.");
    }
    const absolute = path.resolve(dataDirectory);
    await mkdir(absolute, { recursive: true, mode: 0o700 });
    const statePath = path.join(absolute, "state.json");
    let state;
    try {
      state = JSON.parse(await readFile(statePath, "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") {
        if (error instanceof SyntaxError) {
          storeError(
            "Local server state is unreadable. It was preserved and not reset.",
            "STATE_CORRUPT",
            500,
          );
        }
        throw error;
      }
      state = emptyState();
      await atomicWriteFile(
        statePath,
        Buffer.from(`${JSON.stringify(state)}\n`, "utf8"),
      );
    }
    const migrated = migrateLegacyState(state);
    state = assertStateShape(migrated.state);
    if (migrated.migrated) {
      await atomicWriteFile(
        statePath,
        Buffer.from(`${JSON.stringify(state)}\n`, "utf8"),
      );
    }
    return new LocalDurableStore(absolute, state);
  }

  get dataDirectory() {
    return this.#dataDirectory;
  }

  async #exclusive(task) {
    const run = this.#writeChain.then(task, task);
    this.#writeChain = run.catch(() => {});
    return run;
  }

  async #commit(nextState) {
    assertStateShape(nextState);
    await atomicWriteFile(
      this.#statePath,
      Buffer.from(`${JSON.stringify(nextState)}\n`, "utf8"),
    );
    this.#state = nextState;
  }

  getAccountForLogin(email) {
    const account = findAccountByEmail(this.#state, email);
    return account ? clone(account) : null;
  }

  async registerWithSession({
    email,
    displayName,
    passwordRecord,
    householdName,
    sessionHash,
    csrfToken,
    expiresAt,
    now,
  }) {
    return this.#exclusive(async () => {
      const next = clone(this.#state);
      if (findAccountByEmail(next, email)) {
        storeError(
          "An account with this email already exists.",
          "ACCOUNT_EXISTS",
          409,
        );
      }
      const account = {
        id: opaqueId("acct"),
        email,
        displayName,
        password: clone(passwordRecord),
        createdAt: now,
        updatedAt: now,
        lastHouseholdId: null,
      };
      next.accounts.push(account);

      const pending = next.memberships
        .filter((item) => item.email === email && item.status === "pending")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      for (const membership of pending) {
        membership.accountId = account.id;
        membership.status = "active";
        membership.joinedAt = now;
        membership.updatedAt = now;
      }

      let selectedMembership = !householdName ? pending[0] || null : null;
      if (!selectedMembership) {
        const household = {
          id: opaqueId("hh"),
          name: householdName || `${displayName}'s household`,
          createdAt: now,
          updatedAt: now,
        };
        next.households.push(household);
        selectedMembership = {
          id: opaqueId("mem"),
          householdId: household.id,
          accountId: account.id,
          email,
          role: "owner",
          status: "active",
          invitedByAccountId: account.id,
          joinedAt: now,
          createdAt: now,
          updatedAt: now,
        };
        next.memberships.push(selectedMembership);
      }

      account.lastHouseholdId = selectedMembership.householdId;
      const session = {
        sessionHash,
        accountId: account.id,
        householdId: selectedMembership.householdId,
        csrfToken,
        createdAt: now,
        expiresAt,
      };
      next.sessions.push(session);
      await this.#commit(next);
      return materializeSession(next, session);
    });
  }

  async createSession({
    accountId,
    requestedHouseholdId = null,
    sessionHash,
    csrfToken,
    expiresAt,
    now,
  }) {
    return this.#exclusive(async () => {
      const next = clone(this.#state);
      const account = next.accounts.find((item) => item.id === accountId);
      if (!account) {
        storeError("Authentication is required.", "AUTH_REQUIRED", 401);
      }
      const memberships = next.memberships.filter(
        (item) => item.accountId === accountId && item.status === "active",
      );
      const selected =
        (requestedHouseholdId
          ? memberships.find(
              (item) => item.householdId === requestedHouseholdId,
            )
          : null) ||
        memberships.find(
          (item) => item.householdId === account.lastHouseholdId,
        ) ||
        memberships[0];
      if (!selected) {
        storeError("Authentication is required.", "AUTH_REQUIRED", 401);
      }
      account.lastHouseholdId = selected.householdId;
      account.updatedAt = now;
      const session = {
        sessionHash,
        accountId,
        householdId: selected.householdId,
        csrfToken,
        createdAt: now,
        expiresAt,
      };
      next.sessions.push(session);
      await this.#commit(next);
      return materializeSession(next, session);
    });
  }

  async getSession(sessionHash, at) {
    const session = this.#state.sessions.find(
      (item) => item.sessionHash === sessionHash,
    );
    if (!session) return null;
    if (
      Date.parse(session.expiresAt) <= Date.parse(at) ||
      !materializeSession(this.#state, session)
    ) {
      await this.deleteSession(sessionHash);
      return null;
    }
    return materializeSession(this.#state, session);
  }

  async deleteSession(sessionHash) {
    return this.#exclusive(async () => {
      const next = clone(this.#state);
      const before = next.sessions.length;
      next.sessions = next.sessions.filter(
        (item) => item.sessionHash !== sessionHash,
      );
      if (next.sessions.length !== before) await this.#commit(next);
      return next.sessions.length !== before;
    });
  }

  async listMembers({ actorAccountId, householdId }) {
    requireMembership(
      this.#state,
      actorAccountId,
      householdId,
      MEMBER_ADMIN_ROLES,
    );
    return this.#state.memberships
      .filter((item) => item.householdId === householdId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((item) => publicMember(this.#state, item));
  }

  async grantMembership({
    actorAccountId,
    householdId,
    email,
    role,
    now,
  }) {
    if (!ACCOUNT_ROLES.has(role) || role === "owner") {
      storeError("This role cannot be granted.", "INVALID_ROLE", 422);
    }
    return this.#exclusive(async () => {
      const next = clone(this.#state);
      const actor = requireMembership(
        next,
        actorAccountId,
        householdId,
        MEMBER_ADMIN_ROLES,
      );
      if (actor.role === "admin" && role === "admin") {
        storeError("This action is unavailable.", "FORBIDDEN", 403);
      }
      const targetAccount = findAccountByEmail(next, email);
      if (targetAccount?.id === actorAccountId) {
        storeError(
          "Use a dedicated role-management flow for your own access.",
          "SELF_ROLE_CHANGE_NOT_ALLOWED",
          409,
        );
      }
      let membership = next.memberships.find(
        (item) =>
          item.householdId === householdId &&
          (item.email === email ||
            (targetAccount && item.accountId === targetAccount.id)),
      );
      if (membership?.role === "owner") {
        storeError("Owner access cannot be changed here.", "FORBIDDEN", 403);
      }
      if (actor.role === "admin" && membership?.role === "admin") {
        storeError("This action is unavailable.", "FORBIDDEN", 403);
      }
      if (membership) {
        membership.accountId = targetAccount?.id || null;
        membership.email = email;
        membership.role = role;
        membership.status = targetAccount ? "active" : "pending";
        membership.joinedAt = targetAccount
          ? membership.joinedAt || now
          : null;
        membership.updatedAt = now;
      } else {
        membership = {
          id: opaqueId("mem"),
          householdId,
          accountId: targetAccount?.id || null,
          email,
          role,
          status: targetAccount ? "active" : "pending",
          invitedByAccountId: actorAccountId,
          joinedAt: targetAccount ? now : null,
          createdAt: now,
          updatedAt: now,
        };
        next.memberships.push(membership);
      }
      await this.#commit(next);
      return publicMember(next, membership);
    });
  }

  async #writeBackupObject(householdId, checksum, payloadBytes) {
    const householdDirectory = path.join(this.#objectsDirectory, householdId);
    await mkdir(householdDirectory, { recursive: true, mode: 0o700 });
    const objectPath = path.join(householdDirectory, `${checksum}.alyr`);
    try {
      const existing = await readFile(objectPath);
      if (
        existing.byteLength !== payloadBytes.byteLength ||
        sha256Hex(existing) !== checksum
      ) {
        storeError(
          "A stored recovery object failed integrity validation.",
          "STORED_BACKUP_CORRUPT",
          500,
        );
      }
      return objectPath;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await atomicWriteFile(objectPath, payloadBytes);
    return objectPath;
  }

  async putLatestBackup({
    actorAccountId,
    householdId,
    checksum,
    byteLength,
    createdAt,
    payloadBytes,
    blobId,
    ciphertextChecksum,
    baseBackupId = null,
    baseBackupObserved = false,
    now,
  }) {
    return this.#exclusive(async () => {
      const next = clone(this.#state);
      requireMembership(
        next,
        actorAccountId,
        householdId,
        BACKUP_ROLES,
      );
      const vault =
        next.backups[householdId] ||
        (next.backups[householdId] = createBackupVault());
      const latest = vault.records.at(-1) || null;
      if (
        baseBackupObserved &&
        baseBackupId !== (latest?.backupId || null)
      ) {
        storeError(
          "A newer encrypted backup already exists. Refresh before uploading again.",
          "BACKUP_STALE",
          409,
          {
            latest: safeBackupMetadata(latest),
          },
        );
      }
      await this.#writeBackupObject(householdId, checksum, payloadBytes);
      const metadata = {
        backupId: opaqueId("backup"),
        version: vault.nextVersion,
        baseBackupId,
        checksum,
        byteLength,
        createdAt,
        storedAt: now,
        uploadedByAccountId: actorAccountId,
        blobId,
        ciphertextChecksum,
        retention: backupRetention(),
      };
      vault.records.push(metadata);
      vault.latestBackupId = metadata.backupId;
      vault.nextVersion = metadata.version + 1;
      await this.#commit(next);
      return clone(metadata);
    });
  }

  async #readBackupPayload(householdId, metadata) {
    const objectPath = path.join(
      this.#objectsDirectory,
      householdId,
      `${metadata.checksum}.alyr`,
    );
    let payloadBytes;
    try {
      const file = await stat(objectPath);
      if (!file.isFile() || file.size !== metadata.byteLength) {
        storeError(
          "The stored recovery kit failed integrity validation.",
          "STORED_BACKUP_CORRUPT",
          500,
        );
      }
      payloadBytes = await readFile(objectPath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        storeError(
          "The stored recovery kit failed integrity validation.",
          "STORED_BACKUP_CORRUPT",
          500,
        );
      }
      throw error;
    }
    if (
      payloadBytes.byteLength !== metadata.byteLength ||
      sha256Hex(payloadBytes) !== metadata.checksum
    ) {
      storeError(
        "The stored recovery kit failed integrity validation.",
        "STORED_BACKUP_CORRUPT",
        500,
      );
    }
    return {
      ...clone(metadata),
      payload: payloadBytes.toString("utf8"),
    };
  }

  async getLatestBackup({ actorAccountId, householdId }) {
    requireMembership(
      this.#state,
      actorAccountId,
      householdId,
      BACKUP_ROLES,
    );
    const vault = this.#state.backups[householdId];
    const metadata = vault?.records.find(
      (record) => record.backupId === vault.latestBackupId,
    );
    if (!metadata) {
      storeError(
        "No encrypted recovery kit is available.",
        "BACKUP_UNAVAILABLE",
        404,
      );
    }
    return this.#readBackupPayload(householdId, metadata);
  }

  async listBackupHistory({ actorAccountId, householdId, limit }) {
    requireMembership(
      this.#state,
      actorAccountId,
      householdId,
      BACKUP_ROLES,
    );
    const vault = this.#state.backups[householdId] || createBackupVault();
    const records = vault.records
      .slice()
      .reverse()
      .slice(0, limit)
      .map((record) => safeBackupMetadata(record));
    return {
      backups: records,
      latestBackupId: vault.latestBackupId,
      total: vault.records.length,
      retention: {
        ...clone(vault.retention),
        historyLimitApplied: limit,
      },
    };
  }

  async getBackupById({ actorAccountId, householdId, backupId }) {
    requireMembership(
      this.#state,
      actorAccountId,
      householdId,
      BACKUP_ROLES,
    );
    const metadata = this.#state.backups[householdId]?.records.find(
      (record) => record.backupId === backupId,
    );
    if (!metadata) {
      storeError(
        "This encrypted recovery-kit version is unavailable.",
        "BACKUP_UNAVAILABLE",
        404,
      );
    }
    return this.#readBackupPayload(householdId, metadata);
  }
}
