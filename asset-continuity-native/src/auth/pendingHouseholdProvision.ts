export interface PendingHouseholdProvision {
  readonly accountId: string;
  readonly operationId: string;
  readonly householdId: string;
  readonly name: string;
  readonly createdAt: string;
}

export interface PendingHouseholdProvisionStore {
  read(): Promise<PendingHouseholdProvision | null>;
  write(provision: PendingHouseholdProvision): Promise<void>;
  clear(): Promise<void>;
}

export interface PendingHouseholdProvisionStoreDriver {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const PENDING_HOUSEHOLD_PROVISION_UNREADABLE =
  "PENDING_HOUSEHOLD_PROVISION_UNREADABLE" as const;

/**
 * A protected provisioning marker exists, but its durable bytes cannot be
 * trusted. Callers must keep household creation and vault routing blocked
 * until an explicit signed-account cleanup clears the marker.
 */
export class PendingHouseholdProvisionReadError extends Error {
  readonly code = PENDING_HOUSEHOLD_PROVISION_UNREADABLE;

  constructor() {
    super("The saved household provisioning operation is unreadable.");
    this.name = "PendingHouseholdProvisionReadError";
  }
}

export function isPendingHouseholdProvisionReadError(
  error: unknown
): error is PendingHouseholdProvisionReadError {
  return (
    error instanceof PendingHouseholdProvisionReadError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === PENDING_HOUSEHOLD_PROVISION_UNREADABLE)
  );
}

const STORAGE_KEY = "alyr.pending-household-provision.v1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;

function normalizeAccountId(value: string): string | null {
  const normalized = value.trim();
  return normalized.length >= 1 &&
    normalized.length <= 128 &&
    !CONTROL_CHARACTERS.test(normalized)
    ? normalized
    : null;
}

function normalizeHouseholdName(value: string): string | null {
  const normalized = value.trim();
  return normalized.length >= 1 &&
    normalized.length <= 120 &&
    !CONTROL_CHARACTERS.test(normalized)
    ? normalized
    : null;
}

function parsePendingProvision(
  value: string
): PendingHouseholdProvision | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    const accountId =
      typeof candidate.accountId === "string"
        ? normalizeAccountId(candidate.accountId)
        : null;
    const operationId =
      typeof candidate.operationId === "string" &&
      UUID_PATTERN.test(candidate.operationId)
        ? candidate.operationId
        : null;
    const householdId =
      typeof candidate.householdId === "string" &&
      UUID_PATTERN.test(candidate.householdId)
        ? candidate.householdId
        : null;
    const name =
      typeof candidate.name === "string"
        ? normalizeHouseholdName(candidate.name)
        : null;
    const createdAt =
      typeof candidate.createdAt === "string"
        ? candidate.createdAt
        : "";
    if (
      candidate.version !== 2 ||
      !accountId ||
      !operationId ||
      !householdId ||
      !name ||
      !createdAt ||
      Number.isNaN(Date.parse(createdAt))
    ) {
      return null;
    }
    return {
      accountId,
      operationId,
      householdId,
      name,
      createdAt
    };
  } catch {
    return null;
  }
}

/**
 * Persists the one signed household-creation intent that may be between a
 * committed server transaction and its lost HTTP acknowledgement.
 */
export function createPendingHouseholdProvisionStore(
  driver: PendingHouseholdProvisionStoreDriver
): PendingHouseholdProvisionStore {
  return {
    async read() {
      let raw: string | null;
      try {
        raw = await driver.getItem(STORAGE_KEY);
      } catch {
        throw new PendingHouseholdProvisionReadError();
      }
      if (raw === null) return null;
      const parsed = parsePendingProvision(raw);
      if (!parsed) {
        throw new PendingHouseholdProvisionReadError();
      }
      return parsed;
    },
    async write(provision) {
      const accountId = normalizeAccountId(provision.accountId);
      const operationId = provision.operationId;
      const householdId = provision.householdId;
      const name = normalizeHouseholdName(provision.name);
      if (
        !accountId ||
        !UUID_PATTERN.test(operationId) ||
        !UUID_PATTERN.test(householdId) ||
        !name ||
        Number.isNaN(Date.parse(provision.createdAt))
      ) {
        throw new Error(
          "A valid household provisioning intent is required."
        );
      }
      await driver.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 2,
          accountId,
          operationId,
          householdId,
          name,
          createdAt: provision.createdAt
        })
      );
    },
    async clear() {
      await driver.removeItem(STORAGE_KEY);
    }
  };
}

let configuredFactory:
  | (() => PendingHouseholdProvisionStore)
  | null = null;

export function configurePendingHouseholdProvisionStoreFactory(
  factory: () => PendingHouseholdProvisionStore
): () => void {
  configuredFactory = factory;
  return () => {
    if (configuredFactory === factory) configuredFactory = null;
  };
}

export function createRuntimePendingHouseholdProvisionStore(): PendingHouseholdProvisionStore {
  if (configuredFactory) return configuredFactory();
  const previewValues = new Map<string, string>();
  return createPendingHouseholdProvisionStore({
    async getItem(key) {
      return previewValues.get(key) ?? null;
    },
    async setItem(key, value) {
      previewValues.set(key, value);
    },
    async removeItem(key) {
      previewValues.delete(key);
    }
  });
}
