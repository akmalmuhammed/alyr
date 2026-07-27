import type {
  SyncChange,
  SyncConflict
} from "@alyr/contracts";

import {
  captureConflictContexts,
  conflictFieldLabel,
  conflictProvenanceValues,
  conflictResolutionOptions,
  createConflictReapplyOperation,
  isDurableSyncConflict,
  markConflictReapplying
} from "@/data/conflictInbox";
import { resolveDurableSyncConflict } from "@/data/conflictResolution";
import { MemoryWorkspaceRepository } from "@/data/memoryRepository";
import { createLocalOperation } from "@/data/sync";
import { createWorkspace } from "@/domain/sample";

const TIME = "2026-07-27T10:00:00.000Z";

function fixture() {
  const workspace = createWorkspace("sample");
  const asset = workspace.assets[0]!;
  const operation = createLocalOperation(workspace, {
    type: "asset.move",
    aggregateId: asset.id,
    payload: {
      assetId: asset.id,
      status: "known",
      placeId: workspace.places[0]!.id,
      spaceId: workspace.places[0]!.rooms[0]!.id,
      locationDetail: "Upper cabinet"
    },
    operationId: "operation-local",
    idempotencyKey: "operation-local",
    observedVersion: 2,
    occurredAt: TIME
  });
  const conflict: SyncConflict = {
    operationId: operation.operationId,
    entityId: asset.id,
    conflictKind: "location",
    serverVersion: 3,
    message: "Changed on another device."
  };
  const serverChange: SyncChange = {
    sequence: 8,
    entityType: "asset",
    entityId: asset.id,
    householdId: workspace.household.id,
    version: 7,
    tombstoned: false,
    body: {
      operationId: "operation-cloud",
      command: "asset.move",
      payload: {
        assetId: asset.id,
        status: "known",
        placeId: workspace.places[0]!.id,
        spaceId: workspace.places[0]!.rooms[1]!.id,
        locationDetail: "Watch drawer"
      },
      result: { locationVersion: 3 }
    },
    changedAt: TIME
  };
  return { workspace, operation, conflict, serverChange };
}

