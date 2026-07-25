import {
  commitWorkspaceWithEvidenceFiles,
  commitRecoveryGeneration,
  purgeFileScope,
  readRecoveryPersistenceState,
  rollbackRecoveryGenerationCommit,
  writeActiveRecoveryWorkspace,
} from "./fileStore.js";
import { createOpaqueId } from "./securityVault.js";
import {
  clearStorageScopeCache,
  requireStorageScopeId,
  storageKeysForScope,
} from "./storageScope.js";

export const RESTORE_GENERATION_FORMAT =
  "continuity-indexeddb-restore-generation";
export const RESTORE_GENERATION_VERSION = 2;

export class RestoreGenerationError extends Error {
  constructor(message, code = "RESTORE_GENERATION_FAILED") {
    super(message);
    this.name = "RestoreGenerationError";
    this.code = code;
  }
}

function requireWorkspace(workspace, label) {
  if (
    !workspace ||
    typeof workspace !== "object" ||
    Array.isArray(workspace) ||
    !String(workspace.household?.id || "").trim()
  ) {
    throw new RestoreGenerationError(
      `${label} is missing its household identity.`,
      "RESTORE_WORKSPACE_INVALID",
    );
  }
  return workspace;
}

function serializeWorkspace(workspace, label) {
  try {
    const raw = JSON.stringify(requireWorkspace(workspace, label));
    requireWorkspace(JSON.parse(raw), label);
    return raw;
  } catch (error) {
    if (error instanceof RestoreGenerationError) throw error;
    throw new RestoreGenerationError(
      `${label} could not be serialized safely.`,
      "RESTORE_WORKSPACE_INVALID",
    );
  }
}

function parseStoredWorkspace(raw, label) {
  if (!raw) {
    throw new RestoreGenerationError(
      `${label} is unavailable.`,
      "RESTORE_WORKSPACE_MISSING",
    );
  }
  try {
    return requireWorkspace(JSON.parse(raw), label);
  } catch (error) {
    if (error instanceof RestoreGenerationError) throw error;
    throw new RestoreGenerationError(
      `${label} is unreadable.`,
      "RESTORE_WORKSPACE_INVALID",
    );
  }
}

function normalizeNow(value) {
  try {
    return new Date(value).toISOString();
  } catch {
    throw new RestoreGenerationError(
      "The restore timestamp is invalid.",
      "RESTORE_TIMESTAMP_INVALID",
    );
  }
}

function optionalStorage(storage) {
  const candidate = storage ?? globalThis.window?.localStorage;
  return candidate?.getItem &&
    candidate?.setItem &&
    candidate?.removeItem
    ? candidate
    : null;
}

function publicRollback(scopeId, rollback) {
  if (!rollback) return null;
  const keys = storageKeysForScope(scopeId);
  return Object.freeze({
    format: RESTORE_GENERATION_FORMAT,
    version: RESTORE_GENERATION_VERSION,
    scopeId,
    activatedGenerationId: rollback.activatedGenerationId,
    previousGenerationId: rollback.previousGenerationId ?? null,
    previousWorkspaceKey: keys.workspaceForGeneration(
      rollback.previousGenerationId ?? null,
    ),
    activatedWorkspaceKey: keys.workspaceForGeneration(
      rollback.activatedGenerationId,
    ),
    createdAt: rollback.createdAt,
  });
}

function invalidateRecoveryCache(scopeId, storage) {
  if (!storage) return;
  const keys = storageKeysForScope(scopeId);
  for (const key of [keys.activeGeneration, keys.restoreRollback]) {
    try {
      storage.removeItem(key);
    } catch {
      // IndexedDB remains authoritative when the compatibility cache is full.
    }
  }
}

function cacheRecoveryState(scopeId, state, storage) {
  if (!storage || !state) return;
  const keys = storageKeysForScope(scopeId);
  const rollback = publicRollback(scopeId, state.rollback);
  try {
    storage.setItem(
      keys.workspaceForGeneration(state.activeGenerationId),
      state.workspaceRaw,
    );
    if (rollback && state.rollbackWorkspaceRaw) {
      storage.setItem(
        rollback.previousWorkspaceKey,
        state.rollbackWorkspaceRaw,
      );
      storage.setItem(keys.restoreRollback, JSON.stringify(rollback));
    } else {
      storage.removeItem(keys.restoreRollback);
    }
    if (state.activeGenerationId) {
      storage.setItem(keys.activeGeneration, state.activeGenerationId);
    } else {
      storage.removeItem(keys.activeGeneration);
    }
  } catch {
    invalidateRecoveryCache(scopeId, storage);
  }
}

