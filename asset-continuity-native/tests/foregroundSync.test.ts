import type {
  ContractError,
  Result,
  SyncChange,
  SyncConflict,
  SyncCursor,
  SyncOperation,
  SyncTransport,
  WorkspaceBootstrapDescriptor
} from "@alyr/contracts";

import {
  applyServerChanges,
  reconcileForeground
} from "@/data/foregroundSync";
import {
  createConflictReapplyOperation,
  isDurableSyncConflict,
  markConflictReapplying
} from "@/data/conflictInbox";
import { MemoryWorkspaceRepository } from "@/data/memoryRepository";
import { createLocalOperation } from "@/data/sync";
import type {
  NativeAsset,
  NativePlace,
  NativeWorkspace
} from "@/domain/model";
import { createWorkspace } from "@/domain/sample";
import {
  getPortfolioValueRecords,
  recordPortfolioValue
} from "@/domain/portfolio";
import { createPortfolioValueOperation } from "@/state/WorkspaceProvider";

const HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000101";
const ACCOUNT_ID = "00000000-0000-4000-8000-000000000102";
const MEMBERSHIP_ID = "00000000-0000-4000-8000-000000000103";
const PLACE_ID = "00000000-0000-4000-8000-000000000201";
const ASSET_ID = "00000000-0000-4000-8000-000000000301";
const FIXED_TIME = "2026-07-27T08:00:00.000Z";

function cursor(value: number): SyncCursor {
  return {
    cursorVersion: 1,
    value: String(value),
    issuedAt: FIXED_TIME
  };
}

function bootstrapDescriptor(): WorkspaceBootstrapDescriptor {
  return {
    householdId: HOUSEHOLD_ID,
    householdName: "Rahman household",
    householdVersion: 1,
    householdCreatedAt: FIXED_TIME,
    membershipId: MEMBERSHIP_ID,
    accountId: ACCOUNT_ID,
    role: "owner",
    membershipVersion: 1
  };
}

function offline<T>(): Result<T> {
  return {
    ok: false,
    error: {
      errorVersion: 1,
      code: "OFFLINE",
      message: "Test transport is offline.",
      retryable: true
    }
  };
}

class TestSyncServer {
  readonly ledger: SyncChange[] = [];
  readonly accepted = new Map<string, SyncChange>();
  readonly assetVersions = new Map<string, number>();
  readonly locationVersions = new Map<string, number>();
  readonly placeVersions = new Map<string, number>();
  readonly spaceVersions = new Map<string, number>();
  readonly valueVersions = new Map<string, number>();
  pushCount = 0;
  applyCount = 0;
  failNextPush = false;
  failNextPull = false;

  transport(): SyncTransport {
    return {
      push: async (operations) => this.push(operations),
      pull: async (householdId, after) =>
        this.pull(householdId, after)
    };
  }

