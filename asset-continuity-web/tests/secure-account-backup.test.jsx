// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const harness = vi.hoisted(() => ({
  session: null,
  backupPreflight: null,
  restorePreflight: null,
  decrypted: null,
  rollbackAvailable: false,
  rollbackResult: null,
}));

vi.mock("../src/continuityApi.js", () => {
  class ContinuityApiError extends Error {
    constructor(message, code = "API_ERROR", status = 0, details = null) {
      super(message);
      this.name = "ContinuityApiError";
      this.code = code;
      this.status = status;
      this.details = details;
    }
  }
  return {
    ContinuityApiError,
    continuityApi: {
      getSession: vi.fn(async () => harness.session),
      register: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      getMembers: vi.fn(async () => []),
      grantAccess: vi.fn(),
      createBackup: vi.fn(),
      getLatestBackup: vi.fn(),
      getBackupHistory: vi.fn(),
      getBackupById: vi.fn(),
    },
  };
});

vi.mock("../src/recoveryKit.js", () => ({
  createEncryptedRecoveryKit: vi.fn(async ({ workspace }) => ({
    format: "encrypted-test-kit",
    version: 2,
    createdAt: "2026-07-25T05:00:00.000Z",
    householdId: workspace.household.id,
    payload: "ciphertext",
  })),
  decryptEncryptedRecoveryKit: vi.fn(async () => harness.decrypted),
}));

vi.mock("../src/backupPreflight.js", () => ({
  runBackupPreflight: vi.fn(async () => harness.backupPreflight),
  runRestorePreflight: vi.fn(async () => harness.restorePreflight),
}));

vi.mock("../src/restoreGeneration.js", () => ({
  readRecoveryRollback: vi.fn(() =>
    harness.rollbackAvailable ? { activatedGenerationId: "gen-restored" } : null,
  ),
  stageAndActivateRecoveryGeneration: vi.fn(
    async ({ recoveredWorkspace }) => ({
      generationId: "gen-restored",
      workspace: recoveredWorkspace,
    }),
  ),
  rollbackRecoveryGeneration: vi.fn(async () => harness.rollbackResult),
}));

vi.mock("../src/securityVault.js", () => ({
  sha256Hex: vi.fn(async () => "b".repeat(64)),
}));

import { continuityApi, ContinuityApiError } from "../src/continuityApi.js";
import {
  runBackupPreflight,
  runRestorePreflight,
} from "../src/backupPreflight.js";
import {
  createEncryptedRecoveryKit,
  decryptEncryptedRecoveryKit,
} from "../src/recoveryKit.js";
import {
  rollbackRecoveryGeneration,
  stageAndActivateRecoveryGeneration,
} from "../src/restoreGeneration.js";
import {
  SecureAccountPanel,
  SecureAccountProvider,
} from "../src/SecureAccountPanel.jsx";

const BACKUP_ID_V1 = "backup_11111111-1111-4111-8111-111111111111";
const BACKUP_ID_V2 = "backup_22222222-2222-4222-8222-222222222222";
const CREATED_AT = "2026-07-25T05:00:00.000Z";

function createWorkspace({
  evidence = [],
  assetName = "Pearl apartment",
} = {}) {
  return {
    meta: {
      id: "workspace-test",
      version: 1,
      updatedAt: CREATED_AT,
    },
    household: {
      id: "household-test",
      name: "Test household",
    },
    assets: [{ id: "asset-1", name: assetName }],
    places: [{ id: "place-1", name: "West Bay home" }],
    evidence,
  };
}

function historyPayload(backups = []) {
  return {
    backups,
    latestBackupId: backups[0]?.backupId || null,
    total: backups.length,
    retention: {
      policy: "retain-all",
      automaticDeletion: false,
    },
  };
}

function backupMetadata({
  backupId = BACKUP_ID_V1,
  version = 1,
} = {}) {
  return {
    backupId,
    version,
    createdAt: CREATED_AT,
    byteLength: 2048,
    checksum: "b".repeat(64),
  };
}