function asRestoreError(error, fallbackMessage) {
  if (error instanceof RestoreGenerationError) return error;
  return new RestoreGenerationError(
    error?.message || fallbackMessage,
    error?.code || "RESTORE_GENERATION_FAILED",
  );
}

/**
 * Compatibility-only synchronous rollback indicator. IndexedDB is the source
 * of truth; boot flows should use readRecoveryGenerationState().
 */
export function readRecoveryRollback(
  scopeId,
  storage = globalThis.window?.localStorage,
) {
  const normalizedScopeId = requireStorageScopeId(scopeId);
  const targetStorage = optionalStorage(storage);
  if (!targetStorage) return null;
  const keys = storageKeysForScope(normalizedScopeId);
  const raw = targetStorage.getItem(keys.restoreRollback);
  if (!raw) return null;
  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    throw new RestoreGenerationError(
      "The cached restore rollback indicator is unreadable.",
      "RESTORE_ROLLBACK_CACHE_INVALID",
    );
  }
  if (
    record?.format !== RESTORE_GENERATION_FORMAT ||
    record?.version !== RESTORE_GENERATION_VERSION ||
    record?.scopeId !== normalizedScopeId ||
    !record?.activatedGenerationId ||
    !record?.previousWorkspaceKey ||
    !record?.activatedWorkspaceKey ||
    !Number.isFinite(Date.parse(record?.createdAt))
  ) {
    throw new RestoreGenerationError(
      "The cached restore rollback indicator failed validation.",
      "RESTORE_ROLLBACK_CACHE_INVALID",
    );
  }
  return Object.freeze(record);
}

/**
 * Reads and validates the IndexedDB-authoritative head and active workspace.
 * The localStorage mirror is refreshed only to support legacy boot code and
 * cross-tab storage signals.
 */
export async function readRecoveryGenerationState(
  scopeId,
  storage = globalThis.window?.localStorage,
) {
  const normalizedScopeId = requireStorageScopeId(scopeId);
  try {
    const state = await readRecoveryPersistenceState(normalizedScopeId);
    if (!state) return null;
    const workspace = parseStoredWorkspace(
      state.workspaceRaw,
      "The active workspace generation",
    );
    const rollbackWorkspace = state.rollbackWorkspaceRaw
      ? parseStoredWorkspace(
          state.rollbackWorkspaceRaw,
          "The rollback workspace generation",
        )
      : null;
    if (
      rollbackWorkspace &&
      rollbackWorkspace.household.id !== workspace.household.id
    ) {
      throw new RestoreGenerationError(
        "The rollback generation belongs to a different household.",
        "RESTORE_HOUSEHOLD_MISMATCH",
      );
    }
    cacheRecoveryState(
      normalizedScopeId,
      state,
      optionalStorage(storage),
    );
    return Object.freeze({
      scopeId: normalizedScopeId,
      revision: state.revision,
      activeGenerationId: state.activeGenerationId,
      workspace,
      rollback: publicRollback(normalizedScopeId, state.rollback),
      rollbackWorkspace,
      updatedAt: state.updatedAt,
    });
  } catch (error) {
    throw asRestoreError(
      error,
      "The authoritative recovery state could not be read.",
    );
  }
}

/**
 * Persists normal workspace edits into the active IndexedDB generation. The
 * optional expected revision lets a caller reject stale cross-tab writes.
 */
export async function persistActiveRecoveryWorkspace({
  scopeId,
  workspace,
  expectedRevision,
  now = new Date().toISOString(),
  storage = globalThis.window?.localStorage,
} = {}) {
  const normalizedScopeId = requireStorageScopeId(scopeId);
  const workspaceRaw = serializeWorkspace(
    workspace,
    "The active workspace",
  );
  try {
    const result = await writeActiveRecoveryWorkspace({
      scopeId: normalizedScopeId,
      workspaceRaw,
      expectedRevision,
      updatedAt: normalizeNow(now),
    });
    const state = await readRecoveryPersistenceState(normalizedScopeId);
    cacheRecoveryState(
      normalizedScopeId,
      state,
      optionalStorage(storage),
    );
    return Object.freeze({
      ...result,
      revision: state.revision,
      activeGenerationId: state.activeGenerationId,
      workspace: parseStoredWorkspace(
        state.workspaceRaw,
        "The active workspace generation",
      ),
      rollback: publicRollback(normalizedScopeId, state.rollback),
    });
  } catch (error) {
    throw asRestoreError(
      error,
      "The active workspace could not be saved.",
    );
  }
}