  private async push(
    operations: readonly SyncOperation[]
  ): Promise<
    Result<{
      readonly acknowledgedOperationIds: readonly string[];
      readonly conflicts: readonly SyncConflict[];
      readonly cursor: SyncCursor;
    }>
  > {
    this.pushCount += 1;
    if (this.failNextPush) {
      this.failNextPush = false;
      return offline();
    }
    const acknowledgedOperationIds: string[] = [];
    const conflicts: SyncConflict[] = [];
    for (const operation of operations) {
      const existing = this.accepted.get(operation.operationId);
      if (existing) {
        acknowledgedOperationIds.push(operation.operationId);
        continue;
      }
      const command = operation.command;
      const entityId = command.aggregateId!;
      let version = 1;
      let result: Record<string, string | number | boolean | null> = {};
      if (command.type === "place.create") {
        version = 1;
        this.placeVersions.set(entityId, version);
      } else if (command.type === "place.update") {
        const current = this.placeVersions.get(entityId) ?? 0;
        if (command.observedVersion !== current) {
          conflicts.push(
            this.conflict(operation, current, "location")
          );
          continue;
        }
        version = current + 1;
        this.placeVersions.set(entityId, version);
      } else if (command.type === "space.create") {
        version = 1;
        this.spaceVersions.set(entityId, version);
      } else if (command.type === "space.update") {
        const current = this.spaceVersions.get(entityId) ?? 0;
        if (command.observedVersion !== current) {
          conflicts.push(
            this.conflict(operation, current, "location")
          );
          continue;
        }
        version = current + 1;
        this.spaceVersions.set(entityId, version);
      } else if (command.type === "asset.create") {
        version = 1;
        this.assetVersions.set(entityId, version);
      } else if (command.type === "asset.move") {
        const currentLocation =
          this.locationVersions.get(entityId) ?? 0;
        if (command.observedVersion !== currentLocation) {
          conflicts.push(
            this.conflict(operation, currentLocation, "location")
          );
          continue;
        }
        const currentAsset = this.assetVersions.get(entityId) ?? 0;
        version = currentAsset + 1;
        const locationVersion = currentLocation + 1;
        this.assetVersions.set(entityId, version);
        this.locationVersions.set(entityId, locationVersion);
        result = { locationVersion };
      } else if (
        command.type === "asset.update" ||
        command.type === "asset.archive" ||
        command.type === "asset.restore"
      ) {
        const current = this.assetVersions.get(entityId) ?? 0;
        if (command.observedVersion !== current) {
          conflicts.push(
            this.conflict(operation, current, "lifecycle")
          );
          continue;
        }
        version = current + 1;
        this.assetVersions.set(entityId, version);
      } else if (command.type === "value.create") {
        version = 1;
        this.valueVersions.set(entityId, version);
      } else if (
        command.type === "value.update" ||
        command.type === "value.delete"
      ) {
        const current = this.valueVersions.get(entityId) ?? 0;
        if (command.observedVersion !== current) {
          conflicts.push(
            this.conflict(operation, current, "value")
          );
          continue;
        }
        version = current + 1;
        this.valueVersions.set(entityId, version);
      } else {
        throw new Error(`Test server does not support ${command.type}.`);
      }
      const change: SyncChange = {
        sequence: this.ledger.length + 1,
        entityType: command.type.split(".", 1)[0]!,
        entityId,
        householdId: operation.householdId,
        version,
        tombstoned: command.type === "value.delete",
        body:
          command.type === "value.delete"
            ? null
            : {
                operationId: operation.operationId,
                command: command.type,
                payload: command.payload,
                result
              },
        changedAt: command.occurredAt
      };
      this.ledger.push(change);
      this.accepted.set(operation.operationId, change);
      this.applyCount += 1;
      acknowledgedOperationIds.push(operation.operationId);
    }
    return {
      ok: true,
      value: {
        acknowledgedOperationIds,
        conflicts,
        cursor: cursor(this.ledger.length)
      }
    };
  }

  private conflict(
    operation: SyncOperation,
    serverVersion: number,
    conflictKind: SyncConflict["conflictKind"]
  ): SyncConflict {
    return {
      operationId: operation.operationId,
      entityId: operation.command.aggregateId!,
      conflictKind,
      serverVersion,
      message: "Another device changed this record."
    };
  }

  private async pull(
    householdId: string,
    after: SyncCursor
  ): Promise<
    Result<{
      readonly workspace: WorkspaceBootstrapDescriptor;
      readonly changes: readonly SyncChange[];
      readonly cursor: SyncCursor;
    }>
  > {
    if (this.failNextPull) {
      this.failNextPull = false;
      return offline();
    }
    const sequence = Number(after.value ?? "0");
    const changes = this.ledger.filter(
      (change) =>
        change.householdId === householdId &&
        change.sequence > sequence
    );
    return {
      ok: true,
      value: {
        workspace: bootstrapDescriptor(),
        changes,
        cursor: cursor(
          changes.at(-1)?.sequence ?? sequence
        )
      }
    };
  }
}

function emptyWorkspace(deviceSuffix: string): NativeWorkspace {
  return createWorkspace("personal", FIXED_TIME, {
    householdId: HOUSEHOLD_ID,
    ownerMemberId: `00000000-0000-4000-8000-0000000004${deviceSuffix}`,
    deviceId: `00000000-0000-4000-8000-0000000005${deviceSuffix}`
  });
}

