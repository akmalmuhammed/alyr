import * as Crypto from "expo-crypto";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import type { JsonObject, SyncOperation } from "@alyr/contracts";

import {
  createDefaultAttachmentStore,
  type AttachmentStore
} from "@/data/attachmentStore";
import { createDefaultRepository } from "@/data/createRepository";
import { MemoryWorkspaceRepository } from "@/data/memoryRepository";
import type { NativeWorkspaceRepository } from "@/data/repository";
import { createLocalOperation } from "@/data/sync";
import type {
  LanguageCode,
  NativeAsset,
  NativeEvidence,
  NativePlace,
  NativeWorkspace,
  NewAssetInput,
  NewPlaceInput,
  WorkspaceMode
} from "@/domain/model";
import { isNativeWorkspace } from "@/domain/model";
import { createWorkspace } from "@/domain/sample";
import {
  addAsset,
  addPlace,
  type MutationContext,
  recordRetrieval,
  setWorkspaceLanguage
} from "@/domain/workspace";
import { isSessionPreview } from "@/runtime/environment";

interface RepositoryInfo {
  readonly kind: NativeWorkspaceRepository["kind"];
  readonly durable: boolean;
  readonly encryptedAtRest: boolean;
}

interface WorkspaceContextValue {
  readonly workspace: NativeWorkspace | null;
  readonly loading: boolean;
  readonly saving: boolean;
  readonly storageReady: boolean;
  readonly error: string | null;
  readonly repository: RepositoryInfo;
  readonly pendingOperationCount: number;
  readonly startWorkspace: (mode: WorkspaceMode) => Promise<void>;
  readonly createPlace: (input: NewPlaceInput) => Promise<NativePlace>;
  readonly createAsset: (input: NewAssetInput) => Promise<NativeAsset>;
  readonly markRetrieved: (assetId: string) => Promise<void>;
  readonly changeLanguage: (language: LanguageCode) => Promise<void>;
  readonly replaceWithPersonalWorkspace: () => Promise<void>;
  readonly exportReadableSnapshot: () => string | null;
  readonly clearError: () => void;
}

interface WorkspaceProviderProps extends PropsWithChildren {
  readonly repositoryOverride?: NativeWorkspaceRepository;
}

