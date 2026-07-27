import {
  createPlaceDocumentReadRequest,
  openPlaceDocument
} from "@/components/PlaceDocumentRow";
import type {
  AttachmentStore,
  MaterializedAttachment
} from "@/data/attachmentStore";
import { MemoryWorkspaceRepository } from "@/data/memoryRepository";
import type {
  CapturedFile,
  NativePlaceDocument,
  NativeWorkspace
} from "@/domain/model";
import {
  isNativeWorkspace,
  isOwnedPropertyPlace,
  placeClassification
} from "@/domain/model";
import { createWorkspace } from "@/domain/sample";
import {
  addPlace,
  addPlaceSpace,
  updatePlaceBasics,
  updatePlaceSpace
} from "@/domain/workspace";
import {
  createPlaceDocumentOperations,
  createPlaceBasicsUpdateOperation,
  createPlaceSpaceOperation,
  createPlaceSpaceUpdateOperation,
  preparePlaceDocumentAddition
} from "@/state/WorkspaceProvider";

function identityFactory(prefix: string) {
  let sequence = 0;
  return () => `${prefix}-${++sequence}`;
}

function context() {
  return {
    now: () => "2026-07-27T10:00:00.000Z",
    id: identityFactory("entity")
  };
}

const checksum =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const protectedAttachmentStore: AttachmentStore = {
  kind: "encrypted-files",
  encryptedAtRest: true,
  ingest: async (file: CapturedFile) => ({
    ...file,
    byteSize: 2400,
    localUri: "file:///vault/deed.alyrblob",
    protectedUri: "file:///vault/deed.alyrblob",
    checksumSha256: checksum,
    encryptedAtRest: true
  }),
  materializeForViewing: async () => {
    throw new Error("Not used by the ingestion test.");
  },
  cleanupMaterialized: async () => undefined
};

