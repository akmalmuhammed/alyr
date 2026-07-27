import type { SyncCursor } from "@alyr/contracts";

import type { ScopedAttachmentStore } from "@/data/attachmentStore";
import type { NativeWorkspaceRepository } from "@/data/repository";
import { isNativeWorkspace, type NativeWorkspace } from "@/domain/model";
import type { RuntimeProfile } from "@/runtime/environment";

import {
  asRecoveryAttachmentRestoreAdapter,
  buildRecoveryKitRequest,
  isRecoveryCapableAttachmentStore
} from "./workspaceExport";
import {
  createCoordinatedRecoveryRestorePort,
  type RecoveryWorkspaceRestoreAdapter
} from "./atomicRestore";
import {
  createUnavailableRecoveryRuntime,
  type RecoveryJourneyRuntime
} from "./journey";
import { RecoveryJourneyController } from "./journeyController";
import {
  ExpoRecoveryCrypto,
  NobleRecoveryArgon2id
} from "./expoCrypto";
import {
  chooseEncryptedRecoveryKit,
  ExpoRecoveryKitStorage,
  shareEncryptedRecoveryKit
} from "./nativeFiles";
import { RecoveryKitError } from "./types";

const EMPTY_CURSOR: SyncCursor = {
  cursorVersion: 1,
  value: null,
  issuedAt: null
};

export interface SignedRecoveryRuntimeDependencies {
  readonly profile: RuntimeProfile;
  readonly repository: NativeWorkspaceRepository;
  readonly attachmentStore: ScopedAttachmentStore | null;
  readonly currentWorkspace: () => NativeWorkspace | null;
  readonly currentHouseholdId: () => string | null;
  readonly currentDeviceId: () => string | null;
  /**
   * Serializes the whole create/restore operation against normal workspace
   * mutations and foreground sync.
   */
  readonly runExclusive: <T>(work: () => Promise<T>) => Promise<T>;
  readonly onRestored: (
    workspace: NativeWorkspace,
    revision: number
  ) => void;
  readonly now?: () => string;
}

function unavailableLockedRuntime(): RecoveryJourneyRuntime {
  const message =
    "Unlock a verified household vault before creating or opening a Recovery Kit.";
  const reject = async (): Promise<never> => {
    throw new RecoveryKitError("RESTORE_REJECTED", message);
  };
  return {
    capability: {
      kind: "unavailable",
      reason: "vault-locked",
      title: "Unlock the household vault",
      description:
        "Recovery Kit stays sealed until this installed app has opened an encrypted household vault.",
      nextStep: "Unlock this household, then return to Recovery Kit."
    },
    create: reject,
    share: reject,
    chooseAndPreview: reject,
    restore: reject,
    clearPreview() {}
  };
}

function assertCurrentWorkspace(
  currentWorkspace: () => NativeWorkspace | null,
  currentHouseholdId: () => string | null
): NativeWorkspace {
  const workspace = currentWorkspace();
  const householdId = currentHouseholdId();
  if (
    !workspace ||
    !householdId ||
    workspace.household.id !== householdId ||
    workspace.mode === "sample"
  ) {
    throw new RecoveryKitError(
      "RESTORE_REJECTED",
      "Open the verified personal household before using Recovery Kit."
    );
  }
  return workspace;
}