/**
 * Persists a reducer-produced workspace and every newly referenced original as
 * one crash-safe commit. A retry with the same operationId returns the original
 * receipt instead of duplicating evidence or incrementing the head again.
 */
export async function persistActiveRecoveryWorkspaceWithFiles({
  scopeId,
  operationId,
  workspace,
  files,
  expectedRevision,
  now = new Date().toISOString(),
  storage = globalThis.window?.localStorage,
} = {}) {
  const normalizedScopeId = requireStorageScopeId(scopeId);
  const workspaceRaw = serializeWorkspace(
    workspace,
    "The captured workspace",
  );
  try {
    const baseline = await readRecoveryPersistenceState(
      normalizedScopeId,
    );
    if (baseline) {
      const activeWorkspace = parseStoredWorkspace(
        baseline.workspaceRaw,
        "The active workspace generation",
      );
      if (
        activeWorkspace.household.id !==
        workspace.household.id
      ) {
        throw new RestoreGenerationError(
          "The active generation belongs to a different household.",
          "RESTORE_HOUSEHOLD_MISMATCH",
        );
      }
    }
    const result = await commitWorkspaceWithEvidenceFiles({
      scopeId: normalizedScopeId,
      operationId,
      workspaceRaw,
      files,
      expectedRevision,
      expectedGenerationId:
        baseline?.activeGenerationId ?? null,
      committedAt: normalizeNow(now),
    });
    const state = await readRecoveryPersistenceState(normalizedScopeId);
    cacheRecoveryState(
      normalizedScopeId,
      state,
      optionalStorage(storage),
    );
    return Object.freeze({
      ...result,
      revision: state.revision,
      activeGenerationId: state.activeGenerationId,
      workspace: parseStoredWorkspace(
        state.workspaceRaw,
        "The active workspace generation",
      ),
      rollback: publicRollback(normalizedScopeId, state.rollback),
    });
  } catch (error) {
    throw asRestoreError(
      error,
      "The captured record and original could not be saved together.",
    );
  }
}

/**
 * Validates all originals before opening the write transaction. IndexedDB then
 * compares the expected head revision and atomically commits current snapshot,
 * recovered snapshot, originals, one-step rollback, and the new head.
 */