function backupPreflight({
  originals = [],
  missing = [],
  integrityFailures = [],
  drafts = 0,
  status,
} = {}) {
  const coverageStatus = integrityFailures.length
    ? "blocked"
    : missing.length
      ? "partial"
      : "ready";
  return {
    version: 1,
    kind: "backup",
    status:
      status ||
      (coverageStatus === "blocked"
        ? "blocked"
        : coverageStatus === "partial" || drafts
          ? "partial"
          : "ready"),
    coverage: {
      status: coverageStatus,
      referencedOriginalCount: originals.length + missing.length,
      includedOriginalCount: originals.length,
      missingOriginalCount: missing.length,
      integrityFailureCount: integrityFailures.length,
      originalBytes: originals.reduce(
        (total, original) => total + original.fileSize,
        0,
      ),
      originalVersionIds: originals.map(
        (original) => original.originalVersionId,
      ),
      missing,
      integrityFailures,
    },
    capacity: {
      status: "ready",
      projectedPlaintextBytes: 4096,
      projectedPackageBytes: 6144,
      originalDataBase64Bytes: 2048,
      blockingReasons: [],
    },
    browserStorage: {
      status: "adequate",
      requiredBytes: 6144,
      availableBytes: 1_000_000,
      advisory: true,
    },
    drafts: {
      status: "known",
      excluded: drafts > 0,
      totalDraftCount: drafts,
      captureDraftCount: drafts,
      roomDraftCount: 0,
      fileCount: drafts,
      knownBytes: 0,
      unknownFileBytes: drafts,
      discoveryFailures: [],
    },
    originals,
  };
}

function restorePreflight(recovered) {
  return {
    version: 1,
    kind: "restore",
    status: recovered.coverage.missingOriginalCount ? "partial" : "ready",
    coverage: recovered.coverage,
    requiredStagingBytes:
      1024 + Number(recovered.coverage.originalBytes || 0),
    browserStorage: {
      status: "adequate",
      requiredBytes: 1024,
      availableBytes: 1_000_000,
      advisory: true,
    },
    originals: recovered.originals,
  };
}

function renderPanel(
  workspace = createWorkspace(),
  {
    recoveryHeadRevision,
    adoptRecoveryHead = vi.fn(),
  } = {},
) {
  const dispatch = vi.fn();
  render(
    <SecureAccountProvider>
      <SecureAccountPanel
        workspace={workspace}
        dispatch={dispatch}
        storageScopeId="account:account-test:household-test"
        recoveryHeadRevision={recoveryHeadRevision}
        adoptRecoveryHead={adoptRecoveryHead}
      />
    </SecureAccountProvider>,
  );
  return { dispatch, adoptRecoveryHead };
}

async function waitForWorkbench() {
  await screen.findByRole("heading", {
    name: "Encrypted account backup",
  });
}

