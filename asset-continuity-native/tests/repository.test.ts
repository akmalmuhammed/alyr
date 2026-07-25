import { MemoryWorkspaceRepository } from "@/data/memoryRepository";
import {
  createLocalOperation,
  selectPushableOperations
} from "@/data/sync";
import { createWorkspace } from "@/domain/sample";

describe("local-first repository contract", () => {
  it("commits the snapshot and outbox operation together", async () => {
    const repository = new MemoryWorkspaceRepository();
    await repository.initialize();
    const workspace = createWorkspace("personal");
    const operation = createLocalOperation(workspace, {
      type: "asset.create",
      aggregateId: "asset-1",
      payload: { assetId: "asset-1" },
      operationId: "operation-1",
      idempotencyKey: "idempotency-1",
      observedVersion: 0,
      occurredAt: "2026-07-25T10:00:00.000Z"
    });

    const result = await repository.commit({
      expectedRevision: 0,
      nextRevision: 1,
      snapshot: workspace,
      operations: [operation]
    });

    expect(result).toEqual({ ok: true, value: { revision: 1 } });
    expect((await repository.load()).snapshot).toEqual(workspace);
    expect(await repository.listPendingOperations(10)).toEqual([operation]);
  });

  it("fails closed when the observed revision is stale", async () => {
    const repository = new MemoryWorkspaceRepository();
    const workspace = createWorkspace("personal");
    await repository.commit({
      expectedRevision: 0,
      nextRevision: 1,
      snapshot: workspace,
      operations: []
    });
    const result = await repository.commit({
      expectedRevision: 0,
      nextRevision: 1,
      snapshot: workspace,
      operations: []
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONFLICT_REQUIRES_REVIEW");
    }
  });

  it("removes only the acknowledged operation", async () => {
    const repository = new MemoryWorkspaceRepository();
    const workspace = createWorkspace("personal");
    const operation = createLocalOperation(workspace, {
      type: "place.create",
      aggregateId: "place-1",
      payload: { placeId: "place-1" },
      operationId: "operation-1",
      idempotencyKey: "idempotency-1",
      observedVersion: 0,
      occurredAt: "2026-07-25T10:00:00.000Z"
    });
    await repository.commit({
      expectedRevision: 0,
      nextRevision: 1,
      snapshot: workspace,
      operations: [operation]
    });
    await repository.acknowledgeOperation(operation.operationId);
    expect(await repository.listPendingOperations(10)).toEqual([]);
  });

  it("keeps evidence versions blocked until their blob is verified stored", () => {
    const workspace = createWorkspace("personal");
    const metadata = createLocalOperation(workspace, {
      type: "evidence.create",
      aggregateId: "evidence-1",
      payload: { assetId: "asset-1" },
      operationId: "operation-metadata",
      idempotencyKey: "idempotency-metadata",
      observedVersion: 0,
      occurredAt: "2026-07-25T10:00:00.000Z"
    });
    const version = createLocalOperation(workspace, {
      type: "evidence.version.add",
      aggregateId: "version-1",
      payload: {
        evidenceId: "evidence-1",
        blobObjectId: "blob-1"
      },
      operationId: "operation-version",
      idempotencyKey: "idempotency-version",
      observedVersion: 0,
      occurredAt: "2026-07-25T10:00:01.000Z",
      prerequisites: [{ kind: "blob-stored", blobObjectId: "blob-1" }]
    });

    expect(
      selectPushableOperations([metadata, version], new Set())
    ).toEqual([metadata]);
    expect(
      selectPushableOperations([metadata, version], new Set(["blob-1"]))
    ).toEqual([metadata, version]);
  });
});
