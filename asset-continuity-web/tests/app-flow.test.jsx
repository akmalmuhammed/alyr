// @vitest-environment jsdom

import React from "react";
import axe from "axe-core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.jsx";
import {
  LEGACY_STORAGE_KEYS,
  RECOVERY_STORAGE_KEY,
  STORAGE_KEY,
  createSampleWorkspace,
  workspaceReducer,
} from "../src/domain.js";
import {
  LOCAL_DEMO_SCOPE_ID,
  storageKeysForScope,
} from "../src/storageScope.js";

const fileStoreHarness = vi.hoisted(() => ({
  evidence: new Map(),
  drafts: new Map(),
  recovery: new Map(),
  operations: new Map(),
  api: null,
}));

vi.mock("../src/fileStore.js", () => {
  const metadataFor = async (file) => ({
    fileName: String(file?.name || "attachment"),
    fileType: String(file?.type || "application/octet-stream"),
    fileSize: Number(file?.size || 0),
    fileChecksum: "a".repeat(64),
    originalVersionId: `ov_${"a".repeat(64)}`,
  });
  const api = {
    canPreviewFileType: vi.fn((type) =>
      ["image/png", "image/jpeg", "image/webp", "image/avif"].includes(
        String(type || "").toLowerCase(),
      ),
    ),
    formatFileSize: vi.fn((bytes) => `${Number(bytes || 0)} B`),
    validateLocalFile: vi.fn((file) =>
      file && Number(file.size) > 0 ? "" : "Choose a file to continue.",
    ),
    describeLocalFile: vi.fn(metadataFor),
    describeEvidenceOriginal: vi.fn(async (_id, file) =>
      metadataFor(file),
    ),
    putEvidenceFile: vi.fn(async (id, file) => {
      const record = {
        id,
        blob: file,
        ...(await metadataFor(file)),
        storedAt: "2026-07-25T00:00:00.000Z",
      };
      fileStoreHarness.evidence.set(id, record);
      return record;
    }),
    putEvidenceFilesWithRollback: vi.fn(async (inputs, options) => {
      const records = [];
      for (const input of inputs) {
        records.push(
          await api.putEvidenceFile(input.evidenceId, input.file, options),
        );
      }
      return records;
    }),
    getEvidenceFile: vi.fn(async (id) => fileStoreHarness.evidence.get(id) || null),
    listEvidenceOriginalVersions: vi.fn(async (id) => {
      const record = fileStoreHarness.evidence.get(id);
      return record?.originalVersionId
        ? [
            {
              originalVersionId: record.originalVersionId,
              fileName: record.fileName,
              fileType: record.fileType,
              fileSize: record.fileSize,
              fileChecksum: record.fileChecksum,
              storedAt: record.storedAt,
              isCurrent: true,
            },
          ]
        : [];
    }),
    getEvidenceOriginalVersion: vi.fn(
      async (id, originalVersionId) => {
        const record = fileStoreHarness.evidence.get(id);
        return record?.originalVersionId === originalVersionId
          ? record
          : null;
      },
    ),
    deleteEvidenceFile: vi.fn(async (id) => {
      fileStoreHarness.evidence.delete(id);
    }),
    replaceEvidenceFiles: vi.fn(async (inputs = []) => {
      const records = [];
      const replacement = new Map();
      for (const input of inputs) {
        const record = {
          id: input.evidenceId,
          blob: input.file,
          ...(await metadataFor(input.file)),
          storedAt: "2026-07-25T00:00:00.000Z",
        };
        replacement.set(input.evidenceId, record);
        records.push(record);
      }
      fileStoreHarness.evidence = replacement;
      return records;
    }),
    sha256ForBlob: vi.fn(async () => "a".repeat(64)),
    verifyEvidenceFileRecord: vi.fn(async (record, evidence) => {
      const actualChecksum = await api.sha256ForBlob(record.blob);
      if (
        record.id !== evidence.id ||
        actualChecksum !== record.fileChecksum ||
        actualChecksum !== evidence.fileChecksum ||
        record.fileName !== evidence.fileName ||
        record.fileType !== evidence.fileType ||
        record.fileSize !== evidence.fileSize ||
        (evidence.originalVersionId &&
          record.originalVersionId !== evidence.originalVersionId)
      ) {
        const error = new Error(
          "The original failed its SHA-256 integrity check and was blocked.",
        );
        error.code = "FILE_INTEGRITY_FAILED";
        throw error;
      }
      return { checksum: actualChecksum };
    }),
    putCaptureDraftFile: vi.fn(async (id, file) => {
      const record = {
        id,
        blob: file,
        ...(await metadataFor(file)),
        storedAt: "2026-07-25T00:00:00.000Z",
      };
      fileStoreHarness.drafts.set(id, record);
      return record;
    }),
    getCaptureDraftFile: vi.fn(async (id) => fileStoreHarness.drafts.get(id) || null),
    deleteCaptureDraftFile: vi.fn(async (id) => {
      fileStoreHarness.drafts.delete(id);
    }),
    copyEvidenceFilesBetweenScopes: vi.fn(async () => []),
    readRecoveryPersistenceState: vi.fn(async (scopeId) =>
      fileStoreHarness.recovery.get(scopeId) || null,
    ),
    writeActiveRecoveryWorkspace: vi.fn(
      async ({
        scopeId,
        workspaceRaw,
        expectedRevision,
        updatedAt,
      }) => {
        const current = fileStoreHarness.recovery.get(scopeId) || null;
        if ((current?.revision || 0) !== Number(expectedRevision || 0)) {
          const error = new Error("The recovery head is stale.");
          error.code = "RECOVERY_HEAD_STALE";
          throw error;
        }
        const next = {
          revision: (current?.revision || 0) + 1,
          activeGenerationId: current?.activeGenerationId || null,
          workspaceRaw,
          rollback: current?.rollback || null,
          rollbackWorkspaceRaw:
            current?.rollbackWorkspaceRaw || null,
          updatedAt,
        };
        fileStoreHarness.recovery.set(scopeId, next);
        return next;
      },
    ),
    commitWorkspaceWithEvidenceFiles: vi.fn(
      async ({
        scopeId,
        operationId,
        workspaceRaw,
        files,
        expectedRevision,
        committedAt,
      }) => {
        const operationKey = `${scopeId}:${operationId}`;
        const prior = fileStoreHarness.operations.get(operationKey);
        if (prior) return { ...prior, retry: true };
        const current = fileStoreHarness.recovery.get(scopeId) || null;
        if ((current?.revision || 0) !== Number(expectedRevision || 0)) {
          const error = new Error(
            "The active workspace changed in another tab. Nothing from this capture was saved.",
          );
          error.code = "CAPTURE_COMMIT_STALE";
          throw error;
        }
        const records = [];
        for (const input of files) {
          const record = {
            id: input.evidenceId,
            blob: input.file,
            ...(await metadataFor(input.file)),
            storedAt: committedAt,
          };
          fileStoreHarness.evidence.set(input.evidenceId, record);
          records.push(record);
        }
        const next = {
          revision: (current?.revision || 0) + 1,
          activeGenerationId: current?.activeGenerationId || null,
          workspaceRaw,
          rollback: current?.rollback || null,
          rollbackWorkspaceRaw:
            current?.rollbackWorkspaceRaw || null,
          updatedAt: committedAt,
        };
        fileStoreHarness.recovery.set(scopeId, next);
        const receipt = {
          scopeId,
          operationId,
          revision: next.revision,
          activeGenerationId: next.activeGenerationId,
          records,
          retry: false,
        };
        fileStoreHarness.operations.set(operationKey, receipt);
        return receipt;
      },
    ),
    commitRecoveryGeneration: vi.fn(
      async ({
        scopeId,
        generationId,
        currentWorkspaceRaw,
        recoveredWorkspaceRaw,
        files,
        expectedRevision,
        createdAt,
      }) => {
        const current = fileStoreHarness.recovery.get(scopeId) || null;
        if ((current?.revision || 0) !== Number(expectedRevision || 0)) {
          const error = new Error("The recovery head is stale.");
          error.code = "RECOVERY_HEAD_STALE";
          throw error;
        }
        const previousEvidence = new Map(fileStoreHarness.evidence);
        fileStoreHarness.evidence.clear();
        for (const input of files || []) {
          fileStoreHarness.evidence.set(input.evidenceId, {
            id: input.evidenceId,
            blob: input.file,
            ...(await metadataFor(input.file)),
            storedAt: createdAt,
          });
        }
        fileStoreHarness.recovery.set(scopeId, {
          revision: (current?.revision || 0) + 1,
          activeGenerationId: generationId,
          workspaceRaw: recoveredWorkspaceRaw,
          rollback: {
            activatedGenerationId: generationId,
            previousGenerationId:
              current?.activeGenerationId || null,
            createdAt,
          },
          rollbackWorkspaceRaw: currentWorkspaceRaw,
          rollbackEvidence: previousEvidence,
          updatedAt: createdAt,
        });
      },
    ),
    rollbackRecoveryGenerationCommit: vi.fn(
      async ({ scopeId, expectedRevision, updatedAt }) => {
        const current = fileStoreHarness.recovery.get(scopeId);
        if (
          !current?.rollback ||
          current.revision !== Number(expectedRevision)
        ) {
          const error = new Error("The recovery head is stale.");
          error.code = "RECOVERY_HEAD_STALE";
          throw error;
        }
        const removedGenerationId = current.activeGenerationId;
        fileStoreHarness.evidence =
          current.rollbackEvidence || new Map();
        fileStoreHarness.recovery.set(scopeId, {
          revision: current.revision + 1,
          activeGenerationId:
            current.rollback.previousGenerationId || null,
          workspaceRaw: current.rollbackWorkspaceRaw,
          rollback: null,
          rollbackWorkspaceRaw: null,
          updatedAt,
        });
        return { removedGenerationId };
      },
    ),
    purgeFileScope: vi.fn(async (scopeId) => {
      fileStoreHarness.evidence.clear();
      fileStoreHarness.drafts.clear();
      fileStoreHarness.recovery.delete(scopeId);
      for (const key of [...fileStoreHarness.operations.keys()]) {
        if (key.startsWith(`${scopeId}:`)) {
          fileStoreHarness.operations.delete(key);
        }
      }
    }),
  };
  fileStoreHarness.api = api;
  return api;
});

vi.mock("../src/Globe.jsx", () => ({
  ContinuityGlobe: () => <div data-testid="continuity-globe">Interactive globe</div>,
}));

const APP_SOURCE = readFileSync(
  resolve(process.cwd(), "src/App.jsx"),
  "utf8",
);
const LOCATION_PICKER_SOURCE = readFileSync(
  resolve(process.cwd(), "src/LocationPicker.jsx"),
  "utf8",
);
const FILE_STORE_SOURCE = readFileSync(
  resolve(process.cwd(), "src/fileStore.js"),
  "utf8",
);

function seedSample(path = "/home") {
  const sample = createSampleWorkspace();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sample));
  window.history.replaceState({}, "", path);
}

function renderApp() {
  return render(<App />);
}