function seededWorkspace(
  deviceSuffix: string
): {
  readonly workspace: NativeWorkspace;
  readonly operations: readonly SyncOperation[];
} {
  const base = emptyWorkspace(deviceSuffix);
  const place: NativePlace = {
    id: PLACE_ID,
    householdId: HOUSEHOLD_ID,
    version: 1,
    name: "West Bay home",
    kind: "property",
    tenure: "owned",
    addressSummary: "West Bay, Doha",
    regionLabel: "Doha",
    latitude: 25.325,
    longitude: 51.53,
    locationSource: "user_pin",
    precision: "user_placed",
    horizontalAccuracyMeters: null,
    observedAt: FIXED_TIME,
    confirmedAt: FIXED_TIME,
    rooms: [],
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME
  };
  const asset: NativeAsset = {
    id: ASSET_ID,
    version: 2,
    locationRevisionVersion: 1,
    householdId: HOUSEHOLD_ID,
    name: "GMT watch",
    categoryId: "lifestyle.watch",
    categoryLabel: "Watch",
    photoUri: null,
    photoProtectedUri: null,
    photoChecksumSha256: null,
    photoEvidenceId: null,
    locationStatus: "known",
    placeId: PLACE_ID,
    roomId: null,
    locatorText: "Safe",
    evidenceIds: [],
    lifecycleStatus: "active",
    archivedAt: null,
    syncStatus: "on-device",
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME
  };
  const workspace: NativeWorkspace = {
    ...base,
    places: [place],
    assets: [asset]
  };
  const operation = (
    operationId: string,
    type: SyncOperation["command"]["type"],
    aggregateId: string,
    observedVersion: number,
    payload: SyncOperation["command"]["payload"]
  ) =>
    createLocalOperation(workspace, {
      type,
      aggregateId,
      payload,
      operationId,
      idempotencyKey: `idem-${operationId}`,
      observedVersion,
      occurredAt: FIXED_TIME
    });
  return {
    workspace,
    operations: [
      operation("op-place-create", "place.create", PLACE_ID, 0, {
        name: place.name,
        kind: place.kind ?? "unknown",
        tenure: place.tenure ?? "unknown",
        addressText: place.addressSummary,
        regionLabel: place.regionLabel,
        latitude: place.latitude,
        longitude: place.longitude,
        locationSource: place.locationSource,
        locationPrecision: place.precision,
        horizontalAccuracyM: place.horizontalAccuracyMeters,
        observedAt: place.observedAt,
        confirmedAt: place.confirmedAt
      }),
      operation("op-asset-create", "asset.create", ASSET_ID, 0, {
        name: asset.name,
        categoryId: asset.categoryId,
        categoryPath: asset.categoryId.split("."),
        importance: "ordinary",
        profile: {}
      }),
      operation("op-asset-move", "asset.move", ASSET_ID, 0, {
        assignmentId:
          "00000000-0000-4000-8000-000000000601",
        placeId: PLACE_ID,
        spaceId: null,
        status: "known",
        locationDetail: "Safe",
        source: "user"
      })
    ]
  };
}

async function repositoryWith(
  workspace: NativeWorkspace,
  operations: readonly SyncOperation[] = []
): Promise<MemoryWorkspaceRepository> {
  const repository = new MemoryWorkspaceRepository();
  await repository.initialize();
  const committed = await repository.commit({
    expectedRevision: 0,
    nextRevision: 1,
    snapshot: workspace,
    operations
  });
  expect(committed.ok).toBe(true);
  return repository;
}

async function cleanRepository(): Promise<MemoryWorkspaceRepository> {
  const repository = new MemoryWorkspaceRepository();
  await repository.initialize();
  return repository;
}

function assertSuccess(
  result: Awaited<ReturnType<typeof reconcileForeground>>
) {
  expect(result.kind).toBe("synced");
  if (result.kind !== "synced") {
    throw new Error("Expected foreground sync to succeed.");
  }
  return result;
}

