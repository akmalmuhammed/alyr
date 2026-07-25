import {
  LEGACY_STORAGE_KEYS,
  RECOVERY_STORAGE_KEY,
  STORAGE_KEY,
} from "./domain.js";

export const LOCAL_DEMO_SCOPE_ID = "local-demo";
export const CAPTURE_DRAFT_STORAGE_KEY =
  "alyr.asset-continuity.capture-draft";
export const RECOVERY_WARNING_DISMISSED_STORAGE_KEY =
  "alyr.asset-continuity.recovery-warning-dismissed";
export const ACTIVE_GENERATION_STORAGE_KEY =
  "alyr.asset-continuity.active-generation";
export const RESTORE_ROLLBACK_STORAGE_KEY =
  "alyr.asset-continuity.restore-rollback";

const ACCOUNT_SCOPE_PREFIX = "account:";
const GENERATION_KEY_SEGMENT = ".generation.";

function requiredOpaqueId(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new TypeError(`${label} is required to create a storage scope.`);
  }
  return normalized;
}

export function createAccountStorageScopeId(session) {
  const accountId = requiredOpaqueId(session?.accountId, "Account identity");
  const householdId = requiredOpaqueId(
    session?.householdId,
    "Household identity",
  );
  return `${ACCOUNT_SCOPE_PREFIX}${encodeURIComponent(accountId)}:${encodeURIComponent(
    householdId,
  )}`;
}

export function isAccountStorageScopeId(scopeId) {
  return String(scopeId || "").startsWith(ACCOUNT_SCOPE_PREFIX);
}

export function requireStorageScopeId(scopeId) {
  const normalized = String(scopeId || "").trim();
  if (
    normalized !== LOCAL_DEMO_SCOPE_ID &&
    !isAccountStorageScopeId(normalized)
  ) {
    throw new TypeError("A valid local or authenticated storage scope is required.");
  }
  return normalized;
}

export function scopedStorageKey(baseKey, scopeId) {
  const normalizedScopeId = requireStorageScopeId(scopeId);
  if (normalizedScopeId === LOCAL_DEMO_SCOPE_ID) return baseKey;
  return `${baseKey}.scope.${encodeURIComponent(normalizedScopeId)}`;
}

export function requireStorageGenerationId(generationId) {
  const normalized = String(generationId || "").trim();
  if (!normalized || normalized.length > 160) {
    throw new TypeError("A valid storage generation identity is required.");
  }
  return normalized;
}

export function workspaceStorageKeyForGeneration(scopeId, generationId = null) {
  const workspaceKey = scopedStorageKey(STORAGE_KEY, scopeId);
  if (!generationId) return workspaceKey;
  return `${workspaceKey}${GENERATION_KEY_SEGMENT}${encodeURIComponent(
    requireStorageGenerationId(generationId),
  )}`;
}

export function readActiveStorageGenerationId(
  scopeId,
  storage = globalThis.window?.localStorage,
) {
  if (!storage?.getItem) return null;
  const value = storage.getItem(
    scopedStorageKey(ACTIVE_GENERATION_STORAGE_KEY, scopeId),
  );
  return value ? requireStorageGenerationId(value) : null;
}

export function listWorkspaceGenerationStorageKeys(
  scopeId,
  storage = globalThis.window?.localStorage,
) {
  const normalizedScopeId = requireStorageScopeId(scopeId);
  if (
    !storage ||
    !Number.isInteger(storage.length) ||
    typeof storage.key !== "function"
  ) {
    return [];
  }
  const prefix = `${scopedStorageKey(
    STORAGE_KEY,
    normalizedScopeId,
  )}${GENERATION_KEY_SEGMENT}`;
  const matches = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (typeof key === "string" && key.startsWith(prefix)) {
      matches.push(key);
    }
  }
  return matches.sort();
}

export function clearStorageScopeCache(
  scopeId,
  storage = globalThis.window?.localStorage,
) {
  const normalizedScopeId = requireStorageScopeId(scopeId);
  if (!storage?.removeItem) {
    throw new TypeError("Browser storage is unavailable.");
  }
  const keys = storageKeysForScope(normalizedScopeId);
  const targets = new Set([
    keys.workspace,
    keys.activeGeneration,
    keys.restoreRollback,
    keys.recovery,
    keys.recoveryWarningDismissed,
    keys.captureDraft,
    ...listWorkspaceGenerationStorageKeys(normalizedScopeId, storage),
    ...(normalizedScopeId === LOCAL_DEMO_SCOPE_ID
      ? LEGACY_STORAGE_KEYS
      : []),
  ]);
  for (const key of targets) storage.removeItem(key);
  return Object.freeze([...targets]);
}

export function storageKeysForScope(scopeId) {
  const normalizedScopeId = requireStorageScopeId(scopeId);
  return Object.freeze({
    workspace: scopedStorageKey(STORAGE_KEY, normalizedScopeId),
    activeGeneration: scopedStorageKey(
      ACTIVE_GENERATION_STORAGE_KEY,
      normalizedScopeId,
    ),
    restoreRollback: scopedStorageKey(
      RESTORE_ROLLBACK_STORAGE_KEY,
      normalizedScopeId,
    ),
    workspaceForGeneration: (generationId = null) =>
      workspaceStorageKeyForGeneration(normalizedScopeId, generationId),
    recovery: scopedStorageKey(RECOVERY_STORAGE_KEY, normalizedScopeId),
    recoveryWarningDismissed: scopedStorageKey(
      RECOVERY_WARNING_DISMISSED_STORAGE_KEY,
      normalizedScopeId,
    ),
    captureDraft: scopedStorageKey(
      CAPTURE_DRAFT_STORAGE_KEY,
      normalizedScopeId,
    ),
  });
}
