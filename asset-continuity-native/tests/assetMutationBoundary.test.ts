import {
  AssetMutationValidationError,
  MAX_ASSET_CAPTURE_FILE_BYTES
} from "@alyr/domain";

import type { AttachmentStore } from "@/data/attachmentStore";
import { MemoryWorkspaceRepository } from "@/data/memoryRepository";
import type {
  CapturedFile,
  NativePlace,
  NativeWorkspace,
  NewAssetInput
} from "@/domain/model";
import { createWorkspace } from "@/domain/sample";
import { addAsset } from "@/domain/workspace";
import { prepareNewAssetCreation } from "@/state/WorkspaceProvider";

function identityFactory(prefix: string) {
  let sequence = 0;
  return () => `${prefix}-${++sequence}`;
}

function context() {
  return {
    now: jest.fn(() => "2026-07-28T10:00:00.000Z"),
    id: jest.fn(identityFactory("entity"))
  };
}

function workspaceWithPlace(): NativeWorkspace {
  const workspace = createWorkspace("personal");
  const place = createWorkspace("sample").places[0]!;
  return {
    ...workspace,
    places: [
      {
        ...place,
        householdId: workspace.household.id
      }
    ]
  };
}

function workspaceWithPlacePatch(
  patch: Pick<
    NativePlace,
    | "latitude"
    | "longitude"
    | "locationSource"
    | "precision"
    | "horizontalAccuracyMeters"
    | "observedAt"
    | "confirmedAt"
  >
): NativeWorkspace {
  const workspace = workspaceWithPlace();
  const place = workspace.places[0]!;
  return {
    ...workspace,
    places: [{ ...place, ...patch }]
  };
}

function validInput(
  workspace: NativeWorkspace
): NewAssetInput {
  const place = workspace.places[0]!;
  return {
    name: "  Travel\u00a0watch  ",
    categoryId: "lifestyle.watch",
    categoryLabel: "Forged display label",
    photo: null,
    locationStatus: "known",
    placeId: place.id,
    roomId: place.rooms[0]!.id,
    locatorText: null,
    evidence: null
  };
}

function expectReason(
  work: () => unknown,
  code: AssetMutationValidationError["issue"]["code"]
) {
  try {
    work();
    throw new Error("Expected asset validation to reject.");
  } catch (caught) {
    expect(caught).toBeInstanceOf(AssetMutationValidationError);
    expect(caught).toMatchObject({
      issue: { code },
      recoverable: true,
      retryable: false,
      contract: {
        errorVersion: 1,
        code: "VALIDATION_FAILED",
        retryable: false
      }
    });
  }
}