describe("durable sync conflict inbox", () => {
  it("captures household-scoped local and cloud provenance", () => {
    const { workspace, operation, conflict, serverChange } = fixture();
    const [captured] = captureConflictContexts(
      [conflict],
      [operation],
      [serverChange],
      workspace.household.id,
      TIME
    );

    expect(captured).toBeDefined();
    expect(isDurableSyncConflict(captured!, workspace.household.id)).toBe(
      true
    );
    expect(captured!.clientContext.localOperation).toEqual(operation);
    expect(captured!.clientContext.serverChange).toEqual(serverChange);
    expect(conflictResolutionOptions(captured!)).toEqual([
      "keep-cloud",
      "reapply-local",
      "review-manually"
    ]);
    expect(conflictProvenanceValues(captured!)).toEqual({
      local: "Upper cabinet",
      cloud: "Watch drawer",
      cloudVerified: true
    });
    expect(conflictFieldLabel(captured!)).toBe("Location");
  });

  it("masks value-conflict provenance in pixels and accessibility", () => {
    const workspace = createWorkspace("sample");
    const asset = workspace.assets[0]!;
    const valueId = "value-conflict";
    const operation = createLocalOperation(workspace, {
      type: "value.create",
      aggregateId: valueId,
      payload: {
        assetId: asset.id,
        amountMinor: 123_450,
        currency: "QAR",
        asOf: "2026-07-27",
        source: "user-entered"
      },
      operationId: "operation-value-local",
      idempotencyKey: "operation-value-local",
      observedVersion: 1,
      occurredAt: TIME
    });
    const conflict: SyncConflict = {
      operationId: operation.operationId,
      entityId: valueId,
      conflictKind: "value",
      serverVersion: 2,
      message: "Changed on another device."
    };
    const serverChange: SyncChange = {
      sequence: 9,
      entityType: "value",
      entityId: valueId,
      householdId: workspace.household.id,
      version: 2,
      tombstoned: false,
      body: {
        operationId: "operation-value-cloud",
        command: "value.update",
        payload: {
          assetId: asset.id,
          amountMinor: 130_000,
          currency: "QAR",
          asOf: "2026-07-26",
          source: "user-entered"
        },
        result: { valueVersion: 2 }
      },
      changedAt: TIME
    };
    const [captured] = captureConflictContexts(
      [conflict],
      [operation],
      [serverChange],
      workspace.household.id,
      TIME
    );

    expect(
      conflictProvenanceValues(captured!, {
        language: "en",
        visibility: "hidden"
      })
    ).toEqual({
      local: "QAR \u2022\u2022\u2022\u2022\u2022\u2022 · 2026-07-27",
      cloud: "QAR \u2022\u2022\u2022\u2022\u2022\u2022 · 2026-07-26",
      cloudVerified: true
    });
    expect(
      conflictProvenanceValues(captured!, {
        accessibility: true,
        language: "en",
        visibility: "hidden"
      })
    ).toEqual({
      local: "QAR, recorded amount hidden · 2026-07-27",
      cloud: "QAR, recorded amount hidden · 2026-07-26",
      cloudVerified: true
    });
  });

  it("rejects cross-household provenance before persistence", () => {
    const { workspace, operation, conflict, serverChange } = fixture();
    expect(() =>
      captureConflictContexts(
        [conflict],
        [operation],
        [
          {
            ...serverChange,
            householdId: "another-household"
          }
        ],
        workspace.household.id,
        TIME
      )
    ).not.toThrow();
    const [captured] = captureConflictContexts(
      [conflict],
      [operation],
      [
        {
          ...serverChange,
          householdId: "another-household"
        }
      ],
      workspace.household.id,
      TIME
    );
    expect(captured!.clientContext.serverChange).toBeNull();

    expect(() =>
      captureConflictContexts(
        [conflict],
        [
          {
            ...operation,
            householdId: "another-household"
          }
        ],
        [serverChange],
        workspace.household.id,
        TIME
      )
    ).toThrow("household");
  });

  it("keeps permission conflicts manual-only", () => {
    const { conflict } = fixture();
    expect(
      conflictResolutionOptions({
        ...conflict,
        conflictKind: "permission"
      })
    ).toEqual(["review-manually"]);
  });

  it("names and compares the exact edited field even when the server classifies a generic version conflict", () => {
    const { workspace, conflict, serverChange } = fixture();
    const operation = createLocalOperation(workspace, {
      type: "asset.update",
      aggregateId: conflict.entityId,
      payload: {
        assetId: conflict.entityId,
        name: "Local archive name"
      },
      operationId: conflict.operationId,
      idempotencyKey: conflict.operationId,
      observedVersion: 2,
      occurredAt: TIME
    });
    const [captured] = captureConflictContexts(
      [conflict],
      [operation],
      [
        {
          ...serverChange,
          version: 3,
          body: {
            operationId: "operation-cloud-name",
            command: "asset.update",
            payload: {
              assetId: conflict.entityId,
              name: "Cloud archive name"
            },
            result: {}
          }
        }
      ],
      workspace.household.id,
      TIME
    );

    expect(conflictProvenanceValues(captured!)).toEqual({
      local: "Local archive name",
      cloud: "Cloud archive name",
      cloudVerified: true
    });
    expect(conflictFieldLabel(captured!)).toBe("Item name");
  });

  it("persists a reviewed reapply operation and clears only after its acknowledgement", async () => {
    const { workspace, operation, conflict, serverChange } = fixture();
    const repository = new MemoryWorkspaceRepository();
    await repository.initialize();
    await repository.commit({
      expectedRevision: 0,
      nextRevision: 1,
      snapshot: workspace,
      operations: [operation]
    });
    const [captured] = captureConflictContexts(
      [conflict],
      [operation],
      [serverChange],
      workspace.household.id,
      TIME
    );
    await repository.commitSync({
      expectedRevision: 1,
      nextRevision: 2,
      snapshot: workspace,
      cursor: {
        cursorVersion: 1,
        value: "8",
        issuedAt: TIME
      },
      acknowledgedOperationIds: [],
      conflicts: [captured!]
    });

    expect((await repository.loadSyncState()).conflicts).toEqual([
      captured
    ]);
    expect(await repository.listPendingOperations(10)).toEqual([]);

    const replacement = createConflictReapplyOperation(
      captured!,
      "operation-reapply",
      "2026-07-27T10:01:00.000Z"
    );
    const waiting = markConflictReapplying(
      captured!,
      replacement.operationId,
      replacement.createdAt
    );
    expect(replacement.command.observedVersion).toBe(3);
    expect(replacement.command.idempotencyKey).toBe(
      replacement.operationId
    );
    await repository.commitSync({
      expectedRevision: 2,
      nextRevision: 3,
      snapshot: workspace,
      cursor: {
        cursorVersion: 1,
        value: "8",
        issuedAt: TIME
      },
      operations: [replacement],
      acknowledgedOperationIds: [],
      conflicts: [waiting]
    });
    expect(await repository.listPendingOperations(10)).toEqual([
      replacement
    ]);
    expect((await repository.loadSyncState()).conflicts).toEqual([
      waiting
    ]);

    await repository.commitSync({
      expectedRevision: 3,
      nextRevision: 4,
      snapshot: workspace,
      cursor: {
        cursorVersion: 1,
        value: "9",
        issuedAt: "2026-07-27T10:02:00.000Z"
      },
      acknowledgedOperationIds: [replacement.operationId],
      conflicts: []
    });
    expect((await repository.loadSyncState()).conflicts).toEqual([]);
    expect(await repository.listPendingOperations(10)).toEqual([]);
  });

  it("applies only the household-verified cloud change when cloud is chosen", async () => {
    const { workspace, operation, conflict, serverChange } = fixture();
    const repository = new MemoryWorkspaceRepository();
    await repository.initialize();
    await repository.commit({
      expectedRevision: 0,
      nextRevision: 1,
      snapshot: workspace,
      operations: [operation]
    });
    const [captured] = captureConflictContexts(
      [conflict],
      [operation],
      [serverChange],
      workspace.household.id,
      TIME
    );
    await repository.commitSync({
      expectedRevision: 1,
      nextRevision: 2,
      snapshot: workspace,
      cursor: {
        cursorVersion: 1,
        value: "8",
        issuedAt: TIME
      },
      acknowledgedOperationIds: [],
      conflicts: [captured!]
    });

    const resolved = await resolveDurableSyncConflict({
      repository,
      householdId: workspace.household.id,
      operationId: conflict.operationId,
      choice: "keep-cloud",
      replacementOperationId: () => "unused",
      now: () => "2026-07-27T10:03:00.000Z"
    });

    expect(resolved.outcome).toBe("cloud-kept");
    expect(resolved.conflicts).toEqual([]);
    expect(resolved.workspace.assets[0]).toMatchObject({
      roomId: workspace.places[0]!.rooms[1]!.id,
      locatorText: "Watch drawer"
    });
    expect((await repository.loadSyncState()).conflicts).toEqual([]);
    expect(await repository.listPendingOperations(10)).toEqual([]);
  });
});