describe("production-truthful foreground reconciliation", () => {
  it("materializes an existing signed household on a clean device", async () => {
    const server = new TestSyncServer();
    const seeded = seededWorkspace("10");
    const origin = await repositoryWith(
      seeded.workspace,
      seeded.operations
    );
    assertSuccess(
      await reconcileForeground({
        repository: origin,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID
      })
    );

    const cleanDevice = await cleanRepository();
    const restored = assertSuccess(
      await reconcileForeground({
        repository: cleanDevice,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID,
        accountId: ACCOUNT_ID,
        deviceId: "00000000-0000-4000-8000-000000000710",
        now: () => FIXED_TIME
      })
    );

    expect(restored.workspace).toMatchObject({
      deviceId: "00000000-0000-4000-8000-000000000710",
      household: {
        id: HOUSEHOLD_ID,
        name: "Rahman household"
      },
      syncStatus: "ready"
    });
    expect(restored.workspace.members).toEqual([
      expect.objectContaining({
        id: MEMBERSHIP_ID,
        householdId: HOUSEHOLD_ID,
        role: "owner",
        status: "active"
      })
    ]);
    expect(restored.workspace.places).toHaveLength(1);
    expect(restored.workspace.places[0]).toMatchObject({
      kind: "property",
      tenure: "owned"
    });
    expect(restored.workspace.assets).toEqual([
      expect.objectContaining({
        id: ASSET_ID,
        name: "GMT watch",
        syncStatus: "synced"
      })
    ]);
    expect((await cleanDevice.load()).revision).toBe(1);
    expect(await cleanDevice.listPendingOperations(10)).toEqual([]);
  });

  it("keeps a clean vault empty after an offline restore and succeeds on retry", async () => {
    const server = new TestSyncServer();
    const repository = await cleanRepository();
    server.failNextPull = true;

    const first = await reconcileForeground({
      repository,
      transport: server.transport(),
      householdId: HOUSEHOLD_ID,
      accountId: ACCOUNT_ID,
      deviceId: "00000000-0000-4000-8000-000000000711"
    });
    expect(first).toMatchObject({
      kind: "offline",
      workspace: null,
      error: { code: "OFFLINE", retryable: true }
    });
    expect(await repository.load()).toEqual({
      revision: 0,
      snapshot: null
    });
    expect((await repository.loadSyncState()).cursor.value).toBeNull();

    const retried = assertSuccess(
      await reconcileForeground({
        repository,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID,
        accountId: ACCOUNT_ID,
        deviceId: "00000000-0000-4000-8000-000000000711"
      })
    );
    expect(retried.workspace.household.id).toBe(HOUSEHOLD_ID);
    expect((await repository.load()).revision).toBe(1);
  });

  it("reuses the restored cursor without duplicating pulled records", async () => {
    const server = new TestSyncServer();
    const seeded = seededWorkspace("12");
    const origin = await repositoryWith(
      seeded.workspace,
      seeded.operations
    );
    assertSuccess(
      await reconcileForeground({
        repository: origin,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID
      })
    );
    const repository = await cleanRepository();
    const first = assertSuccess(
      await reconcileForeground({
        repository,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID,
        accountId: ACCOUNT_ID,
        deviceId: "00000000-0000-4000-8000-000000000712"
      })
    );
    const second = assertSuccess(
      await reconcileForeground({
        repository,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID,
        accountId: ACCOUNT_ID,
        deviceId: first.workspace.deviceId
      })
    );

    expect(first.cursor.value).toBe("3");
    expect(second.cursor.value).toBe("3");
    expect(second.workspace.places.map((place) => place.id)).toEqual([
      PLACE_ID
    ]);
    expect(second.workspace.assets.map((asset) => asset.id)).toEqual([
      ASSET_ID
    ]);
    expect(server.applyCount).toBe(3);
  });

  it("does not materialize a clean vault after membership revocation", async () => {
    const repository = await cleanRepository();
    const denied: SyncTransport = {
      push: async () => {
        throw new Error("A clean device must not push.");
      },
      pull: async () => ({
        ok: false as const,
        error: {
          errorVersion: 1 as const,
          code: "AUTHORIZATION_DENIED" as const,
          message: "You no longer have access to this household.",
          retryable: false
        }
      })
    };
    const result = await reconcileForeground({
      repository,
      transport: denied,
      householdId: HOUSEHOLD_ID,
      accountId: ACCOUNT_ID,
      deviceId: "00000000-0000-4000-8000-000000000713"
    });

    expect(result).toMatchObject({
      kind: "needs-attention",
      workspace: null,
      error: {
        code: "AUTHORIZATION_DENIED",
        retryable: false
      }
    });
    expect(await repository.load()).toEqual({
      revision: 0,
      snapshot: null
    });
  });

  it("converges two devices through ordered server changes", async () => {
    const server = new TestSyncServer();
    const seeded = seededWorkspace("01");
    const deviceA = await repositoryWith(
      seeded.workspace,
      seeded.operations
    );
    const deviceB = await repositoryWith(emptyWorkspace("02"));

    assertSuccess(
      await reconcileForeground({
        repository: deviceA,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID,
        now: () => FIXED_TIME
      })
    );
    assertSuccess(
      await reconcileForeground({
        repository: deviceB,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID,
        now: () => FIXED_TIME
      })
    );

    const a = (await deviceA.load()).snapshot as NativeWorkspace;
    const b = (await deviceB.load()).snapshot as NativeWorkspace;
    expect(b.places[0]).toMatchObject({
      id: a.places[0]?.id,
      name: a.places[0]?.name,
      addressSummary: a.places[0]?.addressSummary,
      latitude: a.places[0]?.latitude,
      longitude: a.places[0]?.longitude,
      version: a.places[0]?.version
    });
    expect(a.places[0]?.regionLabel).toBe("Doha");
    expect(b.assets).toEqual(a.assets);
    expect(b.assets[0]).toMatchObject({
      version: 2,
      locationRevisionVersion: 1,
      syncStatus: "synced"
    });
  });

  it("applies Place metadata without erasing its exact pin", () => {
    const seeded = seededWorkspace("31").workspace;
    const place = seeded.places[0]!;
    const updated = applyServerChanges(
      seeded,
      [
        {
          sequence: 1,
          entityType: "place",
          entityId: place.id,
          householdId: HOUSEHOLD_ID,
          version: 2,
          tombstoned: false,
          body: {
            operationId: "remote-place-metadata",
            command: "place.update",
            payload: {
              name: "West Bay family archive",
              kind: "storage",
              tenure: "unknown",
              addressSummary: "West Bay Lagoon, gate 3",
              regionLabel: "Doha"
            },
            result: {}
          },
          changedAt: FIXED_TIME
        }
      ],
      {
        householdId: HOUSEHOLD_ID,
        conflictedEntityIds: new Set(),
        localOperationIds: new Set()
      }
    );

    expect(updated.places[0]).toMatchObject({
      name: "West Bay family archive",
      kind: "storage",
      tenure: "unknown",
      addressSummary: "West Bay Lagoon, gate 3",
      regionLabel: "Doha",
      latitude: place.latitude,
      longitude: place.longitude,
      locationSource: place.locationSource,
      precision: place.precision,
      version: 2
    });
  });

  it("applies a versioned remote space edit without duplicating it", () => {
    const seeded = seededWorkspace("32").workspace;
    const place = seeded.places[0]!;
    const workspace: NativeWorkspace = {
      ...seeded,
      places: [
        {
          ...place,
          rooms: [
            {
              id: "00000000-0000-4000-8000-000000000401",
              version: 1,
              name: "Study",
              kind: "room",
              parentRoomId: null
            }
          ]
        }
      ]
    };
    const updated = applyServerChanges(
      workspace,
      [
        {
          sequence: 1,
          entityType: "space",
          entityId: workspace.places[0]!.rooms[0]!.id,
          householdId: HOUSEHOLD_ID,
          version: 2,
          tombstoned: false,
          body: {
            operationId: "remote-space-update",
            command: "space.update",
            payload: {
              placeId: place.id,
              parentSpaceId: null,
              name: "Family study",
              kind: "zone",
              ordinal: 0
            },
            result: {}
          },
          changedAt: FIXED_TIME
        }
      ],
      {
        householdId: HOUSEHOLD_ID,
        conflictedEntityIds: new Set(),
        localOperationIds: new Set()
      }
    );

    expect(updated.places[0]!.rooms).toEqual([
      {
        id: "00000000-0000-4000-8000-000000000401",
        version: 2,
        name: "Family study",
        kind: "zone",
        parentRoomId: null
      }
    ]);
  });

  it("retries the same idempotent operation after a post-push outage", async () => {
    const server = new TestSyncServer();
    const seeded = seededWorkspace("03");
    const placeOnly = [seeded.operations[0]!];
    const workspace: NativeWorkspace = {
      ...seeded.workspace,
      assets: []
    };
    const repository = await repositoryWith(workspace, placeOnly);
    server.failNextPull = true;

    const first = await reconcileForeground({
      repository,
      transport: server.transport(),
      householdId: HOUSEHOLD_ID
    });
    expect(first.kind).toBe("offline");
    expect(await repository.listPendingOperations(10)).toEqual(placeOnly);
    expect((await repository.loadSyncState()).cursor.value).toBeNull();

    assertSuccess(
      await reconcileForeground({
        repository,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID
      })
    );
    expect(server.pushCount).toBe(2);
    expect(server.applyCount).toBe(1);
    expect(server.ledger).toHaveLength(1);
    expect(await repository.listPendingOperations(10)).toEqual([]);
    expect((await repository.loadSyncState()).cursor.value).toBe("1");
  });

  it("persists and reuses the pull cursor without duplicate delivery", async () => {
    const server = new TestSyncServer();
    const seeded = seededWorkspace("04");
    const repository = await repositoryWith(
      seeded.workspace,
      seeded.operations
    );
    const first = assertSuccess(
      await reconcileForeground({
        repository,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID
      })
    );
    expect(first.cursor.value).toBe("3");
    const revisionAfterFirst = (await repository.load()).revision;

    const second = assertSuccess(
      await reconcileForeground({
        repository,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID
      })
    );
    expect(second.cursor.value).toBe("3");
    expect((await repository.load()).revision).toBe(
      revisionAfterFirst + 1
    );
    expect(server.applyCount).toBe(3);
  });

  it("keeps a conflicting local draft and records visible durable attention", async () => {
    const server = new TestSyncServer();
    const seeded = seededWorkspace("05");
    const deviceA = await repositoryWith(
      seeded.workspace,
      seeded.operations
    );
    const deviceB = await repositoryWith(emptyWorkspace("06"));
    assertSuccess(
      await reconcileForeground({
        repository: deviceA,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID
      })
    );
    assertSuccess(
      await reconcileForeground({
        repository: deviceB,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID
      })
    );

    const update = (
      repositoryWorkspace: NativeWorkspace,
      name: string,
      operationId: string
    ) => {
      const previous = repositoryWorkspace.assets[0]!;
      const asset = {
        ...previous,
        name,
        version: previous.version + 1,
        syncStatus: "on-device" as const,
        updatedAt: FIXED_TIME
      };
      return {
        workspace: {
          ...repositoryWorkspace,
          assets: [asset]
        },
        operation: createLocalOperation(repositoryWorkspace, {
          type: "asset.update",
          aggregateId: asset.id,
          payload: { name },
          operationId,
          idempotencyKey: `idem-${operationId}`,
          observedVersion: previous.version,
          occurredAt: FIXED_TIME
        })
      };
    };

    const aLoaded = await deviceA.load();
    const aUpdate = update(
      aLoaded.snapshot as NativeWorkspace,
      "GMT watch · household name",
      "op-a-update"
    );
    await deviceA.commit({
      expectedRevision: aLoaded.revision,
      nextRevision: aLoaded.revision + 1,
      snapshot: aUpdate.workspace,
      operations: [aUpdate.operation]
    });
    assertSuccess(
      await reconcileForeground({
        repository: deviceA,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID
      })
    );

    const bLoaded = await deviceB.load();
    const bUpdate = update(
      bLoaded.snapshot as NativeWorkspace,
      "GMT watch · offline draft",
      "op-b-update"
    );
    await deviceB.commit({
      expectedRevision: bLoaded.revision,
      nextRevision: bLoaded.revision + 1,
      snapshot: bUpdate.workspace,
      operations: [bUpdate.operation]
    });
    const conflict = assertSuccess(
      await reconcileForeground({
        repository: deviceB,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID
      })
    );

    expect(conflict.conflicts).toEqual([
      expect.objectContaining({
        operationId: "op-b-update",
        entityId: ASSET_ID,
        serverVersion: 3,
        clientContext: expect.objectContaining({
          contextVersion: 1,
          householdId: HOUSEHOLD_ID,
          localOperation: expect.objectContaining({
            operationId: "op-b-update"
          }),
          serverChange: expect.objectContaining({
            householdId: HOUSEHOLD_ID,
            entityId: ASSET_ID,
            version: 3
          })
        })
      })
    ]);
    expect(conflict.workspace.assets[0]).toMatchObject({
      name: "GMT watch · offline draft",
      syncStatus: "needs-attention"
    });
    expect(conflict.workspace.syncStatus).toBe("needs-attention");
    expect(await deviceB.listPendingOperations(10)).toEqual([]);
    expect((await deviceB.loadSyncState()).conflicts).toEqual(
      conflict.conflicts
    );

    const durableConflict = conflict.conflicts[0]!;
    expect(isDurableSyncConflict(durableConflict, HOUSEHOLD_ID)).toBe(
      true
    );
    if (!isDurableSyncConflict(durableConflict, HOUSEHOLD_ID)) {
      throw new Error("Expected a durable conflict fixture.");
    }
    const replacement = createConflictReapplyOperation(
      durableConflict,
      "op-b-reapply",
      "2026-07-27T08:01:00.000Z"
    );
    const currentSyncState = await deviceB.loadSyncState();
    const queuedResolution = await deviceB.commitSync({
      expectedRevision: conflict.revision,
      nextRevision: conflict.revision + 1,
      snapshot: conflict.workspace,
      cursor: currentSyncState.cursor,
      operations: [replacement],
      acknowledgedOperationIds: [],
      conflicts: [
        markConflictReapplying(
          durableConflict,
          replacement.operationId,
          replacement.createdAt
        )
      ]
    });
    expect(queuedResolution.ok).toBe(true);
    const resolved = assertSuccess(
      await reconcileForeground({
        repository: deviceB,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID
      })
    );
    expect(resolved.conflicts).toEqual([]);
    expect(await deviceB.listPendingOperations(10)).toEqual([]);
    expect((await deviceB.loadSyncState()).conflicts).toEqual([]);
    expect(resolved.workspace.assets[0]).toMatchObject({
      name: "GMT watch · offline draft",
      syncStatus: "synced"
    });
  });

  it("recovers after an offline push without losing the committed local record", async () => {
    const server = new TestSyncServer();
    const seeded = seededWorkspace("07");
    const repository = await repositoryWith(
      seeded.workspace,
      seeded.operations
    );
    server.failNextPush = true;

    const offlineResult = await reconcileForeground({
      repository,
      transport: server.transport(),
      householdId: HOUSEHOLD_ID
    });
    expect(offlineResult.kind).toBe("offline");
    expect(
      ((await repository.load()).snapshot as NativeWorkspace).assets[0]
        ?.name
    ).toBe("GMT watch");
    expect(await repository.listPendingOperations(10)).toHaveLength(3);

    assertSuccess(
      await reconcileForeground({
        repository,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID
      })
    );
    expect(await repository.listPendingOperations(10)).toEqual([]);
  });

  it("syncs a versioned value assertion across devices only after server acknowledgement", async () => {
    const server = new TestSyncServer();
    const seeded = seededWorkspace("08");
    const deviceA = await repositoryWith(
      seeded.workspace,
      seeded.operations
    );
    const deviceB = await repositoryWith(emptyWorkspace("09"));
    assertSuccess(
      await reconcileForeground({
        repository: deviceA,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID
      })
    );
    assertSuccess(
      await reconcileForeground({
        repository: deviceB,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID
      })
    );

    const loaded = await deviceA.load();
    const mutation = recordPortfolioValue(
      loaded.snapshot as NativeWorkspace,
      {
        assetId: ASSET_ID,
        amountMinor: 2_750_000,
        currency: "QAR",
        asOf: "2026-07-27"
      },
      {
        id: () =>
          "00000000-0000-4000-8000-000000000901",
        now: () => FIXED_TIME,
        today: () => "2026-07-27"
      }
    );
    expect(mutation.record.syncStatus).toBe("on-device");
    const operation = createLocalOperation(
      loaded.snapshot as NativeWorkspace,
      {
        type: "value.create",
        aggregateId: mutation.record.id,
        payload: {
          assetId: mutation.record.assetId!,
          amountMinor: mutation.record.amountMinor,
          currency: mutation.record.currency,
          asOf: mutation.record.asOf,
          source: mutation.record.source
        },
        operationId: "op-value-create",
        idempotencyKey: "idem-value-create",
        observedVersion: 0,
        occurredAt: mutation.record.updatedAt
      }
    );
    await deviceA.commit({
      expectedRevision: loaded.revision,
      nextRevision: loaded.revision + 1,
      snapshot: mutation.workspace,
      operations: [operation]
    });
    expect(
      getPortfolioValueRecords(
        (await deviceA.load()).snapshot as NativeWorkspace
      )[0]?.syncStatus
    ).toBe("on-device");

    assertSuccess(
      await reconcileForeground({
        repository: deviceA,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID
      })
    );
    assertSuccess(
      await reconcileForeground({
        repository: deviceB,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID
      })
    );

    const aValues = getPortfolioValueRecords(
      (await deviceA.load()).snapshot as NativeWorkspace
    );
    const bValues = getPortfolioValueRecords(
      (await deviceB.load()).snapshot as NativeWorkspace
    );
    expect(aValues).toEqual(bValues);
    expect(bValues).toEqual([
      expect.objectContaining({
        householdId: HOUSEHOLD_ID,
        assetId: ASSET_ID,
        version: 1,
        amountMinor: 2_750_000,
        currency: "QAR",
        syncStatus: "synced"
      })
    ]);
  });

  it("syncs an owned-property value across devices without manufacturing an Asset", async () => {
    const server = new TestSyncServer();
    const seeded = seededWorkspace("18");
    const deviceA = await repositoryWith(
      seeded.workspace,
      seeded.operations
    );
    const deviceB = await repositoryWith(emptyWorkspace("19"));
    assertSuccess(
      await reconcileForeground({
        repository: deviceA,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID
      })
    );
    assertSuccess(
      await reconcileForeground({
        repository: deviceB,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID
      })
    );

    const loaded = await deviceA.load();
    const mutation = recordPortfolioValue(
      loaded.snapshot as NativeWorkspace,
      {
        placeId: PLACE_ID,
        amountMinor: 675_000_000,
        currency: "QAR",
        asOf: "2026-07-27"
      },
      {
        id: () => "00000000-0000-4000-8000-000000000902",
        now: () => FIXED_TIME,
        today: () => "2026-07-27"
      }
    );
    const operation = createPortfolioValueOperation(
      loaded.snapshot as NativeWorkspace,
      mutation.record,
      {
        operationId: () => "op-property-value-create",
        idempotencyKey: () => "idem-property-value-create"
      }
    );
    await deviceA.commit({
      expectedRevision: loaded.revision,
      nextRevision: loaded.revision + 1,
      snapshot: mutation.workspace,
      operations: [operation]
    });

    assertSuccess(
      await reconcileForeground({
        repository: deviceA,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID
      })
    );
    assertSuccess(
      await reconcileForeground({
        repository: deviceB,
        transport: server.transport(),
        householdId: HOUSEHOLD_ID
      })
    );

    const aWorkspace = (await deviceA.load()).snapshot as NativeWorkspace;
    const bWorkspace = (await deviceB.load()).snapshot as NativeWorkspace;
    const aValues = getPortfolioValueRecords(aWorkspace);
    const bValues = getPortfolioValueRecords(bWorkspace);
    expect(aValues).toEqual(bValues);
    expect(bValues).toEqual([
      expect.objectContaining({
        householdId: HOUSEHOLD_ID,
        subject: { kind: "place", placeId: PLACE_ID },
        placeId: PLACE_ID,
        version: 1,
        amountMinor: 675_000_000,
        currency: "QAR",
        syncStatus: "synced"
      })
    ]);
    expect(bValues[0]).not.toHaveProperty("assetId");
    expect(bWorkspace.assets).toHaveLength(1);
  });
});
