export type PasswordRecoverySessionMarker =
  | {
      readonly version: 1;
      readonly exchangeId: string;
      readonly phase: "exchanging";
      readonly scope: {
        readonly kind: "exchange";
        readonly exchangeId: string;
      };
      readonly startedAt: string;
    }
  | {
      readonly version: 1;
      readonly exchangeId: string;
      readonly phase: "session-active";
      readonly scope: {
        readonly kind: "account";
        readonly accountId: string;
      };
      readonly startedAt: string;
    };

export interface PasswordRecoverySessionMarkerStore {
  read(): Promise<PasswordRecoverySessionMarker | null>;
  begin(exchangeId: string, startedAt: string): Promise<void>;
  bindAccount(exchangeId: string, accountId: string): Promise<void>;
  clear(): Promise<void>;
}

export interface PasswordRecoverySessionMarkerStoreDriver {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const STORAGE_KEY = "alyr.password-recovery-session-marker.v1";
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

function validTimestamp(value: string): boolean {
  return value.length > 0 && !Number.isNaN(Date.parse(value));
}

function parseMarker(value: string): PasswordRecoverySessionMarker {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error(
      "The protected password-recovery marker is unreadable."
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(
      "The protected password-recovery marker is invalid."
    );
  }
  const candidate = parsed as Record<string, unknown>;
  const exchangeId =
    typeof candidate.exchangeId === "string" &&
    UUID_PATTERN.test(candidate.exchangeId)
      ? candidate.exchangeId
      : null;
  const startedAt =
    typeof candidate.startedAt === "string" &&
    validTimestamp(candidate.startedAt)
      ? candidate.startedAt
      : null;
  const scope =
    typeof candidate.scope === "object" &&
    candidate.scope !== null
      ? (candidate.scope as Record<string, unknown>)
      : null;
  if (
    candidate.version !== 1 ||
    !exchangeId ||
    !startedAt ||
    !scope
  ) {
    throw new Error(
      "The protected password-recovery marker is invalid."
    );
  }

  if (
    candidate.phase === "exchanging" &&
    scope.kind === "exchange" &&
    scope.exchangeId === exchangeId
  ) {
    return {
      version: 1,
      exchangeId,
      phase: "exchanging",
      scope: { kind: "exchange", exchangeId },
      startedAt
    };
  }

  const accountId =
    candidate.phase === "session-active" &&
    scope.kind === "account" &&
    typeof scope.accountId === "string"
      ? normalizeAccountId(scope.accountId)
      : null;
  if (accountId) {
    return {
      version: 1,
      exchangeId,
      phase: "session-active",
      scope: { kind: "account", accountId },
      startedAt
    };
  }

  throw new Error(
    "The protected password-recovery marker is invalid."
  );
}

/**
 * Records the recovery boundary before a provider code exchange can persist a
 * session. The exchange scope is replaced with the provider-confirmed account
 * scope before that session is exposed to React routing.
 *
 * An unreadable record is deliberately not deleted here. Bootstrap must keep
 * every vault sealed until an explicit signed cleanup removes the marker and
 * provider session together.
 */
export function createPasswordRecoverySessionMarkerStore(
  driver: PasswordRecoverySessionMarkerStoreDriver
): PasswordRecoverySessionMarkerStore {
  const readMarker = async (): Promise<PasswordRecoverySessionMarker | null> => {
    const raw = await driver.getItem(STORAGE_KEY);
    return raw === null ? null : parseMarker(raw);
  };
  return {
    read: readMarker,
    async begin(exchangeId, startedAt) {
      if (
        !UUID_PATTERN.test(exchangeId) ||
        !validTimestamp(startedAt)
      ) {
        throw new Error(
          "A valid password-recovery exchange marker is required."
        );
      }
      await driver.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          exchangeId,
          phase: "exchanging",
          scope: {
            kind: "exchange",
            exchangeId
          },
          startedAt
        })
      );
    },
    async bindAccount(exchangeId, accountIdValue) {
      const accountId = normalizeAccountId(accountIdValue);
      if (!UUID_PATTERN.test(exchangeId) || !accountId) {
        throw new Error(
          "A valid password-recovery account scope is required."
        );
      }
      const current = await readMarker();
      if (
        !current ||
        current.exchangeId !== exchangeId ||
        current.phase !== "exchanging"
      ) {
        throw new Error(
          "The password-recovery exchange marker no longer matches."
        );
      }
      await driver.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          exchangeId,
          phase: "session-active",
          scope: {
            kind: "account",
            accountId
          },
          startedAt: current.startedAt
        })
      );
    },
    async clear() {
      await driver.removeItem(STORAGE_KEY);
    }
  };
}