describe("native final Asset mutation boundary", () => {
  it("normalizes identity and uses the reviewed category label", () => {
    const workspace = workspaceWithPlace();
    const result = addAsset(
      workspace,
      validInput(workspace),
      context()
    );

    expect(result.asset).toMatchObject({
      name: "Travel watch",
      categoryId: "lifestyle.watch",
      categoryLabel: "Watch"
    });
  });

  it.each([
    [
      "normalized blank name",
      (workspace: NativeWorkspace) => ({
        ...validInput(workspace),
        name: "\u200b \ufeff"
      }),
      "ASSET_NAME_REQUIRED"
    ],
    [
      "property category",
      (workspace: NativeWorkspace) => ({
        ...validInput(workspace),
        categoryId: "property.house"
      }),
      "ASSET_CATEGORY_UNSUPPORTED"
    ],
    [
      "unknown state retaining a Place",
      (workspace: NativeWorkspace) => ({
        ...validInput(workspace),
        locationStatus: "unknown" as const,
        roomId: null
      }),
      "ASSET_LOCATION_STATE_INVALID"
    ],
    [
      "missing Place",
      (workspace: NativeWorkspace) => ({
        ...validInput(workspace),
        placeId: "place-missing"
      }),
      "ASSET_PLACE_INVALID"
    ],
    [
      "room outside the Place",
      (workspace: NativeWorkspace) => ({
        ...validInput(workspace),
        roomId: "room-missing"
      }),
      "ASSET_SPACE_INVALID"
    ]
  ] as const)(
    "rejects %s before allocating mutation IDs",
    (_label, candidate, code) => {
      const workspace = workspaceWithPlace();
      const mutation = context();

      expectReason(
        () => addAsset(workspace, candidate(workspace), mutation),
        code
      );
      expect(mutation.now).not.toHaveBeenCalled();
      expect(mutation.id).not.toHaveBeenCalled();
      expect(workspace.assets).toHaveLength(0);
      expect(workspace.evidence).toHaveLength(0);
    }
  );

  it("rejects foreign household Places even when they are present", () => {
    const workspace = workspaceWithPlace();
    const foreignPlace = {
      ...createWorkspace("sample").places[0]!,
      householdId: "household-foreign"
    };
    const corrupted: NativeWorkspace = {
      ...workspace,
      places: [foreignPlace]
    };
    const mutation = context();

    expectReason(
      () =>
        addAsset(
          corrupted,
          {
            ...validInput({
              ...corrupted,
              places: [
                {
                  ...foreignPlace,
                  householdId: corrupted.household.id
                }
              ]
            }),
            placeId: foreignPlace.id,
            roomId: foreignPlace.rooms[0]!.id
          },
          mutation
        ),
      "ASSET_PLACE_INVALID"
    );
    expect(mutation.id).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "no Place pin",
      patch: {
        latitude: null,
        longitude: null,
        locationSource: "not_set" as const,
        precision: "locality_only" as const,
        horizontalAccuracyMeters: null,
        observedAt: null,
        confirmedAt: null
      }
    },
    {
      name: "unconfirmed exact device pin",
      patch: {
        latitude: 25.2854,
        longitude: 51.531,
        locationSource: "device_gps" as const,
        precision: "exact" as const,
        horizontalAccuracyMeters: 7,
        observedAt: "2026-07-28T09:59:00.000Z",
        confirmedAt: null
      }
    }
  ])(
    "downgrades a requested exact location to needs-detail for $name",
    ({ patch }) => {
      const workspace = workspaceWithPlacePatch(patch);
      const result = addAsset(
        workspace,
        {
          ...validInput(workspace),
          locatorText: "Blue case"
        },
        context()
      );

      expect(result.asset).toMatchObject({
        locationStatus: "needs-detail",
        placeId: workspace.places[0]!.id,
        roomId: workspace.places[0]!.rooms[0]!.id,
        locatorText: "Blue case"
      });
    }
  );

  it.each([
    {
      source: "manual_coordinates" as const,
      precision: "user_placed" as const
    },
    {
      source: "user_pin" as const,
      precision: "user_placed" as const
    }
  ])(
    "keeps a confirmed $source Place pin exact with room/container detail",
    ({ source, precision }) => {
      const workspace = workspaceWithPlacePatch({
        latitude: 25.2854,
        longitude: 51.531,
        locationSource: source,
        precision,
        horizontalAccuracyMeters: null,
        observedAt: "2026-07-28T09:59:00.000Z",
        confirmedAt: "2026-07-28T10:00:00.000Z"
      });
      const place = workspace.places[0]!;
      const container = {
        id: "container-watch-roll",
        version: 1,
        name: "Watch roll",
        kind: "container" as const,
        parentRoomId: place.rooms[0]!.id
      };
      const withContainer: NativeWorkspace = {
        ...workspace,
        places: [
          {
            ...place,
            rooms: [...place.rooms, container]
          }
        ]
      };
      const result = addAsset(
        withContainer,
        {
          ...validInput(withContainer),
          roomId: container.id
        },
        context()
      );

      expect(result.asset).toMatchObject({
        locationStatus: "known",
        roomId: container.id
      });
    }
  );

  it("retains indoor detail when the caller explicitly saves needs-detail", () => {
    const workspace = workspaceWithPlacePatch({
      latitude: null,
      longitude: null,
      locationSource: "not_set",
      precision: "locality_only",
      horizontalAccuracyMeters: null,
      observedAt: null,
      confirmedAt: null
    });
    const result = addAsset(
      workspace,
      {
        ...validInput(workspace),
        locationStatus: "needs-detail",
        locatorText: "Upper shelf"
      },
      context()
    );

    expect(result.asset).toMatchObject({
      locationStatus: "needs-detail",
      roomId: workspace.places[0]!.rooms[0]!.id,
      locatorText: "Upper shelf"
    });
  });

  it("downgrades a confirmed Place without an indoor clue to needs-detail", () => {
    const workspace = workspaceWithPlace();
    const result = addAsset(
      workspace,
      {
        ...validInput(workspace),
        roomId: null,
        locatorText: " "
      },
      context()
    );

    expect(result.asset).toMatchObject({
      locationStatus: "needs-detail",
      placeId: workspace.places[0]!.id,
      roomId: null,
      locatorText: null
    });
  });

  it("rejects invalid capture metadata and the 10 MB boundary", () => {
    const workspace = workspaceWithPlace();
    const baseFile: CapturedFile = {
      localUri: "file:///watch.jpg",
      fileName: "watch.jpg",
      mimeType: "image/jpeg",
      byteSize: 1_024
    };

    expectReason(
      () =>
        addAsset(
          workspace,
          {
            ...validInput(workspace),
            photo: {
              ...baseFile,
              mimeType: "application/pdf"
            }
          },
          context()
        ),
      "ASSET_FILE_METADATA_INVALID"
    );
    expectReason(
      () =>
        addAsset(
          workspace,
          {
            ...validInput(workspace),
            evidence: {
              ...baseFile,
              fileName: "receipt.pdf",
              mimeType: "application/pdf",
              byteSize: MAX_ASSET_CAPTURE_FILE_BYTES + 1
            }
          },
          context()
        ),
      "ASSET_FILE_SIZE_INVALID"
    );
  });
});