describe("authenticated encrypted backup workbench", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.session = {
      accountId: "account-test",
      householdId: "household-test",
      householdName: "Test household",
      displayName: "Test owner",
      email: "owner@example.test",
      role: "owner",
      csrfToken: "csrf-test",
      expiresAt: "2026-08-25T05:00:00.000Z",
    };
    harness.backupPreflight = backupPreflight();
    harness.restorePreflight = null;
    harness.decrypted = null;
    harness.rollbackAvailable = false;
    harness.rollbackResult = {
      workspace: createWorkspace({ assetName: "Previous asset" }),
      cleaned: true,
    };
    continuityApi.getBackupHistory.mockResolvedValue(historyPayload());
    continuityApi.createBackup.mockResolvedValue({
      backup: backupMetadata(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("loads bounded retained history and conditionally creates from the latest observed version", async () => {
    const evidence = {
      id: "evidence-1",
      assetId: "asset-1",
      fileName: "watch-receipt.pdf",
      fileType: "application/pdf",
      fileSize: 4,
      fileChecksum: "a".repeat(64),
      originalVersionId: `ov_${"c".repeat(64)}`,
      fileState: "ready_local",
    };
    const latest = backupMetadata({
      backupId: BACKUP_ID_V1,
      version: 1,
    });
    continuityApi.getBackupHistory.mockResolvedValue(
      historyPayload([latest]),
    );
    const original = {
      evidenceId: evidence.id,
      blob: new Blob(["test"], { type: "application/pdf" }),
      fileName: evidence.fileName,
      fileType: evidence.fileType,
      fileSize: evidence.fileSize,
      fileChecksum: evidence.fileChecksum,
      originalVersionId: evidence.originalVersionId,
    };
    harness.backupPreflight = backupPreflight({
      originals: [original],
    });
    renderPanel(createWorkspace({ evidence: [evidence] }));
    await waitForWorkbench();

    await waitFor(() => {
      expect(continuityApi.getBackupHistory).toHaveBeenCalledWith({
        limit: 10,
      });
    });

    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/Vault passphrase/),
      "this is a strong vault phrase",
    );
    await user.click(
      screen.getByRole("button", { name: "Back up this device" }),
    );

    await waitFor(() => {
      expect(continuityApi.createBackup).toHaveBeenCalledTimes(1);
    });
    expect(runBackupPreflight).toHaveBeenCalledWith({
      workspace: expect.objectContaining({
        household: expect.objectContaining({ id: "household-test" }),
      }),
      storageScopeId: "account:account-test:household-test",
    });
    expect(continuityApi.createBackup.mock.calls[0][2]).toEqual({
      baseBackupId: BACKUP_ID_V1,
    });
    expect(
      createEncryptedRecoveryKit.mock.calls[0][0].originals[0]
        .originalVersionId,
    ).toBe(evidence.originalVersionId);
    expect(
      await screen.findByText(
        "Encrypted recovery snapshot stored with 1 of 1 referenced original.",
      ),
    ).toBeTruthy();
  });

  it("names missing originals and requires explicit partial-snapshot acknowledgement", async () => {
    const evidence = {
      id: "evidence-missing",
      assetId: "asset-1",
      fileName: "lost-appraisal.pdf",
      fileType: "application/pdf",
      fileSize: 400,
      fileChecksum: "a".repeat(64),
      fileState: "missing_original",
    };
    harness.backupPreflight = backupPreflight({
      missing: [
        {
          evidenceId: evidence.id,
          fileName: evidence.fileName,
          reason: "not_stored_on_this_device",
          message: "The original is not stored on this device.",
        },
      ],
    });
    renderPanel(createWorkspace({ evidence: [evidence] }));
    await waitForWorkbench();

    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/Vault passphrase/),
      "this is a strong vault phrase",
    );
    const createButton = screen.getByRole("button", {
      name: "Back up this device",
    });
    await user.click(createButton);

    expect(continuityApi.createBackup).not.toHaveBeenCalled();
    expect(
      (await screen.findByText(/Not available here:/)).textContent,
    ).toContain("lost-appraisal.pdf");

    await user.click(
      screen.getByLabelText(
        /I understand this is a partial recovery snapshot/,
      ),
    );
    await user.click(createButton);

    await waitFor(() => {
      expect(continuityApi.createBackup).toHaveBeenCalledTimes(1);
    });
    expect(
      createEncryptedRecoveryKit.mock.calls[0][0].originals,
    ).toHaveLength(0);
  });

  it("reports a stale upload as not uploaded and refreshes history", async () => {
    continuityApi.createBackup.mockRejectedValue(
      new ContinuityApiError(
        "A newer encrypted backup exists.",
        "BACKUP_STALE",
        409,
        {
          latest: backupMetadata({
            backupId: BACKUP_ID_V2,
            version: 2,
          }),
        },
      ),
    );
    renderPanel();
    await waitForWorkbench();

    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/Vault passphrase/),
      "this is a strong vault phrase",
    );
    await user.click(
      screen.getByRole("button", { name: "Back up this device" }),
    );

    expect(
      await screen.findByText(/This snapshot was not uploaded/),
    ).toBeTruthy();
    expect(continuityApi.getBackupHistory.mock.calls.length).toBeGreaterThan(1);
  });

  it("opens an exact historical backup, shows decrypted coverage, stages restore, and offers undo", async () => {
    const historical = backupMetadata({
      backupId: BACKUP_ID_V1,
      version: 1,
    });
    const latest = backupMetadata({
      backupId: BACKUP_ID_V2,
      version: 2,
    });
    continuityApi.getBackupHistory.mockResolvedValue(
      historyPayload([latest, historical]),
    );
    continuityApi.getBackupById.mockResolvedValue({
      ...historical,
      payload: JSON.stringify({ ciphertext: "test" }),
      checksum: "b".repeat(64),
      byteLength: new TextEncoder().encode(
        JSON.stringify({ ciphertext: "test" }),
      ).byteLength,
    });
    const recoveredEvidence = {
      id: "evidence-recovered",
      assetId: "asset-1",
      fileName: "watch-appraisal.pdf",
      fileType: "application/pdf",
      fileSize: 8,
      fileChecksum: "d".repeat(64),
      originalVersionId: `ov_${"e".repeat(64)}`,
      fileState: "ready_local",
    };
    const recoveredWorkspace = createWorkspace({
      evidence: [recoveredEvidence],
      assetName: "Recovered watch",
    });
    harness.decrypted = {
      createdAt: CREATED_AT,
      workspace: recoveredWorkspace,
      manifest: [
        {
          evidenceId: recoveredEvidence.id,
          originalVersionId: recoveredEvidence.originalVersionId,
          fileName: recoveredEvidence.fileName,
          fileType: recoveredEvidence.fileType,
          fileSize: recoveredEvidence.fileSize,
          fileChecksum: recoveredEvidence.fileChecksum,
        },
      ],
      coverage: {
        referencedOriginalCount: 1,
        includedOriginalCount: 1,
        missingOriginalCount: 0,
        originalBytes: 8,
        originalVersionIds: [recoveredEvidence.originalVersionId],
      },
      originals: [
        {
          evidenceId: recoveredEvidence.id,
          originalVersionId: recoveredEvidence.originalVersionId,
          fileName: recoveredEvidence.fileName,
          fileType: recoveredEvidence.fileType,
          fileSize: recoveredEvidence.fileSize,
          fileChecksum: recoveredEvidence.fileChecksum,
          blob: new Blob(["recovery"], { type: "application/pdf" }),
        },
      ],
    };
    harness.restorePreflight = restorePreflight(harness.decrypted);
    const { dispatch, adoptRecoveryHead } = renderPanel(
      createWorkspace(),
      { recoveryHeadRevision: 7 },
    );
    await waitForWorkbench();
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/Vault passphrase/),
      "this is a strong vault phrase",
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Open encrypted backup version 1",
      }),
    );

    await waitFor(() => {
      expect(continuityApi.getBackupById).toHaveBeenCalledWith(BACKUP_ID_V1);
    });
    expect(decryptEncryptedRecoveryKit).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText("Review before activating this generation"),
    ).toBeTruthy();
    expect(screen.getByText("originals referenced")).toBeTruthy();

    await user.click(
      screen.getByRole("button", {
        name: "Activate recovered generation",
      }),
    );
    await waitFor(() => {
      expect(stageAndActivateRecoveryGeneration).toHaveBeenCalledTimes(1);
    });
    expect(runRestorePreflight).toHaveBeenCalledTimes(2);
    expect(
      stageAndActivateRecoveryGeneration.mock.calls[0][0].files[0]
        .originalVersionId,
    ).toBe(recoveredEvidence.originalVersionId);
    expect(
      stageAndActivateRecoveryGeneration.mock.calls[0][0]
        .expectedHeadRevision,
    ).toBe(7);
    expect(adoptRecoveryHead).toHaveBeenCalledWith(
      expect.objectContaining({ generationId: "gen-restored" }),
      recoveredWorkspace,
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "REPLACE_WORKSPACE",
      workspace: recoveredWorkspace,
    });

    await user.click(
      await screen.findByRole("button", { name: "Undo last recovery" }),
    );
    await waitFor(() => {
      expect(rollbackRecoveryGeneration).toHaveBeenCalledWith({
        scopeId: "account:account-test:household-test",
        expectedHeadRevision: 7,
      });
    });
  });
});