const fallbackRepository = new MemoryWorkspaceRepository();
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function id(_prefix: string): string {
  return Crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

const mutationContext: MutationContext = { id, now };

function createAssetOperations(
  workspace: NativeWorkspace,
  asset: NativeAsset,
  evidence: readonly NativeEvidence[],
  occurredAt: string
): SyncOperation[] {
  const operations: SyncOperation[] = [
    createLocalOperation(workspace, {
      type: "asset.create",
      aggregateId: asset.id,
      payload: {
        name: asset.name,
        categoryId: asset.categoryId,
        categoryPath: asset.categoryId.split("."),
        importance: "ordinary",
        profile: {}
      },
      operationId: id("operation"),
      idempotencyKey: id("idempotency"),
      observedVersion: 0,
      occurredAt
    }),
    createLocalOperation(workspace, {
      type: "asset.move",
      aggregateId: asset.id,
      payload: {
        assignmentId: id("location-revision"),
        placeId: asset.placeId,
        spaceId: asset.roomId,
        status: asset.locationStatus,
        locationDetail: asset.locatorText,
        source: "user"
      },
      operationId: id("operation"),
      idempotencyKey: id("idempotency"),
      observedVersion: 0,
      occurredAt
    })
  ];

  for (const item of evidence) {
    operations.push(
      createLocalOperation(workspace, {
        type: "evidence.create",
        aggregateId: item.id,
        payload: {
          assetId: item.assetId,
          kind: item.kind,
          relation: item.relation,
          title: item.fileName,
          storageState: "on-device"
        },
        operationId: id("operation"),
        idempotencyKey: id("idempotency"),
        observedVersion: 0,
        occurredAt
      })
    );

    if (
      item.checksumSha256 &&
      /^[a-f0-9]{64}$/u.test(item.checksumSha256) &&
      item.byteSize > 0
    ) {
      operations.push(
        createLocalOperation(workspace, {
          type: "evidence.version.add",
          aggregateId: item.versionId,
          payload: {
            evidenceId: item.id,
            blobObjectId: item.blobObjectId,
            fileName: item.fileName,
            mimeType: item.mimeType,
            byteSize: item.byteSize,
            checksumSha256: item.checksumSha256
          },
          operationId: id("operation"),
          idempotencyKey: id("idempotency"),
          observedVersion: 0,
          occurredAt,
          prerequisites: [
            {
              kind: "blob-stored",
              blobObjectId: item.blobObjectId
            }
          ]
        })
      );
    }
  }

  return operations;
}

export function WorkspaceProvider({
  children,
  repositoryOverride
}: WorkspaceProviderProps) {
  const [workspace, setWorkspace] = useState<NativeWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingOperationCount, setPendingOperationCount] = useState(0);
  const [repository, setRepository] = useState<NativeWorkspaceRepository>(
    repositoryOverride ?? fallbackRepository
  );

  const workspaceRef = useRef<NativeWorkspace | null>(null);
  const revisionRef = useRef(0);
  const storageReadyRef = useRef(false);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const attachmentStoreRef = useRef<AttachmentStore>(
    createDefaultAttachmentStore()
  );

  const refreshPendingCount = useCallback(
    async (activeRepository: NativeWorkspaceRepository) => {
      const operations = await activeRepository.listPendingOperations(1000);
      setPendingOperationCount(operations.length);
    },
    []
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const nextRepository =
          repositoryOverride ?? (await createDefaultRepository());
        await nextRepository.initialize();
        const loaded = await nextRepository.load();
        if (!active) {
          return;
        }
        setRepository(nextRepository);
        storageReadyRef.current = true;
        setStorageReady(true);
        revisionRef.current = loaded.revision;
        if (loaded.snapshot !== null) {
          if (!isNativeWorkspace(loaded.snapshot)) {
            setError(
              "This device contains an unsupported workspace. Nothing was overwritten."
            );
          } else {
            workspaceRef.current = loaded.snapshot;
            setWorkspace(loaded.snapshot);
          }
        }
        await refreshPendingCount(nextRepository);
      } catch {
        if (active) {
          setError(
            isSessionPreview
              ? "The preview store could not be opened. Nothing was overwritten."
              : "The encrypted vault could not be opened. Saving is blocked so ALYR never falls back to plaintext storage."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshPendingCount, repositoryOverride]);

  const commitWorkspace = useCallback(
    async (
      nextWorkspace: NativeWorkspace,
      operations: readonly SyncOperation[]
    ): Promise<void> => {
      if (!storageReadyRef.current) {
        throw new Error(
          "The local vault is unavailable. Nothing was saved."
        );
      }
      const expectedRevision = revisionRef.current;
      const nextRevision = expectedRevision + 1;
      const result = await repository.commit({
        expectedRevision,
        nextRevision,
        snapshot: nextWorkspace,
        operations
      });
      if (!result.ok) {
        const latest = await repository.load();
        revisionRef.current = latest.revision;
        if (latest.snapshot && isNativeWorkspace(latest.snapshot)) {
          workspaceRef.current = latest.snapshot;
          setWorkspace(latest.snapshot);
        }
        throw new Error(result.error.message);
      }
      revisionRef.current = result.value.revision;
      workspaceRef.current = nextWorkspace;
      setWorkspace(nextWorkspace);
      await refreshPendingCount(repository);
    },
    [refreshPendingCount, repository]
  );

  const enqueue = useCallback(
    async <T,>(work: () => Promise<T>): Promise<T> => {
      setSaving(true);
      const run = queueRef.current.then(work, work);
      queueRef.current = run.catch(() => undefined);
      try {
        return await run;
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "The update could not be saved."
        );
        throw caught;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const startWorkspace = useCallback(
    async (mode: WorkspaceMode): Promise<void> =>
      enqueue(async () => {
        const nextWorkspace = createWorkspace(mode, now(), {
          householdId: Crypto.randomUUID(),
          ownerMemberId: Crypto.randomUUID(),
          deviceId: Crypto.randomUUID()
        });
        await commitWorkspace(nextWorkspace, []);
      }),
    [commitWorkspace, enqueue]
  );

  const createPlace = useCallback(
    async (input: NewPlaceInput): Promise<NativePlace> =>
      enqueue(async () => {
        const current = workspaceRef.current;
        if (!current) {
          throw new Error("Choose a workspace before adding a Place.");
        }
        const result = addPlace(current, input, mutationContext);
        const occurredAt = now();
        const operations =
          current.mode === "sample"
            ? []
            : [
                createLocalOperation(current, {
                  type: "place.create",
                  aggregateId: result.place.id,
                  payload: {
                    name: result.place.name,
                    kind: "home",
                    tenure: "unknown",
                    addressText: result.place.addressSummary,
                    latitude: result.place.latitude,
                    longitude: result.place.longitude,
                    locationSource: result.place.locationSource,
                    locationPrecision: result.place.precision,
                    horizontalAccuracyM:
                      result.place.horizontalAccuracyMeters,
                    observedAt: result.place.observedAt,
                    confirmedAt: result.place.confirmedAt
                  },
                  operationId: id("operation"),
                  idempotencyKey: id("idempotency"),
                  observedVersion: 0,
                  occurredAt
                }),
                ...result.place.rooms.map((room, ordinal) =>
                  createLocalOperation(current, {
                    type: "space.create",
                    aggregateId: room.id,
                    payload: {
                      placeId: result.place.id,
                      parentSpaceId: room.parentRoomId,
                      name: room.name,
                      kind: room.kind,
                      ordinal
                    },
                    operationId: id("operation"),
                    idempotencyKey: id("idempotency"),
                    observedVersion: 0,
                    occurredAt
                  })
                )
              ];
        await commitWorkspace(result.workspace, operations);
        return result.place;
      }),
    [commitWorkspace, enqueue]
  );

  const createAsset = useCallback(
    async (input: NewAssetInput): Promise<NativeAsset> =>
      enqueue(async () => {
        const current = workspaceRef.current;
        if (!current) {
          throw new Error("Choose a workspace before adding an asset.");
        }
        const [protectedPhoto, protectedEvidence] = await Promise.all([
          input.photo
            ? attachmentStoreRef.current.ingest(input.photo)
            : Promise.resolve(null),
          input.evidence
            ? attachmentStoreRef.current.ingest(input.evidence)
            : Promise.resolve(null)
        ]);
        const result = addAsset(
          current,
          {
            ...input,
            photo: protectedPhoto,
            evidence: protectedEvidence
          },
          mutationContext
        );
        const occurredAt = now();
        const newEvidence = result.workspace.evidence.filter(
          (item) => item.assetId === result.asset.id
        );
        const operations =
          current.mode === "sample"
            ? []
            : createAssetOperations(
                current,
                result.asset,
                newEvidence,
                occurredAt
              );
        await commitWorkspace(result.workspace, operations);
        return result.asset;
      }),
    [commitWorkspace, enqueue]
  );

  const markRetrieved = useCallback(
    async (assetId: string): Promise<void> =>
      enqueue(async () => {
        const current = workspaceRef.current;
        if (!current) {
          return;
        }
        const next = recordRetrieval(current, assetId, mutationContext);
        await commitWorkspace(next, []);
      }),
    [commitWorkspace, enqueue]
  );

  const changeLanguage = useCallback(
    async (language: LanguageCode): Promise<void> =>
      enqueue(async () => {
        const current = workspaceRef.current;
        if (!current) {
          return;
        }
        const next = setWorkspaceLanguage(current, language, now());
        await commitWorkspace(next, []);
      }),
    [commitWorkspace, enqueue]
  );

  const replaceWithPersonalWorkspace = useCallback(
    async (): Promise<void> => startWorkspace("personal"),
    [startWorkspace]
  );

  const exportReadableSnapshot = useCallback((): string | null => {
    const current = workspaceRef.current;
    if (!current) {
      return null;
    }
    return JSON.stringify(
      {
        format: "alyr-readable-snapshot",
        version: 1,
        exportedAt: now(),
        warning:
          "Readable JSON is not an encrypted Recovery Kit or automatic backup.",
        workspace: current
      },
      null,
      2
    );
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspace,
      loading,
      saving,
      storageReady,
      error,
      repository: {
        kind: repository.kind,
        durable: repository.durable,
        encryptedAtRest: repository.encryptedAtRest
      },
      pendingOperationCount,
      startWorkspace,
      createPlace,
      createAsset,
      markRetrieved,
      changeLanguage,
      replaceWithPersonalWorkspace,
      exportReadableSnapshot,
      clearError: () => setError(null)
    }),
    [
      changeLanguage,
      createAsset,
      createPlace,
      error,
      exportReadableSnapshot,
      loading,
      markRetrieved,
      pendingOperationCount,
      replaceWithPersonalWorkspace,
      repository,
      saving,
      storageReady,
      startWorkspace,
      workspace
    ]
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider.");
  }
  return context;
}

export function workspaceAsJson(workspace: NativeWorkspace): JsonObject {
  return workspace;
}
