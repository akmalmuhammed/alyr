import type { AttachmentStore } from "@/data/attachmentStore";
import { MemoryWorkspaceRepository } from "@/data/memoryRepository";
import type {
  CapturedFile,
  NativeWorkspace
} from "@/domain/model";
import { createWorkspace } from "@/domain/sample";
import { addAsset, updatePlacePin } from "@/domain/workspace";
import {
  createPlacePinUpdateOperation,
  prepareExistingAssetUpdate
} from "@/state/WorkspaceProvider";

function identityFactory(prefix: string) {
  let sequence = 0;
  return () => `${prefix}-${++sequence}`;
}

function mutationContext() {
  return {
    now: () => "2026-07-25T10:00:00.000Z",
    id: identityFactory("entity")
  };
}

function operationIdentity() {
  return {
    operationId: identityFactory("operation"),
    idempotencyKey: identityFactory("idempotency"),
    locationRevisionId: identityFactory("location-revision")
  };
}

const previewAttachmentStore: AttachmentStore = {
  kind: "memory-preview",
  encryptedAtRest: false,
  ingest: async (file: CapturedFile) => ({
    ...file,
    protectedUri: null,
    checksumSha256: null,
    encryptedAtRest: false
  }),
  materializeForViewing: async () => {
    throw new Error("Not used by this transaction test.");
  },
  cleanupMaterialized: async () => undefined
};

const protectedAttachmentStore: AttachmentStore = {
  kind: "encrypted-files",
  encryptedAtRest: true,
  ingest: async (file: CapturedFile) => ({
    ...file,
    localUri: `file:///protected/${file.fileName}.alyrblob`,
    protectedUri: `file:///protected/${file.fileName}.alyrblob`,
    checksumSha256:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    encryptedAtRest: true
  }),
  materializeForViewing: async () => {
    throw new Error("Not used by this transaction test.");
  },
  cleanupMaterialized: async () => undefined
};

async function repositoryWith(workspace: NativeWorkspace) {
  const repository = new MemoryWorkspaceRepository();
  await repository.initialize();
  const committed = await repository.commit({
    expectedRevision: 0,
    nextRevision: 1,
    snapshot: workspace,
    operations: []
  });
  expect(committed.ok).toBe(true);
  return repository;
}

