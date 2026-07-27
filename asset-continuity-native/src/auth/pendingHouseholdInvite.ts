export interface PendingHouseholdInvite {
  readonly oneTimeCode: string;
  readonly capturedAt: string;
}

export interface PendingHouseholdInviteStore {
  read(): Promise<PendingHouseholdInvite | null>;
  write(invite: PendingHouseholdInvite): Promise<void>;
  clear(): Promise<void>;
}

export interface PendingHouseholdInviteStoreDriver {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const STORAGE_KEY = "alyr.pending-household-invite.v1";
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;

export function normalizeHouseholdInviteCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (
    normalized.length < 1 ||
    normalized.length > 128 ||
    CONTROL_CHARACTERS.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function parsePendingInvite(
  value: string
): PendingHouseholdInvite | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    const oneTimeCode =
      typeof candidate.oneTimeCode === "string"
        ? normalizeHouseholdInviteCode(candidate.oneTimeCode)
        : null;
    const capturedAt =
      typeof candidate.capturedAt === "string"
        ? candidate.capturedAt
        : "";
    if (
      candidate.version !== 1 ||
      !oneTimeCode ||
      !capturedAt ||
      Number.isNaN(Date.parse(capturedAt))
    ) {
      return null;
    }
    return { oneTimeCode, capturedAt };
  } catch {
    return null;
  }
}

/**
 * Persists only the bearer invitation needed to finish the join journey.
 * Signed runtime supplies an encrypted, device-bound SecureStore driver.
 */
export function createPendingHouseholdInviteStore(
  driver: PendingHouseholdInviteStoreDriver
): PendingHouseholdInviteStore {
  return {
    async read() {
      const raw = await driver.getItem(STORAGE_KEY);
      if (raw === null) return null;
      const parsed = parsePendingInvite(raw);
      if (!parsed) {
        await driver.removeItem(STORAGE_KEY);
      }
      return parsed;
    },
    async write(invite) {
      const oneTimeCode = normalizeHouseholdInviteCode(
        invite.oneTimeCode
      );
      if (
        !oneTimeCode ||
        Number.isNaN(Date.parse(invite.capturedAt))
      ) {
        throw new Error("A valid household invitation is required.");
      }
      await driver.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          oneTimeCode,
          capturedAt: invite.capturedAt
        })
      );
    },
    async clear() {
      await driver.removeItem(STORAGE_KEY);
    }
  };
}

let configuredFactory:
  | (() => PendingHouseholdInviteStore)
  | null = null;

const previewValues = new Map<string, string>();
const previewStore = createPendingHouseholdInviteStore({
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

export function configurePendingHouseholdInviteStoreFactory(
  factory: () => PendingHouseholdInviteStore
): () => void {
  configuredFactory = factory;
  return () => {
    if (configuredFactory === factory) configuredFactory = null;
  };
}

export function createRuntimePendingHouseholdInviteStore(): PendingHouseholdInviteStore {
  return configuredFactory ? configuredFactory() : previewStore;
}