describe("WorkspaceProvider Asset create preparation", () => {
  it("keeps an invalid restored draft outside attachment and repository boundaries", async () => {
    const workspace = workspaceWithPlace();
    const ingest = jest.fn(async (file: CapturedFile) => file);
    const store: AttachmentStore = {
      kind: "encrypted-files",
      encryptedAtRest: true,
      ingest,
      materializeForViewing: jest.fn(),
      cleanupMaterialized: jest.fn()
    };
    const repository = new MemoryWorkspaceRepository();
    await repository.initialize();
    await repository.commit({
      expectedRevision: 0,
      nextRevision: 1,
      snapshot: workspace,
      operations: []
    });

    await expect(
      prepareNewAssetCreation(
        workspace,
        {
          ...validInput(workspace),
          roomId: "room-missing",
          photo: {
            localUri: "file:///watch.jpg",
            fileName: "watch.jpg",
            mimeType: "image/jpeg",
            byteSize: 1_024
          }
        },
        store,
        context()
      )
    ).rejects.toMatchObject({
      issue: { code: "ASSET_SPACE_INVALID" },
      recoverable: true
    });

    expect(ingest).not.toHaveBeenCalled();
    await expect(repository.load()).resolves.toMatchObject({
      revision: 1,
      snapshot: workspace
    });
    await expect(
      repository.listPendingOperations(100)
    ).resolves.toEqual([]);
  });

  it("prepares one valid offline commit with asset, move, and evidence operations", async () => {
    const workspace = workspaceWithPlace();
    const checksum = "a".repeat(64);
    const store: AttachmentStore = {
      kind: "encrypted-files",
      encryptedAtRest: true,
      ingest: jest.fn(async (file: CapturedFile) => ({
        ...file,
        localUri: `file:///protected/${file.fileName}.alyrblob`,
        protectedUri: `file:///protected/${file.fileName}.alyrblob`,
        checksumSha256: checksum,
        encryptedAtRest: true
      })),
      materializeForViewing: jest.fn(),
      cleanupMaterialized: jest.fn()
    };
    const prepared = await prepareNewAssetCreation(
      workspace,
      {
        ...validInput(workspace),
        evidence: {
          localUri: "file:///receipt.pdf",
          fileName: "receipt.pdf",
          mimeType: "application/pdf",
          byteSize: 2_048
        }
      },
      store,
      context(),
      {
        operationId: identityFactory("operation"),
        idempotencyKey: identityFactory("idempotency"),
        locationRevisionId: identityFactory("location-revision")
      }
    );
    const repository = new MemoryWorkspaceRepository();
    await repository.initialize();
    const committed = await repository.commit({
      expectedRevision: 0,
      nextRevision: 1,
      snapshot: prepared.result.workspace,
      operations: prepared.operations
    });

    expect(committed.ok).toBe(true);
    expect(
      prepared.operations.map((operation) => operation.command.type)
    ).toEqual([
      "asset.create",
      "asset.move",
      "evidence.create",
      "evidence.version.add"
    ]);
    await expect(
      repository.listPendingOperations(100)
    ).resolves.toEqual(prepared.operations);
  });

  it("queues an unresolved Place pin as needs-detail without dropping indoor detail", async () => {
    const workspace = workspaceWithPlacePatch({
      latitude: 25.2854,
      longitude: 51.531,
      locationSource: "device_gps",
      precision: "exact",
      horizontalAccuracyMeters: 5,
      observedAt: "2026-07-28T09:59:00.000Z",
      confirmedAt: null
    });
    const store: AttachmentStore = {
      kind: "encrypted-files",
      encryptedAtRest: true,
      ingest: jest.fn(async (file: CapturedFile) => file),
      materializeForViewing: jest.fn(),
      cleanupMaterialized: jest.fn()
    };
    const prepared = await prepareNewAssetCreation(
      workspace,
      {
        ...validInput(workspace),
        locatorText: "Upper drawer"
      },
      store,
      context(),
      {
        operationId: identityFactory("operation"),
        idempotencyKey: identityFactory("idempotency"),
        locationRevisionId: identityFactory("location-revision")
      }
    );

    expect(prepared.result.asset).toMatchObject({
      locationStatus: "needs-detail",
      roomId: workspace.places[0]!.rooms[0]!.id,
      locatorText: "Upper drawer"
    });
    expect(
      prepared.operations.find(
        (operation) => operation.command.type === "asset.move"
      )
    ).toMatchObject({
      command: {
        payload: {
          status: "needs-detail",
          spaceId: workspace.places[0]!.rooms[0]!.id,
          locationDetail: "Upper drawer"
        }
      }
    });
  });
});