describe("local-first Place management", () => {
  it("loads legacy schema-v2 workspaces and rejects malformed document lists", () => {
    const current = createWorkspace("personal");
    const { placeDocuments: _documents, ...legacy } = current;
    expect(isNativeWorkspace(legacy)).toBe(true);
    expect(
      isNativeWorkspace({ ...current, placeDocuments: "not-an-array" })
    ).toBe(false);
  });

  it("edits useful Place basics without changing exact-pin provenance", () => {
    const workspace = createWorkspace("sample");
    const previous = workspace.places[0]!;
    const result = updatePlaceBasics(
      workspace,
      {
        placeId: previous.id,
        name: "West Bay family home",
        classification: "rented_or_managed",
        regionLabel: "Doha",
        addressSummary: "West Bay Lagoon · gate 3"
      },
      context()
    );

    expect(result.place).toMatchObject({
      id: previous.id,
      name: "West Bay family home",
      addressSummary: "West Bay Lagoon · gate 3",
      latitude: previous.latitude,
      longitude: previous.longitude,
      locationSource: previous.locationSource,
      precision: previous.precision,
      horizontalAccuracyMeters: previous.horizontalAccuracyMeters,
      observedAt: previous.observedAt,
      confirmedAt: previous.confirmedAt,
      rooms: previous.rooms
    });
    expect(placeClassification(result.place)).toBe(
      "rented_or_managed"
    );
    expect(isOwnedPropertyPlace(result.place)).toBe(false);
    expect(result.place.version).toBe(previous.version);
  });

  it("defaults old callers to unknown and saves explicit owned-property classification", () => {
    const personal = createWorkspace("personal");
    const legacyCaller = addPlace(
      personal,
      {
        name: "Unclassified location",
        addressSummary: null,
        regionLabel: "Doha",
        roomName: null,
        pin: null
      },
      context()
    );
    const owned = addPlace(
      legacyCaller.workspace,
      {
        name: "Owned family home",
        classification: "owned_property",
        addressSummary: "West Bay",
        regionLabel: "Doha",
        roomName: null,
        pin: null
      },
      context()
    );

    expect(legacyCaller.place).toMatchObject({
      kind: "unknown",
      tenure: "unknown"
    });
    expect(isOwnedPropertyPlace(legacyCaller.place)).toBe(false);
    expect(owned.place).toMatchObject({
      kind: "property",
      tenure: "owned"
    });
    expect(isOwnedPropertyPlace(owned.place)).toBe(true);
  });

  it("adds and edits a nested space while keeping its stable ID", () => {
    const workspace = createWorkspace("sample");
    const place = workspace.places[0]!;
    const parent = place.rooms[0]!;
    const added = addPlaceSpace(
      workspace,
      {
        placeId: place.id,
        name: "Archive cabinet",
        kind: "container",
        parentRoomId: parent.id
      },
      context()
    );
    const updated = updatePlaceSpace(
      added.workspace,
      {
        placeId: place.id,
        roomId: added.room.id,
        name: "Document archive",
        kind: "zone",
        parentRoomId: parent.id
      },
      context()
    );

    expect(updated.room).toEqual({
      id: added.room.id,
      version: 1,
      name: "Document archive",
      kind: "zone",
      parentRoomId: parent.id
    });
    expect(added.place.version).toBe(place.version);
    expect(updated.place.version).toBe(place.version);
    expect(
      updated.place.rooms.filter((room) => room.id === added.room.id)
    ).toHaveLength(1);
  });

  it("queues versioned Place metadata without including pin fields", () => {
    const workspace = {
      ...createWorkspace("sample"),
      mode: "personal" as const
    };
    const place = workspace.places[0]!;
    const updated = updatePlaceBasics(
      workspace,
      {
        placeId: place.id,
        name: "West Bay archive",
        classification: "owned_property",
        regionLabel: "Doha",
        addressSummary: "West Bay Lagoon, gate 3"
      },
      context()
    );
    const operation = createPlaceBasicsUpdateOperation(
      workspace,
      updated,
      updated.place.updatedAt,
      {
        operationId: () => "operation-place-basics",
        idempotencyKey: () => "idempotency-place-basics"
      }
    );

    expect(operation.command).toMatchObject({
      type: "place.update",
      aggregateId: place.id,
      observedVersion: place.version,
      payload: {
        name: "West Bay archive",
        regionLabel: "Doha",
        addressSummary: "West Bay Lagoon, gate 3",
        kind: "property",
        tenure: "owned"
      }
    });
    expect(operation.command.payload).not.toHaveProperty("latitude");
  });

  it("queues a new nested space with its exact Place hierarchy", () => {
    const workspace = {
      ...createWorkspace("sample"),
      mode: "personal" as const
    };
    const place = workspace.places[0]!;
    const parent = place.rooms[0]!;
    const added = addPlaceSpace(
      workspace,
      {
        placeId: place.id,
        name: "Archive cabinet",
        kind: "container",
        parentRoomId: parent.id
      },
      context()
    );
    const operation = createPlaceSpaceOperation(workspace, added, {
      operationId: () => "operation-space",
      idempotencyKey: () => "idempotency-space"
    });

    expect(operation.command).toMatchObject({
      type: "space.create",
      aggregateId: added.room.id,
      observedVersion: 0,
      payload: {
        placeId: place.id,
        parentSpaceId: parent.id,
        name: "Archive cabinet",
        kind: "container",
        ordinal: added.place.rooms.length - 1
      }
    });
  });

  it("rejects a space hierarchy cycle", () => {
    const workspace = createWorkspace("sample");
    const place = workspace.places[0]!;
    const parent = place.rooms[0]!;
    const child = addPlaceSpace(
      workspace,
      {
        placeId: place.id,
        name: "Study safe",
        kind: "container",
        parentRoomId: parent.id
      },
      context()
    );

    expect(() =>
      updatePlaceSpace(
        child.workspace,
        {
          placeId: place.id,
          roomId: parent.id,
          name: parent.name,
          kind: parent.kind,
          parentRoomId: child.room.id
        },
        context()
      )
    ).toThrow("A space cannot sit inside itself or one of its children.");
  });

  it("queues a space edit against the last observed room version", () => {
    const workspace = {
      ...createWorkspace("sample"),
      mode: "personal" as const
    };
    const place = workspace.places[0]!;
    const target = place.rooms[0]!;
    const updated = updatePlaceSpace(
      workspace,
      {
        placeId: place.id,
        roomId: target.id,
        name: "Family study",
        kind: "zone",
        parentRoomId: null
      },
      context()
    );
    const operation = createPlaceSpaceUpdateOperation(
      workspace,
      updated,
      {
        operationId: () => "operation-space-update",
        idempotencyKey: () => "idempotency-space-update"
      }
    );

    expect(operation.command).toMatchObject({
      type: "space.update",
      aggregateId: target.id,
      observedVersion: 1,
      payload: {
        placeId: place.id,
        parentSpaceId: null,
        name: "Family study",
        kind: "zone",
        ordinal: 0
      }
    });
  });

  it("does not invent an observed version for a legacy local space", () => {
    const current = createWorkspace("personal");
    const place = createWorkspace("sample").places[0]!;
    const target = place.rooms[0]!;
    const { version: _legacyVersion, ...legacyRoom } = target;
    const workspace = {
      ...current,
      places: [
        {
          ...place,
          householdId: current.household.id,
          rooms: [legacyRoom]
        }
      ]
    } as unknown as NativeWorkspace;
    const updated = updatePlaceSpace(
      workspace,
      {
        placeId: place.id,
        roomId: target.id,
        name: "Legacy study",
        kind: "zone",
        parentRoomId: null
      },
      context()
    );

    expect(() =>
      createPlaceSpaceUpdateOperation(workspace, updated)
    ).toThrow(
      "Sync this Place before editing a space from an older local snapshot."
    );
  });

  it("protects a Place document without misfiling it as Asset Evidence", async () => {
    const workspace = createWorkspace("personal");
    const samplePlace = createWorkspace("sample").places[0]!;
    const seeded = {
      ...workspace,
      places: [
        {
          ...samplePlace,
          householdId: workspace.household.id
        }
      ]
    };
    const result = await preparePlaceDocumentAddition(
      seeded,
      {
        placeId: samplePlace.id,
        file: {
          localUri: "file:///picker/deed.pdf",
          fileName: "property-deed.pdf",
          mimeType: "application/pdf",
          byteSize: 0
        }
      },
      protectedAttachmentStore,
      context()
    );

    expect(result.document).toMatchObject({
      placeId: samplePlace.id,
      householdId: workspace.household.id,
      fileName: "property-deed.pdf",
      byteSize: 2400,
      localUri: "file:///vault/deed.alyrblob",
      checksumSha256: checksum,
      encryptedAtRest: true,
      storageState: "on-device"
    });
    expect(result.workspace.placeDocuments).toEqual([result.document]);
    expect(result.workspace.evidence).toEqual(workspace.evidence);

    const operationId = identityFactory("place-document-operation");
    const idempotencyKey = identityFactory(
      "place-document-idempotency"
    );
    const operations = createPlaceDocumentOperations(
      seeded,
      result.document,
      result.document.capturedAt,
      { operationId, idempotencyKey }
    );
    expect(operations.map((operation) => operation.command.type)).toEqual([
      "place-document.create",
      "place-document.version.add"
    ]);
    expect(operations[0]?.command.payload).toMatchObject({
      placeId: samplePlace.id,
      kind: "paper",
      relation: "other",
      title: "property-deed.pdf"
    });
    expect(operations[1]).toMatchObject({
      command: {
        aggregateId: result.document.versionId,
        observedVersion: 0,
        payload: {
          placeDocumentId: result.document.id,
          blobObjectId: result.document.blobObjectId,
          checksumSha256: checksum
        }
      },
      prerequisites: [
        {
          kind: "blob-stored",
          blobObjectId: result.document.blobObjectId
        }
      ]
    });

    const repository = new MemoryWorkspaceRepository();
    await repository.initialize();
    const committed = await repository.commit({
      expectedRevision: 0,
      nextRevision: 1,
      snapshot: result.workspace,
      operations
    });
    expect(committed.ok).toBe(true);
    expect(
      ((await repository.load()).snapshot as NativeWorkspace)
        .placeDocuments?.[0]
    ).toMatchObject({
      id: result.document.id,
      localUri: "file:///vault/deed.alyrblob"
    });
    expect(
      (await repository.listPendingOperations(10)).map(
        (operation) => operation.command.type
      )
    ).toEqual([
      "place-document.create",
      "place-document.version.add"
    ]);
  });

  it("validates the Place before writing attachment bytes", async () => {
    const workspace = createWorkspace("personal");
    const ingest = jest.fn(protectedAttachmentStore.ingest);
    await expect(
      preparePlaceDocumentAddition(
        workspace,
        {
          placeId: "place-outside-household",
          file: {
            localUri: "file:///picker/deed.pdf",
            fileName: "property-deed.pdf",
            mimeType: "application/pdf",
            byteSize: 2400
          }
        },
        { ...protectedAttachmentStore, ingest },
        context()
      )
    ).rejects.toThrow(
      "This Place is not available in the current household."
    );
    expect(ingest).not.toHaveBeenCalled();
  });

  it("uses the encrypted read contract and cleans the temporary copy", async () => {
    const document: NativePlaceDocument = {
      id: "document-1",
      versionId: "document-version-1",
      blobObjectId: "blob-1",
      householdId: "household-1",
      placeId: "place-1",
      fileName: "lease.pdf",
      mimeType: "application/pdf",
      byteSize: 1024,
      localUri: "file:///vault/lease.alyrblob",
      checksumSha256: checksum,
      encryptedAtRest: true,
      storageState: "on-device",
      capturedAt: "2026-07-27T10:00:00.000Z"
    };
    expect(createPlaceDocumentReadRequest(document)).toEqual({
      storage: "encrypted",
      protectedUri: document.localUri,
      fileName: "lease.pdf",
      mimeType: "application/pdf",
      byteSize: 1024,
      checksumSha256: checksum
    });

    const materialized: MaterializedAttachment = {
      uri: "file:///cache/lease.pdf",
      fileName: "lease.pdf",
      mimeType: "application/pdf",
      byteSize: 1024,
      checksumSha256: checksum,
      integrity: "aes-gcm-and-sha256",
      temporary: true
    };
    const cleanup = jest.fn(async () => undefined);
    const store: AttachmentStore = {
      kind: "encrypted-files",
      encryptedAtRest: true,
      ingest: async (file) => file,
      materializeForViewing: async () => materialized,
      cleanupMaterialized: cleanup
    };

    await expect(
      openPlaceDocument(document, {
        store,
        isSharingAvailable: async () => true,
        share: async () => {
          throw new Error("Viewer closed with an error.");
        }
      })
    ).rejects.toThrow("Viewer closed with an error.");
    expect(cleanup).toHaveBeenCalledWith(materialized);
  });
});