describe("canonical web journeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileStoreHarness.evidence.clear();
    fileStoreHarness.drafts.clear();
    fileStoreHarness.recovery.clear();
    fileStoreHarness.operations.clear();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/welcome");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:alyr-local-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("explains first open and enters an isolated sample workspace", async () => {
    const user = userEvent.setup();
    renderApp();

    expect(
      screen.getByRole("heading", { name: "Start with what matters." }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /manual encrypted recovery kit.*optional local account service.*automatic live sync is not connected/i,
      ),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Explore a sample workspace/i }));

    expect(
      await screen.findByRole("heading", { name: "Everything you own" }),
    ).toBeTruthy();
    expect(screen.getAllByText("17").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Sample data/i })).toBeTruthy();
  });

  it("creates a clean personal place through details, review, and success", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(
      screen.getByRole("button", { name: /^Add a place$/i }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Add a place",
    });
    await user.type(within(dialog).getByLabelText(/Place name/i), "Al Waab Home");
    await user.selectOptions(within(dialog).getByLabelText(/Place type/i), "Home");
    await user.selectOptions(within(dialog).getByLabelText(/City cluster/i), "doha");
    await user.click(within(dialog).getByRole("button", { name: /^Review$/i }));

    expect(await within(dialog).findByText("Al Waab Home")).toBeTruthy();
    expect(within(dialog).getByText("Doha")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: /Save record/i }));

    expect(await within(dialog).findByText("Added to workspace")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: /View record/i }));
    expect(
      await screen.findByRole("heading", { name: "Al Waab Home" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Rooms & zones" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Add room or zone/i }),
    ).toBeTruthy();
  });

  it("creates one owned Place and one mutually linked property passport", async () => {
    const user = userEvent.setup();
    seedSample("/home?capture=place");
    renderApp();

    const dialog = await screen.findByRole("dialog", {
      name: "Add a place",
    });
    await user.type(
      within(dialog).getByLabelText(/Place name/i),
      "Lusail Marina Apartment",
    );
    await user.selectOptions(
      within(dialog).getByLabelText(/Place type/i),
      "Apartment",
    );
    await user.selectOptions(
      within(dialog).getByLabelText(/Relationship to this place/i),
      "owned",
    );
    const createPassport = within(dialog).getByRole("button", {
      name: /Create linked passport/i,
    });
    expect(createPassport.getAttribute("aria-pressed")).toBe("true");
    await user.type(
      within(dialog).getByLabelText(/Property passport name/i),
      "Lusail title and continuity passport",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /^Review$/i }),
    );

    expect(
      await within(dialog).findByText("Lusail Marina Apartment"),
    ).toBeTruthy();
    expect(within(dialog).getByText("Owned")).toBeTruthy();
    expect(
      within(dialog).getByText(
        /Create and link.*Lusail title and continuity passport/i,
      ),
    ).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", { name: /Save record/i }),
    );

    let savedPlace;
    let savedPassport;
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      savedPlace = saved.places.find(
        (place) => place.name === "Lusail Marina Apartment",
      );
      expect(savedPlace?.tenure).toBe("owned");
      expect(savedPlace?.propertyAssetId).toBeTruthy();
      const linked = saved.assets.filter(
        (asset) => asset.propertyPlaceId === savedPlace.id,
      );
      expect(linked).toHaveLength(1);
      savedPassport = linked[0];
      expect(savedPassport.id).toBe(savedPlace.propertyAssetId);
      expect(savedPassport.categoryId).toBe("property.apartment");
      expect(savedPassport.locationStatus).toBe("needs-detail");
      const assignments = saved.locationAssignments.filter(
        (assignment) =>
          assignment.assetId === savedPassport.id && !assignment.validTo,
      );
      expect(assignments).toHaveLength(1);
      expect(assignments[0].createdByMemberId).toBe("member-akmal");
    });

    await user.click(
      within(dialog).getByRole("button", { name: /View record/i }),
    );
    const relationshipHeading = await screen.findByRole("heading", {
      name: "Property relationship",
    });
    const relationshipSection = relationshipHeading.closest("section");
    const passportLink = within(relationshipSection).getByRole("link", {
      name: /Open property passport/i,
    });
    expect(passportLink.getAttribute("href")).toBe(
      `/assets/${savedPassport.id}`,
    );
    await user.click(passportLink);

    expect(
      await screen.findByRole("heading", {
        name: "Lusail title and continuity passport",
      }),
    ).toBeTruthy();
    const propertyPlaceHeading = screen.getByRole("heading", {
      name: "Property Place",
    });
    const propertyPlaceSection = propertyPlaceHeading.closest("section");
    const placeLink = within(propertyPlaceSection).getByRole("link", {
      name: /Open Place/i,
    });
    expect(placeLink.getAttribute("href")).toBe(`/places/${savedPlace.id}`);
  });

  it("keeps a rented Place location-only and never creates an ownership passport", async () => {
    const user = userEvent.setup();
    seedSample("/home?capture=place");
    renderApp();

    const dialog = await screen.findByRole("dialog", {
      name: "Add a place",
    });
    await user.type(
      within(dialog).getByLabelText(/Place name/i),
      "Rented West Bay Office",
    );
    await user.selectOptions(
      within(dialog).getByLabelText(/Place type/i),
      "Office",
    );
    await user.selectOptions(
      within(dialog).getByLabelText(/Relationship to this place/i),
      "rented",
    );
    expect(
      within(dialog).queryByRole("button", {
        name: /Create linked passport/i,
      }),
    ).toBe(null);
    await user.click(
      within(dialog).getByRole("button", { name: /^Review$/i }),
    );
    expect(await within(dialog).findByText("Rented")).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", { name: /Save record/i }),
    );

    let savedPlace;
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      savedPlace = saved.places.find(
        (place) => place.name === "Rented West Bay Office",
      );
      expect(savedPlace?.tenure).toBe("rented");
      expect(savedPlace?.propertyAssetId).toBe(null);
      expect(
        saved.assets.filter(
          (asset) => asset.propertyPlaceId === savedPlace.id,
        ),
      ).toHaveLength(0);
    });

    await user.click(
      within(dialog).getByRole("button", { name: /View record/i }),
    );
    const relationshipHeading = await screen.findByRole("heading", {
      name: "Property relationship",
    });
    const relationshipSection = relationshipHeading.closest("section");
    expect(
      within(relationshipSection).getByText(
        /location record only.*No ownership passport/i,
      ),
    ).toBeTruthy();
    expect(
      within(relationshipSection).queryByRole("link", {
        name: /property passport/i,
      }),
    ).toBe(null);
  });

  it("repairs an existing owned Place by linking one unlinked property passport", async () => {
    const user = userEvent.setup();
    let sample = createSampleWorkspace();
    sample = workspaceReducer(sample, {
      type: "ADD_PLACE",
      memberId: "member-akmal",
      place: {
        id: "repair-villa-place",
        name: "Repair Villa",
        kind: "villa",
        tenure: "owned",
        regionId: "doha",
        regionName: "Doha",
        city: "Doha",
        coordinates: { lat: 25.31, lng: 51.5 },
        locationSource: "user_pin",
        locationPrecision: "user_placed",
        locationConfirmedAt: "2026-07-25T10:00:00.000Z",
      },
      now: "2026-07-25T10:00:00.000Z",
    });
    sample = workspaceReducer(sample, {
      type: "ADD_ASSET",
      memberId: "member-akmal",
      asset: {
        id: "repair-villa-passport",
        name: "Imported villa ownership record",
        categoryId: "property.house",
        category: "House or villa",
        placeId: "repair-villa-place",
        locationMode: "physical",
        locationStatus: "known",
        requiredProofTypes: ["Title deed"],
      },
      now: "2026-07-25T10:01:00.000Z",
    });
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(sample),
    );
    window.history.replaceState(
      {},
      "",
      "/places/repair-villa-place",
    );
    renderApp();

    const relationshipHeading = await screen.findByRole("heading", {
      name: "Property relationship",
    });
    const relationshipSection = relationshipHeading.closest("section");
    expect(
      within(relationshipSection).getByRole("option", {
        name: "Imported villa ownership record",
      }),
    ).toBeTruthy();
    await user.click(
      within(relationshipSection).getByRole("button", {
        name: /Link existing passport/i,
      }),
    );

    await waitFor(() => {
      const saved = JSON.parse(
        window.localStorage.getItem(STORAGE_KEY),
      );
      const place = saved.places.find(
        (item) => item.id === "repair-villa-place",
      );
      const passport = saved.assets.find(
        (item) => item.id === "repair-villa-passport",
      );
      expect(place.propertyAssetId).toBe(passport.id);
      expect(passport.propertyPlaceId).toBe(place.id);
      expect(passport.placeId).toBe(place.id);
      expect(
        saved.locationAssignments.filter(
          (assignment) =>
            assignment.assetId === passport.id &&
            !assignment.validTo,
        ),
      ).toHaveLength(1);
    });
    expect(
      await within(relationshipSection).findByRole("link", {
        name: /Open property passport/i,
      }),
    ).toBeTruthy();
  });

  it("searches an asset, records proof as pending, then verifies it once", async () => {
    const user = userEvent.setup();
    seedSample("/assets?q=GMT");
    renderApp();

    const assetLink = await screen.findByRole("link", { name: /GMT-Master II/i });
    await user.click(assetLink);
    expect(
      await screen.findByRole("heading", { name: "GMT-Master II" }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Add paper or artifact/i }));
    const dialog = await screen.findByRole("dialog", { name: "Add paper or artifact" });
    [
      "Paper or document",
      "Physical artifact",
      "Photo, video, or audio",
      "Note or story",
      "Link or reference",
      "Structured record",
    ].forEach((name) => {
      expect(
        within(dialog).getByRole("button", { name }),
      ).toBeTruthy();
    });
    const materialTitle = within(dialog).getByLabelText(/What is it/i);
    await user.clear(materialTitle);
    await user.type(materialTitle, "Service record");
    const file = new File(["service"], "gmt-service-2026.pdf", {
      type: "application/pdf",
    });
    await user.upload(
      within(dialog).getByLabelText(/^Choose file$/i),
      file,
    );
    await waitFor(() => {
      expect(fileStoreHarness.api.describeLocalFile).toHaveBeenCalledWith(file);
      expect(fileStoreHarness.api.putCaptureDraftFile).toHaveBeenCalledWith(
        "active-capture-file",
        file,
        { scopeId: "local-demo" },
      );
    });
    expect(
      within(dialog).getByText(/inline preview disabled.*download remains available/i),
    ).toBeTruthy();
    expect(dialog.querySelector("audio, video, iframe, object, embed")).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: /^Review$/i }));
    expect(within(dialog).getByText("Pending your review")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: /Save record/i }));
    await waitFor(() => {
      expect(
        fileStoreHarness.api.commitWorkspaceWithEvidenceFiles,
      ).toHaveBeenCalled();
    });
    const savedBeforeOpen = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY),
    );
    const createdEvidence = savedBeforeOpen.evidence.find(
      (item) => item.fileName === "gmt-service-2026.pdf",
    );
    expect(createdEvidence).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: /View record/i }));

    await waitFor(() => {
      expect(window.location.pathname).toBe(
        `/evidence/${createdEvidence.id}`,
      );
      expect(window.location.search).toBe("");
    });
    await new Promise((resolvePromise) => {
      window.setTimeout(resolvePromise, 50);
    });
    expect(window.location.pathname).toBe(
      `/evidence/${createdEvidence.id}`,
    );
    expect(
      await screen.findByRole("heading", { name: "Service record" }),
    ).toBeTruthy();
    expect(screen.getAllByText("gmt-service-2026.pdf")).toHaveLength(3);
    expect(screen.getByText("a".repeat(64))).toBeTruthy();
    expect(
      screen.getByText("Original available for download"),
    ).toBeTruthy();
    expect(
      screen.getByText(/not rendered inline until a sanitized preview/i),
    ).toBeTruthy();
    expect(document.querySelector("iframe, object, embed, audio, video")).toBeNull();
    expect(fileStoreHarness.api.verifyEvidenceFileRecord).toHaveBeenCalled();
    expect(screen.getByText("Asset location when attached")).toBeTruthy();
    expect(
      screen.getByText("Immutable revision linked"),
    ).toBeTruthy();
    expect(screen.getByText("West Bay Home")).toBeTruthy();
    expect(
      screen.getByText(
        "25.32950, 51.53090 · Previously confirmed pin",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Study › Study safe")).toBeTruthy();
    expect(screen.getByText("Watch roll")).toBeTruthy();
    expect(
      screen.getByText(/contextual metadata, not independent proof/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/not encrypted cloud backup/i),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Mark reviewed" }));
    expect(
      screen.getByText("Reviewed by you"),
    ).toBeTruthy();

    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    const matching = saved.evidence.find(
      (item) => item.fileName === "gmt-service-2026.pdf",
    );
    expect(matching.status).toBe("verified");
    expect(matching.fileType).toBe("application/pdf");
    expect(matching.fileSize).toBe(file.size);
    expect(matching.fileChecksum).toBe("a".repeat(64));
    expect(matching.originalVersionId).toBe(`ov_${"a".repeat(64)}`);
    expect(matching.fileState).toBe("ready_local");
    expect(matching.storageScope).toBe("local-device");
    expect(matching.verifiedByMemberId).toBe("member-akmal");
    expect(matching.placementContext.assignmentId).toBe(
      "location-gmt-master-ii-initial",
    );
    expect(matching.placementContext.placeSnapshot.name).toBe(
      "West Bay Home",
    );
    expect(
      matching.placementContext.spacePathSnapshot.map((item) => item.name),
    ).toEqual(["Study", "Study safe"]);
    expect(matching.placementContext.locatorText).toBe("Watch roll");
  });

  it("saves a metadata-only note as text with its current placement context", async () => {
    const user = userEvent.setup();
    seedSample(
      "/assets/gmt-master-ii?capture=evidence&assetId=gmt-master-ii",
    );
    renderApp();

    const dialog = await screen.findByRole("dialog", {
      name: "Add paper or artifact",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Note or story" }),
    );
    const materialTitle = within(dialog).getByLabelText(/What is it/i);
    await user.clear(materialTitle);
    await user.type(materialTitle, "Placement check note");
    await user.selectOptions(
      within(dialog).getByLabelText(/How does it support the asset/i),
      "context",
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: /^Note or story/i }),
      "Recorded beside the watch roll during the location review.",
    );

    await user.click(
      within(dialog).getByRole("button", { name: /^Review$/i }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: /Save record/i }),
    );
    await user.click(
      await within(dialog).findByRole("button", { name: /View record/i }),
    );

    expect(
      await screen.findByRole("heading", { name: "Placement check note" }),
    ).toBeTruthy();
    expect(screen.getByText("Story saved as text")).toBeTruthy();
    expect(
      screen.getByText(
        "Recorded beside the watch roll during the location review.",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/No original file is missing/i)).toBeTruthy();
    expect(screen.queryByText(/File missing on this device/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Attach original/i }),
    ).toBeNull();
    expect(fileStoreHarness.api.getEvidenceFile).not.toHaveBeenCalled();

    expect(screen.getByText("Asset location when attached")).toBeTruthy();
    expect(screen.getByText("Immutable revision linked")).toBeTruthy();
    expect(screen.getByText("West Bay Home")).toBeTruthy();
    expect(screen.getByText("Study › Study safe")).toBeTruthy();
    expect(screen.getByText("Watch roll")).toBeTruthy();

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      const matching = saved.evidence.find(
        (item) => item.type === "Placement check note",
      );
      expect(matching).toBeTruthy();
      expect(matching.kind).toBe("note");
      expect(matching.fileName).toBeNull();
      expect(matching.fileState).toBeNull();
      expect(matching.placementContext.assignmentId).toBe(
        "location-gmt-master-ii-initial",
      );
      expect(matching.placementContext.placeSnapshot.name).toBe(
        "West Bay Home",
      );
      expect(
        matching.placementContext.spacePathSnapshot.map((item) => item.name),
      ).toEqual(["Study", "Study safe"]);
      expect(matching.placementContext.locatorText).toBe("Watch roll");
    });
  });

  it("keeps original-material storage separate and appends corrections from the detail view", async () => {
    const user = userEvent.setup();
    seedSample(
      "/assets/gmt-master-ii?capture=evidence&assetId=gmt-master-ii",
    );
    renderApp();

    const dialog = await screen.findByRole("dialog", {
      name: "Add paper or artifact",
    });
    await user.click(
      within(dialog).getByRole("button", {
        name: "Physical artifact",
      }),
    );
    const materialTitle = within(dialog).getByLabelText(/What is it/i);
    await user.clear(materialTitle);
    await user.type(materialTitle, "Original warranty card");
    expect(
      within(dialog).getByRole("heading", {
        name: "Where is the original material stored?",
      }),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(
        /does not copy the asset location captured when it was attached/i,
      ),
    ).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", { name: "Known" }),
    );
    await user.selectOptions(
      within(dialog).getByLabelText(/Storage place/i),
      "west-bay-home",
    );
    await user.selectOptions(
      within(dialog).getByLabelText(/Room or container/i),
      "study-safe",
    );
    await user.type(
      within(dialog).getByLabelText(/Exact retrieval clue/i),
      "Red portfolio, warranty sleeve",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /^Review$/i }),
    );
    expect(
      within(dialog).getByText("Asset location when attached"),
    ).toBeTruthy();
    expect(
      within(dialog).getByText("Original material storage"),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(
        "West Bay Home / Study / Study safe / Red portfolio, warranty sleeve",
      ),
    ).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", { name: /Save record/i }),
    );
    await user.click(
      await within(dialog).findByRole("button", {
        name: /View record/i,
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Original warranty card",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("Where the original material is stored"),
    ).toBeTruthy();
    expect(screen.getByText("Asset location when attached")).toBeTruthy();
    expect(screen.getByText("Study / Study safe")).toBeTruthy();
    expect(
      screen.getAllByText("Red portfolio, warranty sleeve").length,
    ).toBeGreaterThan(0);

    await user.click(
      screen.getByRole("button", {
        name: "Correct or move original",
      }),
    );
    const correction = screen.getByRole("form", {
      name: "Correct original material storage",
    });
    await user.click(
      within(correction).getByRole("button", {
        name: "Held elsewhere",
      }),
    );
    await user.selectOptions(
      within(correction).getByLabelText(/Household custodian/i),
      "member-sara",
    );
    await user.type(
      within(correction).getByLabelText(/Person or organization/i),
      "Family lawyer",
    );
    const clue = within(correction).getByLabelText(
      /Exact retrieval clue/i,
    );
    await user.clear(clue);
    await user.type(clue, "Estate file");
    await user.type(
      within(correction).getByLabelText(
        /Why are you correcting this?/i,
      ),
      "Transferred for estate review",
    );
    await user.click(
      within(correction).getByRole("button", {
        name: "Save storage correction",
      }),
    );

    await waitFor(() => {
      const saved = JSON.parse(
        window.localStorage.getItem(STORAGE_KEY),
      );
      const material = saved.evidence.find(
        (item) => item.type === "Original warranty card",
      );
      expect(material.materialStorage.status).toBe(
        "external_custodian",
      );
      expect(material.materialStorage.custodianMemberId).toBe(
        "member-sara",
      );
      expect(material.materialStorage.externalLabel).toBe(
        "Family lawyer",
      );
      expect(material.materialStorage.movedByMemberId).toBe(
        "member-akmal",
      );
      expect(material.materialStorage.history).toHaveLength(2);
      expect(material.materialStorage.history[0].status).toBe("known");
      expect(material.materialStorage.history[1].reason).toBe(
        "Transferred for estate review",
      );
      expect(material.placementContext.assignmentId).toBe(
        "location-gmt-master-ii-initial",
      );
    });
    expect(screen.getByText("Storage history (2)")).toBeTruthy();
    expect(screen.getAllByText(/Family lawyer/).length).toBeGreaterThan(0);
  });

  it("blocks a tampered local original before preview or download", async () => {
    const sample = createSampleWorkspace();
    const evidence = sample.evidence.find(
      (item) => item.id === "evidence-gmt-receipt",
    );
    const file = new File(["tampered bytes"], "gmt-purchase-receipt-demo.pdf", {
      type: "application/pdf",
    });
    Object.assign(evidence, {
      fileType: file.type,
      fileSize: file.size,
      fileChecksum: "a".repeat(64),
      fileState: "ready_local",
      storageScope: "local-device",
    });
    fileStoreHarness.evidence.set(evidence.id, {
      id: evidence.id,
      blob: file,
      fileName: evidence.fileName,
      fileType: evidence.fileType,
      fileSize: evidence.fileSize,
      fileChecksum: evidence.fileChecksum,
      storedAt: "2026-07-25T00:00:00.000Z",
    });
    fileStoreHarness.api.sha256ForBlob.mockResolvedValueOnce(
      "b".repeat(64),
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sample));
    window.history.replaceState(
      {},
      "",
      "/evidence/evidence-gmt-receipt",
    );

    renderApp();

    expect(
      await screen.findByText("Original blocked by integrity check"),
    ).toBeTruthy();
    expect(screen.getByText(/failed its SHA-256 integrity check/i)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Download original" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Mark reviewed" }),
    ).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      const blocked = saved.evidence.find(
        (item) => item.id === evidence.id,
      );
      expect(blocked.status).toBe("pending");
      expect(blocked.fileState).toBe("quarantined");
    });
  });

  it("replaces a missing original, verifies it locally, and keeps review explicit", async () => {
    const user = userEvent.setup();
    const sample = createSampleWorkspace();
    const evidence = sample.evidence.find(
      (item) => item.id === "evidence-gmt-receipt",
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sample));
    window.history.replaceState(
      {},
      "",
      `/evidence/${evidence.id}`,
    );

    renderApp();

    expect(
      await screen.findByText("Original file was never stored"),
    ).toBeTruthy();
    expect(
      fileStoreHarness.api.getEvidenceFile,
    ).not.toHaveBeenCalledWith(
      evidence.id,
      expect.anything(),
    );
    expect(
      fileStoreHarness.api.listEvidenceOriginalVersions,
    ).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Mark reviewed" }),
    ).toBeNull();
    const replacement = new File(
      ["replacement receipt"],
      "gmt-purchase-receipt-original.pdf",
      { type: "application/pdf" },
    );
    await user.upload(
      screen.getByLabelText("Choose replacement original"),
      replacement,
    );

    await waitFor(() => {
      expect(
        fileStoreHarness.api.commitWorkspaceWithEvidenceFiles,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeId: "local-demo",
          files: [
            expect.objectContaining({
              evidenceId: evidence.id,
              file: replacement,
            }),
          ],
        }),
      );
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      const attached = saved.evidence.find((item) => item.id === evidence.id);
      expect(attached.fileName).toBe(replacement.name);
      expect(attached.fileType).toBe(replacement.type);
      expect(attached.fileSize).toBe(replacement.size);
      expect(attached.fileChecksum).toBe("a".repeat(64));
      expect(attached.fileState).toBe("ready_local");
      expect(attached.status).toBe("pending");
    });
    expect(
      await screen.findByText("Original available for download"),
    ).toBeTruthy();
    expect(fileStoreHarness.api.verifyEvidenceFileRecord).toHaveBeenCalled();

    await user.click(
      await screen.findByRole("button", { name: "Mark reviewed" }),
    );
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      const reviewed = saved.evidence.find((item) => item.id === evidence.id);
      expect(reviewed.status).toBe("verified");
    });
    expect(screen.getByText("Reviewed by you")).toBeTruthy();
  });

  it("creates a category-first asset with no places and keeps location explicitly unknown", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: /Add my first item/i }));
    const dialog = await screen.findByRole("dialog", { name: "Choose a category" });

    await user.click(
      within(dialog).getByRole("button", { name: /Vehicles & mobility/i }),
    );
    await user.click(within(dialog).getByRole("button", { name: /^Car\b/i }));
    await user.click(within(dialog).getByRole("button", { name: /Continue/i }));

    expect(
      await within(dialog).findByRole("heading", { name: "Identify the item" }),
    ).toBeTruthy();
    await user.type(within(dialog).getByLabelText(/Asset name/i), "Family Land Cruiser");
    await user.click(within(dialog).getByRole("button", { name: /Continue/i }));

    expect(
      await within(dialog).findByRole("heading", { name: "Where is it?" }),
    ).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /Unknown/i }).getAttribute("aria-pressed")).toBe("true");
    await user.click(within(dialog).getByRole("button", { name: /Continue/i }));
    await user.click(within(dialog).getByRole("button", { name: /^Review$/i }));
    await user.click(within(dialog).getByRole("button", { name: /Save record/i }));
    await user.click(within(dialog).getByRole("button", { name: /View record/i }));

    expect(
      await screen.findByRole("heading", { name: "Family Land Cruiser" }),
    ).toBeTruthy();
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    const asset = saved.assets.find((item) => item.name === "Family Land Cruiser");
    expect(asset.categoryId).toBe("vehicle.car");
    expect(asset.locationMode).toBe("unknown");
    expect(asset.placeId).toBe(null);
  });

  it("puts common asset intents and every supporting action on the first Add screen", async () => {
    seedSample("/home?capture=choose");
    renderApp();

    const chooser = await screen.findByRole("dialog", {
      name: "What are you adding?",
    });

    [
      /Add Car — Vehicle/i,
      /Add Motorbike — Vehicle/i,
      /Add Watch — Lifestyle/i,
      /Browse Real estate — Owned property/i,
      /Add Digital asset — Digital/i,
      /Add Physical item — Home & storage/i,
      /Browse all 64 asset categories/i,
      /^Place\b/i,
      /Room or zone/i,
      /Paper or artifact/i,
    ].forEach((name) => {
      expect(within(chooser).getByRole("button", { name })).toBeTruthy();
    });
  });

  it("quick-adds a Car with its canonical category ID", async () => {
    const user = userEvent.setup();
    seedSample("/home?capture=choose");
    renderApp();

    const chooser = await screen.findByRole("dialog", {
      name: "What are you adding?",
    });
    await user.click(
      within(chooser).getByRole("button", {
        name: /Add Car — Vehicle/i,
      }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Identify the item",
    });
    await user.type(
      within(dialog).getByLabelText(/Asset name/i),
      "Quick-add roadster",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /Continue/i }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: /Continue/i }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: /^Review$/i }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: /Save record/i }),
    );

    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    const asset = saved.assets.find(
      (item) => item.name === "Quick-add roadster",
    );
    expect(asset.categoryId).toBe("vehicle.car");
  });

  it("keeps a quick Digital asset virtual even when Add starts from a Place", async () => {
    const user = userEvent.setup();
    const sample = createSampleWorkspace();
    const place = sample.places[0];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sample));
    window.history.replaceState(
      {},
      "",
      `/home?capture=choose&placeId=${place.id}`,
    );
    renderApp();

    const chooser = await screen.findByRole("dialog", {
      name: "What are you adding?",
    });
    await user.click(
      within(chooser).getByRole("button", {
        name: /Add Digital asset — Digital/i,
      }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Identify the item",
    });
    await user.type(
      within(dialog).getByLabelText(/Asset name/i),
      "Family domain",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /Continue/i }),
    );

    expect(
      within(dialog)
        .getByRole("button", { name: /No physical location/i })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(within(dialog).queryByLabelText(/^Place$/i)).toBe(null);
  });

  it("shows recognizable category examples and blocks Continue until selection", async () => {
    const user = userEvent.setup();
    seedSample("/home?capture=choose");
    renderApp();

    const chooser = await screen.findByRole("dialog", {
      name: "What are you adding?",
    });
    await user.click(
      within(chooser).getByRole("button", {
        name: /Browse all 64 asset categories/i,
      }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Choose a category",
    });
    expect(
      within(dialog).getByRole("button", {
        name: /Browse Vehicles & mobility: Car, Motorbike, Bicycle/i,
      }),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole("button", { name: /Continue/i }).disabled,
    ).toBe(true);
  });

  it("keeps Paper or artifact actionable before the first asset exists", async () => {
    const user = userEvent.setup();
    const personal = workspaceReducer(createSampleWorkspace(), {
      type: "START_PERSONAL",
      now: "2026-07-24T10:00:00.000Z",
    });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(personal));
    window.history.replaceState({}, "", "/home?capture=choose");
    renderApp();

    const chooser = await screen.findByRole("dialog", {
      name: "What are you adding?",
    });
    await user.click(
      within(chooser).getByRole("button", {
        name: /Paper or artifact/i,
      }),
    );

    const material = await screen.findByRole("dialog", {
      name: "Add paper or artifact",
    });
    expect(
      within(material).getByRole("heading", {
        name: "What does this material support?",
      }),
    ).toBeTruthy();
    await user.click(
      within(material).getByRole("button", {
        name: /Create the asset first/i,
      }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Choose a category" }),
    ).toBeTruthy();
  });

  it("creates a required Place first when Room is chosen in an empty workspace", async () => {
    const user = userEvent.setup();
    const personal = workspaceReducer(createSampleWorkspace(), {
      type: "START_PERSONAL",
      now: "2026-07-24T10:00:00.000Z",
    });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(personal));
    window.history.replaceState({}, "", "/home?capture=choose");
    renderApp();

    const chooser = await screen.findByRole("dialog", {
      name: "What are you adding?",
    });
    await user.click(
      within(chooser).getByRole("button", { name: /Room or zone/i }),
    );

    const placeDialog = await screen.findByRole("dialog", {
      name: "Add a place",
    });
    expect(within(placeDialog).getByText("A room needs a Place")).toBeTruthy();
    await user.type(
      within(placeDialog).getByLabelText(/Place name/i),
      "Family archive",
    );
    await user.click(
      within(placeDialog).getByRole("button", { name: /^Review$/i }),
    );
    await user.click(
      within(placeDialog).getByRole("button", { name: /Save record/i }),
    );

    const roomDialog = await screen.findByRole("dialog", {
      name: "Add a room or zone",
    });
    let place;
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      place = saved.places.find((item) => item.name === "Family archive");
      expect(place).toBeTruthy();
    });
    expect(within(roomDialog).getByLabelText("Place").value).toBe(place.id);
  });

  it("creates a demo family invitation without claiming an email was sent", async () => {
    const user = userEvent.setup();
    seedSample("/family");
    renderApp();

    await user.click(
      await screen.findByRole("button", { name: /Invite member/i }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Invite a household member",
    });
    await user.type(within(dialog).getByLabelText("Name"), "Omar H.");
    await user.type(
      within(dialog).getByLabelText("Email"),
      "omar@example.test",
    );
    await user.selectOptions(within(dialog).getByLabelText("Role"), "editor");
    await user.click(
      within(dialog).getByRole("button", { name: /Create demo invite/i }),
    );

    expect(await screen.findByText("Omar H.")).toBeTruthy();
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(
      saved.members.some(
        (member) =>
          member.email === "omar@example.test" &&
          member.inviteStatus === "invited",
      ),
    ).toBe(true);
  });

  it("blocks duplicate household emails without closing the invite dialog", async () => {
    const user = userEvent.setup();
    const sample = createSampleWorkspace();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sample));
    window.history.replaceState({}, "", "/family");
    renderApp();

    await user.click(
      await screen.findByRole("button", { name: /Invite member/i }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Invite a household member",
    });
    await user.type(within(dialog).getByLabelText("Name"), "Duplicate member");
    await user.type(
      within(dialog).getByLabelText("Email"),
      sample.members[0].email,
    );
    await user.click(
      within(dialog).getByRole("button", { name: /Create demo invite/i }),
    );

    expect(
      (await within(dialog).findByRole("alert")).textContent,
    ).toMatch(/already belongs/i);
    expect(screen.getByRole("dialog", {
      name: "Invite a household member",
    })).toBeTruthy();
    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY)).members,
    ).toHaveLength(sample.members.length);
  });

  it("keeps an existing personal workspace when capture starts from welcome", async () => {
    const user = userEvent.setup();
    const personal = workspaceReducer(
      workspaceReducer(createSampleWorkspace(), {
        type: "START_PERSONAL",
        now: "2026-07-24T10:00:00.000Z",
      }),
      {
        type: "ADD_ASSET",
        asset: {
          id: "personal-keepsake",
          name: "Personal keepsake",
          categoryId: "custom.other",
          category: "Other",
          requiredProofTypes: [],
        },
        now: "2026-07-24T10:01:00.000Z",
      },
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(personal));
    window.history.replaceState({}, "", "/welcome");
    renderApp();

    await user.click(
      screen.getByRole("button", { name: /Add my first item/i }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Choose a category" }),
    ).toBeTruthy();
    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY)).assets.some(
        (asset) => asset.id === "personal-keepsake",
      ),
    ).toBe(true);
  });

  it("replaces personal records only when the isolated sample is confirmed", async () => {
    const user = userEvent.setup();
    const personal = workspaceReducer(
      workspaceReducer(createSampleWorkspace(), {
        type: "START_PERSONAL",
        now: "2026-07-24T10:00:00.000Z",
      }),
      {
        type: "ADD_ASSET",
        asset: {
          id: "personal-private",
          name: "Private personal record",
          categoryId: "custom.other",
          category: "Other",
          requiredProofTypes: [],
        },
        now: "2026-07-24T10:01:00.000Z",
      },
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(personal));
    window.history.replaceState({}, "", "/welcome");
    renderApp();

    await user.click(
      screen.getByRole("button", { name: /Explore a sample workspace/i }),
    );
    await screen.findByRole("heading", { name: "Everything you own" });
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(window.confirm).toHaveBeenCalled();
    expect(saved.mode).toBe("sample");
    expect(saved.assets).toHaveLength(17);
    expect(saved.assets.some((asset) => asset.id === "personal-private")).toBe(
      false,
    );
  });

  it("protects personal invitations before replacing the workspace with sample data", async () => {
    const user = userEvent.setup();
    const personal = workspaceReducer(
      workspaceReducer(createSampleWorkspace(), {
        type: "START_PERSONAL",
        now: "2026-07-24T10:00:00.000Z",
      }),
      {
        type: "INVITE_MEMBER",
        member: {
          id: "member-personal-invite",
          name: "Private Invite",
          email: "private-invite@example.test",
        },
        now: "2026-07-24T10:01:00.000Z",
      },
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(personal));
    window.history.replaceState({}, "", "/welcome");
    window.confirm.mockReturnValue(false);
    renderApp();

    await user.click(
      screen.getByRole("button", { name: /Explore a sample workspace/i }),
    );

    expect(window.confirm).toHaveBeenCalled();
    expect(
      await screen.findByRole("heading", { name: "Start with what matters." }),
    ).toBeTruthy();
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(saved.mode).toBe("personal");
    expect(
      saved.members.some((member) => member.id === "member-personal-invite"),
    ).toBe(true);
  });

  it("opens a searched household member directly in Family", async () => {
    const user = userEvent.setup();
    const sample = createSampleWorkspace();
    const member = sample.members[1];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sample));
    window.history.replaceState({}, "", "/home");
    renderApp();
    await screen.findByRole("heading", { name: "Everything you own" });

    await user.keyboard("{Control>}k{/Control}");
    const search = await screen.findByRole("dialog", {
      name: "Search everything",
    });
    await user.type(
      within(search).getByPlaceholderText(
        /Find an asset, place, material, or reference/i,
      ),
      member.name,
    );
    await user.click(
      await within(search).findByRole("option", {
        name: new RegExp(member.name, "i"),
      }),
    );

    expect(window.location.pathname).toBe("/family");
    expect(window.location.search).toBe(`?member=${member.id}`);
    expect(
      await screen.findByRole("button", {
        name: new RegExp(member.name, "i"),
        pressed: true,
      }),
    ).toBeTruthy();
  });

  it("closes an invalid capture deep link without showing a false form", async () => {
    seedSample("/home?capture=unsupported&assetId=missing");
    renderApp();

    expect(
      await screen.findByRole("heading", { name: "Everything you own" }),
    ).toBeTruthy();
    await waitFor(() => {
      expect(window.location.search).toBe("");
    });
    expect(screen.queryByRole("dialog")).toBe(null);
  });

  it("commits a real default place when Room is chosen from global Add", async () => {
    const user = userEvent.setup();
    const sample = createSampleWorkspace();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sample));
    window.history.replaceState({}, "", "/home?capture=choose");
    renderApp();

    const chooser = await screen.findByRole("dialog", {
      name: "What are you adding?",
    });
    await user.click(
      within(chooser).getByRole("button", { name: /Room or zone/i }),
    );
    const room = await screen.findByRole("dialog", {
      name: "Add a room or zone",
    });
    expect(within(room).getByLabelText("Place").value).toBe(
      sample.places[0].id,
    );
    await user.type(
      within(room).getByLabelText(/Room or zone name/i),
      "Library shelf",
    );
    await user.click(
      within(room).getByRole("button", { name: /^Review$/i }),
    );
    expect(await within(room).findByText("Library shelf")).toBeTruthy();
  });

  it("clears incompatible draft fields before switching capture types", async () => {
    const user = userEvent.setup();
    seedSample("/home?capture=choose");
    renderApp();

    const chooser = await screen.findByRole("dialog", {
      name: "What are you adding?",
    });
    await user.click(
      within(chooser).getByRole("button", { name: /^Place/i }),
    );
    const place = await screen.findByRole("dialog", {
      name: "Add a place",
    });
    await user.type(
      within(place).getByLabelText(/Place name/i),
      "Family Villa",
    );
    await user.click(
      within(place).getByRole("button", { name: /^Back$/i }),
    );

    const resetChooser = await screen.findByRole("dialog", {
      name: "What are you adding?",
    });
    await user.click(
      within(resetChooser).getByRole("button", {
        name: /Room or zone/i,
      }),
    );
    const room = await screen.findByRole("dialog", {
      name: "Add a room or zone",
    });
    expect(
      within(room).getByLabelText(/Room or zone name/i).value,
    ).toBe("");
  });

  it("keeps a dirty capture draft when browser Back is cancelled", async () => {
    const user = userEvent.setup();
    seedSample("/home");
    renderApp();
    await screen.findByRole("heading", { name: "Everything you own" });

    await user.click(
      screen.getAllByRole("button", {
        name: "Add a place, asset, room, paper, or artifact",
      })[0],
    );
    const chooser = await screen.findByRole("dialog", {
      name: "What are you adding?",
    });
    await user.click(within(chooser).getByRole("button", { name: /^Place/i }));
    const place = await screen.findByRole("dialog", { name: "Add a place" });
    const name = within(place).getByLabelText(/Place name/i);
    await user.type(name, "Do not lose this draft");
    window.confirm.mockReturnValue(false);

    window.history.back();
    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith(
        "Discard the saved draft and the details you entered?",
      );
    });
    expect(
      screen.getByRole("dialog", { name: "Add a place" }),
    ).toBeTruthy();
    expect(name.value).toBe("Do not lose this draft");
  });

  it("retains a capture draft and shows a persistent warning when durable save fails", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { name: "Start with what matters." });
    await user.click(screen.getByRole("button", { name: /^Add a place$/i }));

    const dialog = await screen.findByRole("dialog", { name: "Add a place" });
    await user.type(
      within(dialog).getByLabelText(/Place name/i),
      "Session-only home",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /^Review$/i }),
    );
    fileStoreHarness.api.commitWorkspaceWithEvidenceFiles.mockRejectedValueOnce(
      Object.assign(new Error("Quota denied"), {
        code: "CAPTURE_STORAGE_FAILED",
      }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: /Save record/i }),
    );

    expect(
      await within(dialog).findByText("Quota denied"),
    ).toBeTruthy();
    expect(
      await screen.findByText(/Browser save failed/i),
    ).toBeTruthy();
    const draft = JSON.parse(
      window.localStorage.getItem(
        storageKeysForScope(LOCAL_DEMO_SCOPE_ID).captureDraft,
      ),
    );
    expect(draft.form.name).toBe("Session-only home");
    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY)).places.some(
        (place) => place.name === "Session-only home",
      ),
    ).toBe(false);
  });

  it("revalidates a reviewed material when another tab archives its asset", async () => {
    const user = userEvent.setup();
    const sample = createSampleWorkspace();
    const asset = sample.assets.find(
      (item) => item.lifecycleStatus !== "archived",
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sample));
    window.history.replaceState(
      {},
      "",
      `/assets/${asset.id}?capture=evidence&assetId=${asset.id}`,
    );
    renderApp();

    const dialog = await screen.findByRole("dialog", {
      name: "Add paper or artifact",
    });
    const file = new File(["proof"], "stale-proof.pdf", {
      type: "application/pdf",
    });
    await user.upload(
      within(dialog).getByLabelText(/^Choose file$/i),
      file,
    );
    await user.click(
      within(dialog).getByRole("button", { name: /^Review$/i }),
    );

    const archived = workspaceReducer(sample, {
      type: "ARCHIVE_ASSET",
      assetId: asset.id,
      now: "2026-07-24T11:00:00.000Z",
    });
    const currentRecovery =
      fileStoreHarness.recovery.get(LOCAL_DEMO_SCOPE_ID);
    fileStoreHarness.recovery.set(LOCAL_DEMO_SCOPE_ID, {
      ...currentRecovery,
      revision: currentRecovery.revision + 1,
      workspaceRaw: JSON.stringify(archived),
      updatedAt: "2026-07-24T11:00:00.000Z",
    });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(archived));
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: STORAGE_KEY,
        newValue: JSON.stringify(archived),
      }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Asset not found" }),
      ).toBeTruthy();
    });

    await user.click(
      within(dialog).getByRole("button", { name: /Save record/i }),
    );
    expect(
      await within(dialog).findByText(
        "Choose the asset this material supports.",
      ),
    ).toBeTruthy();
    expect(within(dialog).queryByText("Added to workspace")).toBe(null);
  });

  it("shows an explicit recovery state for an invalid deep link", async () => {
    seedSample("/assets/does-not-exist");
    renderApp();

    expect(
      await screen.findByRole("heading", { name: "Asset not found" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Return safely/i }).getAttribute("href"),
    ).toBe("/assets");
  });

  it("recovers an invalid asset-edit capture link before showing a new-asset form", async () => {
    seedSample("/home?capture=asset&assetId=missing-asset");
    renderApp();

    const dialog = await screen.findByRole("dialog", {
      name: "Capture link unavailable",
    });
    expect(
      within(dialog).getByText(/linked asset is missing or archived/i),
    ).toBeTruthy();
    expect(
      within(dialog).queryByRole("heading", {
        name: "Choose a category",
      }),
    ).toBe(null);
    expect(
      within(dialog).getByRole("button", { name: "Close safely" }),
    ).toBeTruthy();
  });

  it("does not substitute another person for an invalid Family member link", async () => {
    const user = userEvent.setup();
    seedSample("/family?member=missing-member");
    renderApp();

    expect(
      await screen.findByRole("heading", {
        name: "Member link unavailable",
      }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { pressed: false }).length,
    ).toBeGreaterThan(0);

    await user.click(
      screen.getByRole("button", { name: "Show household members" }),
    );
    expect(window.location.search).toBe("");
    expect(
      await screen.findByRole("heading", { name: "Akmal H." }),
    ).toBeTruthy();
  });

  it("recovers a malformed nested room link to Home when its Place is invalid", async () => {
    seedSample("/places/missing-place/spaces/missing-space");
    renderApp();

    expect(
      await screen.findByRole("heading", {
        name: "Room or zone not found",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Return safely/i }).getAttribute("href"),
    ).toBe("/home");
  });

  it("keeps overlays mutually exclusive and gives search an on-screen close action", async () => {
    const user = userEvent.setup();
    seedSample("/home?capture=choose");
    renderApp();

    expect(
      await screen.findByRole("dialog", {
        name: "What are you adding?",
      }),
    ).toBeTruthy();
    await user.keyboard("{Control>}k{/Control}");

    const search = await screen.findByRole("dialog", {
      name: "Search everything",
    });
    expect(
      screen.queryByRole("dialog", {
        name: "What are you adding?",
      }),
    ).toBe(null);
    expect(window.location.search).toBe("?search=1");
    await user.click(within(search).getByRole("button", { name: "Close search" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Search everything" })).toBe(null);
    });
  });

  it("opens the exact material from Search with keyboard selection", async () => {
    const user = userEvent.setup();
    seedSample("/home");
    renderApp();

    await screen.findByRole("heading", {
      name: "Everything you own",
    });
    await user.keyboard("{Control>}k{/Control}");
    const search = await screen.findByRole("dialog", {
      name: "Search everything",
    });
    const input = within(search).getByRole("combobox", {
      name: "Search everything",
    });
    await user.type(input, "gmt-purchase-receipt-demo.pdf");
    expect(
      await within(search).findByRole("option", {
        name: /Purchase receipt/i,
      }),
    ).toBeTruthy();
    expect(input.getAttribute("aria-activedescendant")).toBe(
      "workspace-search-result-0",
    );

    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(window.location.pathname).toBe(
        "/evidence/evidence-gmt-receipt",
      );
    });
    expect(
      await screen.findByRole("heading", {
        name: "Purchase receipt",
      }),
    ).toBeTruthy();
    await waitFor(() => {
      const saved = JSON.parse(
        window.localStorage.getItem(STORAGE_KEY),
      );
      expect(
        saved.activity.some(
          (entry) =>
            entry.type === "search-retrieval" &&
            entry.entityType === "evidence" &&
            entry.entityId === "evidence-gmt-receipt",
        ),
      ).toBe(true);
    });
  });

  it("renders only one modal when a malformed deep link requests several overlays", async () => {
    seedSample(
      "/home?capture=choose&search=1&settings=1&help=1",
    );
    renderApp();

    expect(
      await screen.findByRole("dialog", {
        name: "What are you adding?",
      }),
    ).toBeTruthy();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      screen.queryByRole("dialog", { name: "Search everything" }),
    ).toBe(null);
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBe(null);
    expect(
      screen.queryByRole("dialog", { name: "Your next move" }),
    ).toBe(null);
  });

  it("opens a distinct getting-started guide instead of misrouting Help to Settings", async () => {
    const user = userEvent.setup();
    seedSample("/assets");
    renderApp();

    await user.click(
      await screen.findByRole("button", {
        name: "Help and getting started",
      }),
    );
    const help = await screen.findByRole("dialog", {
      name: "Your next move",
    });
    expect(window.location.search).toBe("?help=1");
    expect(
      within(help).getByText("Capture what you remember"),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBe(null);

    await user.click(
      within(help).getByRole("button", { name: /Show my next action/i }),
    );
    expect(
      await screen.findByRole("heading", { name: "Everything you own" }),
    ).toBeTruthy();
    expect(window.location.pathname).toBe("/home");
    expect(window.location.search).toBe("");
  });

  it("keeps Collections inside Assets and supports the complete collection route", async () => {
    const user = userEvent.setup();
    seedSample("/collections");
    renderApp();

    expect(
      await screen.findByRole("heading", { name: "Collections" }),
    ).toBeTruthy();
    const primaryNavigation = screen.getByRole("navigation", {
      name: "Primary navigation",
    });
    expect(
      within(primaryNavigation).queryByRole("link", { name: "Collections" }),
    ).toBe(null);
    expect(
      within(
        screen.getByRole("navigation", { name: "Asset views" }),
      ).getByRole("link", { name: "Collections" }),
    ).toBeTruthy();

    const collectionLinks = screen.getAllByRole("link", {
      name: /Watches I chose carefully/i,
    });
    await user.click(collectionLinks[0]);

    expect(window.location.pathname).toBe("/collections/collection-watches");
    expect(
      await screen.findByRole("heading", {
        name: "Watches I chose carefully",
      }),
    ).toBeTruthy();
    const sections = screen.getByRole("navigation", {
      name: "Collection sections",
    });
    ["Showcase", "Catalog", "Story", "Proof", "Care", "Access"].forEach(
      (name) => {
        expect(within(sections).getByRole("button", { name })).toBeTruthy();
      },
    );
    await user.click(within(sections).getByRole("button", { name: "Access" }));
    expect(
      await screen.findByText(
        /exclude exact location, serial numbers, financial references, documents, and recorded values/i,
      ),
    ).toBeTruthy();
  });

  it("connects collector care history and purposeful gaps to the saved workspace", async () => {
    const user = userEvent.setup();
    seedSample("/collections/collection-art?tab=care");
    renderApp();

    expect(
      await screen.findByText("Private conservation ledger"),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Gaps, not shopping pressure" }),
    ).toBeTruthy();

    const addCareButton = screen.getByRole("button", {
      name: /Add care record/i,
    });
    await user.click(addCareButton);
    expect(
      await screen.findByRole("dialog", { name: "Add condition check" }),
    ).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Add condition check" }),
      ).toBe(null);
    });
    expect(document.activeElement).toBe(addCareButton);

    await user.click(addCareButton);
    const conditionDialog = await screen.findByRole("dialog", {
      name: "Add condition check",
    });
    await user.selectOptions(
      within(conditionDialog).getByLabelText("Condition"),
      "excellent",
    );
    await user.type(
      within(conditionDialog).getByLabelText("What did you observe?"),
      "Surface, frame, and hanging points reviewed.",
    );
    await user.click(
      within(conditionDialog).getByRole("button", { name: /Save record/i }),
    );

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      expect(
        saved.collector.conditionReports.some(
          (report) =>
            report.summary ===
            "Surface, frame, and hanging points reviewed.",
        ),
      ).toBe(true);
    });
    const documentedBeforeTarget =
      screen.getByText("Documented").parentElement.textContent;

    await user.click(
      screen.getByRole("button", { name: /Define a collection gap/i }),
    );
    const targetDialog = await screen.findByRole("dialog", {
      name: "Define a collection gap",
    });
    await user.type(
      within(targetDialog).getByLabelText(
        "What role should the piece fill?",
      ),
      "A work that explains the collection’s beginning",
    );
    await user.selectOptions(
      within(targetDialog).getByLabelText("Priority"),
      "high",
    );
    await user.click(
      within(targetDialog).getByRole("button", { name: /Save record/i }),
    );

    expect(
      await screen.findByText(
        "A work that explains the collection’s beginning",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("Documented").parentElement.textContent,
    ).toBe(documentedBeforeTarget);
    await user.click(screen.getByRole("button", { name: "Match piece" }));
    const matchDialog = await screen.findByRole("dialog", {
      name: "Match an existing piece",
    });
    expect(
      within(matchDialog).getByRole("option", {
        name: "Desert Light, No. 3",
      }),
    ).toBeTruthy();
    await user.click(
      within(matchDialog).getByRole("button", { name: /Save record/i }),
    );

    await waitFor(() => {
      const matched = JSON.parse(
        window.localStorage.getItem(STORAGE_KEY),
      ).collector.collectionTargets.find(
        (item) =>
          item.label === "A work that explains the collection’s beginning",
      );
      expect(matched.status).toBe("filled");
      expect(matched.matchedItemProfileId).toBe(
        "collector-profile-desert-light-study",
      );
    });
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    const target = saved.collector.collectionTargets.find(
      (item) =>
        item.label === "A work that explains the collection’s beginning",
    );
    expect(target.priority).toBe("high");
    expect(target.status).toBe("filled");
  });

  it("offers a working service action when a required piece has no reviewed history", async () => {
    const user = userEvent.setup();
    seedSample("/collections/collection-watches?tab=care");
    renderApp();

    expect(
      await screen.findByText("Add service history for GMT-Master II"),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: /Add service record/i }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Add service record" }),
    ).toBeTruthy();
  });

  it("opens Set location as a focused edit and saves without unrelated steps", async () => {
    const user = userEvent.setup();
    const sample = createSampleWorkspace();
    const initialHistoryLength = sample.locationAssignments.filter(
      (assignment) => assignment.assetId === "gmt-master-ii",
    ).length;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sample));
    window.history.replaceState({}, "", "/assets/gmt-master-ii");
    renderApp();

    await screen.findByRole("heading", { name: "GMT-Master II" });
    await user.click(
      screen.getAllByRole("button", {
        name: /(?:Set|Change) location/,
      })[0],
    );

    const dialog = await screen.findByRole("dialog", { name: "Where is it?" });
    expect(within(dialog).getByText("Focused edit")).toBeTruthy();
    expect(within(dialog).queryByLabelText(/Asset name/i)).toBe(null);
    expect(
      within(dialog).getByRole("button", { name: "Review location" }),
    ).toBeTruthy();

    await user.click(
      within(dialog).getByRole("button", { name: "Needs detail" }),
    );
    const detail = within(dialog).getByLabelText(/Location detail/i);
    await user.clear(detail);
    await user.type(detail, "Confirm the watch roll");
    await user.click(
      within(dialog).getByRole("button", { name: "Review location" }),
    );
    expect(
      await within(dialog).findByRole("heading", { name: "Review asset" }),
    ).toBeTruthy();
    expect(within(dialog).queryByText("Papers & artifacts")).toBe(null);
    await user.click(
      within(dialog).getByRole("button", { name: "Save record" }),
    );

    expect(await within(dialog).findByText("Added to workspace")).toBeTruthy();
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      const asset = saved.assets.find((item) => item.id === "gmt-master-ii");
      expect(asset.locationStatus).toBe("needs-detail");
      expect(asset.locationDetail).toBe("Confirm the watch roll");
      expect(
        saved.locationAssignments.filter(
          (assignment) => assignment.assetId === "gmt-master-ii",
        ).length,
      ).toBe(initialHistoryLength + 1);
    });
    expect(fileStoreHarness.api.putEvidenceFile).not.toHaveBeenCalled();
  });

  it("moves from an asset location edit into the selected Place pin editor", async () => {
    const user = userEvent.setup();
    seedSample("/assets/family-archive-item-07");
    renderApp();

    await screen.findByRole("heading", { name: "Archive item 07" });
    await user.click(
      screen.getAllByRole("button", {
        name: /(?:Set|Change) location/,
      })[0],
    );

    const assetDialog = await screen.findByRole("dialog", {
      name: "Where is it?",
    });
    await user.click(
       within(assetDialog).getByRole("button", {
         name: "Set Place pin",
       }),
    );

    const placeDialog = await screen.findByRole("dialog", {
      name: "Edit place",
    });
    expect(window.location.pathname).toBe("/places/family-archive");
    expect(new URLSearchParams(window.location.search).get("capture")).toBe(
      "place",
    );
    expect(within(placeDialog).getByLabelText(/Place name/i).value).toBe(
      "Family archive",
    );
    expect(within(placeDialog).queryByText("Focused edit")).toBe(null);

    await user.click(
      within(placeDialog).getByRole("button", { name: /Coordinates/i }),
    );
    const latitude = within(placeDialog).getByLabelText("Latitude");
    const longitude = within(placeDialog).getByLabelText("Longitude");
    await user.clear(latitude);
    await user.type(latitude, "51.5007");
    await user.clear(longitude);
    await user.type(longitude, "-0.1246");
    await user.click(
      within(placeDialog).getByRole("button", { name: /^Review$/i }),
    );

    expect(
      await within(placeDialog).findByRole("heading", {
        name: "Review place",
      }),
    ).toBeTruthy();
    expect(
      within(placeDialog).getByText(/accuracy not measured/i),
    ).toBeTruthy();
    expect(
      within(placeDialog).queryByText("London, United Kingdom"),
    ).toBe(null);
    await user.click(
      within(placeDialog).getByRole("button", { name: "Save record" }),
    );
    expect(await within(placeDialog).findByText("Added to workspace")).toBeTruthy();

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      const place = saved.places.find((item) => item.id === "family-archive");
      expect(place.coordinates).toEqual({ lat: 51.5007, lng: -0.1246 });
      expect(place.locationSource).toBe("manual_coordinates");
      expect(place.locationPrecision).toBe("user_placed");
      expect(place.horizontalAccuracyMeters).toBe(null);
      expect(place.address).toBe(null);
    });
  });

  it("requires a valid point and records manual coordinates without invented accuracy", async () => {
    const user = userEvent.setup();
    seedSample("/home?capture=place");
    renderApp();

    const dialog = await screen.findByRole("dialog", { name: "Add a place" });
    await user.type(
      within(dialog).getByLabelText(/Place name/i),
      "Exact Doha home",
    );
    expect(
      within(dialog)
        .getByRole("button", { name: /Add later/i })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(dialog).getByText(
        /city remains useful for the globe, but no property pin is recorded/i,
      ),
    ).toBeTruthy();

    await user.click(
      within(dialog).getByRole("button", { name: /Coordinates/i }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: /^Review$/i }),
    );
    expect((await within(dialog).findByRole("alert")).textContent).toMatch(
      /valid map point|latitude and longitude/i,
    );

    await user.type(within(dialog).getByLabelText("Latitude"), "25.2854");
    await user.type(within(dialog).getByLabelText("Longitude"), "51.531");
    await user.click(
      within(dialog).getByRole("button", { name: /^Review$/i }),
    );
    expect(
      await within(dialog).findByRole("heading", { name: "Review place" }),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(
        /User-entered coordinates.*accuracy not measured/i,
      ),
    ).toBeTruthy();
    expect(within(dialog).getByText(/25\.2854/)).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", { name: "Save record" }),
    );

    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    const place = saved.places.find((item) => item.name === "Exact Doha home");
    expect(place.coordinates).toEqual({ lat: 25.2854, lng: 51.531 });
    expect(place.locationSource).toBe("manual_coordinates");
    expect(place.locationPrecision).toBe("user_placed");
    expect(place.horizontalAccuracyMeters).toBe(null);
    expect(place.locationConfirmedAt).toBeTruthy();
  });

  it("restores a recoverable capture draft with a visible, non-duplicating state", async () => {
    seedSample("/home?capture=place");
    window.localStorage.setItem(
      "alyr.asset-continuity.capture-draft",
      JSON.stringify({
        version: 1,
        contextKey: "place||||",
        type: "place",
        step: "details",
        assetStage: "category",
        continuation: null,
        form: {
          name: "Recovered family villa",
          kind: "Home",
          regionId: "doha",
          locationMethod: "later",
        },
        hasFile: false,
        updatedAt: new Date().toISOString(),
      }),
    );
    renderApp();

    const dialog = await screen.findByRole("dialog", { name: "Add a place" });
    expect(within(dialog).getByLabelText(/Place name/i).value).toBe(
      "Recovered family villa",
    );
    expect(
      within(dialog).getByText(/unfinished capture was restored/i),
    ).toBeTruthy();
    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY)).places.some(
        (place) => place.name === "Recovered family villa",
      ),
    ).toBe(false);
  });

  it("promotes legacy memory draft fields into the canonical capture controls", async () => {
    seedSample("/assets?view=memories&capture=asset&intent=memory");
    window.localStorage.setItem(
      "alyr.asset-continuity.capture-draft",
      JSON.stringify({
        version: 1,
        contextKey: "asset|||||memory",
        type: "asset",
        step: "details",
        assetStage: "identity",
        continuation: null,
        form: {
          name: "Recovered courtyard story",
          categoryId: "legacy.story-memory",
          meaningFacets: "memory, family-history",
          memorySubjectType: "story",
          memoryOrigin: "",
          memoryPeriod: "",
          memoryPeopleEntries: [],
          profile: {
            origin: "Doha courtyard",
            "date-period": "Childhood · 1999",
            people: "Mariam and Yusuf",
            story: "The original story remains intact.",
          },
        },
        hasFile: false,
        updatedAt: new Date().toISOString(),
      }),
    );
    renderApp();

    const dialog = await screen.findByRole("dialog", {
      name: "Preserve what you remember",
    });
    expect(within(dialog).getByLabelText(/^Origin$/i).value).toBe(
      "Doha courtyard",
    );
    expect(within(dialog).getByLabelText(/^Time or period$/i).value).toBe(
      "Childhood · 1999",
    );
    expect(within(dialog).getByLabelText(/Person 1 name/i).value).toBe(
      "Mariam",
    );
    expect(
      within(dialog).queryByLabelText(/^People connected$/i),
    ).toBeNull();
    expect(
      within(dialog).queryByLabelText(/^Date or period$/i),
    ).toBeNull();
  });

  it("shows the full nested retrieval path and preserves prior location assignments", async () => {
    let sample = createSampleWorkspace();
    sample = workspaceReducer(sample, {
      type: "MOVE_ASSET",
      assetId: "gmt-master-ii",
      placeId: "west-bay-home",
      spaceId: "wardrobe",
      locationMode: "physical",
      locationStatus: "known",
      locationDetail: "Top drawer",
      source: "manual",
      reason: "Moved for safekeeping",
      now: "2026-07-24T10:00:00.000Z",
    });
    sample = workspaceReducer(sample, {
      type: "MOVE_ASSET",
      assetId: "gmt-master-ii",
      placeId: "west-bay-home",
      spaceId: "study-safe",
      locationMode: "physical",
      locationStatus: "known",
      locationDetail: "Watch roll",
      source: "manual",
      reason: "Returned after travel",
      now: "2026-07-24T11:00:00.000Z",
    });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sample));
    window.history.replaceState({}, "", "/assets/gmt-master-ii");
    renderApp();

    await screen.findByRole("heading", { name: "GMT-Master II" });
    expect(
      screen.getAllByText(
        /West Bay Home.*Study.*Study safe.*Watch roll/i,
      ).length,
    ).toBeGreaterThan(0);
    const history = screen
      .getByRole("heading", { name: "Location history" })
      .closest("section");
    expect(
      within(history).getByText(/West Bay Home.*Wardrobe.*Top drawer/i),
    ).toBeTruthy();
    expect(within(history).getByText(/Current.*confirmed/i)).toBeTruthy();
  });

  it("corrects a room or container path without duplicating or losing linked assets", async () => {
    const user = userEvent.setup();
    seedSample("/places/west-bay-home/spaces/study-safe");
    renderApp();

    await screen.findByRole("heading", { name: "Study safe" });
    await user.click(
      screen.getByRole("button", { name: /Edit room or container/i }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Edit room or container",
    });
    const name = within(dialog).getByLabelText(/Room or zone name/i);
    await user.clear(name);
    await user.type(name, "Watch cabinet");
    expect(
      within(dialog).getByRole("combobox", { name: /^Place/i }).disabled,
    ).toBe(true);
    await user.click(
      within(dialog).getByRole("button", { name: /^Review$/i }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: /Save record/i }),
    );
    await user.click(
      await within(dialog).findByRole("button", { name: /View record/i }),
    );

    expect(
      await screen.findByRole("heading", { name: "Watch cabinet" }),
    ).toBeTruthy();
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(
      saved.spaces.filter((space) => space.id === "study-safe"),
    ).toHaveLength(1);
    expect(
      saved.assets.find((asset) => asset.id === "gmt-master-ii").spaceId,
    ).toBe("study-safe");
  });

  it("keeps private financial references out of secret-storage and showcase language", async () => {
    const user = userEvent.setup();
    seedSample("/assets?view=private");
    renderApp();

    expect(
      await screen.findByRole("heading", { name: "Private references" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/never passwords, PINs, keys, or full account numbers/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/safe reference.*not the secret/i),
    ).toBeTruthy();
    expect(screen.queryByText("QAR 380,000")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: /Reveal recorded estimates/i }),
    );
    expect(screen.getByText("QAR 380,000")).toBeTruthy();
  });

  it("keeps financial estimates masked on the general asset passport", async () => {
    const user = userEvent.setup();
    seedSample("/assets/qnb-family-reserve");
    renderApp();

    expect(
      await screen.findByRole("heading", { name: "Family reserve account" }),
    ).toBeTruthy();
    expect(screen.queryByText("QAR 380,000")).toBeNull();
    expect(screen.getByText("••••••")).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: /Reveal estimate/i }),
    );
    expect(screen.getByText("QAR 380,000")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Hide estimate/i }));
    expect(screen.queryByText("QAR 380,000")).toBeNull();
  });

  it("keeps emotional and private CTAs inside their intended capture flows", async () => {
    const user = userEvent.setup();
    seedSample("/assets?view=memories");
    const view = renderApp();

    await screen.findByRole("heading", { name: "Memories" });
    await user.click(
      screen.getByRole("button", { name: /Preserve a memory/i }),
    );
    expect(
      await screen.findByRole("dialog", {
        name: "Preserve what you remember",
      }),
    ).toBeTruthy();
    expect(screen.queryByText("What kind of item is this?")).toBeNull();

    view.unmount();
    seedSample("/assets?view=private");
    renderApp();
    await screen.findByRole("heading", { name: "Private references" });
    await user.click(
      screen.getByRole("button", { name: /Add private reference/i }),
    );
    expect(
      await screen.findByRole("dialog", {
        name: "Add a safe private reference",
      }),
    ).toBeTruthy();
    expect(screen.queryByText("What kind of item is this?")).toBeNull();
    expect(
      screen.getByRole("textbox", { name: /Institution/i }),
    ).toBeTruthy();
  });

  it("preserves a physical memory with an exact retrieval path and canonical private person", async () => {
    const user = userEvent.setup();
    seedSample("/assets?view=memories");
    renderApp();

    await screen.findByRole("heading", { name: "Memories" });
    await user.click(
      screen.getByRole("button", { name: /Preserve a memory/i }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Preserve what you remember",
    });

    await user.click(
      within(dialog).getByRole("radio", {
        name: /Physical belonging/i,
      }),
    );
    await user.type(
      within(dialog).getByLabelText(/Belonging name/i),
      "Grandmother's sewing box",
    );
    expect(within(dialog).getAllByLabelText(/^Origin$/i)).toHaveLength(1);
    expect(
      within(dialog).getAllByLabelText(/^Time or period$/i),
    ).toHaveLength(1);
    expect(
      within(dialog).queryByLabelText(/^Date or period$/i),
    ).toBeNull();
    expect(
      within(dialog).queryByLabelText(/^People connected$/i),
    ).toBeNull();
    await user.click(
      within(dialog).getByRole("button", { name: /Add a person/i }),
    );
    await user.type(
      within(dialog).getByLabelText(/Person 1 name/i),
      "Amina",
    );
    await user.type(
      within(dialog).getByLabelText(/Person 1 relationship to you/i),
      "Grandmother",
    );
    await user.type(
      within(dialog).getByLabelText(/^Time or period$/i),
      "Childhood · 1988",
    );
    await user.type(
      within(dialog).getByLabelText(/^Origin$/i),
      "Made by Amina",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /^Continue$/i }),
    );

    expect(
      await within(dialog).findByRole("heading", { name: "Where is it?" }),
    ).toBeTruthy();
    expect(
      within(dialog).queryByRole("button", {
        name: /No physical location/i,
      }),
    ).toBeNull();
    await user.click(
      within(dialog).getByRole("button", { name: "Known and findable" }),
    );
    await user.selectOptions(
      within(dialog).getByLabelText(/^Place$/i),
      "west-bay-home",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /^Continue$/i }),
    );
    expect(
      await within(dialog).findByText(
        "Add a room, container, or useful locator clue before marking this item Known.",
      ),
    ).toBeTruthy();
    await user.selectOptions(
      within(dialog).getByLabelText(/Room \/ container/i),
      "study-safe",
    );
    await user.type(
      within(dialog).getByLabelText(/Location detail/i),
      "Upper shelf · blue case",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /^Continue$/i }),
    );

    expect(
      await within(dialog).findByRole("heading", {
        name: "Papers & artifacts",
      }),
    ).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", { name: /^Review$/i }),
    );
    expect(
      await within(dialog).findByText(
        /West Bay Home.*Study.*Study safe.*Upper shelf/i,
      ),
    ).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", { name: /Save record/i }),
    );

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      const asset = saved.assets.find(
        (item) => item.name === "Grandmother's sewing box",
      );
      expect(asset.profile["memory-subject"]).toBe("physical");
      expect(asset.locationMode).toBe("physical");
      expect(asset.locationStatus).toBe("known");
      expect(asset.placeId).toBe("west-bay-home");
      expect(asset.spaceId).toBe("study-safe");
      expect(asset.locationDetail).toBe("Upper shelf · blue case");
      expect(asset.profile.people).toBe("Amina");
      expect(asset.profile["date-period"]).toBe("Childhood · 1988");
      expect(asset.profile.origin).toBe("Made by Amina");

      const person = saved.collector.people.find(
        (item) => item.displayName === "Amina",
      );
      expect(person.relationship).toBe("Grandmother");
      expect(person.showInShowcase).toBe(false);
      expect(
        saved.collector.memoryPersonLinks.some(
          (link) =>
            link.personId === person.id &&
            link.itemProfileId === `collector-profile-${asset.id}`,
        ),
      ).toBe(true);
    });
  });

  it("requires a primary person before saving a person-led memory", async () => {
    const user = userEvent.setup();
    seedSample("/assets?view=memories");
    renderApp();

    await screen.findByRole("heading", { name: "Memories" });
    await user.click(
      screen.getByRole("button", { name: /Preserve a memory/i }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Preserve what you remember",
    });

    await user.click(
      within(dialog).getByRole("radio", { name: /^Person/i }),
    );
    expect(
      within(dialog).getByRole("heading", {
        name: "Add the person this memory is about",
      }),
    ).toBeTruthy();
    expect(within(dialog).getByText("A primary person is required")).toBeTruthy();
    expect(within(dialog).queryByLabelText(/Quick reference/i)).toBeNull();
    expect(within(dialog).queryByLabelText(/Value \(QAR\)/i)).toBeNull();
    expect(within(dialog).queryByLabelText(/Future intention/i)).toBeNull();
    expect(within(dialog).queryByLabelText(/Acquired on/i)).toBeNull();

    await user.type(
      within(dialog).getByLabelText(/Person memory title/i),
      "Stories about Fatima",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /^Continue$/i }),
    );

    expect(
      await within(dialog).findByText(
        /Add or choose the primary person this memory is about/i,
      ),
    ).toBeTruthy();
    expect(
      within(dialog).queryByRole("heading", { name: "Papers & artifacts" }),
    ).toBeNull();

    await user.click(
      within(dialog).getByRole("button", { name: /Add primary person/i }),
    );
    await user.type(
      within(dialog).getByLabelText(/Person 1 name/i),
      "Fatima Noor",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /^Continue$/i }),
    );
    expect(
      await within(dialog).findByRole("heading", {
        name: "Papers & artifacts",
      }),
    ).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", { name: /^Review$/i }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: /Save record/i }),
    );

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      const asset = saved.assets.find(
        (item) => item.name === "Stories about Fatima",
      );
      expect(asset.profile["memory-subject"]).toBe("person");
      expect(asset.profile.people).toBe("Fatima Noor");
      const person = saved.collector.people.find(
        (item) => item.displayName === "Fatima Noor",
      );
      expect(
        saved.collector.memoryPersonLinks.some(
          (link) =>
            link.personId === person.id &&
            link.itemProfileId === `collector-profile-${asset.id}`,
        ),
      ).toBe(true);
    });
  });

  it("preserves a story without inventing a physical location", async () => {
    const user = userEvent.setup();
    seedSample("/assets?view=memories");
    renderApp();

    await screen.findByRole("heading", { name: "Memories" });
    await user.click(
      screen.getByRole("button", { name: /Preserve a memory/i }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Preserve what you remember",
    });
    await user.click(
      within(dialog).getByRole("radio", { name: /Physical belonging/i }),
    );
    await user.type(
      within(dialog).getByLabelText(/Quick reference/i),
      "PRIVATE-OBJECT-REF",
    );
    await user.type(
      within(dialog).getByLabelText(/Value \(QAR\)/i),
      "500",
    );
    await user.type(
      within(dialog).getByLabelText(/Acquired on/i),
      "2001-01-02",
    );
    await user.selectOptions(
      within(dialog).getByLabelText(/Future intention/i),
      "sell",
    );
    await user.click(
      within(dialog).getByRole("radio", { name: /Story only/i }),
    );
    expect(within(dialog).queryByLabelText(/Quick reference/i)).toBeNull();
    expect(within(dialog).queryByLabelText(/Value \(QAR\)/i)).toBeNull();
    expect(within(dialog).queryByLabelText(/Future intention/i)).toBeNull();
    expect(within(dialog).queryByLabelText(/Acquired on/i)).toBeNull();
    await user.type(
      within(dialog).getByLabelText(/Story title/i),
      "Friday courtyard story",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /^Continue$/i }),
    );

    expect(
      await within(dialog).findByRole("heading", {
        name: "Papers & artifacts",
      }),
    ).toBeTruthy();
    expect(
      within(dialog).queryByRole("heading", { name: "Where is it?" }),
    ).toBeNull();
    await user.click(
      within(dialog).getByRole("button", { name: /^Review$/i }),
    );
    expect(within(dialog).getByText("Not applicable")).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", { name: /Save record/i }),
    );

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      const asset = saved.assets.find(
        (item) => item.name === "Friday courtyard story",
      );
      expect(asset.profile["memory-subject"]).toBe("story");
      expect(asset.locationMode).toBe("not-applicable");
      expect(asset.placeId).toBeNull();
      expect(asset.spaceId).toBeNull();
      expect(asset.reference).toBeNull();
      expect(asset.value).toBeNull();
      expect(asset.acquiredAt).toBeNull();
      expect(asset.legacyIntent).toBe("archive-story");
    });
  });

  it("opens collection-piece capture with context and saves real curation edits", async () => {
    const user = userEvent.setup();
    seedSample("/collections/collection-art");
    renderApp();

    await screen.findByRole("heading", {
      name: "Art that made home feel ours",
    });
    await user.click(screen.getByRole("button", { name: /Add new piece/i }));
    expect(
      await screen.findByRole("dialog", {
        name: "Add a piece to the collection",
      }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Close capture/i }));

    await user.click(
      screen.getByRole("button", { name: /Curate collection/i }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: /Curate Art that made home feel ours/i,
    });
    const statement = within(dialog).getByLabelText(/Collection statement/i);
    await user.clear(statement);
    await user.type(statement, "Works chosen slowly for the rooms we live in.");
    await user.click(
      within(dialog).getByRole("button", { name: /Save curation/i }),
    );

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      expect(
        saved.collections.find((item) => item.id === "collection-art")
          .description,
      ).toBe("Works chosen slowly for the rooms we live in.");
    });
  });

  it("keeps people, period, origin, and story with memory objects", async () => {
    seedSample("/assets?view=memories");
    renderApp();

    expect(
      await screen.findByRole("heading", { name: "Memories" }),
    ).toBeTruthy();
    expect(screen.getAllByText("Childhood · 1999").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Yusuf and Akmal").length).toBeGreaterThan(0);
    const peopleSection = screen
      .getByRole("heading", { name: "Remembered together" })
      .closest("section");
    expect(within(peopleSection).getByText("Mariam")).toBeTruthy();
    expect(within(peopleSection).getByText("Sara")).toBeTruthy();
    expect(within(peopleSection).queryByText("family")).toBeNull();
  });

  it("offers a manual encrypted recovery kit without implying cloud backup", async () => {
    const user = userEvent.setup();
    seedSample("/vault");
    renderApp();

    expect(
      await screen.findByRole("heading", {
        name: "Take your continuity archive with you.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(/manual file transfer, not cloud synchronization/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/production cloud and passkeys still require deployment/i),
    ).toBeTruthy();
    const createButton = screen.getByRole("button", {
      name: /Create encrypted recovery kit/i,
    });
    expect(createButton.disabled).toBe(true);

    await user.click(screen.getByRole("tab", { name: "Restore kit" }));
    expect(
      screen.getByRole("button", { name: /Choose encrypted recovery kit/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Open and review kit/i }).disabled,
    ).toBe(true);
    expect(
      screen.queryByText(/Configure recovery.*Coming soon/i),
    ).toBeNull();
  });

  it("opens encrypted recovery from Settings without an overlay routing race", async () => {
    const user = userEvent.setup();
    seedSample("/home?settings=1");
    renderApp();

    const settings = await screen.findByRole("dialog", {
      name: "Settings",
    });
    await user.click(
      within(settings).getByRole("button", {
        name: /Encrypted recovery kit/i,
      }),
    );

    await waitFor(() => {
      expect(window.location.pathname).toBe("/vault");
      expect(window.location.search).toBe("");
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
    });
    expect(
      await screen.findByRole("heading", {
        name: "Take your continuity archive with you.",
      }),
    ).toBeTruthy();
  });

  it("reset removes every local generation, draft, and rollback marker before starting clean", async () => {
    const user = userEvent.setup();
    const sample = createSampleWorkspace();
    const keys = storageKeysForScope(LOCAL_DEMO_SCOPE_ID);
    const generationKey = keys.workspaceForGeneration("restore-reset-test");
    window.localStorage.setItem(generationKey, JSON.stringify(sample));
    window.localStorage.setItem(keys.activeGeneration, "restore-reset-test");
    window.localStorage.setItem(keys.restoreRollback, "stale-rollback");
    window.localStorage.setItem(keys.captureDraft, "stale-draft");
    window.localStorage.setItem(keys.recovery, "stale-recovery");
    window.history.replaceState({}, "", "/home?settings=1");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderApp();

    const settings = await screen.findByRole("dialog", {
      name: "Settings",
    });
    await user.click(
      within(settings).getByRole("button", {
        name: /Reset local workspace/i,
      }),
    );

    await waitFor(() => {
      expect(window.location.pathname).toBe("/welcome");
    });
    expect(fileStoreHarness.api.purgeFileScope).toHaveBeenCalledWith(
      LOCAL_DEMO_SCOPE_ID,
    );
    expect(window.localStorage.getItem(generationKey)).toBeNull();
    expect(window.localStorage.getItem(keys.activeGeneration)).toBeNull();
    expect(window.localStorage.getItem(keys.restoreRollback)).toBeNull();
    expect(window.localStorage.getItem(keys.captureDraft)).toBeNull();
    expect(window.localStorage.getItem(keys.recovery)).toBeNull();
    const resetWorkspace = JSON.parse(
      window.localStorage.getItem(keys.workspace),
    );
    expect(resetWorkspace.mode).toBe("unstarted");
  });

  it("opens the real capture studio and persists private asset-label assignments", async () => {
    const user = userEvent.setup();
    seedSample("/home?capture=studio&tool=labels");
    renderApp();

    const dialog = await screen.findByRole("dialog", {
      name: "Turn real-world context into a record.",
    });
    expect(
      within(dialog).getByRole("heading", { name: "Asset labels" }),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole("button", { name: /Document scan/i }),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole("button", { name: /Room photo batch/i }),
    ).toBeTruthy();

    await user.selectOptions(
      within(dialog).getByLabelText("Asset"),
      "gmt-master-ii",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Create private QR" }),
    );
    expect(
      await within(dialog).findByRole("img", {
        name: /Scannable QR label assigned to GMT-Master II/i,
      }),
    ).toBeTruthy();

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      expect(saved.assetLabelRegistry.assignments).toHaveLength(1);
      expect(saved.assetLabelRegistry.assignments[0].assetId).toBe(
        "gmt-master-ii",
      );
    });

    await user.click(
      within(dialog).getByRole("button", { name: /Document scan/i }),
    );
    expect(
      await within(dialog).findByRole("heading", {
        name: "Choose the Asset Passport",
      }),
    ).toBeTruthy();
  });

  it("attaches a reviewed document and its original through the full capture studio", async () => {
    const user = userEvent.setup();
    seedSample(
      "/home?capture=studio&tool=document&assetId=gmt-master-ii",
    );
    renderApp();

    const dialog = await screen.findByRole("dialog", {
      name: "Turn real-world context into a record.",
    });
    await user.upload(
      within(dialog).getByLabelText(/Choose pages/i),
      new File(["permit image"], "residency-permit.jpg", {
        type: "image/jpeg",
      }),
    );
    await user.type(
      within(dialog).getByRole("textbox", {
        name: "Document title",
      }),
      "Residency permit",
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: "Attach reviewed document",
      }),
    );

    expect(
      await within(dialog).findByText(
        /temporary local draft was cleared/i,
      ),
    ).toBeTruthy();
    await waitFor(() => {
      const saved = JSON.parse(
        window.localStorage.getItem(STORAGE_KEY),
      );
      const material = saved.evidence.find(
        (item) =>
          item.assetId === "gmt-master-ii" &&
          item.type === "Residency permit",
      );
      expect(material.fileState).toBe("ready_local");
      expect(material.fileName).toBe("residency-permit.jpg");
      expect(fileStoreHarness.evidence.has(material.id)).toBe(true);
    });
  });

  it("retains the exact-location, local-file, and recovery source contracts", () => {
    expect(LOCATION_PICKER_SOURCE).toMatch(/enableHighAccuracy:\s*true/);
    expect(LOCATION_PICKER_SOURCE).toMatch(/draggable:\s*true/);
    expect(LOCATION_PICKER_SOURCE).toMatch(/nominatim\.openstreetmap\.org/);
    expect(LOCATION_PICKER_SOURCE).toMatch(/Location permission was not granted/);

    expect(FILE_STORE_SOURCE).toMatch(/evidence-files/);
    expect(FILE_STORE_SOURCE).toMatch(/capture-draft-files/);
    expect(FILE_STORE_SOURCE).toMatch(/SHA-256/);
    expect(FILE_STORE_SOURCE).toMatch(/25 \* 1024 \* 1024/);
    expect(FILE_STORE_SOURCE).toMatch(/application\/pdf/);

    expect(APP_SOURCE).toMatch(/commitWorkspaceActionsWithFiles/);
    expect(APP_SOURCE).toMatch(/describeEvidenceOriginal/);
    expect(APP_SOURCE).toMatch(/getEvidenceFile/);
    expect(APP_SOURCE).toMatch(/putCaptureDraftFile/);
    expect(APP_SOURCE).toMatch(/getCaptureDraftFile/);
    expect(APP_SOURCE).toMatch(/createEncryptedRecoveryKit/);
    expect(APP_SOURCE).toMatch(/decryptEncryptedRecoveryKit/);
    expect(APP_SOURCE).toMatch(/stageAndActivateRecoveryGeneration/);
    expect(APP_SOURCE).toMatch(/readRecoveryGenerationState/);
    expect(FILE_STORE_SOURCE).toMatch(/RECOVERY_HEAD_STALE/);
    expect(APP_SOURCE).toMatch(/path="\/evidence\/:evidenceId"/);
    expect(APP_SOURCE).toMatch(/selectSpacePath/);
    expect(APP_SOURCE).toMatch(/selectAssetLocationHistory/);
  });

  it("migrates a legacy versioned browser snapshot into the stable storage key", async () => {
    const sample = createSampleWorkspace();
    window.localStorage.setItem(
      LEGACY_STORAGE_KEYS[0],
      JSON.stringify(sample),
    );
    window.history.replaceState({}, "", "/home");
    renderApp();

    expect(
      await screen.findByRole("heading", { name: "Everything you own" }),
    ).toBeTruthy();
    await waitFor(() => {
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeTruthy();
    });
    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY)).assets.length,
    ).toBe(17);
  });

  it("preserves a corrupt browser snapshot for recovery instead of parsing it", async () => {
    const corrupt = "{not-json";
    window.localStorage.setItem(STORAGE_KEY, corrupt);
    renderApp();

    expect(
      await screen.findByRole("heading", { name: "Start with what matters." }),
    ).toBeTruthy();
    expect(window.localStorage.getItem(RECOVERY_STORAGE_KEY)).toBe(corrupt);
    expect(
      screen.getByText("A saved demo could not be opened")
        .closest('[role="alert"]').textContent,
    ).toMatch(/saved demo could not be opened/i);
    expect(
      screen.getByRole("button", { name: /Download recovery copy/i }),
    ).toBeTruthy();
  });

  it("has no automatically detectable accessibility violations on first open", async () => {
    renderApp();
    const result = await axe.run(document.body, {
      rules: {
        "color-contrast": { enabled: false },
      },
    });
    expect(result.violations).toEqual([]);
  });

  it("has no automatically detectable accessibility violations on the home workspace", async () => {
    seedSample("/home");
    renderApp();
    await screen.findByRole("heading", { name: "Everything you own" });
    const result = await axe.run(document.body, {
      rules: {
        "color-contrast": { enabled: false },
      },
    });
    expect(result.violations).toEqual([]);
  });

  it("has no automatically detectable accessibility violations in Vault recovery", async () => {
    seedSample("/vault");
    renderApp();
    await screen.findByRole("heading", {
      name: "Take your continuity archive with you.",
    });
    const result = await axe.run(document.body, {
      rules: {
        "color-contrast": { enabled: false },
      },
    });
    expect(
      result.violations.map((violation) => violation.id),
    ).toEqual([]);
  });

  it("has no automatically detectable accessibility violations in exact-location capture", async () => {
    seedSample(
      "/assets/gmt-master-ii?capture=asset&assetId=gmt-master-ii&stage=location",
    );
    renderApp();
    const dialog = await screen.findByRole("dialog", {
      name: "Where is it?",
    });
    const result = await axe.run(dialog, {
      rules: {
        "color-contrast": { enabled: false },
      },
    });
    expect(result.violations).toEqual([]);
  });

  it("has no automatically detectable accessibility violations in document capture", async () => {
    seedSample(
      "/home?capture=studio&tool=document&assetId=gmt-master-ii",
    );
    renderApp();
    const dialog = await screen.findByRole("dialog", {
      name: "Turn real-world context into a record.",
    });
    const result = await axe.run(dialog, {
      rules: {
        "color-contrast": { enabled: false },
      },
    });
    expect(result.violations).toEqual([]);
  });
});