describe("WorkspaceProvider existing Passport update transaction", () => {
  it("queues a versioned place.update with truthful pin provenance", () => {
    const personal: NativeWorkspace = {
      ...createWorkspace("sample"),
      mode: "personal"
    };
    const previous = personal.places[0]!;
    const result = updatePlacePin(
      personal,
      {
        placeId: previous.id,
        pin: {
          latitude: 25.2854,
          longitude: 51.531,
          source: "device_gps",
          precision: "approximate",
          horizontalAccuracyMeters: 7,
          observedAt: "2026-07-25T09:59:00.000Z",
          confirmedAt: "2026-07-25T10:00:00.000Z"
        }
      },
      mutationContext()
    );
    const operation = createPlacePinUpdateOperation(
      personal,
      result,
      result.place.updatedAt,
      {
        operationId: () => "operation-place",
        idempotencyKey: () => "idempotency-place"
      }
    );

    expect(operation.command).toMatchObject({
      type: "place.update",
      aggregateId: previous.id,
      observedVersion: previous.version,
      payload: {
        latitude: 25.2854,
        longitude: 51.531,
        locationSource: "device_gps",
        locationPrecision: "approximate",
        horizontalAccuracyM: 7,
        confirmedAt: "2026-07-25T10:00:00.000Z"
      }
    });
  });

  it("updates the sample preview locally without adding cloud operations", async () => {
    const sample = createWorkspace("sample");
    const target = sample.assets.find((asset) => asset.id === "asset-gmt")!;
    const prepared = await prepareExistingAssetUpdate(
      sample,
      {
        assetId: target.id,
        photo: {
          localUri: "file:///preview-gmt.jpg",
          fileName: "preview-gmt.jpg",
          mimeType: "image/jpeg",
          byteSize: 1500
        }
      },
      previewAttachmentStore,
      mutationContext(),
      "2026-07-25T10:00:00.000Z",
      operationIdentity()
    );
    const repository = await repositoryWith(sample);
    const committed = await repository.commit({
      expectedRevision: 1,
      nextRevision: 2,
      snapshot: prepared.result.workspace,
      operations: prepared.operations
    });

    expect(committed.ok).toBe(true);
    expect(prepared.operations).toEqual([]);
    expect(prepared.result.workspace.assets).toHaveLength(
      sample.assets.length
    );
    expect(
      prepared.result.workspace.assets.find(
        (asset) => asset.id === target.id
      )
    ).toMatchObject({
      id: target.id,
      photoUri: "file:///preview-gmt.jpg"
    });
    expect(await repository.listPendingOperations(100)).toEqual([]);
  });

  it("atomically prepares targeted update, move and evidence commands", async () => {
    const personal = createWorkspace("personal");
    const seeded = addAsset(
      personal,
      {
        name: "Archive camera",
        categoryId: "home.other",
        categoryLabel: "Personal item",
        photo: null,
        locationStatus: "unknown",
        placeId: null,
        roomId: null,
        locatorText: null,
        evidence: null
      },
      mutationContext()
    ).workspace;
    const target = seeded.assets[0]!;
    const samplePlace = createWorkspace("sample").places[0]!;
    const workspace: NativeWorkspace = {
      ...seeded,
      places: [
        {
          ...samplePlace,
          householdId: seeded.household.id
        }
      ]
    };
    const prepared = await prepareExistingAssetUpdate(
      workspace,
      {
        assetId: target.id,
        identity: {
          name: "Leica archive camera",
          categoryId: target.categoryId,
          categoryLabel: target.categoryLabel
        },
        location: {
          locationStatus: "known",
          placeId: samplePlace.id,
          roomId: samplePlace.rooms[0]!.id,
          locatorText: "Upper cabinet"
        },
        evidence: {
          localUri: "file:///camera-receipt.pdf",
          fileName: "camera-receipt.pdf",
          mimeType: "application/pdf",
          byteSize: 2300
        }
      },
      protectedAttachmentStore,
      mutationContext(),
      "2026-07-25T10:00:00.000Z",
      operationIdentity()
    );
    const repository = await repositoryWith(workspace);
    const committed = await repository.commit({
      expectedRevision: 1,
      nextRevision: 2,
      snapshot: prepared.result.workspace,
      operations: prepared.operations
    });

    expect(committed.ok).toBe(true);
    expect(prepared.operations.map((item) => item.command.type)).toEqual([
      "evidence.create",
      "evidence.version.add",
      "asset.update",
      "asset.move"
    ]);
    expect(
      new Set(
        prepared.operations.map((item) => item.command.idempotencyKey)
      ).size
    ).toBe(prepared.operations.length);
    expect(
      prepared.operations.every(
        (item) => item.command.aggregateId !== null
      )
    ).toBe(true);
    expect(
      prepared.operations.find(
        (item) => item.command.type === "evidence.version.add"
      )?.prerequisites
    ).toEqual([
      {
        kind: "blob-stored",
        blobObjectId: prepared.result.newEvidence[0]!.blobObjectId
      }
    ]);
    const loaded = await repository.load();
    const savedWorkspace = loaded.snapshot as NativeWorkspace;
    const saved = savedWorkspace.assets.find(
      (asset) => asset.id === target.id
    );
    expect(savedWorkspace.assets).toHaveLength(workspace.assets.length);
    expect(saved).toMatchObject({
      name: "Leica archive camera",
      placeId: samplePlace.id,
      roomId: samplePlace.rooms[0]!.id,
      locatorText: "Upper cabinet"
    });
    expect(await repository.listPendingOperations(100)).toEqual(
      prepared.operations
    );
  });

  it("queues a byte-gated primary-photo selection after its Evidence version", async () => {
    const personal = createWorkspace("personal");
    const seeded = addAsset(
      personal,
      {
        name: "Heirloom ring",
        categoryId: "home.other",
        categoryLabel: "Personal item",
        photo: null,
        locationStatus: "unknown",
        placeId: null,
        roomId: null,
        locatorText: null,
        evidence: null
      },
      mutationContext()
    ).workspace;
    const target = seeded.assets[0]!;
    const prepared = await prepareExistingAssetUpdate(
      seeded,
      {
        assetId: target.id,
        photo: {
          localUri: "file:///ring.jpg",
          fileName: "ring.jpg",
          mimeType: "image/jpeg",
          byteSize: 1800
        }
      },
      protectedAttachmentStore,
      mutationContext(),
      "2026-07-25T10:00:00.000Z",
      operationIdentity()
    );

    expect(prepared.result.workspace.assets).toHaveLength(
      seeded.assets.length
    );
    expect(prepared.operations.map((item) => item.command.type)).toEqual([
      "evidence.create",
      "evidence.version.add",
      "asset.primary-photo.set"
    ]);
    expect(prepared.result.asset).toMatchObject({
      photoEvidenceId: prepared.result.asset.photoEvidenceId,
      version: target.version + 1,
      syncStatus: "on-device"
    });
    expect(prepared.result.asset.localOnlyFields).toBeUndefined();
    expect(
      prepared.operations.find(
        (item) => item.command.type === "asset.primary-photo.set"
      )
    ).toMatchObject({
      command: {
        aggregateId: target.id,
        observedVersion: target.version,
        payload: {
          evidenceId: prepared.result.asset.photoEvidenceId
        }
      },
      prerequisites: [
        {
          kind: "blob-stored",
          blobObjectId: prepared.result.newEvidence[0]!.blobObjectId
        }
      ]
    });
  });

  it("queues the category-boundary location reset with the identity update", async () => {
    const sample = createWorkspace("sample");
    const personal: NativeWorkspace = {
      ...sample,
      mode: "personal"
    };
    const target = personal.assets.find(
      (asset) => asset.id === "asset-gmt"
    )!;
    const prepared = await prepareExistingAssetUpdate(
      personal,
      {
        assetId: target.id,
        identity: {
          name: target.name,
          categoryId: "digital.asset",
          categoryLabel: "Digital reference"
        }
      },
      protectedAttachmentStore,
      mutationContext(),
      "2026-07-25T10:00:00.000Z",
      operationIdentity()
    );

    expect(prepared.operations.map((item) => item.command.type)).toEqual([
      "asset.category.set",
      "asset.move"
    ]);
    expect(prepared.result.asset.localOnlyFields).toBeUndefined();
    expect(prepared.result.asset.version).toBe(target.version + 2);
    expect(
      prepared.operations.find(
        (item) => item.command.type === "asset.category.set"
      )?.command
    ).toMatchObject({
      aggregateId: target.id,
      observedVersion: target.version,
      payload: {
        categoryId: "digital.asset",
        categoryPath: ["digital", "asset"]
      }
    });
    expect(
      prepared.operations.find(
        (item) => item.command.type === "asset.move"
      )?.command.payload
    ).toMatchObject({
      placeId: null,
      spaceId: null,
      status: "unknown",
      locationDetail: null,
      source: "user"
    });
  });
});