export async function stageAndActivateRecoveryGeneration({
  scopeId,
  currentWorkspace,
  recoveredWorkspace,
  files = [],
  expectedHeadRevision,
  now = new Date().toISOString(),
  storage = globalThis.window?.localStorage,
} = {}) {
  const normalizedScopeId = requireStorageScopeId(scopeId);
  const current = requireWorkspace(
    currentWorkspace,
    "The current workspace",
  );
  const recovered = requireWorkspace(
    recoveredWorkspace,
    "The recovered workspace",
  );
  if (current.household.id !== recovered.household.id) {
    throw new RestoreGenerationError(
      "The recovered workspace belongs to a different household.",
      "RESTORE_HOUSEHOLD_MISMATCH",
    );
  }
  if (!Array.isArray(files)) {
    throw new RestoreGenerationError(
      "Choose a valid set of recovery originals.",
      "RESTORE_FILES_INVALID",
    );
  }
  const createdAt = normalizeNow(now);
  const currentWorkspaceRaw = serializeWorkspace(
    current,
    "The current workspace",
  );
  try {
    const baseline = await readRecoveryPersistenceState(normalizedScopeId);
    const baselineRevision = baseline?.revision ?? 0;
    if (
      expectedHeadRevision !== undefined &&
      Number(expectedHeadRevision) !== baselineRevision
    ) {
      throw new RestoreGenerationError(
        "The active workspace changed in another tab. Review it before restoring.",
        "RECOVERY_HEAD_STALE",
      );
    }
    if (baseline) {
      const authoritativeCurrent = parseStoredWorkspace(
        baseline.workspaceRaw,
        "The active workspace generation",
      );
      if (
        authoritativeCurrent.household.id !== current.household.id
      ) {
        throw new RestoreGenerationError(
          "The active generation belongs to a different household.",
          "RESTORE_HOUSEHOLD_MISMATCH",
        );
      }
      if (baseline.workspaceRaw !== currentWorkspaceRaw) {
        throw new RestoreGenerationError(
          "The current workspace has unsaved or newer changes. Wait for it to finish saving, then review the restore again.",
          "RESTORE_CURRENT_WORKSPACE_STALE",
        );
      }
    }
    const generationId = createOpaqueId("restore-generation");
    await commitRecoveryGeneration({
      scopeId: normalizedScopeId,
      generationId,
      currentWorkspaceRaw:
        baseline?.workspaceRaw ?? currentWorkspaceRaw,
      recoveredWorkspaceRaw: serializeWorkspace(
        recovered,
        "The recovered workspace",
      ),
      files,
      expectedRevision: baselineRevision,
      expectedGenerationId: baseline?.activeGenerationId ?? null,
      createdAt,
    });
    const state = await readRecoveryPersistenceState(normalizedScopeId);
    const verifiedRecovered = parseStoredWorkspace(
      state.workspaceRaw,
      "The recovered workspace generation",
    );
    cacheRecoveryState(
      normalizedScopeId,
      state,
      optionalStorage(storage),
    );
    return Object.freeze({
      generationId: state.activeGenerationId,
      previousGenerationId:
        state.rollback?.previousGenerationId ?? null,
      revision: state.revision,
      createdAt,
      rollback: publicRollback(normalizedScopeId, state.rollback),
      workspace: verifiedRecovered,
    });
  } catch (error) {
    throw asRestoreError(
      error,
      "The recovered generation could not be activated. The current workspace was kept.",
    );
  }
}

export async function rollbackRecoveryGeneration({
  scopeId,
  expectedHeadRevision,
  now = new Date().toISOString(),
  storage = globalThis.window?.localStorage,
} = {}) {
  const normalizedScopeId = requireStorageScopeId(scopeId);
  try {
    const baseline = await readRecoveryPersistenceState(normalizedScopeId);
    if (!baseline?.rollback) {
      throw new RestoreGenerationError(
        "There is no recent restore to undo.",
        "RESTORE_ROLLBACK_UNAVAILABLE",
      );
    }
    if (
      expectedHeadRevision !== undefined &&
      Number(expectedHeadRevision) !== baseline.revision
    ) {
      throw new RestoreGenerationError(
        "The active workspace changed in another tab. The restore was not undone.",
        "RECOVERY_HEAD_STALE",
      );
    }
    const committed = await rollbackRecoveryGenerationCommit({
      scopeId: normalizedScopeId,
      expectedRevision: baseline.revision,
      updatedAt: normalizeNow(now),
    });
    const state = await readRecoveryPersistenceState(normalizedScopeId);
    const workspace = parseStoredWorkspace(
      state.workspaceRaw,
      "The previous workspace generation",
    );
    cacheRecoveryState(
      normalizedScopeId,
      state,
      optionalStorage(storage),
    );
    return Object.freeze({
      workspace,
      restoredGenerationId: state.activeGenerationId,
      removedGenerationId: committed.removedGenerationId,
      revision: state.revision,
      cleaned: true,
    });
  } catch (error) {
    throw asRestoreError(
      error,
      "The previous workspace generation could not be reactivated.",
    );
  }
}

/**
 * Atomically removes this scope's originals, drafts, recovery head, and every
 * workspace generation. Cache removal follows and cannot affect other scopes.
 */
export async function resetRecoveryGenerationScope({
  scopeId,
  storage = globalThis.window?.localStorage,
} = {}) {
  const normalizedScopeId = requireStorageScopeId(scopeId);
  try {
    await purgeFileScope(normalizedScopeId);
    const targetStorage = optionalStorage(storage);
    if (targetStorage) {
      try {
        clearStorageScopeCache(normalizedScopeId, targetStorage);
      } catch {
        invalidateRecoveryCache(normalizedScopeId, targetStorage);
      }
    }
    return Object.freeze({
      scopeId: normalizedScopeId,
      reset: true,
      revision: 0,
      activeGenerationId: null,
    });
  } catch (error) {
    throw asRestoreError(
      error,
      "The workspace scope could not be reset safely.",
    );
  }
}