export function createSignedRecoveryWorkspaceRestoreAdapter(
  dependencies: Pick<
    SignedRecoveryRuntimeDependencies,
    | "repository"
    | "currentWorkspace"
    | "currentHouseholdId"
    | "currentDeviceId"
    | "onRestored"
  >
): RecoveryWorkspaceRestoreAdapter {
  let preflight:
    | {
        readonly revision: number;
        readonly householdId: string;
      }
    | null = null;

  return {
    async preflight(metadata) {
      const workspace = assertCurrentWorkspace(
        dependencies.currentWorkspace,
        dependencies.currentHouseholdId
      );
      if (metadata.workspaceSchemaVersion !== workspace.schemaVersion) {
        throw new RecoveryKitError(
          "UNSUPPORTED_VERSION",
          "This Recovery Kit uses a different workspace schema version."
        );
      }
      const [loaded, syncState, pending] = await Promise.all([
        dependencies.repository.load(),
        dependencies.repository.loadSyncState(),
        dependencies.repository.listPendingOperations(1001)
      ]);
      if (
        !loaded.snapshot ||
        !isNativeWorkspace(loaded.snapshot) ||
        loaded.snapshot.household.id !== workspace.household.id
      ) {
        throw new RecoveryKitError(
          "RESTORE_REJECTED",
          "The active encrypted vault changed before restore preflight."
        );
      }
      if (pending.length > 0 || syncState.conflicts.length > 0) {
        throw new RecoveryKitError(
          "RESTORE_REJECTED",
          "Sync or resolve every pending change before replacing this household vault."
        );
      }
      preflight = {
        revision: loaded.revision,
        householdId: workspace.household.id
      };
    },
    async replaceWorkspaceAtomically(value, workspaceSchemaVersion) {
      const checked = preflight;
      preflight = null;
      const current = assertCurrentWorkspace(
        dependencies.currentWorkspace,
        dependencies.currentHouseholdId
      );
      const deviceId = dependencies.currentDeviceId();
      if (
        !checked ||
        !deviceId ||
        !isNativeWorkspace(value) ||
        value.schemaVersion !== workspaceSchemaVersion ||
        value.household.id !== checked.householdId ||
        current.household.id !== checked.householdId
      ) {
        throw new RecoveryKitError(
          "RESTORE_REJECTED",
          "Recovery Kit no longer matches the active household vault."
        );
      }

      const loaded = await dependencies.repository.load();
      if (loaded.revision !== checked.revision) {
        throw new RecoveryKitError(
          "RESTORE_REJECTED",
          "The household changed after verification. Verify the Recovery Kit again."
        );
      }
      const restored: NativeWorkspace = {
        ...value,
        deviceId,
        syncStatus: "local-only",
        lastSyncedAt: null
      };
      const committed = await dependencies.repository.commitSync({
        expectedRevision: checked.revision,
        nextRevision: checked.revision + 1,
        snapshot: restored,
        // A Recovery Kit snapshot and the replaced vault's old cloud cursor
        // are not one atomic history. Pull from the beginning on the next
        // foreground reconciliation so no server change is skipped.
        cursor: EMPTY_CURSOR,
        acknowledgedOperationIds: [],
        conflicts: []
      });
      if (!committed.ok) {
        throw new RecoveryKitError(
          "RESTORE_REJECTED",
          "The encrypted workspace changed before replacement."
        );
      }
      dependencies.onRestored(restored, committed.value.revision);
    }
  };
}

/**
 * Builds the installed-app Recovery Kit runtime. Calling this in Expo Go or
 * web returns the existing, visibly unavailable preview runtime before any
 * filesystem, repository, or Argon2 adapter is constructed.
 */
export function createSignedRecoveryJourneyRuntime(
  dependencies: SignedRecoveryRuntimeDependencies
): RecoveryJourneyRuntime {
  if (dependencies.profile !== "native-secure") {
    return createUnavailableRecoveryRuntime(dependencies.profile);
  }

  const store = dependencies.attachmentStore;
  const attachmentRestore =
    store && isRecoveryCapableAttachmentStore(store)
      ? asRecoveryAttachmentRestoreAdapter(store)
      : null;
  if (
    !dependencies.repository.durable ||
    !dependencies.repository.encryptedAtRest ||
    !store ||
    !isRecoveryCapableAttachmentStore(store) ||
    !attachmentRestore
  ) {
    return unavailableLockedRuntime();
  }

  const crypto = new ExpoRecoveryCrypto(new NobleRecoveryArgon2id());
  const storage = new ExpoRecoveryKitStorage();

  const restore = createCoordinatedRecoveryRestorePort({
    attachments: attachmentRestore,
    workspace: createSignedRecoveryWorkspaceRestoreAdapter(dependencies)
  });

  const controller = new RecoveryJourneyController({
    crypto,
    attachments: store,
    storage,
    restore,
    createRequest: async () => {
      const workspace = assertCurrentWorkspace(
        dependencies.currentWorkspace,
        dependencies.currentHouseholdId
      );
      return buildRecoveryKitRequest(
        workspace,
        (dependencies.now ?? (() => new Date().toISOString()))(),
        store
      );
    },
    chooseEncryptedKit: chooseEncryptedRecoveryKit,
    shareEncryptedKit: shareEncryptedRecoveryKit,
    currentHouseholdId: dependencies.currentHouseholdId,
    ...(dependencies.now ? { now: dependencies.now } : {})
  });

  return {
    capability: controller.capability,
    create: (passphrase) =>
      dependencies.runExclusive(() => controller.create(passphrase)),
    share: (reference) => controller.share(reference),
    chooseAndPreview: (passphrase) =>
      controller.chooseAndPreview(passphrase),
    restore: (previewId, confirmation) =>
      dependencies.runExclusive(() =>
        controller.restore(previewId, confirmation)
      ),
    clearPreview: () => controller.clearPreview()
  };
}
